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

export type ClientMessage =
  | { type: 'hello'; deviceName: string; deviceId: string }
  | { type: 'note:create'; note: Note }
  | { type: 'note:update'; id: string; content: string; updatedAt: number }
  | { type: 'note:rename'; id: string; title: string; updatedAt: number }
  | { type: 'note:delete'; id: string }
  | { type: 'bye' }

export type HostMessage =
  | { type: 'welcome'; notes: Note[]; devices: DeviceInfo[] }
  | { type: 'note:create'; note: Note }
  | { type: 'note:update'; id: string; content: string; updatedAt: number }
  | { type: 'note:rename'; id: string; title: string; updatedAt: number }
  | { type: 'note:delete'; id: string }
  | { type: 'devices:update'; devices: DeviceInfo[] }

export type NetMessage = ClientMessage | HostMessage

export interface RoomInfo {
  host: string
  port: number
  deviceName: string
  hostId: string
}

export type DiscoveryMessage =
  | { type: 'discover'; from: string }
  | ({ type: 'announce' } & RoomInfo)
