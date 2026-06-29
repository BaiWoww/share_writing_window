import { useEffect, useRef, useState } from 'react'
import type { Note } from '@shared/types'

interface EditorProps {
  note: Note | null
  onUpdateContent: (id: string, content: string) => void
  onRename: (id: string, title: string) => void
}

export function Editor({ note, onUpdateContent, onRename }: EditorProps): JSX.Element {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const contentTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (note) {
      setTitle(note.title)
      setContent(note.content)
    } else {
      setTitle('')
      setContent('')
    }
  }, [note?.id, note?.title, note?.content])

  useEffect(() => {
    return (): void => {
      if (contentTimer.current) clearTimeout(contentTimer.current)
      if (titleTimer.current) clearTimeout(titleTimer.current)
    }
  }, [])

  if (!note) {
    return (
      <main className="flex flex-1 items-center justify-center bg-notion-bg">
        <div className="text-center">
          <div className="mb-2 text-4xl text-notion-border">📝</div>
          <p className="text-sm text-notion-subtext">选择一则便签开始编辑，或新建便签</p>
        </div>
      </main>
    )
  }

  const handleContentChange = (value: string): void => {
    setContent(value)
    if (contentTimer.current) clearTimeout(contentTimer.current)
    contentTimer.current = setTimeout(() => {
      onUpdateContent(note.id, value)
    }, 300)
  }

  const handleTitleChange = (value: string): void => {
    setTitle(value)
    if (titleTimer.current) clearTimeout(titleTimer.current)
    titleTimer.current = setTimeout(() => {
      onRename(note.id, value || '无标题')
    }, 300)
  }

  return (
    <main className="flex flex-1 flex-col bg-notion-bg">
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-12 py-8">
        <input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="无标题"
          className="border-none bg-transparent text-3xl font-bold text-notion-text outline-none placeholder:text-notion-border"
        />
        <div className="mb-4 mt-1 text-xs text-notion-subtext">
          {new Date(note.updatedAt).toLocaleString('zh-CN')}
        </div>
        <textarea
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder="在此输入内容，连接的设备将实时同步…"
          className="flex-1 resize-none border-none bg-transparent text-[15px] leading-7 text-notion-text outline-none placeholder:text-notion-border"
        />
      </div>
    </main>
  )
}
