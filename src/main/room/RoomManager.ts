import { BrowserWindow, app } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { readFile, stat, mkdir, writeFile, copyFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { join, basename, extname } from 'path'
import { Store } from '../storage/Store'
import type {
  Note,
  DeviceInfo,
  Role,
  ClientMessage,
  HostMessage,
  FileMeta,
  SharedFile,
  FileTransfer
} from '@shared/types'
import { getMimeType } from '@shared/types'
import { encodeFileChunk, decodeFileChunk, FILE_CHUNK_SIZE } from '../network/fileProtocol'

export interface NetBridge {
  broadcast(msg: HostMessage): void
  sendToHost(msg: ClientMessage): void
  sendBinary(data: Buffer): void
}

export class NullNetBridge implements NetBridge {
  broadcast(): void {}
  sendToHost(): void {}
  sendBinary(): void {}
}

interface IncomingFile {
  meta: FileMeta
  chunks: Map<number, Buffer>
}

export class RoomManager {
  private store: Store
  private win: BrowserWindow | null = null
  private role: Role = 'idle'
  private devices: DeviceInfo[] = []
  private localDeviceId = uuidv4()
  private localDeviceName = '本机'
  private net: NetBridge = new NullNetBridge()
  private statusText = '未连接'

  /** Files currently being received, keyed by fileId. */
  private incomingFiles = new Map<string, IncomingFile>()

  constructor(store: Store) {
    this.store = store
  }

  setWindow(win: BrowserWindow): void {
    this.win = win
  }

  setNetBridge(net: NetBridge): void {
    this.net = net
  }

  setRole(role: Role): void {
    this.role = role
    this.sendStatus()
    this.sendRole()
  }

  getRole(): Role {
    return this.role
  }

  getLocalDeviceId(): string {
    return this.localDeviceId
  }

  setLocalDeviceName(name: string): void {
    this.localDeviceName = name
  }

  getLocalDeviceName(): string {
    return this.localDeviceName
  }

  private sendNotes(): void {
    this.win?.webContents.send('notes:change', this.store.list())
  }

  private sendDevices(): void {
    this.win?.webContents.send('devices:change', this.devices)
  }

  private sendRole(): void {
    this.win?.webContents.send('role:change', this.role)
  }

  sendStatus(): void {
    this.win?.webContents.send('status:change', this.statusText)
  }

  setStatus(text: string): void {
    this.statusText = text
    this.sendStatus()
  }

  getStatus(): string {
    return this.statusText
  }

  setDevices(devices: DeviceInfo[]): void {
    this.devices = devices
    this.sendDevices()
  }

  getDevices(): DeviceInfo[] {
    return this.devices
  }

  getNotes(): Note[] {
    return this.store.list()
  }

  selectNote(id: string): Note | null {
    return this.store.get(id)
  }

  private isWritable(): boolean {
    return this.role === 'idle' || this.role === 'host'
  }

  /* ------------------------------------------------------------------ */
  /*  Note operations (unchanged)                                       */
  /* ------------------------------------------------------------------ */

  createNote(): Note {
    const now = Date.now()
    const note: Note = {
      id: uuidv4(),
      title: '无标题',
      content: '',
      createdAt: now,
      updatedAt: now,
      deleted: 0
    }
    if (this.isWritable()) {
      this.store.insert(note)
      this.sendNotes()
      this.net.broadcast({ type: 'note:create', note })
    } else {
      this.net.sendToHost({ type: 'note:create', note })
    }
    return note
  }

  updateNoteContent(id: string, content: string): void {
    if (this.isWritable()) {
      this.store.updateContent(id, content, Date.now())
      this.sendNotes()
      this.net.broadcast({
        type: 'note:update',
        id,
        content,
        updatedAt: this.store.get(id)?.updatedAt ?? Date.now()
      })
    } else {
      this.net.sendToHost({ type: 'note:update', id, content, updatedAt: Date.now() })
    }
  }

  renameNote(id: string, title: string): void {
    if (this.isWritable()) {
      this.store.rename(id, title, Date.now())
      this.sendNotes()
      this.net.broadcast({
        type: 'note:rename',
        id,
        title,
        updatedAt: this.store.get(id)?.updatedAt ?? Date.now()
      })
    } else {
      this.net.sendToHost({ type: 'note:rename', id, title, updatedAt: Date.now() })
    }
  }

  deleteNote(id: string): void {
    if (this.isWritable()) {
      this.store.softDelete(id)
      this.sendNotes()
      this.net.broadcast({ type: 'note:delete', id })
    } else {
      this.net.sendToHost({ type: 'note:delete', id })
    }
  }

  applyNoteCreate(note: Note): void {
    this.store.upsert(note)
    this.sendNotes()
  }

  applyNoteUpdate(id: string, content: string, updatedAt: number): void {
    const existing = this.store.get(id)
    if (!existing || updatedAt > existing.updatedAt) {
      this.store.updateContent(id, content, updatedAt)
      this.sendNotes()
    }
  }

  applyNoteRename(id: string, title: string, updatedAt: number): void {
    const existing = this.store.get(id)
    if (!existing || updatedAt > existing.updatedAt) {
      this.store.rename(id, title, updatedAt)
      this.sendNotes()
    }
  }

  applyNoteDelete(id: string): void {
    const existing = this.store.get(id)
    if (existing && existing.deleted === 0) {
      this.store.softDelete(id)
      this.sendNotes()
    }
  }

  applyFullSync(notes: Note[]): void {
    this.store.upsertMany(notes)
    this.sendNotes()
  }

  /* ------------------------------------------------------------------ */
  /*  File operations                                                   */
  /* ------------------------------------------------------------------ */

  getFiles(): SharedFile[] {
    return this.store.listFiles()
  }

  private sendFiles(): void {
    this.win?.webContents.send('files:change', this.store.listFiles())
  }

  private sendTransferUpdate(t: FileTransfer): void {
    this.win?.webContents.send('file:transfer', t)
  }

  private sharedFilesDir(): string {
    return join(app.getPath('userData'), 'shared-files')
  }

  /** Sanitise a filename so it is safe to use on disk. */
  private sanitizeFileName(name: string): string {
    return name.replace(/[<>:"/\\|?*]/g, '_')
  }

  /**
   * Read a file from disk, split it into chunks and transmit it to all
   * connected peers via the NetBridge.  Also records the file in the local
   * shared-files list so the sender sees it in the UI.
   */
  async sendFile(filePath: string): Promise<void> {
    const stats = await stat(filePath)
    const data = await readFile(filePath)
    const fileId = uuidv4()
    const chunkSize = FILE_CHUNK_SIZE
    const totalChunks = Math.max(1, Math.ceil(data.length / chunkSize))

    const meta: FileMeta = {
      id: fileId,
      name: basename(filePath),
      size: stats.size,
      mime: getMimeType(extname(filePath)),
      totalChunks,
      fromDeviceId: this.localDeviceId,
      fromDeviceName: this.localDeviceName,
      createdAt: Date.now()
    }

    // Notify the renderer that a send transfer has started.
    this.sendTransferUpdate({
      fileId,
      name: meta.name,
      size: meta.size,
      direction: 'send',
      received: 0,
      total: totalChunks,
      status: 'transferring'
    })

    // 1. Announce the file.
    if (this.isWritable()) {
      this.net.broadcast({ type: 'file:offer', file: meta })
    } else {
      this.net.sendToHost({ type: 'file:offer', file: meta })
    }

    // 2. Stream binary chunks.
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize
      const end = Math.min(start + chunkSize, data.length)
      const chunkData = data.subarray(start, end)
      const frame = encodeFileChunk(fileId, i, totalChunks, chunkData)
      this.net.sendBinary(frame)

      this.sendTransferUpdate({
        fileId,
        name: meta.name,
        size: meta.size,
        direction: 'send',
        received: i + 1,
        total: totalChunks,
        status: 'transferring'
      })

      // Yield to the event loop every ~3 MB so the UI stays responsive.
      if (i > 0 && i % 48 === 0) {
        await new Promise((r) => setTimeout(r, 0))
      }
    }

    // 3. Signal completion.
    if (this.isWritable()) {
      this.net.broadcast({ type: 'file:complete', fileId })
    } else {
      this.net.sendToHost({ type: 'file:complete', fileId })
    }

    // 4. Record locally.
    const sharedFile: SharedFile = {
      id: meta.id,
      name: meta.name,
      size: meta.size,
      mime: meta.mime,
      fromDeviceId: meta.fromDeviceId,
      fromDeviceName: meta.fromDeviceName,
      createdAt: meta.createdAt,
      savedPath: filePath
    }
    this.store.insertFile(sharedFile)
    this.sendFiles()

    this.sendTransferUpdate({
      fileId,
      name: meta.name,
      size: meta.size,
      direction: 'send',
      received: totalChunks,
      total: totalChunks,
      status: 'done'
    })
  }

  /** Called when a `file:offer` message arrives from the network. */
  handleFileOffer(meta: FileMeta): void {
    // Ignore files we sent ourselves (the host re-broadcasts to everyone).
    if (meta.fromDeviceId === this.localDeviceId) return

    this.incomingFiles.set(meta.id, { meta, chunks: new Map() })
    this.sendTransferUpdate({
      fileId: meta.id,
      name: meta.name,
      size: meta.size,
      direction: 'receive',
      received: 0,
      total: meta.totalChunks,
      status: 'transferring'
    })
  }

  /** Called when a raw binary frame arrives from the network. */
  handleFileChunkRaw(buf: Buffer): void {
    const decoded = decodeFileChunk(buf)
    if (!decoded) return
    const incoming = this.incomingFiles.get(decoded.fileId)
    if (!incoming) return

    incoming.chunks.set(decoded.index, decoded.data)
    this.sendTransferUpdate({
      fileId: decoded.fileId,
      name: incoming.meta.name,
      size: incoming.meta.size,
      direction: 'receive',
      received: incoming.chunks.size,
      total: decoded.total,
      status: 'transferring'
    })
  }

  /** Called when a `file:complete` message arrives from the network. */
  async handleFileComplete(fileId: string): Promise<void> {
    const incoming = this.incomingFiles.get(fileId)
    if (!incoming) return

    // Assemble chunks in order.
    const parts: Buffer[] = []
    for (let i = 0; i < incoming.meta.totalChunks; i++) {
      const chunk = incoming.chunks.get(i)
      if (!chunk) {
        this.sendTransferUpdate({
          fileId,
          name: incoming.meta.name,
          size: incoming.meta.size,
          direction: 'receive',
          received: incoming.chunks.size,
          total: incoming.meta.totalChunks,
          status: 'error'
        })
        this.incomingFiles.delete(fileId)
        return
      }
      parts.push(chunk)
    }

    const fullData = Buffer.concat(parts)

    // Persist to the shared-files directory.
    const dir = this.sharedFilesDir()
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }
    const safeName = this.sanitizeFileName(incoming.meta.name)
    const savedPath = join(dir, `${fileId}-${safeName}`)
    await writeFile(savedPath, fullData)

    const sharedFile: SharedFile = {
      id: incoming.meta.id,
      name: incoming.meta.name,
      size: incoming.meta.size,
      mime: incoming.meta.mime,
      fromDeviceId: incoming.meta.fromDeviceId,
      fromDeviceName: incoming.meta.fromDeviceName,
      createdAt: incoming.meta.createdAt,
      savedPath
    }
    this.store.insertFile(sharedFile)
    this.sendFiles()

    this.sendTransferUpdate({
      fileId,
      name: incoming.meta.name,
      size: incoming.meta.size,
      direction: 'receive',
      received: incoming.meta.totalChunks,
      total: incoming.meta.totalChunks,
      status: 'done'
    })

    this.incomingFiles.delete(fileId)
  }

  /** Remove a shared-file record (and optionally its on-disk copy). */
  async deleteFile(id: string): Promise<void> {
    const file = this.store.getFile(id)
    if (!file) return
    // Only delete the on-disk copy if it lives inside the shared-files dir.
    if (file.savedPath.startsWith(this.sharedFilesDir())) {
      try {
        await unlink(file.savedPath)
      } catch {
        /* ignore – file may already be gone */
      }
    }
    this.store.deleteFile(id)
    this.sendFiles()
  }

  /** Copy a shared file to a user-chosen destination. */
  async saveFileAs(id: string, destPath: string): Promise<void> {
    const file = this.store.getFile(id)
    if (!file) throw new Error('文件不存在')
    await copyFile(file.savedPath, destPath)
  }
}
