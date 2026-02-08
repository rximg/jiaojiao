import { ipcMain } from 'electron';
import { getWorkspaceFilesystem } from '../../backend/services/fs.js';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { getRuntimeManager } from '../../backend/services/runtime-manager.js';
import { getLogManager } from '../../backend/services/log-manager.js';

interface SessionMeta {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  title?: string;
  prompt?: string;
  messages?: any[]; // 历史消息
  todos?: any[]; // todos列表
  firstMessage?: string; // 第一句话
  firstImage?: string; // 第一张图片路径
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

      // 创建 Runtime（新增）
      const runtimeManager = getRuntimeManager();
      await runtimeManager.createAgentRuntime(sessionId);

      // 创建会话目录和元数据
      await fsService.writeFile(
        sessionId,
        'meta/session.json',
        JSON.stringify(meta, null, 2)
      );

      // 创建子目录（移除 llm_logs）
      await Promise.all([
        fsService.writeFile(sessionId, 'images/.gitkeep', ''),
        fsService.writeFile(sessionId, 'audio/.gitkeep', ''),
        fsService.writeFile(sessionId, 'checkpoints/.gitkeep', ''),
      ]);

      // 记录审计日志（新增）
      const logManager = getLogManager();
      await logManager.logAudit(sessionId, {
        action: 'session_created',
        title: meta.title,
        prompt: meta.prompt,
      });

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

      // 只把含有 meta/session.json 的目录视为会话，避免把 workspaces 下的其他目录（如 annoted_images）当会话
      const sessionsRaw = await Promise.all(
        sessionDirs.map(async (sessionId): Promise<SessionMeta & { firstMessage?: string; firstImage?: string } | null> => {
          try {
            const metaContent = await fsService.readFile(
              sessionId,
              'meta/session.json',
              'utf-8'
            );
            const meta = JSON.parse(metaContent as string) as SessionMeta;

            let firstMessage = '';
            let firstImage = '';

            try {
              const messagesContent = await fsService.readFile(
                sessionId,
                'meta/messages.json',
                'utf-8'
              );
              const messages = JSON.parse(messagesContent as string);
              const firstUserMessage = messages.find((msg: any) => msg.role === 'user');
              if (firstUserMessage) {
                firstMessage = firstUserMessage.content.substring(0, 100);
              }
              try {
                const imagesPath = path.join(rootDir, sessionId, 'images');
                const imageFiles = await fs.readdir(imagesPath);
                const imageFile = imageFiles.find((file: string) =>
                  /\.(png|jpg|jpeg|gif|webp)$/i.test(file)
                );
                if (imageFile) {
                  firstImage = path.join(imagesPath, imageFile);
                }
              } catch {
                // ignore
              }
            } catch {
              // ignore
            }

            return { ...meta, firstMessage, firstImage };
          } catch {
            // 无 meta/session.json 的目录（如 annoted_images）不列入会话列表
            return null;
          }
        })
      );

      const sessions = sessionsRaw.filter((s): s is SessionMeta & { firstMessage?: string; firstImage?: string } => s !== null);

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

      // 尝试从单独文件读取messages和todos
      let messages = meta.messages || [];
      let todos = meta.todos || [];
      
      try {
        const messagesContent = await fsService.readFile(
          sessionId,
          'meta/messages.json',
          'utf-8'
        );
        messages = JSON.parse(messagesContent as string);
      } catch {
        // messages.json不存在，使用meta中的或空数组
      }
      
      try {
        const todosContent = await fsService.readFile(
          sessionId,
          'meta/todos.json',
          'utf-8'
        );
        todos = JSON.parse(todosContent as string);
      } catch {
        // todos.json不存在，使用meta中的或空数组
      }

      // 获取文件清单
      const [images, audio, logs] = await Promise.all([
        fsService.ls(sessionId, 'images'),
        fsService.ls(sessionId, 'audio'),
        fsService.ls(sessionId, 'llm_logs'),
      ]);

      return {
        meta,
        messages,
        todos,
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
      let meta: SessionMeta;
      
      // 尝试读取现有session
      try {
        const metaContent = await fsService.readFile(
          sessionId,
          'meta/session.json',
          'utf-8'
        );
        meta = JSON.parse(metaContent as string) as SessionMeta;
      } catch (readError) {
        // Session不存在，自动创建
        console.log(`[session:update] Session ${sessionId} does not exist, creating...`);
        meta = {
          sessionId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          title: updates.title || '未命名对话',
          prompt: updates.prompt || '',
        };
        
        // 创建子目录
        await Promise.all([
          fsService.writeFile(sessionId, 'images/.gitkeep', ''),
          fsService.writeFile(sessionId, 'audio/.gitkeep', ''),
          fsService.writeFile(sessionId, 'llm_logs/.gitkeep', ''),
        ]);
      }

      const updatedMeta: SessionMeta = {
        ...meta,
        ...updates,
        sessionId, // 不允许修改sessionId
        updatedAt: new Date().toISOString(),
      };

      // 保存元数据
      await fsService.writeFile(
        sessionId,
        'meta/session.json',
        JSON.stringify(updatedMeta, null, 2)
      );
      
      // 如果更新包含messages，单独保存到messages.json
      if (updates.messages) {
        await fsService.writeFile(
          sessionId,
          'meta/messages.json',
          JSON.stringify(updates.messages, null, 2)
        );
      }
      
      // 如果更新包含todos，单独保存到todos.json
      if (updates.todos) {
        await fsService.writeFile(
          sessionId,
          'meta/todos.json',
          JSON.stringify(updates.todos, null, 2)
        );
      }

      return { meta: updatedMeta };
    } catch (error) {
      console.error('Failed to update session:', error);
      throw error;
    }
  });

  // 删除会话
  ipcMain.handle('session:delete', async (_event, sessionId: string) => {
    try {
      // 关闭 Runtime（新增）
      const runtimeManager = getRuntimeManager();
      await runtimeManager.closeRuntime(sessionId);
      // 给 Windows 一点时间释放文件句柄，避免 EPERM
      await new Promise((r) => setTimeout(r, 300));
      // 删除文件系统数据
      await fsService.rm(sessionId, '.');
      
      // 记录审计日志（新增）
      const logManager = getLogManager();
      await logManager.logAudit(sessionId, {
        action: 'session_deleted',
      });
      
      return { success: true };
    } catch (error) {
      console.error('Failed to delete session:', error);
      throw error;
    }
  });
}
