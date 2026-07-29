import { app } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { readFile, writeFile, mkdir, unlink, readdir, stat, rm } from 'fs/promises'
import { existsSync } from 'fs'
import { join, relative, basename, sep } from 'path'
import tar from 'tar'
import type {
  FileEntry,
  SyncManifest,
  SyncProgress,
  FileMeta,
  ClientMessage,
  HostMessage
} from '@shared/types'
import { getMimeType } from '@shared/types'
import { encodeFileChunk, decodeFileChunk, FILE_CHUNK_SIZE } from '../network/fileProtocol'

/** Maximum number of files to send in a single tar.gz package. */
const MAX_FILES_PER_PACKAGE = 500

interface IncomingSyncPackage {
  meta: FileMeta
  syncId: string
  chunks: Map<number, Buffer>
}

interface PendingSend {
  syncId: string
  targetDeviceId: string
  targetDeviceName: string
  relativePaths: string[]
}

/**
 * Manages folder synchronisation between connected devices.
 *
 * Sync flow:
 *  1. Initiator scans local folder → builds manifest
 *  2. Sends `sync:request` with manifest to all peers
 *  3. Peer receives request, scans its own folder, compares manifests
 *  4. Peer sends `sync:response` with its manifest + list of files it needs
 *  5. Both sides package missing files into tar.gz and send via chunked transfer
 *  6. Receivers extract packages to their sync folder
 *  7. All temp files are cleaned up
 */
export class FolderSyncManager {
  private syncFolder = ''
  private tempDir: string
  private incomingSyncPackages = new Map<string, IncomingSyncPackage>()
  private pendingSends = new Map<string, PendingSend[]>()

  // Callbacks set by RoomManager
  sendMsg: (msg: ClientMessage | HostMessage) => void = () => {}
  sendBinary: (data: Buffer) => void = () => {}
  sendProgress: (progress: SyncProgress) => void = () => {}
  getLocalDeviceId: () => string = () => ''
  getLocalDeviceName: () => string = () => ''
  getRole: () => 'idle' | 'host' | 'guest' = () => 'idle'

  constructor() {
    this.tempDir = join(app.getPath('temp'), 'shared-notes-sync')
  }

  /* ------------------------------------------------------------------ */
  /*  Public API (called by RoomManager / IPC)                          */
  /* ------------------------------------------------------------------ */

  setSyncFolder(path: string): void {
    this.syncFolder = path
  }

  getSyncFolder(): string {
    return this.syncFolder
  }

  hasSyncFolder(): boolean {
    return this.syncFolder !== '' && existsSync(this.syncFolder)
  }

  /** Initiate a sync session – called when user clicks "Start Sync". */
  async startSync(): Promise<void> {
    if (!this.hasSyncFolder()) {
      this.sendProgress(this.makeProgress('error', '请先选择同步文件夹', 0, 0))
      return
    }

    const syncId = uuidv4()
    this.sendProgress(
      this.makeProgress('scanning', '正在扫描本地文件夹…', 0, 0, syncId)
    )

    const files = await this.scanFolder(this.syncFolder)
    const folderLabel = basename(this.syncFolder)

    const manifest: SyncManifest = {
      syncId,
      folderLabel,
      files,
      fromDeviceId: this.getLocalDeviceId(),
      fromDeviceName: this.getLocalDeviceName()
    }

    this.sendProgress(
      this.makeProgress('comparing', `已扫描 ${files.length} 个文件，正在请求对端对比…`, 1, 1, syncId)
    )

    // Broadcast sync request to all peers
    this.sendMsg({ type: 'sync:request', manifest })
  }

  /* ------------------------------------------------------------------ */
  /*  Incoming message handlers (called by RoomManager)                 */
  /* ------------------------------------------------------------------ */

  /** Handle `sync:request` from a peer. */
  async handleSyncRequest(manifest: SyncManifest): Promise<void> {
    // Ignore our own requests (host may re-broadcast)
    if (manifest.fromDeviceId === this.getLocalDeviceId()) return

    if (!this.hasSyncFolder()) {
      // No sync folder set – silently ignore
      return
    }

    this.sendProgress(
      this.makeProgress(
        'scanning',
        `收到来自 ${manifest.fromDeviceName} 的同步请求，正在扫描本地文件夹…`,
        0,
        0,
        manifest.syncId,
        manifest.fromDeviceName
      )
    )

    const localFiles = await this.scanFolder(this.syncFolder)

    // Find files that the peer has but we don't (or are newer)
    const neededFiles = this.findMissingFiles(manifest.files, localFiles)

    const responseManifest: SyncManifest = {
      syncId: manifest.syncId,
      folderLabel: basename(this.syncFolder),
      files: localFiles,
      fromDeviceId: this.getLocalDeviceId(),
      fromDeviceName: this.getLocalDeviceName()
    }

    this.sendProgress(
      this.makeProgress(
        'comparing',
        `对比完成，需要接收 ${neededFiles.length} 个文件`,
        1,
        1,
        manifest.syncId,
        manifest.fromDeviceName
      )
    )

    // Respond with our manifest + the files we need
    this.sendMsg({
      type: 'sync:response',
      syncId: manifest.syncId,
      manifest: responseManifest,
      neededFiles,
      toDeviceId: manifest.fromDeviceId
    })

    // If we also need files from the peer, we'll receive a sync:package:offer later
    if (neededFiles.length > 0) {
      this.sendProgress(
        this.makeProgress(
          'receiving',
          `等待接收 ${neededFiles.length} 个文件…`,
          0,
          neededFiles.length,
          manifest.syncId,
          manifest.fromDeviceName
        )
      )
    } else {
      // Nothing to receive from this peer
      this.sendProgress(
        this.makeProgress(
          'done',
          `无需接收文件，本地已是最新`,
          0,
          0,
          manifest.syncId,
          manifest.fromDeviceName
        )
      )
    }
  }

  /** Handle `sync:response` from a peer. */
  async handleSyncResponse(
    syncId: string,
    remoteManifest: SyncManifest,
    neededFiles: string[],
    toDeviceId: string
  ): Promise<void> {
    // Ignore if not meant for us
    if (toDeviceId !== this.getLocalDeviceId()) return

    // Ignore our own responses
    if (remoteManifest.fromDeviceId === this.getLocalDeviceId()) return

    if (!this.hasSyncFolder()) return

    // Find files that the peer needs from us (files we have that they don't)
    const localFiles = await this.scanFolder(this.syncFolder)
    const filesToSend = this.findMissingFiles(localFiles, remoteManifest.files)

    if (filesToSend.length === 0) {
      // Nothing to send to this peer
      this.sendMsg({ type: 'sync:done', syncId, toDeviceId: remoteManifest.fromDeviceId })
      return
    }

    this.sendProgress(
      this.makeProgress(
        'packaging',
        `正在打包 ${filesToSend.length} 个文件…`,
        0,
        filesToSend.length,
        syncId,
        remoteManifest.fromDeviceName
      )
    )

    // Package and send files in batches
    await this.packageAndSend(
      filesToSend,
      syncId,
      remoteManifest.fromDeviceId,
      remoteManifest.fromDeviceName
    )

    // Signal done
    this.sendMsg({ type: 'sync:done', syncId, toDeviceId: remoteManifest.fromDeviceId })
  }

  /** Handle `sync:package:offer` – register an incoming sync package. */
  handleSyncPackageOffer(syncId: string, file: FileMeta, toDeviceId: string): void {
    // Ignore if not meant for us
    if (toDeviceId !== this.getLocalDeviceId()) return

    // Ignore our own packages
    if (file.fromDeviceId === this.getLocalDeviceId()) return

    this.incomingSyncPackages.set(file.id, {
      meta: file,
      syncId,
      chunks: new Map()
    })
  }

  /** Handle a binary chunk that might belong to a sync package.
   *  Returns true if the chunk was consumed by the sync manager. */
  handleBinaryChunk(buf: Buffer): boolean {
    const decoded = decodeFileChunk(buf)
    if (!decoded) return false

    const pkg = this.incomingSyncPackages.get(decoded.fileId)
    if (!pkg) return false

    pkg.chunks.set(decoded.index, decoded.data)

    this.sendProgress({
      syncId: pkg.syncId,
      phase: 'receiving',
      message: `接收同步包: ${pkg.meta.name}`,
      current: pkg.chunks.size,
      total: decoded.total,
      filesSent: 0,
      filesReceived: 0
    })

    return true
  }

  /** Handle `file:complete` for a sync package.
   *  Returns true if the fileId was a sync package. */
  async handleFileComplete(fileId: string): Promise<boolean> {
    const pkg = this.incomingSyncPackages.get(fileId)
    if (!pkg) return false

    // Assemble chunks
    const parts: Buffer[] = []
    for (let i = 0; i < pkg.meta.totalChunks; i++) {
      const chunk = pkg.chunks.get(i)
      if (!chunk) {
        this.sendProgress(
          this.makeProgress('error', `同步包接收不完整: ${pkg.meta.name}`, 0, 0, pkg.syncId)
        )
        this.incomingSyncPackages.delete(fileId)
        return true
      }
      parts.push(chunk)
    }

    const fullData = Buffer.concat(parts)

    this.sendProgress(
      this.makeProgress('extracting', `正在解压同步包…`, 0, 0, pkg.syncId)
    )

    // Save to temp file and extract
    if (!existsSync(this.tempDir)) {
      await mkdir(this.tempDir, { recursive: true })
    }

    const tempArchive = join(this.tempDir, `${fileId}.tar.gz`)
    try {
      await writeFile(tempArchive, fullData)

      // Extract to sync folder
      await this.extractPackage(tempArchive, this.syncFolder)

      this.sendProgress(
        this.makeProgress('done', `同步包已解压到目标文件夹`, 1, 1, pkg.syncId)
      )
    } catch (err) {
      this.sendProgress(
        this.makeProgress(
          'error',
          `解压失败: ${err instanceof Error ? err.message : String(err)}`,
          0,
          0,
          pkg.syncId
        )
      )
    } finally {
      // Clean up temp archive
      await this.safeDelete(tempArchive)
      this.incomingSyncPackages.delete(fileId)
    }

    return true
  }

  /** Handle `sync:done` from a peer. */
  handleSyncDone(syncId: string, toDeviceId: string): void {
    if (toDeviceId !== this.getLocalDeviceId()) return
    this.sendProgress(
      this.makeProgress('done', '同步完成', 1, 1, syncId)
    )
  }

  /* ------------------------------------------------------------------ */
  /*  File system helpers                                               */
  /* ------------------------------------------------------------------ */

  /** Recursively scan a folder and return a list of file entries. */
  private async scanFolder(folderPath: string): Promise<FileEntry[]> {
    const entries: FileEntry[] = []

    const walk = async (dir: string): Promise<void> => {
      if (!existsSync(dir)) return
      const items = await readdir(dir, { withFileTypes: true })
      for (const item of items) {
        const fullPath = join(dir, item.name)
        if (item.isDirectory()) {
          await walk(fullPath)
        } else if (item.isFile()) {
          const rel = relative(folderPath, fullPath).split(sep).join('/')
          // Skip temp/archive files
          if (rel.startsWith('.')) continue
          try {
            const stats = await stat(fullPath)
            entries.push({
              relativePath: rel,
              size: stats.size,
              mtime: Math.floor(stats.mtimeMs)
            })
          } catch {
            // Skip files we can't stat
          }
        }
      }
    }

    await walk(folderPath)
    return entries
  }

  /**
   * Find files present in `source` but missing from (or older than) `target`.
   * Returns relative paths of the missing/outdated files.
   */
  private findMissingFiles(source: FileEntry[], target: FileEntry[]): string[] {
    const targetMap = new Map<string, FileEntry>()
    for (const f of target) {
      targetMap.set(f.relativePath, f)
    }

    const missing: string[] = []
    for (const src of source) {
      const tgt = targetMap.get(src.relativePath)
      if (!tgt) {
        // File doesn't exist on target
        missing.push(src.relativePath)
      } else if (src.size !== tgt.size || src.mtime > tgt.mtime + 1000) {
        // File is different or newer (1s tolerance)
        missing.push(src.relativePath)
      }
    }
    return missing
  }

  /** Package files into tar.gz and send via chunked binary transfer. */
  private async packageAndSend(
    relativePaths: string[],
    syncId: string,
    targetDeviceId: string,
    targetDeviceName: string
  ): Promise<void> {
    if (!existsSync(this.tempDir)) {
      await mkdir(this.tempDir, { recursive: true })
    }

    // Process in batches to avoid huge archives
    for (let i = 0; i < relativePaths.length; i += MAX_FILES_PER_PACKAGE) {
      const batch = relativePaths.slice(i, i + MAX_FILES_PER_PACKAGE)
      const batchNum = Math.floor(i / MAX_FILES_PER_PACKAGE) + 1
      const archiveName = `sync-${syncId.substring(0, 8)}-${batchNum}.tar.gz`
      const archivePath = join(this.tempDir, archiveName)

      this.sendProgress({
        syncId,
        phase: 'packaging',
        message: `正在打包第 ${batchNum} 批 (${batch.length} 个文件)…`,
        current: i,
        total: relativePaths.length,
        filesSent: 0,
        filesReceived: 0,
        peerName: targetDeviceName
      })

      try {
        await this.createPackage(this.syncFolder, batch, archivePath)
      } catch (err) {
        this.sendProgress(
          this.makeProgress(
            'error',
            `打包失败: ${err instanceof Error ? err.message : String(err)}`,
            0,
            0,
            syncId,
            targetDeviceName
          )
        )
        return
      }

      // Send the archive via chunked transfer
      this.sendProgress({
        syncId,
        phase: 'sending',
        message: `正在发送同步包 (${archiveName})…`,
        current: i,
        total: relativePaths.length,
        filesSent: 0,
        filesReceived: 0,
        peerName: targetDeviceName
      })

      await this.sendFileAsSyncPackage(archivePath, syncId, targetDeviceId, targetDeviceName)

      // Clean up the temp archive after sending
      await this.safeDelete(archivePath)
    }
  }

  /** Send a file as a sync package using the chunked binary protocol. */
  private async sendFileAsSyncPackage(
    filePath: string,
    syncId: string,
    targetDeviceId: string,
    _targetDeviceName: string
  ): Promise<void> {
    const stats = await stat(filePath)
    const data = await readFile(filePath)
    const fileId = uuidv4()
    const totalChunks = Math.max(1, Math.ceil(data.length / FILE_CHUNK_SIZE))

    const meta: FileMeta = {
      id: fileId,
      name: basename(filePath),
      size: stats.size,
      mime: getMimeType('.gz'),
      totalChunks,
      fromDeviceId: this.getLocalDeviceId(),
      fromDeviceName: this.getLocalDeviceName(),
      createdAt: Date.now(),
      syncId,
      syncTargetDeviceId: targetDeviceId
    }

    // 1. Announce the sync package
    this.sendMsg({
      type: 'sync:package:offer',
      syncId,
      file: meta,
      toDeviceId: targetDeviceId
    })

    // 2. Stream binary chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * FILE_CHUNK_SIZE
      const end = Math.min(start + FILE_CHUNK_SIZE, data.length)
      const chunkData = data.subarray(start, end)
      const frame = encodeFileChunk(fileId, i, totalChunks, chunkData)
      this.sendBinary(frame)

      // Yield to the event loop every ~3 MB
      if (i > 0 && i % 48 === 0) {
        await new Promise((r) => setTimeout(r, 0))
      }
    }

    // 3. Signal completion (reuse file:complete so the receiver assembles chunks)
    this.sendMsg({ type: 'file:complete', fileId })
  }

  /** Create a tar.gz archive containing specific files from a base folder. */
  private async createPackage(
    basePath: string,
    relativePaths: string[],
    outputPath: string
  ): Promise<void> {
    await tar.create(
      {
        gzip: true,
        file: outputPath,
        cwd: basePath
      },
      relativePaths
    )
  }

  /** Extract a tar.gz archive to a target folder. */
  private async extractPackage(archivePath: string, targetPath: string): Promise<void> {
    if (!existsSync(targetPath)) {
      await mkdir(targetPath, { recursive: true })
    }

    await tar.extract({
      file: archivePath,
      cwd: targetPath
    })
  }

  /** Safely delete a file, ignoring errors. */
  private async safeDelete(filePath: string): Promise<void> {
    try {
      if (existsSync(filePath)) {
        await unlink(filePath)
      }
    } catch {
      // Ignore deletion errors
    }
  }

  /** Clean up the entire temp directory. */
  async cleanupTempDir(): Promise<void> {
    try {
      if (existsSync(this.tempDir)) {
        await rm(this.tempDir, { recursive: true, force: true })
      }
    } catch {
      // Ignore
    }
  }

  /** Create a SyncProgress object with defaults. */
  private makeProgress(
    phase: SyncProgress['phase'],
    message: string,
    current: number,
    total: number,
    syncId = '',
    peerName?: string
  ): SyncProgress {
    return {
      syncId,
      phase,
      message,
      current,
      total,
      filesSent: 0,
      filesReceived: 0,
      peerName
    }
  }
}
