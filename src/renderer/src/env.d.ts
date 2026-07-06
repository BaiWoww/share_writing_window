import type { Note, DeviceInfo, Role, RoomInfo, SharedFile, FileTransfer } from '@shared/types'

export interface AppApi {
  ping: () => Promise<string>
  onNotesChange: (cb: (notes: Note[]) => void) => () => void
  onDevicesChange: (cb: (devices: DeviceInfo[]) => void) => () => void
  onRoleChange: (cb: (role: Role) => void) => () => void
  onStatusChange: (cb: (status: string) => void) => () => void
  getNotes: () => Promise<Note[]>
  selectNote: (id: string) => Promise<Note | null>
  createNote: () => Promise<Note>
  updateNoteContent: (id: string, content: string) => Promise<void>
  renameNote: (id: string, title: string) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  startHost: (deviceName: string) => Promise<{ host: string; port: number }>
  joinHost: (host: string, port: number, deviceName: string) => Promise<void>
  disconnect: () => Promise<void>
  getLocalIp: () => Promise<string>
  startDiscovery: () => Promise<void>
  stopDiscovery: () => Promise<void>
  onDiscoveryRoom: (cb: (room: RoomInfo) => void) => () => void
  onDiscoveryDone: (cb: () => void) => () => void

  /* file transfer */
  onFilesChange: (cb: (files: SharedFile[]) => void) => () => void
  onFileTransfer: (cb: (transfer: FileTransfer) => void) => () => void
  getFiles: () => Promise<SharedFile[]>
  selectFile: () => Promise<string | null>
  sendFile: (filePath: string) => Promise<void>
  openFile: (path: string) => Promise<void>
  saveFileAs: (id: string) => Promise<boolean>
  deleteFile: (id: string) => Promise<void>
  revealFile: (path: string) => Promise<void>
}

declare global {
  interface Window {
    app: AppApi
  }
}

export {}
