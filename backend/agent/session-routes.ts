import type { Express, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getRuntimeManager } from '../services/runtime-manager.js';
import { getLogManager } from '../services/log-manager.js';
import { getSessionRepository, getArtifactRepository } from '../infrastructure/repositories.js';

export function registerSessionRoutes(app: Express) {
  const sessionRepo = getSessionRepository();
  const artifactRepo = getArtifactRepository();

  // 创建新会话
  app.post('/api/sessions', async (req: Request, res: Response) => {
    try {
      const sessionId = randomUUID();
      const meta = {
        sessionId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        title: req.body.title || '新对话',
        prompt: req.body.prompt || '',
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

      res.json({ sessionId, meta });
    } catch (error) {
      console.error('Failed to create session:', error);
      res.status(500).json({ error: 'Failed to create session' });
    }
  });

  // 获取所有会话列表
  app.get('/api/sessions', async (_req: Request, res: Response) => {
    try {
      const sessions = await sessionRepo.list();
      const metaList = sessions.map((s) => ({
        ...s.meta,
        sessionId: s.sessionId,
      }));
      res.json({ sessions: metaList });
    } catch (error) {
      console.error('Failed to list sessions:', error);
      res.status(500).json({ error: 'Failed to list sessions' });
    }
  });

  // 获取单个会话详情
  app.get('/api/sessions/:sessionId', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const session = await sessionRepo.findById(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const [images, audio, logs] = await Promise.all([
        artifactRepo.list(sessionId, 'images'),
        artifactRepo.list(sessionId, 'audio'),
        artifactRepo.list(sessionId, 'llm_logs'),
      ]);

      res.json({
        meta: { ...session.meta, sessionId: session.sessionId },
        files: {
          images: images.filter((f) => !f.name.startsWith('.')),
          audio: audio.filter((f) => !f.name.startsWith('.')),
          llm_logs: logs.filter((f) => !f.name.startsWith('.')),
        },
      });
    } catch (error) {
      console.error('Failed to get session:', error);
      res.status(404).json({ error: 'Session not found' });
    }
  });

  // 更新会话元数据
  app.patch('/api/sessions/:sessionId', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const updates = req.body;

      const session = await sessionRepo.findById(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const updatedMeta = {
        ...session.meta,
        ...updates,
        sessionId,
        updatedAt: new Date().toISOString(),
      };

      await sessionRepo.save({ sessionId, meta: updatedMeta });
      res.json({ meta: updatedMeta });
    } catch (error) {
      console.error('Failed to update session:', error);
      res.status(500).json({ error: 'Failed to update session' });
    }
  });

  // 删除会话
  app.delete('/api/sessions/:sessionId', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;

      const runtimeManager = getRuntimeManager();
      await runtimeManager.closeRuntime(sessionId);

      await sessionRepo.delete(sessionId);

      const logManager = getLogManager();
      await logManager.logAudit(sessionId, {
        action: 'session_deleted',
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete session:', error);
      res.status(500).json({ error: 'Failed to delete session' });
    }
  });
}
