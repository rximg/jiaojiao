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
    onConfirmRequest: (callback) => {
      ipcRenderer.on('agent:confirmRequest', (_event, data) => callback(data));
    },
    confirmAction: (ok) => ipcRenderer.send('agent:confirmAction', { ok }),
    stopStream: () => ipcRenderer.invoke('agent:stopStream'),
  },
  // 文件系统相关
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
  // 会话管理相关
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
