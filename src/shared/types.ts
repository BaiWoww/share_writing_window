export type Role = 'idle' | 'host' | 'guest'

export interface Note {
  id: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
  deleted: 0 | 1
}

export interface DeviceInfo {
  id: string
  name: string
  isHost: boolean
}

/* ------------------------------------------------------------------ */
/*  File transfer types                                               */
/* ------------------------------------------------------------------ */

/** Metadata announced before binary chunks are sent. */
export interface FileMeta {
  id: string
  name: string
  size: number
  mime: string
  totalChunks: number
  fromDeviceId: string
  fromDeviceName: string
  createdAt: number
  /** If set, this file is a folder-sync package (tar.gz) to be extracted. */
  syncId?: string
  /** The device id that should receive this sync package. */
  syncTargetDeviceId?: string
}

/** A file that has been fully received and saved to disk. */
export interface SharedFile {
  id: string
  name: string
  size: number
  mime: string
  fromDeviceId: string
  fromDeviceName: string
  createdAt: number
  savedPath: string
}

/** Live progress of an ongoing file transfer. */
export interface FileTransfer {
  fileId: string
  name: string
  size: number
  direction: 'send' | 'receive'
  received: number
  total: number
  status: 'transferring' | 'done' | 'error'
}

/** Best-effort MIME type from file extension (no external dependency). */
export function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    '.txt': 'text/plain',
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.zip': 'application/zip',
    '.rar': 'application/vnd.rar',
    '.7z': 'application/x-7z-compressed',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.mp4': 'video/mp4',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.ogg': 'audio/ogg',
    '.json': 'application/json',
    '.csv': 'text/csv',
    '.html': 'text/html',
    '.md': 'text/markdown',
    '.xml': 'application/xml'
  }
  return map[ext.toLowerCase()] || 'application/octet-stream'
}

/* ------------------------------------------------------------------ */
/*  Network message types                                             */
/* ------------------------------------------------------------------ */

export type ClientMessage =
  | { type: 'hello'; deviceName: string; deviceId: string }
  | { type: 'note:create'; note: Note }
  | { type: 'note:update'; id: string; content: string; updatedAt: number }
  | { type: 'note:rename'; id: string; title: string; updatedAt: number }
  | { type: 'note:delete'; id: string }
  | { type: 'file:offer'; file: FileMeta }
  | { type: 'file:complete'; fileId: string }
  | { type: 'sync:request'; manifest: SyncManifest }
  | {
      type: 'sync:response'
      syncId: string
      manifest: SyncManifest
      neededFiles: string[]
      toDeviceId: string
    }
  | { type: 'sync:package:offer'; syncId: string; file: FileMeta; toDeviceId: string }
  | { type: 'sync:done'; syncId: string; toDeviceId: string }
  | { type: 'bye' }

export type HostMessage =
  | { type: 'welcome'; notes: Note[]; devices: DeviceInfo[] }
  | { type: 'note:create'; note: Note }
  | { type: 'note:update'; id: string; content: string; updatedAt: number }
  | { type: 'note:rename'; id: string; title: string; updatedAt: number }
  | { type: 'note:delete'; id: string }
  | { type: 'devices:update'; devices: DeviceInfo[] }
  | { type: 'file:offer'; file: FileMeta }
  | { type: 'file:complete'; fileId: string }
  | { type: 'sync:request'; manifest: SyncManifest }
  | {
      type: 'sync:response'
      syncId: string
      manifest: SyncManifest
      neededFiles: string[]
      toDeviceId: string
    }
  | { type: 'sync:package:offer'; syncId: string; file: FileMeta; toDeviceId: string }
  | { type: 'sync:done'; syncId: string; toDeviceId: string }

export type NetMessage = ClientMessage | HostMessage

export interface RoomInfo {
  host: string
  port: number
  deviceName: string
  hostId: string
}

export type DiscoveryMessage =
  { type: 'discover'; from: string } | ({ type: 'announce' } & RoomInfo)

/* ------------------------------------------------------------------ */
/*  Folder sync types                                                 */
/* ------------------------------------------------------------------ */

/** A single file entry in a sync manifest. */
export interface FileEntry {
  relativePath: string
  size: number
  mtime: number
}

/** Manifest of a folder, sent to peers for comparison. */
export interface SyncManifest {
  syncId: string
  folderLabel: string
  files: FileEntry[]
  fromDeviceId: string
  fromDeviceName: string
}

/** Sync phases shown in the UI. */
export type SyncPhase =
  | 'idle'
  | 'scanning'
  | 'comparing'
  | 'packaging'
  | 'sending'
  | 'receiving'
  | 'extracting'
  | 'done'
  | 'error'

/** Progress update pushed to the renderer. */
export interface SyncProgress {
  syncId: string
  phase: SyncPhase
  message: string
  current: number
  total: number
  /** Files sent to peers. */
  filesSent: number
  /** Files received from peers. */
  filesReceived: number
  /** Peer device name (if applicable). */
  peerName?: string
}
