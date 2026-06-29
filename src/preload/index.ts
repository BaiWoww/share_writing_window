import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Note, DeviceInfo, Role } from '@shared/types'

type Listener<T> = (payload: T) => void

function on<T>(channel: string, cb: Listener<T>): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return (): void => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api = {
  ping: (): Promise<string> => ipcRenderer.invoke('ping'),
  onNotesChange: (cb: Listener<Note[]>) => on<Note[]>('notes:change', cb),
  onDevicesChange: (cb: Listener<DeviceInfo[]>) => on<DeviceInfo[]>('devices:change', cb),
  onRoleChange: (cb: Listener<Role>) => on<Role>('role:change', cb),
  onStatusChange: (cb: Listener<string>) => on<string>('status:change', cb),
  getNotes: (): Promise<Note[]> => ipcRenderer.invoke('note:list'),
  selectNote: (id: string): Promise<Note | null> => ipcRenderer.invoke('note:select', id),
  createNote: (): Promise<Note> => ipcRenderer.invoke('note:create'),
  updateNoteContent: (id: string, content: string): Promise<void> =>
    ipcRenderer.invoke('note:update-content', id, content),
  renameNote: (id: string, title: string): Promise<void> =>
    ipcRenderer.invoke('note:rename', id, title),
  deleteNote: (id: string): Promise<void> => ipcRenderer.invoke('note:delete', id),
  startHost: (deviceName: string): Promise<{ host: string; port: number }> =>
    ipcRenderer.invoke('host:start', deviceName),
  joinHost: (host: string, port: number, deviceName: string): Promise<void> =>
    ipcRenderer.invoke('host:join', host, port, deviceName),
  disconnect: (): Promise<void> => ipcRenderer.invoke('host:disconnect'),
  getLocalIp: (): Promise<string> => ipcRenderer.invoke('host:local-ip')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('app', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.app = api
}
