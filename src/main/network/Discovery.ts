import dgram from 'dgram'
import { getLocalIp, getBroadcastAddresses } from './util'
import type { DiscoveryMessage, RoomInfo } from '@shared/types'

export const DISCOVERY_PORT = 8788
export const DISCOVERY_TIMEOUT = 3000

function encode(msg: DiscoveryMessage): Buffer {
  return Buffer.from(JSON.stringify(msg), 'utf8')
}

function decode(buf: Buffer): DiscoveryMessage | null {
  try {
    return JSON.parse(buf.toString('utf8')) as DiscoveryMessage
  } catch {
    return null
  }
}

export class HostAnnouncer {
  private socket: dgram.Socket | null = null

  start(wsPort: number, deviceName: string, hostId: string): void {
    this.stop()
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    socket.on('message', (buf, rinfo) => {
      const msg = decode(buf)
      if (!msg || msg.type !== 'discover') return
      const announce: DiscoveryMessage = {
        type: 'announce',
        host: getLocalIp(),
        port: wsPort,
        deviceName,
        hostId
      }
      socket.send(encode(announce), rinfo.port, rinfo.address)
    })
    socket.on('error', () => {
      /* ignore — discovery is best-effort */
    })
    socket.bind(DISCOVERY_PORT, () => {
      socket.setBroadcast(true)
    })
    this.socket = socket
  }

  stop(): void {
    if (this.socket) {
      try {
        this.socket.close()
      } catch {
        /* ignore */
      }
      this.socket = null
    }
  }
}

export class RoomDiscoverer {
  private socket: dgram.Socket | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private found = new Map<string, RoomInfo>()
  private onFound: (room: RoomInfo) => void
  private onDone: (rooms: RoomInfo[]) => void
  private fromId: string

  constructor(
    fromId: string,
    onFound: (room: RoomInfo) => void,
    onDone: (rooms: RoomInfo[]) => void
  ) {
    this.fromId = fromId
    this.onFound = onFound
    this.onDone = onDone
  }

  start(timeoutMs: number = DISCOVERY_TIMEOUT): void {
    this.stop()
    this.found.clear()
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    socket.on('message', (buf) => {
      const msg = decode(buf)
      if (!msg || msg.type !== 'announce') return
      const room: RoomInfo = {
        host: msg.host || '',
        port: msg.port,
        deviceName: msg.deviceName,
        hostId: msg.hostId
      }
      if (!room.host) return
      const key = room.hostId
      if (this.found.has(key)) return
      this.found.set(key, room)
      this.onFound(room)
    })
    socket.on('error', () => {
      /* ignore — discovery is best-effort */
    })
    socket.bind(0, () => {
      socket.setBroadcast(true)
      const discover: DiscoveryMessage = { type: 'discover', from: this.fromId }
      const data = encode(discover)
      for (const addr of getBroadcastAddresses()) {
        socket.send(data, DISCOVERY_PORT, addr, () => {
          /* ignore */
        })
      }
    })
    this.socket = socket
    this.timer = setTimeout(() => {
      this.finish()
    }, timeoutMs)
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.socket) {
      try {
        this.socket.close()
      } catch {
        /* ignore */
      }
      this.socket = null
    }
  }

  private finish(): void {
    const rooms = Array.from(this.found.values())
    this.stop()
    this.onDone(rooms)
  }
}
