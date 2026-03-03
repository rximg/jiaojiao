# IPC 通信架构文档

## 概述

有声绘本智能体遵循 Electron 安全最佳实践，通过 **contextBridge** 在渲染进程与主进程之间建立隔离的通信通道。前端**无法直接访问 Node.js API**，所有后端交互必须经过预定义的 IPC 接口。

---

## 整体通信架构

```
┌─────────────────────────────────────────────────────────┐
│                  Renderer Process（src/）                │
│                                                         │
│   React 组件                                            │
│     └── window.electronAPI.agent.sendMessage(...)       │
│     └── window.electronAPI.config.get(...)              │
│     └── window.electronAPI.session.create(...)          │
│     └── window.electronAPI.fs.ls(...)                   │
└──────────────────────┬──────────────────────────────────┘
                       │ contextBridge（安全沙箱）
┌──────────────────────▼──────────────────────────────────┐
│              Preload Script（electron/preload.cjs）      │
│                                                         │
│   ipcRenderer.invoke('agent:send-message', ...)         │
│   ipcRenderer.invoke('config:get', ...)                 │
│   ipcRenderer.on('agent:stream-chunk', ...)             │
│   ...                                                   │
└──────────────────────┬──────────────────────────────────┘
                       │ ipcMain / ipcRenderer
┌──────────────────────▼──────────────────────────────────┐
│              Main Process（electron/main.ts）            │
│                                                         │
│   IPC Handlers（electron/ipc/）                         │
│     ├── agent.ts    → RuntimeManager / AgentFactory     │
│     ├── config.ts   → AppConfig                         │
│     ├── session.ts  → SessionService                    │
│     ├── fs.ts       → WorkspaceFilesystem               │
│     ├── hitl.ts     → HitlService                       │
│     ├── storage.ts  → electron-store                    │
│     └── sync.ts     → SyncService                       │
└─────────────────────────────────────────────────────────┘
```

---

## Preload 桥接（`electron/preload.cjs`）

Preload 脚本是唯一可同时访问 `ipcRenderer` 和 DOM 的安全边界。它通过 `contextBridge.exposeInMainWorld` 向渲染进程暴露受控 API：

```javascript
// electron/preload.cjs（示意）
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  agent: {
    sendMessage: (sessionId, message) =>
      ipcRenderer.invoke('agent:send-message', sessionId, message),
    stopStream: (sessionId) =>
      ipcRenderer.invoke('agent:stop-stream', sessionId),
    onStreamChunk: (callback) =>
      ipcRenderer.on('agent:stream-chunk', callback),
    onStreamDone: (callback) =>
      ipcRenderer.on('agent:stream-done', callback),
  },
  config: {
    get: ()          => ipcRenderer.invoke('config:get'),
    set: (key, val)  => ipcRenderer.invoke('config:set', key, val),
  },
  session: {
    create: ()       => ipcRenderer.invoke('session:create'),
    list: ()         => ipcRenderer.invoke('session:list'),
    get: (id)        => ipcRenderer.invoke('session:get', id),
    delete: (id)     => ipcRenderer.invoke('session:delete', id),
  },
  fs: {
    ls: (sessionId, path)           => ipcRenderer.invoke('fs:ls', sessionId, path),
    readFile: (sessionId, path)     => ipcRenderer.invoke('fs:read-file', sessionId, path),
    glob: (sessionId, pattern)      => ipcRenderer.invoke('fs:glob', sessionId, pattern),
  },
});
```

---

## IPC 通道规范

所有通道名称遵循 `namespace:action` 格式。

### `agent:*` — 智能体操作（`electron/ipc/agent.ts`）

| 通道 | 方向 | 参数 | 返回 / 事件数据 | 说明 |
|---|---|---|---|---|
| `agent:send-message` | Renderer → Main | `sessionId: string, message: string` | `Promise<void>` | 发送消息，开启流式响应 |
| `agent:stop-stream` | Renderer → Main | `sessionId: string` | `Promise<void>` | 中止当前流式输出 |
| `agent:stream-chunk` | Main → Renderer | — | `{ sessionId, chunk: string }` | 流式文本块推送 |
| `agent:stream-done` | Main → Renderer | — | `{ sessionId }` | 流式完成通知 |
| `agent:stream-error` | Main → Renderer | — | `{ sessionId, error: string }` | 流式错误通知 |
| `agent:todo-update` | Main → Renderer | — | `{ sessionId, todos: Todo[] }` | Todo 列表更新推送 |

### `config:*` — 配置管理（`electron/ipc/config.ts`）

| 通道 | 方向 | 参数 | 返回 | 说明 |
|---|---|---|---|---|
| `config:get` | Renderer → Main | — | `Promise<AppConfig>` | 读取全量用户配置 |
| `config:set` | Renderer → Main | `key: string, value: unknown` | `Promise<void>` | 写入单项配置 |
| `config:get-ai-models` | Renderer → Main | — | `Promise<AIModelSchema[]>` | 获取可用 AI 模型列表 |

### `session:*` — 会话生命周期（`electron/ipc/session.ts`）

| 通道 | 方向 | 参数 | 返回 | 说明 |
|---|---|---|---|---|
| `session:create` | Renderer → Main | — | `Promise<SessionMeta>` | 创建新会话，初始化工作区目录 |
| `session:list` | Renderer → Main | — | `Promise<SessionMeta[]>` | 列出所有历史会话 |
| `session:get` | Renderer → Main | `sessionId: string` | `Promise<SessionMeta>` | 获取指定会话元数据 |
| `session:delete` | Renderer → Main | `sessionId: string` | `Promise<void>` | 删除会话及其工作区文件 |
| `session:rename` | Renderer → Main | `sessionId, title: string` | `Promise<void>` | 重命名会话 |

### `fs:*` — 文件系统操作（`electron/ipc/filesystem.ts`）

| 通道 | 方向 | 参数 | 返回 | 说明 |
|---|---|---|---|---|
| `fs:ls` | Renderer → Main | `sessionId, dirPath: string` | `Promise<FileEntry[]>` | 列出目录内容 |
| `fs:read-file` | Renderer → Main | `sessionId, filePath: string` | `Promise<string \| Buffer>` | 读取文件内容 |
| `fs:glob` | Renderer → Main | `sessionId, pattern: string` | `Promise<string[]>` | glob 模式匹配文件 |

> **安全**：`fs:*` 通道在 `WorkspaceFilesystem` 中执行路径边界校验，所有路径必须在当前 session 的工作区目录内。

### `hitl:*` — Human-in-the-loop（`electron/ipc/hitl.ts`）

| 通道 | 方向 | 参数 | 返回 / 事件数据 | 说明 |
|---|---|---|---|---|
| `hitl:request` | Main → Renderer | — | `{ sessionId, requestId, prompt }` | 推送审批请求到前端 |
| `hitl:respond` | Renderer → Main | `requestId, approved: boolean` | `Promise<void>` | 用户审批结果回传 |

### `storage:*` — 持久化存储（`electron/ipc/storage.ts`）

| 通道 | 方向 | 参数 | 返回 | 说明 |
|---|---|---|---|---|
| `storage:get` | Renderer → Main | `key: string` | `Promise<unknown>` | 读取 electron-store 键值 |
| `storage:set` | Renderer → Main | `key, value: unknown` | `Promise<void>` | 写入 electron-store 键值 |

### `sync:*` — 数据同步（`electron/ipc/sync.ts`）

| 通道 | 方向 | 参数 | 返回 | 说明 |
|---|---|---|---|---|
| `sync:workspace` | Main → Renderer | — | `{ sessionId }` | 触发前端刷新工作区文件列表 |

---

## 通信序列图

### 1. 发送消息并接收流式响应

```
ChatInterface          preload.cjs           ipc/agent.ts        AgentFactory
     │                     │                      │                   │
     │   sendMessage()     │                      │                   │
     │──────────────────►  │  invoke('agent:send-message')           │
     │                     │─────────────────────►│                   │
     │                     │                      │  agent.stream()  │
     │                     │                      │──────────────────►│
     │                     │                      │◄── chunk ─────────│
     │  on('stream-chunk') │◄──────────────────── │                   │
     │◄────────────────────│                      │◄── chunk ─────────│
     │  on('stream-chunk') │◄──────────────────── │                   │
     │◄────────────────────│                      │◄── done ──────────│
     │                     │◄──────────────────── │ ('stream-done')   │
     │  on('stream-done')  │                      │                   │
     │◄────────────────────│                      │                   │
```

### 2. HITL 审批流程

```
AgentFactory          ipc/hitl.ts           preload.cjs        HitlConfirmBlock
     │                    │                      │                   │
     │  需要人工审批       │                      │                   │
     │───────────────────►│  send('hitl:request')│                   │
     │  （阻塞等待）       │─────────────────────►│                   │
     │                    │                      │  on('hitl:req')  │
     │                    │                      │──────────────────►│
     │                    │                      │                   │ 用户点击确认/拒绝
     │                    │◄─────────────────────│ invoke('hitl:respond')
     │◄───────────────────│  释放阻塞             │                   │
     │  继续执行           │                      │                   │
```

---

## TypeScript 类型声明

前端通过 `src/types/electron.d.ts` 获得完整的 `window.electronAPI` 类型提示：

```typescript
// src/types/electron.d.ts（示意结构）
interface ElectronAPI {
  agent: {
    sendMessage(sessionId: string, message: string): Promise<void>;
    stopStream(sessionId: string): Promise<void>;
    onStreamChunk(cb: (event: unknown, data: StreamChunk) => void): void;
    onStreamDone(cb: (event: unknown, data: { sessionId: string }) => void): void;
    onStreamError(cb: (event: unknown, data: StreamError) => void): void;
    onTodoUpdate(cb: (event: unknown, data: TodoUpdate) => void): void;
  };
  config: {
    get(): Promise<AppConfig>;
    set(key: string, value: unknown): Promise<void>;
  };
  session: {
    create(): Promise<SessionMeta>;
    list(): Promise<SessionMeta[]>;
    get(sessionId: string): Promise<SessionMeta>;
    delete(sessionId: string): Promise<void>;
  };
  fs: {
    ls(sessionId: string, dirPath: string): Promise<FileEntry[]>;
    readFile(sessionId: string, filePath: string): Promise<string>;
    glob(sessionId: string, pattern: string): Promise<string[]>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
```

---

## 安全设计要点

| 原则 | 实现方式 |
|---|---|
| **最小权限** | `contextBridge` 仅暴露必要方法，禁止暴露 `require` / `process` |
| **输入验证** | 每个 IPC Handler 在调用后端前校验参数类型和合法性 |
| **路径隔离** | `fs:*` 通道强制路径在 session 工作区目录内，防止路径穿越 |
| **API Key 保护** | Key 仅存于 electron-store（系统加密），不经 IPC 传回渲染进程明文 |
| **沙箱隔离** | 渲染进程启用 `sandbox: true`，`nodeIntegration: false` |
