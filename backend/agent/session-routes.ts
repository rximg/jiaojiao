import type { Express, Request, Response } from 'express';
import { getWorkspaceFilesystem } from '../services/fs';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

interface SessionMeta {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  title?: string;
  prompt?: string;
}

export function registerSessionRoutes(app: Express) {
  const fsService = getWorkspaceFilesystem();

  // 创建新会话
  app.post('/api/sessions', async (req: Request, res: Response) => {
    try {
      const sessionId = randomUUID();
      const meta: SessionMeta = {
        sessionId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        title: req.body.title || '新对话',
        prompt: req.body.prompt || '',
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

      res.json({ sessionId, meta });
    } catch (error) {
      console.error('Failed to create session:', error);
      res.status(500).json({ error: 'Failed to create session' });
    }
  });

  // 获取所有会话列表
  app.get('/api/sessions', async (req: Request, res: Response) => {
    try {
      const rootDir = fsService.root;
      let sessionDirs: string[] = [];

      try {
        const entries = await fs.readdir(rootDir, { withFileTypes: true });
        sessionDirs = entries
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name);
      } catch {
        return res.json({ sessions: [] });
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

      res.json({ sessions });
    } catch (error) {
      console.error('Failed to list sessions:', error);
      res.status(500).json({ error: 'Failed to list sessions' });
    }
  });

  // 获取单个会话详情
  app.get('/api/sessions/:sessionId', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;

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

      res.json({
        meta,
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
      await fsService.rm(sessionId, '.');
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete session:', error);
      res.status(500).json({ error: 'Failed to delete session' });
    }
  });
}
