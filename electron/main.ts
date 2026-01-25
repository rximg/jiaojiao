import { app, BrowserWindow, protocol } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { promises as fs } from 'fs';
import { handleConfigIPC } from './ipc/config.js';
import { handleStorageIPC } from './ipc/storage.js';
import { handleAgentIPC } from './ipc/agent.js';
import { handleFilesystemIPC } from './ipc/filesystem.js';
import { handleSessionIPC } from './ipc/session.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const preloadPath = process.env.NODE_ENV === 'development'
    ? path.join(process.cwd(), 'electron', 'preload.cjs')
    : path.join(__dirname, '..', 'electron', 'preload.cjs');
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    titleBarStyle: 'default',
  });

  // 开发环境加载 Vite 开发服务器，生产环境加载构建文件
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // 注册自定义协议来服务本地文件
  protocol.registerFileProtocol('local-file', (request, callback) => {
    const url = request.url.replace('local-file://', '');
    try {
      return callback(decodeURIComponent(url));
    } catch (error) {
      console.error('Failed to load local file:', error);
      return callback({ error: -2 }); // FILE_NOT_FOUND
    }
  });

  createWindow();

  // 注册 IPC 处理器
  handleConfigIPC();
  handleStorageIPC();
  handleAgentIPC();
  handleFilesystemIPC();
  handleSessionIPC();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
