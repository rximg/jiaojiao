import type { Express, Request, Response } from 'express';
import { getRuntimeManager } from '../../services/runtime-manager.js';
import { getLogManager } from '../../services/log-manager.js';
import { getSessionRepository, getArtifactRepository } from '../../infrastructure/repositories.js';
import {
  createSessionUseCase,
  listSessionsUseCase,
  getSessionUseCase,
  updateSessionUseCase,
  deleteSessionUseCase,
} from '../../application/agent/index.js';

function sessionUseCaseDeps() {
  const sessionRepo = getSessionRepository();
  const artifactRepo = getArtifactRepository();
  const runtimeManager = getRuntimeManager();
  const logManager = getLogManager();
  return {
    sessionRepo,
    artifactRepo,
    createAgentRuntime: (sessionId: string) => runtimeManager.createAgentRuntime(sessionId),
    logAudit: (sessionId: string, payload: Record<string, unknown>) => logManager.logAudit(sessionId, payload),
    closeRuntime: (sessionId: string) => runtimeManager.closeRuntime(sessionId),
  };
}

export function registerSessionRoutes(app: Express) {
  app.post('/api/sessions', async (req: Request, res: Response) => {
    try {
      const deps = sessionUseCaseDeps();
      const result = await createSessionUseCase(deps, { title: req.body?.title, prompt: req.body?.prompt });
      res.json(result);
    } catch (error) {
      console.error('Failed to create session:', error);
      res.status(500).json({ error: 'Failed to create session' });
    }
  });

  app.get('/api/sessions', async (_req: Request, res: Response) => {
    try {
      const deps = sessionUseCaseDeps();
      const result = await listSessionsUseCase(deps);
      res.json(result);
    } catch (error) {
      console.error('Failed to list sessions:', error);
      res.status(500).json({ error: 'Failed to list sessions' });
    }
  });

  app.get('/api/sessions/:sessionId', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const deps = sessionUseCaseDeps();
      const result = await getSessionUseCase(deps, sessionId);
      res.json(result);
    } catch (error: any) {
      console.error('Failed to get session:', error);
      if (error?.message === 'Session not found') return res.status(404).json({ error: 'Session not found' });
      res.status(500).json({ error: 'Failed to get session' });
    }
  });

  app.patch('/api/sessions/:sessionId', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const deps = sessionUseCaseDeps();
      const result = await updateSessionUseCase(deps, sessionId, req.body);
      res.json(result);
    } catch (error) {
      console.error('Failed to update session:', error);
      res.status(500).json({ error: 'Failed to update session' });
    }
  });

  app.delete('/api/sessions/:sessionId', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const deps = sessionUseCaseDeps();
      const result = await deleteSessionUseCase(deps, sessionId);
      res.json(result);
    } catch (error) {
      console.error('Failed to delete session:', error);
      res.status(500).json({ error: 'Failed to delete session' });
    }
  });
}
