import { useEffect, useState, useCallback } from 'react'
import type { SyncProgress } from '@shared/types'

interface SyncPanelProps {
  isConnected: boolean
}

interface SyncLogEntry {
  id: string
  time: number
  phase: SyncProgress['phase']
  message: string
  peerName?: string
}

const PHASE_LABELS: Record<SyncProgress['phase'], string> = {
  idle: '空闲',
  scanning: '扫描中',
  comparing: '对比中',
  packaging: '打包中',
  sending: '发送中',
  receiving: '接收中',
  extracting: '解压中',
  done: '完成',
  error: '错误'
}

const PHASE_COLORS: Record<SyncProgress['phase'], string> = {
  idle: 'text-notion-subtext',
  scanning: 'text-blue-500',
  comparing: 'text-blue-500',
  packaging: 'text-amber-500',
  sending: 'text-amber-500',
  receiving: 'text-purple-500',
  extracting: 'text-amber-500',
  done: 'text-emerald-500',
  error: 'text-red-500'
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function SyncPanel({ isConnected }: SyncPanelProps): JSX.Element {
  const [folderPath, setFolderPath] = useState('')
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const [logs, setLogs] = useState<SyncLogEntry[]>([])
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    void window.app.getSyncFolder().then((path) => {
      if (path) setFolderPath(path)
    })
    const off = window.app.onSyncProgress((p) => {
      setProgress(p)
      if (p.phase !== 'idle') {
        setLogs((prev) => {
          const entry: SyncLogEntry = {
            id: `${p.syncId}-${Date.now()}-${Math.random()}`,
            time: Date.now(),
            phase: p.phase,
            message: p.message,
            peerName: p.peerName
          }
          // Keep last 50 entries
          const next = [...prev, entry]
          return next.slice(-50)
        })
      }
      if (p.phase === 'done' || p.phase === 'error') {
        setSyncing(false)
      }
    })
    return off
  }, [])

  const handleSelectFolder = useCallback(async () => {
    const path = await window.app.selectSyncFolder()
    if (path) {
      setFolderPath(path)
    }
  }, [])

  const handleStartSync = useCallback(async () => {
    if (!folderPath) return
    setSyncing(true)
    setProgress(null)
    try {
      await window.app.startSync()
    } catch (e) {
      setSyncing(false)
      setLogs((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          time: Date.now(),
          phase: 'error',
          message: `同步启动失败: ${e instanceof Error ? e.message : String(e)}`
        }
      ])
    }
  }, [folderPath])

  const pct =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0

  const isBusy =
    syncing &&
    progress !== null &&
    progress.phase !== 'done' &&
    progress.phase !== 'error'

  return (
    <main className="flex flex-1 flex-col bg-notion-bg">
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-12 py-8">
        {/* Folder selection */}
        <div className="mb-6">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-notion-subtext">
            文件夹同步
          </div>
          <div
            onClick={() => !syncing && void handleSelectFolder()}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed p-4 transition-colors ${
              syncing
                ? 'cursor-not-allowed border-notion-border opacity-60'
                : 'border-notion-border hover:border-notion-accent hover:bg-notion-sidebar'
            }`}
          >
            <div className="text-2xl">{folderPath ? '📁' : '📂'}</div>
            <div className="min-w-0 flex-1">
              {folderPath ? (
                <>
                  <div className="truncate text-sm font-medium text-notion-text">
                    {folderPath.split(/[\\/]/).pop() || folderPath}
                  </div>
                  <div className="truncate text-xs text-notion-subtext">{folderPath}</div>
                </>
              ) : (
                <>
                  <div className="text-sm font-medium text-notion-text">点击选择要同步的文件夹</div>
                  <div className="mt-0.5 text-xs text-notion-subtext">
                    选择项目目录，与连接的设备进行一键同步
                  </div>
                </>
              )}
            </div>
            {folderPath && !syncing && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  void handleSelectFolder()
                }}
                className="shrink-0 rounded-md border border-notion-border px-3 py-1 text-xs text-notion-subtext transition-colors hover:bg-notion-hover"
              >
                更换
              </button>
            )}
          </div>
        </div>

        {/* Sync button + status */}
        <div className="mb-6 flex items-center gap-4">
          <button
            onClick={() => void handleStartSync()}
            disabled={!folderPath || !isConnected || syncing}
            className="flex items-center gap-2 rounded-md bg-notion-text px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 1.5v3M8 11.5v3M2.5 8h3M10.5 8h3" strokeLinecap="round" />
              <path d="M4.5 4.5l2 2M9.5 9.5l2 2M11.5 4.5l-2 2M6.5 9.5l-2 2" strokeLinecap="round" />
              <circle cx="8" cy="8" r="2" />
            </svg>
            {syncing ? '同步中…' : '一键同步'}
          </button>
          {!isConnected && (
            <span className="text-xs text-notion-subtext">请先连接到其他设备</span>
          )}
          {isConnected && !folderPath && (
            <span className="text-xs text-notion-subtext">请先选择同步文件夹</span>
          )}
        </div>

        {/* Progress */}
        {progress && progress.phase !== 'idle' && (
          <div className="mb-6 rounded-md border border-notion-border p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className={`text-sm font-medium ${PHASE_COLORS[progress.phase]}`}>
                {PHASE_LABELS[progress.phase]}
                {progress.peerName ? ` · ${progress.peerName}` : ''}
              </span>
              {isBusy && progress.total > 0 && (
                <span className="text-xs text-notion-subtext">
                  {progress.current} / {progress.total} ({pct}%)
                </span>
              )}
            </div>
            <div className="mb-1 truncate text-xs text-notion-subtext">{progress.message}</div>
            {isBusy && progress.total > 0 && (
              <div className="h-1.5 overflow-hidden rounded-full bg-notion-hover">
                <div
                  className="h-full rounded-full bg-notion-accent transition-all duration-200"
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Sync log */}
        {logs.length > 0 && (
          <div className="flex-1 overflow-hidden">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-notion-subtext">
                同步日志
              </span>
              {logs.length > 0 && (
                <button
                  onClick={() => setLogs([])}
                  className="text-xs text-notion-subtext transition-colors hover:text-notion-text"
                >
                  清除
                </button>
              )}
            </div>
            <div className="h-full overflow-y-auto rounded-md border border-notion-border">
              {logs
                .slice()
                .reverse()
                .map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-2 border-b border-notion-border px-3 py-2 last:border-b-0"
                  >
                    <span className="shrink-0 font-mono text-[11px] text-notion-subtext">
                      {formatTime(log.time)}
                    </span>
                    <span className={`shrink-0 text-xs font-medium ${PHASE_COLORS[log.phase]}`}>
                      [{PHASE_LABELS[log.phase]}]
                    </span>
                    <span className="min-w-0 flex-1 break-words text-xs text-notion-text">
                      {log.message}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {logs.length === 0 && !progress && (
          <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
            <div className="mb-3 text-4xl text-notion-border">🔄</div>
            <p className="text-sm text-notion-subtext">
              选择文件夹后点击"一键同步"
            </p>
            <p className="mt-1 text-xs text-notion-subtext">
              系统将对比两端文件夹差异，自动打包传输缺失的文件
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
