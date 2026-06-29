import { useEffect, useState } from 'react'

interface ConnectionDialogProps {
  open: boolean
  localIp: string
  onClose: () => void
  onStartHost: (deviceName: string) => Promise<void>
  onJoin: (host: string, port: number, deviceName: string) => Promise<void>
}

export function ConnectionDialog({
  open,
  localIp,
  onClose,
  onStartHost,
  onJoin
}: ConnectionDialogProps): JSX.Element | null {
  const [tab, setTab] = useState<'host' | 'join'>('host')
  const [deviceName, setDeviceName] = useState('我的设备')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('8787')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setError(null)
      setBusy(false)
    }
  }, [open])

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

  const handleJoin = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
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
            </div>
          ) : (
            <>
              <label className="mb-1 block text-xs font-medium text-notion-subtext">
                主机地址
              </label>
              <input
                value={host}
                onChange={(e) => setHost(e.target.value)}
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
