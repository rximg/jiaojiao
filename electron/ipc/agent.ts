import { ipcMain, BrowserWindow, type WebContents } from 'electron';
import { getBackendConfigDir } from './config.js';
import { workspaceNotifier } from '../../backend/workspace-notifier.js';
import { getSessionMessages } from './session.js';
import { invokeAgentUseCase } from '../../backend/application/use-cases/index.js';
import { resolveStepResultPaths } from '../../backend/application/helpers/resolve-step-result-paths.js';

let currentStreamController: AbortController | null = null;

/** 向渲染进程发送额度错误并抛出 */
function sendQuotaExceededAndThrow(
  win: WebContents,
  error: any,
  kind: '403' | '429'
): never {
  const is403 = kind === '403';
  const message = is403
    ? 'API额度已用完，请前往设置更换模型'
    : 'API配额不足，请检查您的账户余额和套餐详情';
  const details =
    kind === '429'
      ? '您已超出当前配额，请检查您的计划和账单详情。详情请参阅：https://help.aliyun.com/zh/model-studio/error-code#token-limit'
      : undefined;
  win.send('agent:quotaExceeded', {
    message,
    error: error?.message ?? (is403 ? '403 Forbidden' : '429 Insufficient Quota'),
    ...(details ? { details } : {}),
  });
  throw new Error(message);
}

/** 判断是否为用户取消 HITL 导致的错误 */
function isCancelledByUser(error: any): boolean {
  return (
    error?.message?.includes('cancelled by user') ||
    error?.cause?.message?.includes('cancelled by user')
  );
}

/** 判断是否为额度/配额类错误（403 或 429） */
function isQuotaError(error: any): '403' | '429' | null {
  if (error?.message?.includes('403') || error?.status === 403 || error?.code === 403)
    return '403';
  if (
    error?.name === 'InsufficientQuotaError' ||
    error?.message?.includes('429') ||
    error?.message?.includes('quota') ||
    error?.status === 429 ||
    error?.code === 429
  )
    return '429';
  return null;
}

/**
 * 发送用户消息给 Agent 并流式返回结果。委托 InvokeAgentUseCase，IPC 仅负责 env、callbacks、错误与取消处理。
 * @returns 成功时返回 threadId；用户中止时返回 'stream-aborted'
 */
async function sendAgentMessage(
  message: string,
  threadId?: string,
  sessionId?: string
): Promise<string> {
  const mainWindow = BrowserWindow.getAllWindows()[0];
  if (!mainWindow) throw new Error('Main window not found');

  const previousSessionId = process.env.AGENT_SESSION_ID;
  try {
    currentStreamController = new AbortController();
    if (sessionId) {
      process.env.AGENT_SESSION_ID = sessionId;
      console.log(`[agent] Set AGENT_SESSION_ID to: ${sessionId}`);
    }
    process.env.AGENT_CONFIG_DIR = getBackendConfigDir();

    const { createMainAgent } = await import('../../backend/agent/factory.js');
    const deps = {
      createAgent: createMainAgent,
      getSessionMessages,
      resolveStepResultPaths: (sid: string | undefined, steps: any[]) => resolveStepResultPaths(sid, steps),
    };
    const callbacks = {
      onMessage: (newThreadId: string, messages: any[]) => {
        mainWindow.webContents.send('agent:message', { threadId: newThreadId, messages });
      },
      onStepResult: (newThreadId: string, messageId: string, stepResults: any[]) => {
        mainWindow.webContents.send('agent:stepResult', { threadId: newThreadId, messageId, stepResults });
      },
      onToolCall: (newThreadId: string, toolCalls: any[]) => {
        mainWindow.webContents.send('agent:toolCall', { threadId: newThreadId, toolCalls });
      },
      onTodoUpdate: (newThreadId: string, todos: any[]) => {
        mainWindow.webContents.send('agent:todoUpdate', { threadId: newThreadId, todos });
      },
    };

    try {
      const newThreadId = await invokeAgentUseCase(deps, {
        message,
        threadId,
        sessionId,
        signal: currentStreamController.signal,
        callbacks,
      });
      return newThreadId;
    } catch (streamError: any) {
      if (streamError.name === 'AbortError') return 'stream-aborted';
      console.error('Stream error:', streamError);

      const quotaKind = isQuotaError(streamError);
      if (quotaKind)
        sendQuotaExceededAndThrow(mainWindow.webContents, streamError, quotaKind);

      if (isCancelledByUser(streamError)) {
        const newThreadId = threadId ?? `thread-${Date.now()}`;
        mainWindow.webContents.send('agent:streamEnd', {
          threadId: newThreadId,
          cancelled: true,
        });
        return newThreadId;
      }
      throw streamError;
    }
  } catch (error: any) {
    if (error.name === 'AbortError') return 'stream-aborted';

    const quotaKind = isQuotaError(error);
    if (quotaKind)
      sendQuotaExceededAndThrow(mainWindow.webContents, error, quotaKind);

    console.error('Agent error:', error);
    throw error;
  } finally {
    if (previousSessionId !== undefined) {
      process.env.AGENT_SESSION_ID = previousSessionId;
    } else {
      delete process.env.AGENT_SESSION_ID;
    }
  }
}

export function handleAgentIPC() {
  workspaceNotifier.on('fileAdded', (data: { sessionId: string; category: string }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w?.webContents?.send('agent:workspaceFileAdded', data);
  });

  ipcMain.handle(
    'agent:sendMessage',
    async (_event, message: string, threadId?: string, sessionId?: string) => {
      return sendAgentMessage(message, threadId, sessionId);
    }
  );

  ipcMain.handle('agent:stopStream', async () => {
    if (currentStreamController) {
      currentStreamController.abort();
      currentStreamController = null;
    }
  });
}
