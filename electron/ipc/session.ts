import { ipcMain } from 'electron';
import { randomUUID } from 'crypto';
import { getRuntimeManager } from '../../backend/services/runtime-manager.js';
import { getLogManager } from '../../backend/services/log-manager.js';
import { getSessionRepository, getArtifactRepository } from '../../backend/infrastructure/repositories.js';

interface SessionMeta {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  title?: string;
  prompt?: string;
  messages?: any[];
  todos?: any[];
  firstMessage?: string;
  firstImage?: string;
}

/** 供 agent 等主进程逻辑使用：根据 sessionId 读取该会话的 messages，用于拼接到 agent 的上下文中 */
export async function getSessionMessages(sessionId: string): Promise<any[]> {
  const artifactRepo = getArtifactRepository();
  try {
    const messagesContent = await artifactRepo.read(sessionId, 'meta/messages.json');
    return JSON.parse(typeof messagesContent === 'string' ? messagesContent : messagesContent.toString('utf-8'));
  } catch {
    try {
      const metaContent = await artifactRepo.read(sessionId, 'meta/session.json');
      const meta = JSON.parse(typeof metaContent === 'string' ? metaContent : metaContent.toString('utf-8')) as SessionMeta;
      return meta.messages || [];
    } catch {
      return [];
    }
  }
}

export function handleSessionIPC() {
  const sessionRepo = getSessionRepository();
  const artifactRepo = getArtifactRepository();

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

      const runtimeManager = getRuntimeManager();
      await runtimeManager.createAgentRuntime(sessionId);

      await sessionRepo.save({ sessionId, meta });

      await Promise.all([
        artifactRepo.write(sessionId, 'images/.gitkeep', ''),
        artifactRepo.write(sessionId, 'audio/.gitkeep', ''),
        artifactRepo.write(sessionId, 'checkpoints/.gitkeep', ''),
      ]);

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
      const sessions = await sessionRepo.list();
      const sessionsRaw = await Promise.all(
        sessions.map(async (session): Promise<SessionMeta & { firstMessage?: string; firstImage?: string }> => {
          let firstMessage = '';
          let firstImage = '';
          try {
            const messagesContent = await artifactRepo.read(session.sessionId, 'meta/messages.json');
            const messages = JSON.parse(
              typeof messagesContent === 'string' ? messagesContent : messagesContent.toString('utf-8')
            );
            const firstUserMessage = messages.find((msg: { role?: string }) => msg.role === 'user');
            if (firstUserMessage?.content) {
              firstMessage = String(firstUserMessage.content).substring(0, 100);
            }
          } catch {
            // ignore
          }
          try {
            const imageEntries = await artifactRepo.list(session.sessionId, 'images');
            const imageFile = imageEntries.find((e) => /\.(png|jpg|jpeg|gif|webp)$/i.test(e.name));
            if (imageFile) firstImage = imageFile.path;
          } catch {
            // ignore
          }
          const m = session.meta as Record<string, unknown>;
          return {
            sessionId: session.sessionId,
            createdAt: m.createdAt ?? new Date().toISOString(),
            updatedAt: m.updatedAt ?? new Date().toISOString(),
            title: m.title,
            prompt: m.prompt,
            firstMessage,
            firstImage,
          } as SessionMeta & { firstMessage?: string; firstImage?: string };
        })
      );

      sessionsRaw.sort(
        (a, b) =>
          new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()
      );

      return { sessions: sessionsRaw };
    } catch (error) {
      console.error('Failed to list sessions:', error);
      throw error;
    }
  });

  // 获取单个会话详情
  ipcMain.handle('session:get', async (_event, sessionId: string) => {
    try {
      const session = await sessionRepo.findById(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      let messages = (session.meta as SessionMeta).messages || [];
      let todos = (session.meta as SessionMeta).todos || [];

      try {
        const messagesContent = await artifactRepo.read(sessionId, 'meta/messages.json');
        messages = JSON.parse(
          typeof messagesContent === 'string' ? messagesContent : messagesContent.toString('utf-8')
        );
      } catch {
        // ignore
      }

      try {
        const todosContent = await artifactRepo.read(sessionId, 'meta/todos.json');
        todos = JSON.parse(
          typeof todosContent === 'string' ? todosContent : todosContent.toString('utf-8')
        );
      } catch {
        // ignore
      }

      const [images, audio, logs] = await Promise.all([
        artifactRepo.list(sessionId, 'images'),
        artifactRepo.list(sessionId, 'audio'),
        artifactRepo.list(sessionId, 'llm_logs'),
      ]);

      return {
        meta: { ...session.meta, sessionId: session.sessionId },
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
      let session = await sessionRepo.findById(sessionId);
      let meta: SessionMeta;

      if (!session) {
        meta = {
          sessionId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          title: updates.title || '未命名对话',
          prompt: updates.prompt || '',
        };
        await Promise.all([
          artifactRepo.write(sessionId, 'images/.gitkeep', ''),
          artifactRepo.write(sessionId, 'audio/.gitkeep', ''),
          artifactRepo.write(sessionId, 'llm_logs/.gitkeep', ''),
        ]);
      } else {
        meta = { ...session.meta, sessionId: session.sessionId } as SessionMeta;
      }

      const updatedMeta: SessionMeta = {
        ...meta,
        ...updates,
        sessionId,
        updatedAt: new Date().toISOString(),
      };

      await sessionRepo.save({ sessionId, meta: updatedMeta });

      if (updates.messages !== undefined) {
        await artifactRepo.write(
          sessionId,
          'meta/messages.json',
          JSON.stringify(updates.messages, null, 2)
        );
      }
      if (updates.todos !== undefined) {
        await artifactRepo.write(
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
      const runtimeManager = getRuntimeManager();
      await runtimeManager.closeRuntime(sessionId);
      await new Promise((r) => setTimeout(r, 300));

      await sessionRepo.delete(sessionId);

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
