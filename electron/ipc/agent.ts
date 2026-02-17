import path from 'path';
import { ipcMain, BrowserWindow, type WebContents } from 'electron';
import { getBackendConfigDir } from './config.js';
import { workspaceNotifier } from '../../backend/workspace-notifier.js';
import { loadConfig } from '../../backend/app-config.js';
import { getWorkspaceFilesystem } from '../../backend/services/fs.js';
import { getSessionMessages } from './session.js';

let currentStreamController: AbortController | null = null;

/** 结构化步骤结果，供前端按文档/图片/音频控件渲染 */
export type StepResult =
  | { type: 'image'; payload: { path: string; prompt?: string } }
  | { type: 'audio'; payload: { path: string; text?: string } }
  | { type: 'document'; payload: { pathOrContent: string; title?: string } };

function extractStepResultsFromContent(content: string): StepResult[] {
  if (!content || typeof content !== 'string') return [];
  const results: StepResult[] = [];
  // 图片：支持多种格式（中文冒号、英文冒号、绝对路径、outputs/...、images/...）
  const imagePatterns = [
    /(?:图片[：:]\s*)([^\s\n]+\.(?:png|jpg|jpeg))/gi,
    /(?:outputs[/\\]workspaces[/\\][^/\\]+[/\\]images[/\\][^\s\n]+\.(?:png|jpg|jpeg))/gi,
    /(?:outputs[/\\]images[/\\][^\s\n]+\.(?:png|jpg|jpeg))/gi,
    /(?:images[/\\][^\s\n]+\.(?:png|jpg|jpeg))/gi,
    /([A-Za-z]:[\\/][^\s\n]+\.(?:png|jpg|jpeg))/g,
    /(\/[^\s\n]+\.(?:png|jpg|jpeg))/g,
  ];
  const seenImages = new Set<string>();
  for (const re of imagePatterns) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(content)) !== null) {
      const path = (m[1] ?? m[0]).replace(/^图片[：:]\s*/i, '').trim();
      if (path && !seenImages.has(path)) {
        seenImages.add(path);
        results.push({ type: 'image', payload: { path } });
      }
    }
  }
  // 音频：同上
  const audioPatterns = [
    /(?:音频[：:]\s*)([^\s\n]+\.(?:mp3|wav))/gi,
    /(?:outputs[/\\]workspaces[/\\][^/\\]+[/\\]audio[/\\][^\s\n]+\.(?:mp3|wav))/gi,
    /(?:outputs[/\\]audio[/\\][^\s\n]+\.(?:mp3|wav))/gi,
    /(?:audio[/\\][^\s\n]+\.(?:mp3|wav))/gi,
    /([A-Za-z]:[\\/][^\s\n]+\.(?:mp3|wav))/g,
    /(\/[^\s\n]+\.(?:mp3|wav))/g,
  ];
  const seenAudio = new Set<string>();
  for (const re of audioPatterns) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(content)) !== null) {
      const path = (m[1] ?? m[0]).replace(/^音频[：:]\s*/i, '').trim();
      if (path && !seenAudio.has(path)) {
        seenAudio.add(path);
        results.push({ type: 'audio', payload: { path } });
      }
    }
  }
  return results;
}

function isAbsolutePath(p: string): boolean {
  const trimmed = p.trim();
  if (/^[A-Za-z]:[\\/]/.test(trimmed)) return true;
  if (trimmed.startsWith('/')) return true;
  return false;
}

async function resolveStepResultPaths(
  stepResults: StepResult[],
  sessionId: string | undefined
): Promise<StepResult[]> {
  if (!sessionId || stepResults.length === 0) return stepResults;
  try {
    const appConfig = await loadConfig();
    const outputPath = appConfig?.storage?.outputPath ?? './outputs';
    const workspaceFs = getWorkspaceFilesystem({ outputPath });
    const sessionRoot = path.join(workspaceFs.root, sessionId);
    return stepResults.map((sr) => {
      if (sr.type === 'image' && sr.payload.path && !isAbsolutePath(sr.payload.path)) {
        const abs = path.resolve(sessionRoot, sr.payload.path.replace(/^[/\\]+/, ''));
        return { ...sr, payload: { ...sr.payload, path: abs } };
      }
      if (sr.type === 'audio' && sr.payload.path && !isAbsolutePath(sr.payload.path)) {
        const abs = path.resolve(sessionRoot, sr.payload.path.replace(/^[/\\]+/, ''));
        return { ...sr, payload: { ...sr.payload, path: abs } };
      }
      return sr;
    });
  } catch {
    return stepResults;
  }
}

/**
 * 修复消息历史中的工具调用，确保所有工具调用都有 id 字段
 * OpenAI API 要求所有工具调用必须有 id 字段
 */
function fixToolCallsInMessages(messages: any[]): any[] {
  return messages.map((msg) => {
    if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
      msg.tool_calls = msg.tool_calls.map((toolCall: any, index: number) => {
        if (!toolCall.id) {
          // 如果没有 id，生成一个
          toolCall.id = `call_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 9)}`;
        }
        return toolCall;
      });
    }
    // 兼容 toolCalls (camelCase)
    if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
      msg.toolCalls = msg.toolCalls.map((toolCall: any, index: number) => {
        if (!toolCall.id) {
          toolCall.id = `call_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 9)}`;
        }
        return toolCall;
      });
    }
    return msg;
  });
}

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
 * 发送用户消息给 Agent 并流式返回结果。
 * 负责：环境变量、加载历史、创建 agent、流式消费、错误与取消处理。
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
    const agent = await createMainAgent(sessionId);
    const newThreadId = threadId || `thread-${Date.now()}`;

    let inputMessages: any[];
    if (sessionId) {
      const history = await getSessionMessages(sessionId);
      const maxHistory = 30;
      const recent = history.slice(-maxHistory);
      const historyForAgent = recent.map((m: any) => ({
        role: m.role || 'user',
        content: typeof m.content === 'string' ? m.content : (m.content ?? ''),
      }));
      // 已有历史时注入“重新打开会话”上下文，让 agent 明确知道这是续接会话，应结合 checkpoint/todo 只执行用户要求的步骤
      const isReopenedSession = recent.length > 0;
      const userContent = isReopenedSession
        ? `【当前为已有会话的继续；请结合对话历史和 checkpoint 中的 todo 状态，仅执行用户在本条消息中要求的步骤（如「重新生成台词」则只做第 3 步，勿从头重跑）。】\n\n${message}`
        : message;
      inputMessages = [...historyForAgent, { role: 'user', content: userContent }];
      console.log(`[agent] Loaded ${recent.length} history messages for session ${sessionId}${isReopenedSession ? ' (reopened session context injected)' : ''}`);
    } else {
      inputMessages = [{ role: 'user', content: message }];
    }
    const fixedMessages = fixToolCallsInMessages(inputMessages);

    try {
      // 有 sessionId 时传入 thread_id，使 LangGraph checkpointer 按 session 加载/保存状态（session/checkpoints/）
      const runConfig: { signal: AbortSignal; recursionLimit: number; configurable?: { thread_id: string } } = {
        signal: currentStreamController.signal,
        recursionLimit: 200,
      };
      if (sessionId) runConfig.configurable = { thread_id: sessionId };

      // @ts-ignore - Type instantiation is too deep with deepagents
      const stream = await (agent as any).stream(
        { messages: fixedMessages },
        runConfig
      );

      let streamingAssistantId: string | null = null;
      for await (const chunk of stream) {
        if (currentStreamController.signal.aborted) break;

        const chunkKeys = Object.keys(chunk);
        const nodeKey = chunkKeys[0];
        const state = nodeKey ? (chunk as any)[nodeKey] : chunk;

        console.log('[stream chunk] Full chunk keys:', chunkKeys);
        console.log('[stream node]', nodeKey);
        console.log('[stream state keys]', Object.keys(state || {}));

        if (state.messages && Array.isArray(state.messages)) {
          const fixedStateMessages = fixToolCallsInMessages(state.messages);
          const newMessages = fixedStateMessages
            .filter((msg: any) => msg.role === 'assistant')
            .slice(-1);
          if (newMessages.length > 0) {
            const msg = newMessages[0];
            const content =
              typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
            const stableId: string =
              streamingAssistantId ?? (msg.id || `stream-${newThreadId}`);
            streamingAssistantId = stableId;
            let stepResults = extractStepResultsFromContent(content);
            stepResults = await resolveStepResultPaths(stepResults, sessionId);
            const mapped = [
              {
                id: stableId,
                role: msg.role,
                content,
                timestamp: new Date(),
                ...(stepResults.length > 0 ? { stepResults } : {}),
              },
            ];
            mainWindow.webContents.send('agent:message', {
              threadId: newThreadId,
              messages: mapped,
            });
            if (stepResults.length > 0) {
              mainWindow.webContents.send('agent:stepResult', {
                threadId: newThreadId,
                messageId: stableId,
                stepResults,
              });
            }
          }
        }

        if (state.tool_calls || state.toolCalls) {
          const toolCalls = state.tool_calls || state.toolCalls;
          mainWindow.webContents.send('agent:toolCall', {
            threadId: newThreadId,
            toolCalls: Array.isArray(toolCalls) ? toolCalls : [toolCalls],
          });
        }

        if (state.todos && Array.isArray(state.todos) && state.todos.length > 0) {
          console.log('[todos update]', JSON.stringify(state.todos, null, 2));
          mainWindow.webContents.send('agent:todoUpdate', {
            threadId: newThreadId,
            todos: state.todos,
          });
        }
      }
    } catch (streamError: any) {
      if (streamError.name === 'AbortError') return 'stream-aborted';
      console.error('Stream error:', streamError);

      const quotaKind = isQuotaError(streamError);
      if (quotaKind)
        sendQuotaExceededAndThrow(mainWindow.webContents, streamError, quotaKind);

      if (isCancelledByUser(streamError)) {
        mainWindow.webContents.send('agent:streamEnd', {
          threadId: newThreadId,
          cancelled: true,
        });
        return newThreadId;
      }
      throw streamError;
    }

    return newThreadId;
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
