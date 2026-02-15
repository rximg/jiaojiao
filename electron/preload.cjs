const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程（与 preload.ts 保持一致，Electron 预加载必须用 CJS）
contextBridge.exposeInMainWorld('electronAPI', {
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    getAiModels: () => ipcRenderer.invoke('config:getAiModels'),
    set: (config) => ipcRenderer.invoke('config:set', config),
  },
  sync: {
    syncAudioToStore: () => ipcRenderer.invoke('sync:audioToStore'),
  },
  storage: {
    getHistory: () => ipcRenderer.invoke('storage:getHistory'),
    saveHistory: (history) => ipcRenderer.invoke('storage:saveHistory', history),
    getBook: (id) => ipcRenderer.invoke('storage:getBook', id),
    saveBook: (book) => ipcRenderer.invoke('storage:saveBook', book),
  },
  agent: {
    sendMessage: (message, threadId, sessionId) =>
      ipcRenderer.invoke('agent:sendMessage', message, threadId, sessionId),
    onMessage: (callback) => {
      ipcRenderer.on('agent:message', (_event, data) => callback(data));
    },
    onToolCall: (callback) => {
      ipcRenderer.on('agent:toolCall', (_event, data) => callback(data));
    },
    onTodoUpdate: (callback) => {
      ipcRenderer.on('agent:todoUpdate', (_event, data) => callback(data));
    },
    onStepResult: (callback) => {
      ipcRenderer.on('agent:stepResult', (_event, data) => callback(data));
    },
    onQuotaExceeded: (callback) => {
      ipcRenderer.on('agent:quotaExceeded', (_event, data) => callback(data));
    },
    stopStream: () => ipcRenderer.invoke('agent:stopStream'),
  },
  hitl: {
    onConfirmRequest: (callback) => {
      ipcRenderer.on('hitl:confirmRequest', (_event, data) => callback(data));
    },
    respond: (requestId, response) =>
      ipcRenderer.invoke('hitl:respond', requestId, response),
  },
  fs: {
    ls: (sessionId, relativePath) =>
      ipcRenderer.invoke('fs:ls', sessionId, relativePath),
    readFile: (sessionId, relativePath) =>
      ipcRenderer.invoke('fs:readFile', sessionId, relativePath),
    getFilePath: (sessionId, relativePath) =>
      ipcRenderer.invoke('fs:getFilePath', sessionId, relativePath),
    glob: (sessionId, pattern) =>
      ipcRenderer.invoke('fs:glob', sessionId, pattern),
    grep: (sessionId, pattern, globPattern) =>
      ipcRenderer.invoke('fs:grep', sessionId, pattern, globPattern),
  },
  session: {
    create: (title, prompt) =>
      ipcRenderer.invoke('session:create', title, prompt),
    list: () => ipcRenderer.invoke('session:list'),
    get: (sessionId) => ipcRenderer.invoke('session:get', sessionId),
    update: (sessionId, updates) =>
      ipcRenderer.invoke('session:update', sessionId, updates),
    delete: (sessionId) => ipcRenderer.invoke('session:delete', sessionId),
  },
});
