import { useEffect, useRef, useState } from 'react'
import type { RoomInfo } from '@shared/types'

interface ConnectionDialogProps {
  open: boolean
  localIp: string
  onClose: () => void
  onStartHost: (deviceName: string) => Promise<void>
  onJoin: (host: string, port: number, deviceName: string) => Promise<void>
  onStartDiscovery: () => Promise<void>
  onStopDiscovery: () => Promise<void>
}

export function ConnectionDialog({
  open,
  localIp,
  onClose,
  onStartHost,
  onJoin,
  onStartDiscovery,
  onStopDiscovery
}: ConnectionDialogProps): JSX.Element | null {
  const [tab, setTab] = useState<'host' | 'join'>('host')
  const [deviceName, setDeviceName] = useState('我的设备')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('8787')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rooms, setRooms] = useState<RoomInfo[]>([])
  const [selectedRoom, setSelectedRoom] = useState<RoomInfo | null>(null)
  const [searching, setSearching] = useState(false)
  const unsubRef = useRef<Array<() => void>>([])

  useEffect(() => {
    if (open) {
      setError(null)
      setBusy(false)
      setRooms([])
      setSelectedRoom(null)
      setSearching(false)
    }
  }, [open])

  useEffect(() => {
    const offRoom = window.app.onDiscoveryRoom((room) => {
      setRooms((prev) => {
        if (prev.some((r) => r.hostId === room.hostId)) return prev
        return [...prev, room]
      })
    })
    const offDone = window.app.onDiscoveryDone(() => {
      setSearching(false)
    })
    unsubRef.current = [offRoom, offDone]
    return (): void => {
      unsubRef.current.forEach((fn) => fn())
      unsubRef.current = []
    }
  }, [])

  useEffect(() => {
    if (!open && searching) {
      void onStopDiscovery()
      setSearching(false)
    }
  }, [open, searching, onStopDiscovery])

  if (!open) return null

  const handleStartHost = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await onStartHost(deviceName || '我的设备')
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const handleSearch = async (): Promise<void> => {
    setError(null)
    setRooms([])
    setSelectedRoom(null)
    setSearching(true)
    try {
      await onStartDiscovery()
    } catch (e) {
      setSearching(false)
      setError(String(e))
    }
  }

  const handleStopSearch = async (): Promise<void> => {
    await onStopDiscovery()
    setSearching(false)
  }

  const handleSelectRoom = (room: RoomInfo): void => {
    setSelectedRoom(room)
    setHost(room.host)
    setPort(String(room.port))
  }

  const handleJoin = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      if (searching) await onStopDiscovery()
      const portNum = parseInt(port, 10)
      if (!host) throw new Error('请输入主机地址')
      if (!portNum || portNum < 1 || portNum > 65535) throw new Error('端口无效')
      await onJoin(host, portNum, deviceName || '我的设备')
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="w-[420px] overflow-hidden rounded-xl bg-notion-bg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3">
          <h2 className="text-base font-semibold text-notion-text">建立连接</h2>
          <p className="mt-1 text-xs text-notion-subtext">
            在同一局域网下与其他设备共享便签
          </p>
        </div>

        <div className="mx-5 flex gap-1 rounded-lg bg-notion-sidebar p-1">
          <button
            onClick={() => setTab('host')}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
              tab === 'host'
                ? 'bg-notion-bg text-notion-text shadow-sm'
                : 'text-notion-subtext hover:text-notion-text'
            }`}
          >
            创建房间
          </button>
          <button
            onClick={() => setTab('join')}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
              tab === 'join'
                ? 'bg-notion-bg text-notion-text shadow-sm'
                : 'text-notion-subtext hover:text-notion-text'
            }`}
          >
            加入房间
          </button>
        </div>

        <div className="px-5 py-4">
          <label className="mb-1 block text-xs font-medium text-notion-subtext">
            设备名称
          </label>
          <input
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            className="mb-3 w-full rounded-md border border-notion-border px-3 py-2 text-sm text-notion-text outline-none focus:border-notion-accent"
          />

          {tab === 'host' ? (
            <div className="rounded-md bg-notion-sidebar px-3 py-2.5 text-xs text-notion-subtext">
              创建后，其他设备可通过以下地址加入：
              <div className="mt-1 font-mono text-sm text-notion-text">
                {localIp || '获取中…'} : 8787
              </div>
              <div className="mt-1.5 text-[11px] text-notion-subtext">
                其他设备可在"加入房间"中点击搜索自动发现本机。
              </div>
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2">
                <button
                  onClick={searching ? handleStopSearch : handleSearch}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-md border border-notion-border px-3 py-1.5 text-xs font-medium text-notion-text transition-colors hover:bg-notion-hover disabled:opacity-50"
                >
                  {searching ? '停止搜索' : '🔍 搜索局域网房间'}
                </button>
                {searching && (
                  <span className="text-xs text-notion-subtext">
                    搜索中… {rooms.length > 0 && `(已发现 ${rooms.length})`}
                  </span>
                )}
              </div>

              {rooms.length > 0 && (
                <div className="mb-3 max-h-40 overflow-y-auto rounded-md border border-notion-border">
                  {rooms.map((room) => {
                    const active = selectedRoom?.hostId === room.hostId
                    return (
                      <button
                        key={room.hostId}
                        onClick={() => handleSelectRoom(room)}
                        className={`flex w-full items-center justify-between border-b border-notion-border px-3 py-2 text-left text-sm transition-colors last:border-b-0 ${
                          active
                            ? 'bg-notion-hover text-notion-text'
                            : 'text-notion-text hover:bg-notion-hover'
                        }`}
                      >
                        <span className="truncate font-medium">{room.deviceName}</span>
                        <span className="ml-2 shrink-0 font-mono text-xs text-notion-subtext">
                          {room.host}:{room.port}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              {!searching && rooms.length === 0 && (
                <div className="mb-3 text-center text-xs text-notion-subtext">
                  点击上方按钮搜索，或手动输入地址加入
                </div>
              )}

              <div className="mb-1 mt-2 text-[11px] font-medium text-notion-subtext">
                手动输入
              </div>
              <label className="mb-1 block text-xs font-medium text-notion-subtext">
                主机地址
              </label>
              <input
                value={host}
                onChange={(e) => {
                  setHost(e.target.value)
                  setSelectedRoom(null)
                }}
                placeholder="例如 192.168.1.5"
                className="mb-3 w-full rounded-md border border-notion-border px-3 py-2 text-sm text-notion-text outline-none focus:border-notion-accent"
              />
              <label className="mb-1 block text-xs font-medium text-notion-subtext">
                端口
              </label>
              <input
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="mb-3 w-full rounded-md border border-notion-border px-3 py-2 text-sm text-notion-text outline-none focus:border-notion-accent"
              />
            </>
          )}

          {error && (
            <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-notion-subtext transition-colors hover:bg-notion-hover"
            >
              取消
            </button>
            <button
              disabled={busy}
              onClick={tab === 'host' ? handleStartHost : handleJoin}
              className="rounded-md bg-notion-text px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? '处理中…' : tab === 'host' ? '创建' : '加入'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
