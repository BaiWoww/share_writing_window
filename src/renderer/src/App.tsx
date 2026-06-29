import { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { Editor } from './components/Editor'
import { TopBar } from './components/TopBar'
import { ConnectionDialog } from './components/ConnectionDialog'
import { useNotes } from './hooks/useNotes'
import type { DeviceInfo, Role } from '@shared/types'

export default function App(): JSX.Element {
  const {
    notes,
    selectedId,
    selectedNote,
    selectNote,
    createNote,
    updateContent,
    renameNote,
    deleteNote
  } = useNotes()

  const [statusText, setStatusText] = useState('未连接')
  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [role, setRole] = useState<Role>('idle')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [localIp, setLocalIp] = useState('')

  useEffect(() => {
    const offStatus = window.app.onStatusChange(setStatusText)
    const offDevices = window.app.onDevicesChange(setDevices)
    const offRole = window.app.onRoleChange(setRole)
    void window.app.getLocalIp().then(setLocalIp).catch(() => {})
    return (): void => {
      offStatus()
      offDevices()
      offRole()
    }
  }, [])

  const handleStartHost = async (deviceName: string): Promise<void> => {
    const info = await window.app.startHost(deviceName)
    setLocalIp(info.host)
  }

  const handleJoin = async (
    host: string,
    port: number,
    deviceName: string
  ): Promise<void> => {
    await window.app.joinHost(host, port, deviceName)
  }

  const handleDisconnect = async (): Promise<void> => {
    await window.app.disconnect()
  }

  return (
    <div className="flex h-full w-full flex-col">
      <TopBar
        statusText={statusText}
        deviceCount={devices.length}
        canConnect={role === 'idle'}
        onConnectClick={() => setDialogOpen(true)}
        onDisconnect={handleDisconnect}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          notes={notes}
          selectedId={selectedId}
          onSelect={selectNote}
          onCreate={createNote}
          onDelete={deleteNote}
        />
        <Editor
          note={selectedNote}
          onUpdateContent={updateContent}
          onRename={renameNote}
        />
      </div>
      <ConnectionDialog
        open={dialogOpen}
        localIp={localIp}
        onClose={() => setDialogOpen(false)}
        onStartHost={handleStartHost}
        onJoin={handleJoin}
      />
    </div>
  )
}
