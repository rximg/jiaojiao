/**
 * Preload API 定义与类型。实际被 Electron 加载的是 preload.cjs（CJS），
 * 因预加载脚本必须为 CommonJS。修改 API 时请同步更新 preload.cjs。
 */
import { contextBridge, ipcRenderer } from 'electron';

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 配置相关
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    getAiModels: () => ipcRenderer.invoke('config:getAiModels'),
    set: (config: any) => ipcRenderer.invoke('config:set', config),
    openConfigDir: () => ipcRenderer.invoke('config:openConfigDir'),
    showOutputPathDialog: (defaultPath?: string) => ipcRenderer.invoke('config:showOutputPathDialog', defaultPath),
    openFolder: (dirPath: string) => ipcRenderer.invoke('config:openFolder', dirPath),
  },
  // 同步 mp3 到 store（由前端按钮触发，非 MCP）
  sync: {
    syncAudioToStore: () => ipcRenderer.invoke('sync:audioToStore'),
  },
  // 存储相关
  storage: {
    getHistory: () => ipcRenderer.invoke('storage:getHistory'),
    saveHistory: (history: any) => ipcRenderer.invoke('storage:saveHistory', history),
    getBook: (id: string) => ipcRenderer.invoke('storage:getBook', id),
    saveBook: (book: any) => ipcRenderer.invoke('storage:saveBook', book),
  },
  // Agent 相关
  agent: {
    sendMessage: (message: string, threadId?: string, sessionId?: string) =>
      ipcRenderer.invoke('agent:sendMessage', message, threadId, sessionId),
    onMessage: (callback: (data: any) => void) => {
      ipcRenderer.on('agent:message', (_event, data) => callback(data));
    },
    onToolCall: (callback: (data: any) => void) => {
      ipcRenderer.on('agent:toolCall', (_event, data) => callback(data));
    },
    onTodoUpdate: (callback: (data: any) => void) => {
      ipcRenderer.on('agent:todoUpdate', (_event, data) => callback(data));
    },
    onStepResult: (callback: (data: { threadId: string; messageId: string; stepResults: Array<{ type: 'image' | 'audio' | 'document'; payload: Record<string, unknown> }> }) => void) => {
      ipcRenderer.on('agent:stepResult', (_event, data) => callback(data));
    },
    onQuotaExceeded: (callback: (data: any) => void) => {
      ipcRenderer.on('agent:quotaExceeded', (_event, data) => callback(data));
    },
    stopStream: () => ipcRenderer.invoke('agent:stopStream'),
  },
  // HITL 人工确认（统一通道）
  hitl: {
    onConfirmRequest: (callback: (data: { requestId: string; actionType: string; payload: Record<string, unknown>; timeout: number }) => void) => {
      ipcRenderer.on('hitl:confirmRequest', (_event, data) => callback(data));
    },
    respond: (requestId: string, response: { approved: boolean; reason?: string }) =>
      ipcRenderer.invoke('hitl:respond', requestId, response),
  },
  // 文件系统相关
  fs: {
    ls: (sessionId: string, relativePath?: string) =>
      ipcRenderer.invoke('fs:ls', sessionId, relativePath),
    readFile: (sessionId: string, relativePath: string) =>
      ipcRenderer.invoke('fs:readFile', sessionId, relativePath),
    getFilePath: (sessionId: string, relativePath: string) =>
      ipcRenderer.invoke('fs:getFilePath', sessionId, relativePath),
    glob: (sessionId: string, pattern?: string) =>
      ipcRenderer.invoke('fs:glob', sessionId, pattern),
    grep: (sessionId: string, pattern: string, globPattern?: string) =>
      ipcRenderer.invoke('fs:grep', sessionId, pattern, globPattern),
  },
  // 会话管理相关
  session: {
    create: (title?: string, prompt?: string) =>
      ipcRenderer.invoke('session:create', title, prompt),
    list: () => ipcRenderer.invoke('session:list'),
    get: (sessionId: string) => ipcRenderer.invoke('session:get', sessionId),
    update: (sessionId: string, updates: any) =>
      ipcRenderer.invoke('session:update', sessionId, updates),
    delete: (sessionId: string) => ipcRenderer.invoke('session:delete', sessionId),
  },
});

// TypeScript 类型声明
declare global {
  interface Window {
    electronAPI: {
      config: {
        get: () => Promise<any>;
        getAiModels: () => Promise<Record<string, { default: string; models: Array<{ id: string; label: string }> }>>;
        set: (config: any) => Promise<void>;
        openConfigDir: () => Promise<void>;
        showOutputPathDialog: (defaultPath?: string) => Promise<string | null>;
        openFolder: (dirPath: string) => Promise<void>;
      };
      sync: {
        syncAudioToStore: () => Promise<{ success: boolean; copied: number; storeDir: string; files: string[]; message: string }>;
      };
      storage: {
        getHistory: () => Promise<any[]>;
        saveHistory: (history: any) => Promise<void>;
        getBook: (id: string) => Promise<any>;
        saveBook: (book: any) => Promise<void>;
      };
      agent: {
        sendMessage: (message: string, threadId?: string, sessionId?: string) => Promise<string>;
        onMessage: (callback: (data: any) => void) => void;
        onToolCall: (callback: (data: any) => void) => void;
        onTodoUpdate: (callback: (data: any) => void) => void;
        onStepResult: (callback: (data: { threadId: string; messageId: string; stepResults: Array<{ type: 'image' | 'audio' | 'document'; payload: Record<string, unknown> }> }) => void) => void;
        onQuotaExceeded: (callback: (data: any) => void) => void;
        stopStream: () => Promise<void>;
      };
      hitl: {
        onConfirmRequest: (callback: (data: { requestId: string; actionType: string; payload: Record<string, unknown>; timeout: number }) => void) => void;
        respond: (requestId: string, response: { approved: boolean; reason?: string }) => Promise<{ success: boolean }>;
      };
      fs: {
        ls: (sessionId: string, relativePath?: string) => Promise<{ entries: any[] }>;
        readFile: (sessionId: string, relativePath: string) => Promise<{ content: string }>;
        getFilePath: (sessionId: string, relativePath: string) => Promise<{ path: string }>;
        glob: (sessionId: string, pattern?: string) => Promise<{ matches: string[] }>;
        grep: (sessionId: string, pattern: string, globPattern?: string) => Promise<{ matches: any[] }>;
      };
      session: {
        create: (title?: string, prompt?: string) => Promise<{ sessionId: string; meta: any }>;
        list: () => Promise<{ sessions: any[] }>;
        get: (sessionId: string) => Promise<{ meta: any; messages: any[]; todos: any[]; files: any }>;
        update: (sessionId: string, updates: any) => Promise<{ meta: any }>;
        delete: (sessionId: string) => Promise<{ success: boolean }>;
      };
    };
  }
}
