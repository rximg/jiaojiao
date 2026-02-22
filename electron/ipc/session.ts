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

// 单 session 模式：只保存当前 session 的 caseId
let currentSessionId: string | null = null;
let currentCaseId: string | null = null;

export function getCachedSessionCaseId(sessionId: string): string | undefined {
  return currentSessionId === sessionId ? currentCaseId ?? undefined : undefined;
}

function cacheSessionCaseId(sessionId: string, caseId?: unknown): void {
  currentSessionId = sessionId;
  if (typeof caseId === 'string' && caseId.trim().length > 0) {
    currentCaseId = caseId.trim();
  } else {
    currentCaseId = null;
  }
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
  ipcMain.handle('session:create', async (_event, title?: string, prompt?: string, caseId?: string) => {
    try {
      const deps = sessionUseCaseDeps();
      const result = await createSessionUseCase(deps, { title, prompt, caseId });
      cacheSessionCaseId(result.sessionId, result.meta.caseId);
      return result;
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
      const result = await getSessionUseCase(deps, sessionId);
      cacheSessionCaseId(sessionId, result.meta.caseId);
      return result;
    } catch (error) {
      console.error('Failed to get session:', error);
      throw error;
    }
  });

  // 更新会话元数据
  ipcMain.handle('session:update', async (_event, sessionId: string, updates: { title?: string; prompt?: string; messages?: any[]; todos?: any[]; lastSyncAudioAt?: string; lastPrintAt?: string }) => {
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
      const result = await deleteSessionUseCase(deps, sessionId);
      // 单 session 模式：如果删除的是当前 session，清空缓存
      if (currentSessionId === sessionId) {
        currentSessionId = null;
        currentCaseId = null;
      }
      return result;
    } catch (error) {
      console.error('Failed to delete session:', error);
      throw error;
    }
  });

  // 显式关闭 session runtime（前端退出 chatbot 时调用）
  ipcMain.handle('session:closeRuntime', async (_event, sessionId: string) => {
    try {
      const runtimeManager = getRuntimeManager();
      await runtimeManager.closeRuntime(sessionId);
      // 单 session 模式：关闭当前 session 时清空缓存
      if (currentSessionId === sessionId) {
        currentSessionId = null;
        currentCaseId = null;
      }
      console.log('[Session IPC] Runtime closed for session:', sessionId);
      return { success: true };
    } catch (error) {
      console.error('Failed to close runtime:', error);
      throw error;
    }
  });
}
