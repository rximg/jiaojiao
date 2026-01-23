import { contextBridge, ipcRenderer } from 'electron';

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 配置相关
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (config: any) => ipcRenderer.invoke('config:set', config),
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
    sendMessage: (message: string, threadId?: string) =>
      ipcRenderer.invoke('agent:sendMessage', message, threadId),
    onMessage: (callback: (data: any) => void) => {
      ipcRenderer.on('agent:message', (_event, data) => callback(data));
    },
    onToolCall: (callback: (data: any) => void) => {
      ipcRenderer.on('agent:toolCall', (_event, data) => callback(data));
    },
    onTodoUpdate: (callback: (data: any) => void) => {
      ipcRenderer.on('agent:todoUpdate', (_event, data) => callback(data));
    },
    stopStream: () => ipcRenderer.invoke('agent:stopStream'),
  },
});

// TypeScript 类型声明
declare global {
  interface Window {
    electronAPI: {
      config: {
        get: () => Promise<any>;
        set: (config: any) => Promise<void>;
      };
      storage: {
        getHistory: () => Promise<any[]>;
        saveHistory: (history: any) => Promise<void>;
        getBook: (id: string) => Promise<any>;
        saveBook: (book: any) => Promise<void>;
      };
      agent: {
        sendMessage: (message: string, threadId?: string) => Promise<string>;
        onMessage: (callback: (data: any) => void) => void;
        onToolCall: (callback: (data: any) => void) => void;
        onTodoUpdate: (callback: (data: any) => void) => void;
        stopStream: () => Promise<void>;
      };
    };
  }
}
