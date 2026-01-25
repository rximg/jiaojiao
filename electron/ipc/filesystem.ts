import { ipcMain } from 'electron';
import { getWorkspaceFilesystem } from '../../backend/services/fs.js';

export function handleFilesystemIPC() {
  const fs = getWorkspaceFilesystem();

  // 列出目录文件
  ipcMain.handle('fs:ls', async (_event, sessionId: string, relativePath = '.') => {
    try {
      const entries = await fs.ls(sessionId, relativePath);
      return { entries };
    } catch (error) {
      console.error('Failed to list files:', error);
      throw error;
    }
  });

  // 读取文件内容
  ipcMain.handle('fs:readFile', async (_event, sessionId: string, relativePath: string) => {
    try {
      const content = await fs.readFile(sessionId, relativePath, 'utf-8');
      return { content };
    } catch (error) {
      console.error('Failed to read file:', error);
      throw error;
    }
  });

  // 获取文件路径（用于直接访问）
  ipcMain.handle('fs:getFilePath', async (_event, sessionId: string, relativePath: string) => {
    try {
      const fullPath = fs.sessionPath(sessionId, relativePath);
      return { path: fullPath };
    } catch (error) {
      console.error('Failed to get file path:', error);
      throw error;
    }
  });

  // Glob搜索文件
  ipcMain.handle('fs:glob', async (_event, sessionId: string, pattern = '**/*') => {
    try {
      const matches = await fs.glob(sessionId, pattern);
      return { matches };
    } catch (error) {
      console.error('Failed to glob files:', error);
      throw error;
    }
  });

  // Grep搜索文件内容
  ipcMain.handle('fs:grep', async (_event, sessionId: string, pattern: string, globPattern?: string) => {
    try {
      const matches = await fs.grep(sessionId, pattern, { glob: globPattern });
      return { matches };
    } catch (error) {
      console.error('Failed to grep files:', error);
      throw error;
    }
  });
}
