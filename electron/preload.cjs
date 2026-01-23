const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 配置相关
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (config) => ipcRenderer.invoke('config:set', config),
  },
  // 存储相关
  storage: {
    getHistory: () => ipcRenderer.invoke('storage:getHistory'),
    saveHistory: (history) => ipcRenderer.invoke('storage:saveHistory', history),
    getBook: (id) => ipcRenderer.invoke('storage:getBook', id),
    saveBook: (book) => ipcRenderer.invoke('storage:saveBook', book),
  },
  // Agent 相关
  agent: {
    sendMessage: (message, threadId) =>
      ipcRenderer.invoke('agent:sendMessage', message, threadId),
    onMessage: (callback) => {
      ipcRenderer.on('agent:message', (_event, data) => callback(data));
    },
    onToolCall: (callback) => {
      ipcRenderer.on('agent:toolCall', (_event, data) => callback(data));
    },
    onTodoUpdate: (callback) => {
      ipcRenderer.on('agent:todoUpdate', (_event, data) => callback(data));
    },
    stopStream: () => ipcRenderer.invoke('agent:stopStream'),
  },
});
