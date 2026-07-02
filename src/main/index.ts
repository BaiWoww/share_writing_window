import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { Store } from './storage/Store'
import { RoomManager } from './room/RoomManager'
import { NetworkManager } from './network/NetworkManager'
import { getLocalIp } from './network/util'
import { RoomDiscoverer } from './network/Discovery'
import type { RoomInfo } from '@shared/types'

let room: RoomManager
let net: NetworkManager
let mainWindow: BrowserWindow | null = null
let discoverer: RoomDiscoverer | null = null

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 720,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    title: '共享便签',
    backgroundColor: '#ffffff',
    icon: join(app.getAppPath(), 'assets', 'icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

function registerIpc(room: RoomManager): void {
  ipcMain.handle('ping', () => 'pong')
  ipcMain.handle('note:list', () => room.getNotes())
  ipcMain.handle('note:select', (_e, id: string) => room.selectNote(id))
  ipcMain.handle('note:create', () => room.createNote())
  ipcMain.handle('note:update-content', (_e, id: string, content: string) =>
    room.updateNoteContent(id, content)
  )
  ipcMain.handle('note:rename', (_e, id: string, title: string) =>
    room.renameNote(id, title)
  )
  ipcMain.handle('note:delete', (_e, id: string) => room.deleteNote(id))
  ipcMain.handle('host:local-ip', () => getLocalIp())
  ipcMain.handle('host:start', async (_e, deviceName: string) => {
    room.setLocalDeviceName(deviceName)
    return await net.startHost()
  })
  ipcMain.handle('host:join', async (_e, host: string, port: number, deviceName: string) => {
    await net.joinHost(host, port, deviceName)
  })
  ipcMain.handle('host:disconnect', async () => {
    await net.disconnect()
  })
  ipcMain.handle('discovery:start', async () => {
    if (discoverer) discoverer.stop()
    discoverer = new RoomDiscoverer(
      room.getLocalDeviceId(),
      (roomInfo: RoomInfo) => {
        mainWindow?.webContents.send('discovery:room', roomInfo)
      },
      () => {
        mainWindow?.webContents.send('discovery:done')
        discoverer = null
      }
    )
    discoverer.start()
  })
  ipcMain.handle('discovery:stop', async () => {
    if (discoverer) {
      discoverer.stop()
      discoverer = null
    }
  })
}

app.whenReady().then(async () => {
  const store = new Store()
  await store.init()
  room = new RoomManager(store)
  net = new NetworkManager(room)

  const win = createWindow()
  mainWindow = win
  room.setWindow(win)
  registerIpc(room)

  win.on('closed', () => {
    if (discoverer) {
      discoverer.stop()
      discoverer = null
    }
    mainWindow = null
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const w = createWindow()
      mainWindow = w
      room.setWindow(w)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
