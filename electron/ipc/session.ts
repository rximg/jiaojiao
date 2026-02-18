import { ipcMain } from 'electron';
import { getRuntimeManager } from '../../backend/services/runtime-manager.js';
import { getLogManager } from '../../backend/services/log-manager.js';
import { getSessionRepository, getArtifactRepository } from '../../backend/infrastructure/repositories.js';
import {
  createSessionUseCase,
  listSessionsUseCase,
  getSessionUseCase,
  updateSessionUseCase,
  deleteSessionUseCase,
} from '../../backend/application/agent/index.js';

/** 供 agent 等主进程逻辑使用：根据 sessionId 读取该会话的 messages，用于拼接到 agent 的上下文中 */
export async function getSessionMessages(sessionId: string): Promise<any[]> {
  const artifactRepo = getArtifactRepository();
  try {
    const messagesContent = await artifactRepo.read(sessionId, 'meta/messages.json');
    return JSON.parse(typeof messagesContent === 'string' ? messagesContent : messagesContent.toString('utf-8'));
  } catch {
    try {
      const metaContent = await artifactRepo.read(sessionId, 'meta/session.json');
      const meta = JSON.parse(typeof metaContent === 'string' ? metaContent : metaContent.toString('utf-8')) as { messages?: any[] };
      return meta.messages || [];
    } catch {
      return [];
    }
  }
}

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

export function handleSessionIPC() {
  // 创建新会话
  ipcMain.handle('session:create', async (_event, title?: string, prompt?: string) => {
    try {
      const deps = sessionUseCaseDeps();
      return await createSessionUseCase(deps, { title, prompt });
    } catch (error) {
      console.error('Failed to create session:', error);
      throw error;
    }
  });

  // 获取所有会话列表
  ipcMain.handle('session:list', async () => {
    try {
      const deps = sessionUseCaseDeps();
      return await listSessionsUseCase(deps);
    } catch (error) {
      console.error('Failed to list sessions:', error);
      throw error;
    }
  });

  // 获取单个会话详情
  ipcMain.handle('session:get', async (_event, sessionId: string) => {
    try {
      const deps = sessionUseCaseDeps();
      return await getSessionUseCase(deps, sessionId);
    } catch (error) {
      console.error('Failed to get session:', error);
      throw error;
    }
  });

  // 更新会话元数据
  ipcMain.handle('session:update', async (_event, sessionId: string, updates: { title?: string; prompt?: string; messages?: any[]; todos?: any[] }) => {
    try {
      const deps = sessionUseCaseDeps();
      return await updateSessionUseCase(deps, sessionId, updates);
    } catch (error) {
      console.error('Failed to update session:', error);
      throw error;
    }
  });

  // 删除会话
  ipcMain.handle('session:delete', async (_event, sessionId: string) => {
    try {
      const deps = sessionUseCaseDeps();
      return await deleteSessionUseCase(deps, sessionId);
    } catch (error) {
      console.error('Failed to delete session:', error);
      throw error;
    }
  });
}
