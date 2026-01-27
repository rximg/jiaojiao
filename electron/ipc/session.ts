import { ipcMain } from 'electron';
import { getWorkspaceFilesystem } from '../../backend/services/fs.js';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

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
            
            // 提取第一句话和第一张图片
            let firstMessage = '';
            let firstImage = '';
            
            try {
              const messagesContent = await fsService.readFile(
                sessionId,
                'meta/messages.json',
                'utf-8'
              );
              const messages = JSON.parse(messagesContent as string);
              
              // 获取第一条用户消息
              const firstUserMessage = messages.find((msg: any) => msg.role === 'user');
              if (firstUserMessage) {
                firstMessage = firstUserMessage.content.substring(0, 100); // 最多100字符
              }
              
              // 查找第一张图片（从images目录）
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
                // 没有图片目录或图片，忽略
              }
            } catch {
              // 没有消息文件，忽略
            }
            
            return {
              ...meta,
              firstMessage,
              firstImage,
            };
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
      await fsService.rm(sessionId, '.');
      return { success: true };
    } catch (error) {
      console.error('Failed to delete session:', error);
      throw error;
    }
  });
}
