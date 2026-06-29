import { useEffect, useState, useCallback } from 'react'
import type { Note } from '@shared/types'

export function useNotes(): {
  notes: Note[]
  selectedId: string | null
  selectedNote: Note | null
  selectNote: (id: string) => void
  createNote: () => Promise<void>
  updateContent: (id: string, content: string) => Promise<void>
  renameNote: (id: string, title: string) => Promise<void>
  deleteNote: (id: string) => Promise<void>
} {
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    const off = window.app.onNotesChange((next) => {
      setNotes(next)
    })
    void window.app.getNotes().then((initial) => setNotes(initial))
    return off
  }, [])

  const selectedNote = notes.find((n) => n.id === selectedId) ?? null

  const selectNote = useCallback((id: string) => {
    setSelectedId(id)
  }, [])

  const createNote = useCallback(async () => {
    const note = await window.app.createNote()
    setSelectedId(note.id)
  }, [])

  const updateContent = useCallback(async (id: string, content: string) => {
    await window.app.updateNoteContent(id, content)
  }, [])

  const renameNote = useCallback(async (id: string, title: string) => {
    await window.app.renameNote(id, title)
  }, [])

  const deleteNote = useCallback(
    async (id: string) => {
      await window.app.deleteNote(id)
      if (selectedId === id) setSelectedId(null)
    },
    [selectedId]
  )

  return {
    notes,
    selectedId,
    selectedNote,
    selectNote,
    createNote,
    updateContent,
    renameNote,
    deleteNote
  }
}
