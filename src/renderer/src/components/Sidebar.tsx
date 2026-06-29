import { useState } from 'react'
import type { Note } from '@shared/types'

interface SidebarProps {
  notes: Note[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
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

export function Sidebar({
  notes,
  selectedId,
  onSelect,
  onCreate,
  onDelete
}: SidebarProps): JSX.Element {
  const [hoverId, setHoverId] = useState<string | null>(null)

  return (
    <aside className="flex h-full w-60 flex-col border-r border-notion-border bg-notion-sidebar">
      <div className="px-3 pt-3 pb-2">
        <button
          onClick={onCreate}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-notion-subtext transition-colors hover:bg-notion-hover hover:text-notion-text"
        >
          <span className="text-base leading-none">+</span>
          <span>新建便签</span>
        </button>
      </div>

      <div className="px-2 pb-1">
        <div className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-notion-subtext">
          便签
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {notes.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-notion-subtext">
            暂无便签
          </div>
        ) : (
          notes.map((note) => {
            const isActive = note.id === selectedId
            return (
              <div
                key={note.id}
                onClick={() => onSelect(note.id)}
                onMouseEnter={() => setHoverId(note.id)}
                onMouseLeave={() => setHoverId(null)}
                className={`group mb-0.5 flex cursor-pointer items-center rounded-md px-2 py-1.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-notion-hover text-notion-text'
                    : 'text-notion-text hover:bg-notion-hover'
                }`}
              >
                <div className="flex-1 truncate">
                  <div className="truncate">{note.title || '无标题'}</div>
                  <div className="truncate text-xs text-notion-subtext">
                    {note.content.slice(0, 30) || '空白'}
                  </div>
                </div>
                <div className="ml-2 flex shrink-0 items-center gap-1">
                  <span className="text-[10px] text-notion-subtext">
                    {formatTime(note.updatedAt)}
                  </span>
                  {(hoverId === note.id || isActive) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(note.id)
                      }}
                      className="ml-1 flex h-5 w-5 items-center justify-center rounded text-notion-subtext transition-colors hover:bg-notion-border hover:text-notion-text"
                      title="删除"
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      >
                        <path d="M3 4h10M6.5 4V2.5h3V4M5 4l.5 9h5L11 4" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
