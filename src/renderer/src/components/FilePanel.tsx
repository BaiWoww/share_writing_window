import { useState, useCallback } from 'react'
import type { SharedFile, FileTransfer } from '@shared/types'

interface FilePanelProps {
  files: SharedFile[]
  transfers: FileTransfer[]
  isConnected: boolean
  onUpload: () => Promise<void>
  onSendFile: (filePath: string) => Promise<void>
  onOpen: (path: string) => Promise<void>
  onSaveAs: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onReveal: (path: string) => Promise<void>
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'].includes(ext)) return '🖼️'
  if (['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(ext)) return '🎬'
  if (['mp3', 'wav', 'flac', 'ogg'].includes(ext)) return '🎵'
  if (['pdf'].includes(ext)) return '📕'
  if (['doc', 'docx'].includes(ext)) return '📘'
  if (['xls', 'xlsx'].includes(ext)) return '📗'
  if (['ppt', 'pptx'].includes(ext)) return '📙'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '🗜️'
  if (['txt', 'md'].includes(ext)) return '📃'
  return '📎'
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

export function FilePanel({
  files,
  transfers,
  isConnected,
  onUpload,
  onSendFile,
  onOpen,
  onSaveAs,
  onDelete,
  onReveal
}: FilePanelProps): JSX.Element {
  const [dragOver, setDragOver] = useState(false)
  const [hoverId, setHoverId] = useState<string | null>(null)

  const activeTransfers = transfers.filter((t) => t.status === 'transferring')

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const droppedFiles = Array.from(e.dataTransfer.files)
      for (const file of droppedFiles) {
        // Electron exposes the real path on File objects in the renderer.
        const path = (file as File & { path?: string }).path
        if (path) {
          await onSendFile(path)
        }
      }
    },
    [onSendFile]
  )

  return (
    <main className="flex flex-1 flex-col bg-notion-bg">
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-12 py-8">
        {/* Upload zone */}
        <div
          onClick={() => void onUpload()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => void handleDrop(e)}
          className={`mb-6 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
            dragOver
              ? 'border-notion-accent bg-notion-sidebar'
              : 'border-notion-border hover:border-notion-accent hover:bg-notion-sidebar'
          }`}
        >
          <div className="mb-2 text-3xl">📎</div>
          <p className="text-sm font-medium text-notion-text">点击选择文件或拖拽到此区域</p>
          <p className="mt-1 text-xs text-notion-subtext">
            {isConnected ? '文件将发送到所有已连接的设备' : '当前未连接，文件将仅保存在本地'}
          </p>
        </div>

        {/* Active transfers */}
        {activeTransfers.length > 0 && (
          <div className="mb-6">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-notion-subtext">
              传输中
            </div>
            {activeTransfers.map((t) => {
              const pct = t.total > 0 ? Math.round((t.received / t.total) * 100) : 0
              return (
                <div key={t.fileId} className="mb-2 rounded-md border border-notion-border p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="truncate text-sm text-notion-text">{t.name}</span>
                    <span className="ml-2 shrink-0 text-xs text-notion-subtext">
                      {t.direction === 'send' ? '↑ 发送' : '↓ 接收'} {pct}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-notion-hover">
                    <div
                      className="h-full rounded-full bg-notion-accent transition-all duration-200"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Shared files list */}
        <div className="flex-1">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-notion-subtext">
            已共享文件
          </div>
          {files.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <div className="mb-2 text-3xl text-notion-border">📂</div>
              <p className="text-sm text-notion-subtext">暂无共享文件</p>
            </div>
          ) : (
            files.map((file) => (
              <div
                key={file.id}
                onMouseEnter={() => setHoverId(file.id)}
                onMouseLeave={() => setHoverId(null)}
                className="group mb-1 flex items-center rounded-md px-2 py-2 transition-colors hover:bg-notion-hover"
              >
                <span className="mr-3 text-xl">{getFileIcon(file.name)}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-notion-text">{file.name}</div>
                  <div className="truncate text-xs text-notion-subtext">
                    {formatSize(file.size)} · {file.fromDeviceName} · {formatTime(file.createdAt)}
                  </div>
                </div>
                <div
                  className={`ml-2 flex shrink-0 items-center gap-0.5 transition-opacity ${
                    hoverId === file.id ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  <button
                    onClick={() => void onOpen(file.savedPath)}
                    className="flex h-7 w-7 items-center justify-center rounded text-notion-subtext transition-colors hover:bg-notion-border hover:text-notion-text"
                    title="打开"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M3 13V5a1 1 0 011-1h2.5l1-1h3l1 1H12a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1z" />
                      <circle cx="8" cy="9" r="2" />
                    </svg>
                  </button>
                  <button
                    onClick={() => void onSaveAs(file.id)}
                    className="flex h-7 w-7 items-center justify-center rounded text-notion-subtext transition-colors hover:bg-notion-border hover:text-notion-text"
                    title="另存为"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 3v10h10V5.5L10.5 3H3z" />
                      <path d="M6 3v3h4V3M6 13v-4h4v4" />
                    </svg>
                  </button>
                  <button
                    onClick={() => void onReveal(file.savedPath)}
                    className="flex h-7 w-7 items-center justify-center rounded text-notion-subtext transition-colors hover:bg-notion-border hover:text-notion-text"
                    title="在文件夹中显示"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M2 5V4a1 1 0 011-1h3l1 1h6a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V5z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => void onDelete(file.id)}
                    className="flex h-7 w-7 items-center justify-center rounded text-notion-subtext transition-colors hover:bg-notion-border hover:text-notion-text"
                    title="删除"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    >
                      <path d="M3 4h10M6.5 4V2.5h3V4M5 4l.5 9h5L11 4" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  )
}
