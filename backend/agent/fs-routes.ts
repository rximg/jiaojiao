import type { Express, Request, Response } from 'express';
import path from 'path';
import { getArtifactRepository } from '../infrastructure/repositories.js';

export function registerFilesystemRoutes(app: Express) {
  const artifactRepo = getArtifactRepository();

  // 列出目录文件
  app.get('/api/fs/ls', async (req: Request, res: Response) => {
    try {
      const { sessionId, path: relativePath = '.' } = req.query;

      if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ error: 'sessionId is required' });
      }

      const entries = await artifactRepo.list(sessionId, relativePath as string);
      res.json({ entries });
    } catch (error) {
      console.error('Failed to list files:', error);
      res.status(500).json({ error: 'Failed to list files' });
    }
  });

  // 读取文件内容
  app.get('/api/fs/file', async (req: Request, res: Response) => {
    try {
      const { sessionId, path: relativePath } = req.query;

      if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ error: 'sessionId is required' });
      }

      if (!relativePath || typeof relativePath !== 'string') {
        return res.status(400).json({ error: 'path is required' });
      }

      const fullPath = artifactRepo.resolvePath(sessionId, relativePath);
      const ext = path.extname(fullPath).toLowerCase();

      const contentTypeMap: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.log': 'text/plain',
        '.txt': 'text/plain',
        '.json': 'application/json',
      };

      const contentType = contentTypeMap[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);

      if (ext.match(/\.(png|jpg|jpeg|gif|webp|mp3|wav|ogg)$/i)) {
        res.sendFile(fullPath);
      } else {
        const content = await artifactRepo.read(sessionId, relativePath);
        res.send(typeof content === 'string' ? content : content.toString('utf-8'));
      }
    } catch (error) {
      console.error('Failed to read file:', error);
      res.status(500).json({ error: 'Failed to read file' });
    }
  });

  // Glob搜索文件
  app.get('/api/fs/glob', async (req: Request, res: Response) => {
    try {
      const { sessionId, pattern = '**/*' } = req.query;

      if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ error: 'sessionId is required' });
      }

      const matches = await artifactRepo.glob(sessionId, pattern as string);
      res.json({ matches });
    } catch (error) {
      console.error('Failed to glob files:', error);
      res.status(500).json({ error: 'Failed to glob files' });
    }
  });

  // Grep搜索文件内容
  app.get('/api/fs/grep', async (req: Request, res: Response) => {
    try {
      const { sessionId, pattern, glob } = req.query;

      if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ error: 'sessionId is required' });
      }

      if (!pattern || typeof pattern !== 'string') {
        return res.status(400).json({ error: 'pattern is required' });
      }

      const matches = await artifactRepo.grep(sessionId, pattern, {
        glob: glob as string | undefined,
      });
      res.json({ matches });
    } catch (error) {
      console.error('Failed to grep files:', error);
      res.status(500).json({ error: 'Failed to grep files' });
    }
  });
}
