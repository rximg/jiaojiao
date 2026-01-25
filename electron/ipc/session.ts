import { ipcMain } from 'electron';
import { getWorkspaceFilesystem } from '../../backend/services/fs.js';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';

interface SessionMeta {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  title?: string;
  prompt?: string;
  messages?: any[]; // 历史消息
  todos?: any[]; // todos列表
}

export function handleSessionIPC() {
  const fsService = getWorkspaceFilesystem();

  // 创建新会话
  ipcMain.handle('session:create', async (_event, title?: string, prompt?: string) => {
    try {
      const sessionId = randomUUID();
      const meta: SessionMeta = {
        sessionId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        title: title || '新对话',
        prompt: prompt || '',
      };

      // 创建会话目录和元数据
      await fsService.writeFile(
        sessionId,
        'meta/session.json',
        JSON.stringify(meta, null, 2)
      );

      // 创建子目录
      await Promise.all([
        fsService.writeFile(sessionId, 'images/.gitkeep', ''),
        fsService.writeFile(sessionId, 'audio/.gitkeep', ''),
        fsService.writeFile(sessionId, 'llm_logs/.gitkeep', ''),
      ]);

      return { sessionId, meta };
    } catch (error) {
      console.error('Failed to create session:', error);
      throw error;
    }
  });

  // 获取所有会话列表
  ipcMain.handle('session:list', async () => {
    try {
      const rootDir = fsService.root;
      let sessionDirs: string[] = [];

      try {
        const entries = await fs.readdir(rootDir, { withFileTypes: true });
        sessionDirs = entries
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name);
      } catch {
        return { sessions: [] };
      }

      // 读取每个会话的元数据
      const sessions = await Promise.all(
        sessionDirs.map(async (sessionId) => {
          try {
            const metaContent = await fsService.readFile(
              sessionId,
              'meta/session.json',
              'utf-8'
            );
            const meta = JSON.parse(metaContent as string) as SessionMeta;
            return meta;
          } catch {
            // 如果没有元数据，创建一个默认的
            return {
              sessionId,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              title: '未命名对话',
            } as SessionMeta;
          }
        })
      );

      // 按更新时间倒序排列
      sessions.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      return { sessions };
    } catch (error) {
      console.error('Failed to list sessions:', error);
      throw error;
    }
  });

  // 获取单个会话详情
  ipcMain.handle('session:get', async (_event, sessionId: string) => {
    try {
      const metaContent = await fsService.readFile(
        sessionId,
        'meta/session.json',
        'utf-8'
      );
      const meta = JSON.parse(metaContent as string) as SessionMeta;

      // 获取文件清单
      const [images, audio, logs] = await Promise.all([
        fsService.ls(sessionId, 'images'),
        fsService.ls(sessionId, 'audio'),
        fsService.ls(sessionId, 'llm_logs'),
      ]);

      return {
        meta,
        messages: meta.messages || [],
        todos: meta.todos || [],
        files: {
          images: images.filter((f) => !f.name.startsWith('.')),
          audio: audio.filter((f) => !f.name.startsWith('.')),
          llm_logs: logs.filter((f) => !f.name.startsWith('.')),
        },
      };
    } catch (error) {
      console.error('Failed to get session:', error);
      throw error;
    }
  });

  // 更新会话元数据
  ipcMain.handle('session:update', async (_event, sessionId: string, updates: Partial<SessionMeta>) => {
    try {
      const metaContent = await fsService.readFile(
        sessionId,
        'meta/session.json',
        'utf-8'
      );
      const meta = JSON.parse(metaContent as string) as SessionMeta;

      const updatedMeta: SessionMeta = {
        ...meta,
        ...updates,
        sessionId, // 不允许修改sessionId
        updatedAt: new Date().toISOString(),
      };

      await fsService.writeFile(
        sessionId,
        'meta/session.json',
        JSON.stringify(updatedMeta, null, 2)
      );

      return { meta: updatedMeta };
    } catch (error) {
      console.error('Failed to update session:', error);
      throw error;
    }
  });

  // 删除会话
  ipcMain.handle('session:delete', async (_event, sessionId: string) => {
    try {
      await fsService.rm(sessionId, '.');
      return { success: true };
    } catch (error) {
      console.error('Failed to delete session:', error);
      throw error;
    }
  });
}
