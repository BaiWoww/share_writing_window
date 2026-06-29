import type { Note, DeviceInfo, Role } from '@shared/types'

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
}

declare global {
  interface Window {
    app: AppApi
  }
}

export {}
