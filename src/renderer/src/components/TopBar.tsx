type ViewMode = 'notes' | 'files'

interface TopBarProps {
  statusText: string
  deviceCount: number
  onConnectClick: () => void
  onDisconnect: () => void
  canConnect: boolean
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

export function TopBar({
  statusText,
  deviceCount,
  onConnectClick,
  onDisconnect,
  canConnect,
  viewMode,
  onViewModeChange
}: TopBarProps): JSX.Element {
  const dotColor =
    deviceCount > 0 ? 'bg-emerald-500' : canConnect ? 'bg-notion-border' : 'bg-notion-border'

  return (
    <header className="flex h-10 shrink-0 items-center justify-between border-b border-notion-border bg-notion-bg px-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-notion-text">共享便签</span>
        <div className="flex gap-0.5 rounded-md bg-notion-sidebar p-0.5">
          <button
            onClick={() => onViewModeChange('notes')}
            className={`rounded px-2.5 py-0.5 text-xs font-medium transition-colors ${
              viewMode === 'notes'
                ? 'bg-notion-bg text-notion-text shadow-sm'
                : 'text-notion-subtext hover:text-notion-text'
            }`}
          >
            便签
          </button>
          <button
            onClick={() => onViewModeChange('files')}
            className={`rounded px-2.5 py-0.5 text-xs font-medium transition-colors ${
              viewMode === 'files'
                ? 'bg-notion-bg text-notion-text shadow-sm'
                : 'text-notion-subtext hover:text-notion-text'
            }`}
          >
            文件
          </button>
        </div>
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
