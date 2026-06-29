interface TopBarProps {
  statusText: string
  deviceCount: number
  onConnectClick: () => void
  onDisconnect: () => void
  canConnect: boolean
}

export function TopBar({
  statusText,
  deviceCount,
  onConnectClick,
  onDisconnect,
  canConnect
}: TopBarProps): JSX.Element {
  const dotColor =
    deviceCount > 0
      ? 'bg-emerald-500'
      : canConnect
        ? 'bg-notion-border'
        : 'bg-notion-border'

  return (
    <header className="flex h-10 shrink-0 items-center justify-between border-b border-notion-border bg-notion-bg px-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-notion-text">共享便签</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${dotColor}`} />
          <span className="text-xs text-notion-subtext">{statusText}</span>
          {deviceCount > 0 && (
            <span className="text-xs text-notion-subtext">· {deviceCount} 台设备</span>
          )}
        </div>
        {canConnect ? (
          <button
            onClick={onConnectClick}
            className="rounded-md bg-notion-text px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            建立连接
          </button>
        ) : (
          <button
            onClick={onDisconnect}
            className="rounded-md border border-notion-border px-3 py-1 text-xs font-medium text-notion-subtext transition-colors hover:bg-notion-hover"
          >
            断开
          </button>
        )}
      </div>
    </header>
  )
}
