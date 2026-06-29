# 共享便签 (Shared Notes)

> 同一局域网下，多台 Windows 设备实时共享便签。基于 Electron + React，主机/客户端架构，主机为数据源。

![status](https://img.shields.io/badge/status-MVP-blue)
![platform](https://img.shields.io/badge/platform-Windows-0078d4)
![electron](https://img.shields.io/badge/Electron-33-47848F)
![react](https://img.shields.io/badge/React-18-61DAFB)

## ✨ 功能

- **局域网同步**：A 设备创建房间，B/C 设备输入 A 的 IP 加入，所有人共享同一份便签
- **实时同步**：任一设备编辑便签，其他设备 300ms 内同步显示
- **多便签管理**：左侧列表 + 右侧编辑，类 Notion 极简风格
- **离线编辑**：单机模式下完整可写；离线编辑重启后数据仍在
- **自动重连**：意外断开后指数退避自动重连（最多 5 次）
- **心跳检测**：主机每 15s 检测客户端活性，死连接自动清理
- **本地持久化**：每台设备本地存储 SQLite 副本（sql.js + WASM），重启不丢数据

## 🏗️ 架构

```
┌──────────────────────────────────────────────────┐
│               Electron 主进程 (Node)               │
│  ┌──────────────┐  ┌──────────────┐  ┌────────┐ │
│  │ Store (sql.js)│  │ RoomManager  │  │Network │ │
│  │   持久化      │  │  业务/状态    │  │Manager │ │
│  └──────────────┘  └──────────────┘  └───┬────┘ │
│         ▲               ▲                 │      │
│         │    IPC + contextBridge          │      │
│         │                                 │      │
│  ┌──────┴─────────────────────────────────┴────┐ │
│  │     渲染进程 (React + Tailwind)              │ │
│  │  Sidebar │ Editor │ TopBar │ ConnDialog     │ │
│  └────────────────────────────────────────────┘ │
└──────────────────────┬───────────────────────────┘
                       │ WebSocket
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
      设备 A         设备 B         设备 C
```

- **主机（Host）**：唯一数据源。监听端口（默认 8787），接受客户端连接，保存便签 + 广播变更
- **客户端（Guest）**：连接主机。本地编辑 → 发送给主机 → 主机广播 → 自身收到后更新本地（upsert + LWW）
- **同步策略**：LWW (Last-Write-Wins) + 300ms 编辑去抖。`updatedAt` 较新者覆盖较旧者
- **冲突解决**：基于 `updatedAt` 时间戳的 upsert；并发编辑可能丢失数据（MVP 限制）

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 33 |
| 构建 | electron-vite + Vite 5 |
| UI | React 18 + TypeScript 5 + Tailwind CSS 3 |
| 通信 | `ws` (WebSocket) |
| 存储 | `sql.js` (WASM SQLite) |
| 打包 | electron-builder (NSIS + portable) |

## 🚀 快速开始

### 环境要求

- Node.js ≥ 20
- npm ≥ 10
- Windows 10/11

### 开发

```bash
npm install
npm run dev
```

### 打包（Windows）

```bash
npm run build:win
```

产物在 `dist/`：
- `共享便签-0.1.0-x64.exe` — NSIS 安装包
- `共享便签-0.1.0-portable.exe` — 免安装版（推荐试用）

### 检查

```bash
npm run typecheck       # tsc --noEmit (main + renderer)
npm run build           # electron-vite build
```

## 📖 使用

1. **设备 A** 点击右上角"建立连接" → 选"创建房间" → 记下显示的 IP（如 `192.168.1.5:8787`）
2. **设备 B/C** 点击"建立连接" → 选"加入房间" → 输入 A 的 IP 和设备名 → 点"加入"
3. 任一设备左侧点"+ 新建便签"，输入标题和内容，其他设备即时同步
4. 点击右上角"断开"可主动退出房间

> ⚠️ 首次创建房间时，Windows 防火墙可能弹窗，需允许"共享便签"通过**专用网络**。

## 📂 目录结构

```
writing_window/
├── electron.vite.config.ts
├── electron-builder.yml
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json / tsconfig.node.json / tsconfig.web.json
├── package.json
└── src/
    ├── main/                  # Electron 主进程
    │   ├── index.ts           # 入口
    │   ├── storage/Store.ts   # sql.js CRUD
    │   ├── room/RoomManager.ts# 业务协调（角色/状态/通知）
    │   └── network/
    │       ├── NetworkManager.ts  # host + guest 实现
    │       └── util.ts        # getLocalIp
    ├── preload/index.ts       # contextBridge 暴露 IPC
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
    └── shared/types.ts        # 共享类型（Note/Device/消息协议）
```

## 🔌 通信协议（WebSocket JSON）

| 方向 | 类型 | 负载 | 说明 |
|------|------|------|------|
| C→H | `hello` | `{deviceId, deviceName}` | 加入 |
| H→C | `welcome` | `{notes, devices}` | 全量同步 |
| C→H/H→C | `note:create` | `note` | 新建 |
| C→H/H→C | `note:update` | `{id, content, updatedAt}` | 编辑（去抖 300ms） |
| C→H/H→C | `note:rename` | `{id, title, updatedAt}` | 重命名 |
| C→H/H→C | `note:delete` | `{id}` | 删除 |
| H→C | `devices:update` | `{devices}` | 设备列表变化 |
| C→H | `bye` | — | 退出 |

## ⚠️ 已知限制（MVP）

- 并发编辑同一便签采用 LWW，后写入者覆盖前者（非 CRDT）
- 离线编辑不会推送到主机，重连后通过 `welcome` 全量合并
- 主机退出后所有客户端自动断开并尝试重连，重连失败需重新加入
- 仅 Windows 平台（Linux/macOS 可构建但未测试）
- 未做代码签名（首次启动 SmartScreen 可能警告）

## 🗺️ 路线图

- [ ] Yjs CRDT 替换 LWW（真正的多人协同编辑）
- [ ] 便签分类/标签/搜索
- [ ] 暗色模式
- [ ] 自动发现（UDP 广播）替代手动输入 IP
- [ ] macOS / Linux 打包
- [ ] 便签导出（Markdown / JSON）
- [ ] 端到端加密

## 📄 许可证

[MIT](./LICENSE)

## 致谢

- [electron-vite](https://electron-vite.org/) — 出色的 Electron 构建工具
- [Tailwind CSS](https://tailwindcss.com/) — UI 样式
- [ws](https://github.com/websockets/ws) — WebSocket 实现
- [sql.js](https://github.com/sql-js/sql.js) — WASM SQLite
