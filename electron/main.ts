import { app, BrowserWindow, protocol } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 尽早加载 .env（与 AgentFactory 一致：从应用根目录读取，避免 dist-electron 运行时 cwd 不对）
const appRoot = __dirname.includes('dist-electron') ? path.join(__dirname, '..') : process.cwd();
const envPath = path.join(appRoot, '.env');
dotenv.config({ path: envPath });
if (process.env.NODE_ENV === 'development') {
  console.log('[Electron] .env path:', envPath, 'exists:', fs.existsSync(envPath));
}

import { handleConfigIPC } from './ipc/config.js';
import { handleStorageIPC } from './ipc/storage.js';
import { handleAgentIPC } from './ipc/agent.js';
import { handleFilesystemIPC } from './ipc/filesystem.js';
import { handleSessionIPC } from './ipc/session.js';
import { handleHITLIPC } from './ipc/hitl.js';
import { initializeServices, shutdownServices } from '../backend/services/service-initializer.js';
import { loadConfig } from '../backend/agent/config.js';
import { initLangSmithEnv } from '../backend/agent/langsmith.js';

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

app.whenReady().then(async () => {
  try {
    initLangSmithEnv();
    const config = await loadConfig();
    await initializeServices({ outputPath: config.storage?.outputPath });
    console.log('[Electron] Core services initialized');
  } catch (error) {
    console.error('[Electron] Failed to initialize services:', error);
  }

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
  handleHITLIPC();  // 新增

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    // 清理服务（新增）
    await shutdownServices();
    app.quit();
  }
});
