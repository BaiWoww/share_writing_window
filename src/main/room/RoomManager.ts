import { BrowserWindow } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { Store } from '../storage/Store'
import type { Note, DeviceInfo, Role, ClientMessage, HostMessage } from '@shared/types'

export interface NetBridge {
  broadcast(msg: HostMessage): void
  sendToHost(msg: ClientMessage): void
}

export class NullNetBridge implements NetBridge {
  broadcast(): void {}
  sendToHost(): void {}
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
}
