import { useEffect, useState, useCallback } from 'react'
import type { SharedFile, FileTransfer } from '@shared/types'

export function useFiles(): {
  files: SharedFile[]
  transfers: FileTransfer[]
  selectAndSend: () => Promise<void>
  sendFile: (filePath: string) => Promise<void>
  openFile: (path: string) => Promise<void>
  saveFileAs: (id: string) => Promise<void>
  deleteFile: (id: string) => Promise<void>
  revealFile: (path: string) => Promise<void>
} {
  const [files, setFiles] = useState<SharedFile[]>([])
  const [transfers, setTransfers] = useState<FileTransfer[]>([])

  useEffect(() => {
    const offFiles = window.app.onFilesChange((next) => setFiles(next))
    const offTransfer = window.app.onFileTransfer((t) => {
      setTransfers((prev) => {
        const idx = prev.findIndex((p) => p.fileId === t.fileId)
        if (idx >= 0) {
          const copy = [...prev]
          copy[idx] = t
          return copy
        }
        return [...prev, t]
      })
      // Auto-remove completed/error transfers after a short delay.
      if (t.status === 'done' || t.status === 'error') {
        setTimeout(() => {
          setTransfers((prev) => prev.filter((p) => p.fileId !== t.fileId))
        }, 3000)
      }
    })
    void window.app.getFiles().then((initial) => setFiles(initial))
    return (): void => {
      offFiles()
      offTransfer()
    }
  }, [])

  const sendFile = useCallback(async (filePath: string) => {
    await window.app.sendFile(filePath)
  }, [])

  const selectAndSend = useCallback(async () => {
    const path = await window.app.selectFile()
    if (path) {
      await window.app.sendFile(path)
    }
  }, [])

  const openFile = useCallback(async (path: string) => {
    await window.app.openFile(path)
  }, [])

  const saveFileAs = useCallback(async (id: string) => {
    await window.app.saveFileAs(id)
  }, [])

  const deleteFile = useCallback(async (id: string) => {
    await window.app.deleteFile(id)
  }, [])

  const revealFile = useCallback(async (path: string) => {
    await window.app.revealFile(path)
  }, [])

  return {
    files,
    transfers,
    selectAndSend,
    sendFile,
    openFile,
    saveFileAs,
    deleteFile,
    revealFile
  }
}
