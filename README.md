# Shared Notes

> Share notes in real time across multiple Windows devices on the same LAN. Built with Electron + React, host/guest architecture, the host is the single source of truth.

![status](https://img.shields.io/badge/status-MVP-blue)
![platform](https://img.shields.io/badge/platform-Windows-0078d4)
![electron](https://img.shields.io/badge/Electron-33-47848F)
![react](https://img.shields.io/badge/React-18-61DAFB)

**English** · [简体中文](./README.zh-CN.md)

---

## ✨ Features

- **LAN sync**: device A creates a room, B/C join by entering A's IP, everyone shares the same notes
- **Real-time sync**: any device edits a note and others display it within 300 ms
- **Multi-note management**: left list + right editor, Notion-like minimal style
- **Offline editing**: fully writable in standalone mode; offline edits survive a restart
- **Auto-reconnect**: exponential backoff auto-reconnect after an unexpected drop (up to 5 attempts)
- **Heartbeat**: the host checks client liveness every 15 s; dead connections are cleaned up automatically
- **Local persistence**: each device stores a local SQLite copy (sql.js + WASM); no data lost on restart

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────┐
│               Electron main process (Node)        │
│  ┌──────────────┐  ┌──────────────┐  ┌────────┐ │
│  │ Store (sql.js)│  │ RoomManager  │  │Network │ │
│  │  persistence  │  │ business/state│  │Manager │ │
│  └──────────────┘  └──────────────┘  └───┬────┘ │
│         ▲               ▲                 │      │
│         │    IPC + contextBridge          │      │
│         │                                 │      │
│  ┌──────┴─────────────────────────────────┴────┐ │
│  │     Renderer process (React + Tailwind)      │ │
│  │  Sidebar │ Editor │ TopBar │ ConnDialog      │ │
│  └────────────────────────────────────────────┘ │
└──────────────────────┬───────────────────────────┘
                       │ WebSocket
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
      Device A       Device B       Device C
```

- **Host**: the single source of truth. Listens on a port (default 8787), accepts guest connections, stores notes + broadcasts changes
- **Guest**: connects to the host. Local edit -> send to host -> host broadcasts -> receive and update local (upsert + LWW)
- **Sync strategy**: LWW (Last-Write-Wins) + 300 ms edit debounce. The newer `updatedAt` overwrites the older one
- **Conflict resolution**: upsert based on the `updatedAt` timestamp; concurrent edits may lose data (MVP limitation)

## 🛠️ Tech Stack

| Layer | Technology |
| -------- | ---------------------------------------- |
| Desktop framework | Electron 33 |
| Build | electron-vite + Vite 5 |
| UI | React 18 + TypeScript 5 + Tailwind CSS 3 |
| Transport | `ws` (WebSocket) |
| Storage | `sql.js` (WASM SQLite) |
| Packaging | electron-builder (NSIS + portable) |

## 🚀 Quick Start

### Requirements

- Node.js ≥ 20
- npm ≥ 10
- Windows 10/11

### Development

```bash
npm install
npm run dev
```

### Build (Windows)

```bash
npm run build:win
```

Artifacts in `dist/`:

- `Shared-Notes-0.1.0-x64.exe` - NSIS installer
- `Shared-Notes-0.1.0-portable.exe` - portable build (recommended for trial)

### Checks

```bash
npm run typecheck       # tsc --noEmit (main + renderer)
npm run build           # electron-vite build
```

## 📖 Usage

1. **Device A** clicks "Connect" in the top right -> choose "Create Room" -> note the displayed IP (e.g. `192.168.1.5:8787`)
2. **Device B/C** clicks "Connect" -> choose "Join Room" -> enter A's IP and a device name -> click "Join"
3. On any device, click "+ New Note" on the left, enter a title and content; other devices sync instantly
4. Click "Disconnect" in the top right to leave the room

> ⚠️ On first room creation, the Windows firewall may prompt; allow "Shared Notes" through **private networks**.

## 📂 Directory Structure

```
writing_window/
├── electron.vite.config.ts
├── electron-builder.yml
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json / tsconfig.node.json / tsconfig.web.json
├── package.json
└── src/
    ├── main/                  # Electron main process
    │   ├── index.ts           # entry
    │   ├── storage/Store.ts   # sql.js CRUD
    │   ├── room/RoomManager.ts# business coordination (role/state/notification)
    │   └── network/
    │       ├── NetworkManager.ts  # host + guest implementation
    │       └── util.ts        # getLocalIp
    ├── preload/index.ts       # contextBridge exposes IPC
    ├── renderer/              # React UI
    │   ├── index.html
    │   └── src/
    │       ├── App.tsx
    │       ├── main.tsx
    │       ├── env.d.ts
    │       ├── hooks/useNotes.ts
    │       ├── components/
    │       │   ├── Sidebar.tsx
    │       │   ├── Editor.tsx
    │       │   ├── TopBar.tsx
    │       │   └── ConnectionDialog.tsx
    │       └── styles.css
    └── shared/types.ts        # shared types (Note/Device/message protocol)
```

## 🔌 Protocol (WebSocket JSON)

| Direction | Type | Payload | Description |
| --------- | ---------------- | -------------------------- | ------------------ |
| C->H | `hello` | `{deviceId, deviceName}` | join |
| H->C | `welcome` | `{notes, devices}` | full sync |
| C->H/H->C | `note:create` | `note` | create |
| C->H/H->C | `note:update` | `{id, content, updatedAt}` | edit (debounced 300 ms) |
| C->H/H->C | `note:rename` | `{id, title, updatedAt}` | rename |
| C->H/H->C | `note:delete` | `{id}` | delete |
| H->C | `devices:update` | `{devices}` | device list changed |
| C->H | `bye` | - | leave |

## ⚠️ Known Limitations (MVP)

- Concurrent edits to the same note use LWW; the later write overwrites the earlier (not CRDT)
- Offline edits are not pushed to the host; after reconnect they are merged via the full `welcome` payload
- When the host exits, all guests disconnect and try to reconnect; if reconnection fails, you must rejoin
- Windows only (Linux/macOS can be built but are untested)
- No code signing (SmartScreen may warn on first launch)

## 🗺️ Roadmap

- [ ] Replace LWW with Yjs CRDT (true multi-user collaborative editing)
- [ ] Note categories / tags / search
- [ ] Dark mode
- [ ] Auto-discovery (UDP broadcast) instead of manual IP entry
- [ ] macOS / Linux packaging
- [ ] Note export (Markdown / JSON)
- [ ] End-to-end encryption

## 📄 License

[MIT](./LICENSE)

## Acknowledgements

- [electron-vite](https://electron-vite.org/) - excellent Electron build tool
- [Tailwind CSS](https://tailwindcss.com/) - UI styling
- [ws](https://github.com/websockets/ws) - WebSocket implementation
- [sql.js](https://github.com/sql-js/sql.js) - WASM SQLite
