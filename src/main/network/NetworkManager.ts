import { WebSocketServer, WebSocket } from 'ws'
import { createServer, type Server as NetServer } from 'net'
import { v4 as uuidv4 } from 'uuid'
import { RoomManager, type NetBridge, NullNetBridge } from '../room/RoomManager'
import { getLocalIp } from './util'
import type { ClientMessage, HostMessage, DeviceInfo } from '@shared/types'

export class NetworkManager implements NetBridge {
  private room: RoomManager
  private wss: WebSocketServer | null = null
  private port = 0
  private clients = new Map<WebSocket, DeviceInfo>()
  private guestWs: WebSocket | null = null
  private guestEndpoint = ''
  private guestHost = ''
  private guestPort = 0
  private guestDeviceName = ''
  private shouldReconnect = false
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private alive = new Map<WebSocket, boolean>()

  constructor(room: RoomManager) {
    this.room = room
  }

  async startHost(preferredPort = 8787): Promise<{ host: string; port: number }> {
    if (this.wss) await this.stopHost()
    const actualPort = await this.findFreePort(preferredPort)
    this.wss = new WebSocketServer({ port: actualPort })
    this.port = actualPort
    this.wss.on('connection', (ws) => this.handleConnection(ws))
    this.wss.on('error', (err) => {
      this.room.setStatus('主机错误: ' + String(err))
    })
    this.room.setNetBridge(this)
    this.room.setRole('host')
    this.room.setDevices([this.hostDevice()])
    const host = getLocalIp()
    this.room.setStatus(`主机运行中 ${host}:${actualPort}`)
    this.startHeartbeat()
    return { host, port: actualPort }
  }

  async stopHost(): Promise<void> {
    this.stopHeartbeat()
    for (const ws of this.clients.keys()) {
      try {
        ws.close(1001, 'host closing')
      } catch {
        /* ignore */
      }
    }
    this.clients.clear()
    this.wss?.close()
    this.wss = null
    this.port = 0
    this.room.setNetBridge(new NullNetBridge())
    this.room.setRole('idle')
    this.room.setDevices([])
    this.room.setStatus('未连接')
  }

  private hostDevice(): DeviceInfo {
    return {
      id: this.room.getLocalDeviceId(),
      name: this.room.getLocalDeviceName(),
      isHost: true
    }
  }

  private currentDevices(): DeviceInfo[] {
    return [this.hostDevice(), ...this.clients.values()]
  }

  private findFreePort(start: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const tryPort = (p: number, attemptsLeft: number): void => {
        if (attemptsLeft <= 0) {
          reject(new Error('无可用端口'))
          return
        }
        const tester: NetServer = createServer()
        tester.once('error', () => tryPort(p + 1, attemptsLeft - 1))
        tester.once('listening', () => {
          tester.close(() => resolve(p))
        })
        tester.listen(p, '0.0.0.0')
      }
      tryPort(start, 50)
    })
  }

  private handleConnection(ws: WebSocket): void {
    const pendingId = uuidv4()
    this.clients.set(ws, { id: pendingId, name: '连接中…', isHost: false })
    this.alive.set(ws, true)
    ws.on('pong', () => {
      this.alive.set(ws, true)
    })
    ws.on('message', (raw) => this.handleClientMessage(ws, raw.toString()))
    ws.on('close', () => this.handleDisconnect(ws))
    ws.on('error', () => this.handleDisconnect(ws))
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      for (const ws of this.clients.keys()) {
        if (!this.alive.get(ws)) {
          try {
            ws.terminate()
          } catch {
            /* ignore */
          }
          this.handleDisconnect(ws)
          continue
        }
        this.alive.set(ws, false)
        try {
          ws.ping()
        } catch {
          /* ignore */
        }
      }
    }, 15000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    this.alive.clear()
  }

  private handleDisconnect(ws: WebSocket): void {
    this.alive.delete(ws)
    if (this.clients.delete(ws)) {
      this.broadcastDevices()
    }
  }

  private handleClientMessage(ws: WebSocket, raw: string): void {
    let msg: ClientMessage
    try {
      msg = JSON.parse(raw) as ClientMessage
    } catch {
      return
    }
    switch (msg.type) {
      case 'hello': {
        const dev: DeviceInfo = {
          id: msg.deviceId,
          name: msg.deviceName,
          isHost: false
        }
        this.clients.set(ws, dev)
        this.sendTo(ws, {
          type: 'welcome',
          notes: this.room.getNotes(),
          devices: this.currentDevices()
        })
        this.broadcastDevices()
        break
      }
      case 'note:create':
        this.room.applyNoteCreate(msg.note)
        this.broadcast({ type: 'note:create', note: msg.note })
        break
      case 'note:update':
        this.room.applyNoteUpdate(msg.id, msg.content, msg.updatedAt)
        this.broadcast(msg)
        break
      case 'note:rename':
        this.room.applyNoteRename(msg.id, msg.title, msg.updatedAt)
        this.broadcast(msg)
        break
      case 'note:delete':
        this.room.applyNoteDelete(msg.id)
        this.broadcast({ type: 'note:delete', id: msg.id })
        break
      case 'bye':
        this.handleDisconnect(ws)
        break
    }
  }

  private broadcastDevices(): void {
    const devices = this.currentDevices()
    this.room.setDevices(devices)
    this.broadcast({ type: 'devices:update', devices })
  }

  private sendTo(ws: WebSocket, msg: HostMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  }

  broadcast(msg: HostMessage): void {
    const data = JSON.stringify(msg)
    for (const ws of this.clients.keys()) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(data)
        } catch {
          /* ignore */
        }
      }
    }
  }

  sendToHost(msg: ClientMessage): void {
    if (this.guestWs && this.guestWs.readyState === WebSocket.OPEN) {
      try {
        this.guestWs.send(JSON.stringify(msg))
      } catch {
        /* ignore */
      }
    }
  }

  async joinHost(host: string, port: number, deviceName: string): Promise<void> {
    if (this.wss) await this.stopHost()
    if (this.guestWs) await this.leaveHost()
    this.room.setLocalDeviceName(deviceName)
    this.guestHost = host
    this.guestPort = port
    this.guestDeviceName = deviceName
    this.shouldReconnect = true
    this.reconnectAttempts = 0
    try {
      await this.connectGuest()
    } catch (e) {
      this.shouldReconnect = false
      throw e
    }
  }

  private connectGuest(): Promise<void> {
    const endpoint = `ws://${this.guestHost}:${this.guestPort}`
    return new Promise((resolve, reject) => {
      let settled = false
      let established = false
      let ws: WebSocket
      try {
        ws = new WebSocket(endpoint)
      } catch (e) {
        reject(new Error('地址无效: ' + String(e)))
        return
      }
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true
          try {
            ws.close()
          } catch {
            /* ignore */
          }
          reject(new Error('连接超时'))
        }
      }, 8000)

      ws.on('open', () => {
        this.guestWs = ws
        this.guestEndpoint = endpoint
        this.room.setNetBridge(this)
        this.sendToHost({
          type: 'hello',
          deviceId: this.room.getLocalDeviceId(),
          deviceName: this.guestDeviceName
        })
      })

      ws.on('message', (raw) => {
        let msg: HostMessage
        try {
          msg = JSON.parse(raw.toString()) as HostMessage
        } catch {
          return
        }
        this.handleHostMessage(msg)
        if (msg.type === 'welcome' && !settled) {
          settled = true
          established = true
          this.reconnectAttempts = 0
          clearTimeout(timeout)
          resolve()
        }
      })

      ws.on('close', () => {
        this.guestWs = null
        const wasGuest = this.room.getRole() === 'guest'
        if (wasGuest) {
          this.room.setNetBridge(new NullNetBridge())
          this.room.setRole('idle')
          this.room.setDevices([])
        }
        if (!settled) {
          settled = true
          clearTimeout(timeout)
          reject(new Error('无法连接到主机'))
        }
        if (established && this.shouldReconnect) {
          this.scheduleReconnect()
        }
      })
      ws.on('error', (e) => {
        if (!settled) {
          settled = true
          clearTimeout(timeout)
          reject(new Error('连接失败: ' + (e?.message ?? String(e))))
        }
      })
    })
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return
    if (this.reconnectAttempts >= 5) {
      this.room.setStatus('重连失败，已停止')
      this.shouldReconnect = false
      return
    }
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 16000)
    this.reconnectAttempts++
    this.room.setStatus(`重连中… (${this.reconnectAttempts}/5)`)
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      this.connectGuest()
        .then(() => {
          this.room.setStatus(`已连接 ${this.guestHost}:${this.guestPort}`)
        })
        .catch(() => {
          this.scheduleReconnect()
        })
    }, delay)
  }

  private stopReconnect(): void {
    this.shouldReconnect = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private handleHostMessage(msg: HostMessage): void {
    switch (msg.type) {
      case 'welcome':
        this.room.applyFullSync(msg.notes)
        this.room.setDevices(msg.devices)
        this.room.setRole('guest')
        this.room.setStatus(`已连接 ${this.guestEndpoint.replace('ws://', '')}`)
        break
      case 'devices:update':
        this.room.setDevices(msg.devices)
        break
      case 'note:create':
        this.room.applyNoteCreate(msg.note)
        break
      case 'note:update':
        this.room.applyNoteUpdate(msg.id, msg.content, msg.updatedAt)
        break
      case 'note:rename':
        this.room.applyNoteRename(msg.id, msg.title, msg.updatedAt)
        break
      case 'note:delete':
        this.room.applyNoteDelete(msg.id)
        break
    }
  }

  async leaveHost(): Promise<void> {
    this.stopReconnect()
    if (!this.guestWs) return
    try {
      this.sendToHost({ type: 'bye' })
    } catch {
      /* ignore */
    }
    try {
      this.guestWs.close()
    } catch {
      /* ignore */
    }
    this.guestWs = null
    this.guestEndpoint = ''
    this.guestHost = ''
    this.guestPort = 0
    this.room.setNetBridge(new NullNetBridge())
    this.room.setRole('idle')
    this.room.setDevices([])
    this.room.setStatus('未连接')
  }

  async disconnect(): Promise<void> {
    if (this.wss) await this.stopHost()
    else if (this.guestWs) await this.leaveHost()
    else this.stopReconnect()
  }

  isHosting(): boolean {
    return this.wss !== null
  }

  isGuest(): boolean {
    return this.guestWs !== null
  }

  getPort(): number {
    return this.port
  }
}
