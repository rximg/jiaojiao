import { ipcMain, BrowserWindow } from 'electron';
import { getBackendConfigDir } from './config.js';

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
    const path = await import('path');
    const { loadConfig } = await import('../../backend/app-config.js');
    const { getWorkspaceFilesystem } = await import('../../backend/services/fs.js');
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

export function handleAgentIPC() {
  ipcMain.handle('agent:sendMessage', async (_event, message: string, threadId?: string, sessionId?: string) => {
    // 获取主窗口用于发送事件
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (!mainWindow) {
      throw new Error('Main window not found');
    }
    
    // 如果提供了sessionId，将其注入到环境变量，供工具使用
    const previousSessionId = process.env.AGENT_SESSION_ID;
    
    try {

      // 创建新的流控制器
      currentStreamController = new AbortController();

      if (sessionId) {
        process.env.AGENT_SESSION_ID = sessionId;
        console.log(`[agent] Set AGENT_SESSION_ID to: ${sessionId}`);
      }

      // 打包后 backend 在 extraResources，需让 AgentFactory 使用 resources/backend/config
      process.env.AGENT_CONFIG_DIR = getBackendConfigDir();

      // 动态导入 Agent 工厂（避免在模块加载时执行）
      const { createMainAgent } = await import('../../backend/agent/factory.js');
      
      // 初始化 Agent，传入 sessionId（修改）
      const agent = await createMainAgent(sessionId);

      const newThreadId = threadId || `thread-${Date.now()}`;

      // 若有 sessionId，加载该会话的历史消息，与当前消息一起传给 agent，使回复能结合上下文
      let inputMessages: any[];
      if (sessionId) {
        const { getSessionMessages } = await import('./session.js');
        const history = await getSessionMessages(sessionId);
        const maxHistory = 30; // 最多保留最近 30 条，避免 token 超限
        const recent = history.slice(-maxHistory);
        const historyForAgent = recent.map((m: any) => ({
          role: m.role || 'user',
          content: typeof m.content === 'string' ? m.content : (m.content ?? ''),
        }));
        inputMessages = [...historyForAgent, { role: 'user', content: message }];
        console.log(`[agent] Loaded ${recent.length} history messages for session ${sessionId}`);
      } else {
        inputMessages = [{ role: 'user', content: message }];
      }
      const fixedMessages = fixToolCallsInMessages(inputMessages);

      // 发送消息并流式返回结果
      // deepagentsjs 返回的是 LangGraph graph，支持 stream 方法
      try {
        
        // @ts-ignore - Type instantiation is too deep with deepagents
        const stream = await (agent as any).stream(
          { messages: fixedMessages },
          { 
            signal: currentStreamController.signal,
            recursionLimit: 200  // 增加递归限制，防止无限循环（默认50，增加到200）
          }
        );

        // 处理流式响应
        // LangGraph stream chunks are keyed by node/middleware name
        // 流式期间使用稳定 id，保证 stepResult 能匹配到同一条消息
        let streamingAssistantId: string | null = null;
        for await (const chunk of stream) {
          if (currentStreamController.signal.aborted) {
            break;
          }

          // Extract the actual state from the keyed chunk
          const chunkKeys = Object.keys(chunk);
          const nodeKey = chunkKeys[0];
          const state = nodeKey ? (chunk as any)[nodeKey] : chunk;

          console.log('[stream chunk] Full chunk keys:', chunkKeys);
          console.log('[stream node]', nodeKey);
          console.log('[stream state keys]', Object.keys(state || {}));
          console.log('[stream state]', {
            hasTodos: !!state.todos,
            todosLength: state.todos?.length || 0,
            todosData: state.todos ? JSON.stringify(state.todos, null, 2) : 'none'
          });

          // 发送消息块
          if (state.messages && Array.isArray(state.messages)) {
            const fixedMessages = fixToolCallsInMessages(state.messages);
            const newMessages = fixedMessages
              .filter((msg: any) => msg.role === 'assistant')
              .slice(-1);

            if (newMessages.length > 0) {
              const msg = newMessages[0];
              const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
              const stableId: string = streamingAssistantId ?? (msg.id || `stream-${newThreadId}`);
              streamingAssistantId = stableId;
              let stepResults = extractStepResultsFromContent(content);
              stepResults = await resolveStepResultPaths(stepResults, sessionId);
              const mapped = [{
                id: stableId,
                role: msg.role,
                content,
                timestamp: new Date(),
                ...(stepResults.length > 0 ? { stepResults } : {}),
              }];
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

          // 发送工具调用（如果有）
          if (state.tool_calls || state.toolCalls) {
            const toolCalls = state.tool_calls || state.toolCalls;
            mainWindow.webContents.send('agent:toolCall', {
              threadId: newThreadId,
              toolCalls: Array.isArray(toolCalls) ? toolCalls : [toolCalls],
            });
          }

          // 发送 Todo 更新（deepagents 的 todoListMiddleware 会更新 state.todos）
          if (state.todos && Array.isArray(state.todos) && state.todos.length > 0) {
            console.log('[todos update]', JSON.stringify(state.todos, null, 2));
            mainWindow.webContents.send('agent:todoUpdate', {
              threadId: newThreadId,
              todos: state.todos,
            });
          }
        }
      } catch (streamError: any) {
        // 如果流式 API 不可用，使用普通调用
        if (streamError.name === 'AbortError') {
          return 'stream-aborted';
        }
        
        console.error('Stream error:', streamError);
        
        // 检查是否是 403 错误（额度用完）
        if (streamError.message?.includes('403') || streamError.status === 403 || streamError.code === 403) {
          console.error('[agent] 403 Error detected - quota exceeded');
          mainWindow.webContents.send('agent:quotaExceeded', {
            message: 'API额度已用完，请前往设置更换模型',
            error: streamError.message || '403 Forbidden',
          });
          throw new Error('API额度已用完，请前往设置更换模型');
        }
        
        // 检查是否是 429 错误（配额/额度不足）
        if (streamError.name === 'InsufficientQuotaError' || 
            streamError.message?.includes('429') || 
            streamError.message?.includes('quota') ||
            streamError.status === 429 || 
            streamError.code === 429) {
          console.error('[agent] 429 Error detected - insufficient quota');
          mainWindow.webContents.send('agent:quotaExceeded', {
            message: 'API配额不足，请检查您的账户余额和套餐详情',
            error: streamError.message || '429 Insufficient Quota',
            details: '您已超出当前配额，请检查您的计划和账单详情。详情请参阅：https://help.aliyun.com/zh/model-studio/error-code#token-limit',
          });
          throw new Error('API配额不足，请检查您的账户余额和套餐详情');
        }
        
        // 尝试使用 invoke 方法（使用与 stream 相同的 inputMessages，已含历史）
        try {
          // @ts-ignore - Type instantiation is too deep with deepagents
          const result = await (agent as any).invoke({ 
            messages: fixedMessages 
          }, {
            recursionLimit: 200  // Increase recursion limit for invoke as well
          });
          
          const state = result as any;
          const messages = state.messages || [];
          const lastMessage = messages[messages.length - 1];
          
          if (lastMessage) {
            const content = typeof lastMessage.content === 'string'
              ? lastMessage.content
              : JSON.stringify(lastMessage.content);
            const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            let stepResults = extractStepResultsFromContent(content);
            stepResults = await resolveStepResultPaths(stepResults, sessionId);
            mainWindow.webContents.send('agent:message', {
              threadId: newThreadId,
              messages: [{
                id: msgId,
                role: lastMessage.role || 'assistant',
                content,
                timestamp: new Date(),
                ...(stepResults.length > 0 ? { stepResults } : {}),
              }],
            });
            if (stepResults.length > 0) {
              mainWindow.webContents.send('agent:stepResult', {
                threadId: newThreadId,
                messageId: msgId,
                stepResults,
              });
            }
          }
        } catch (invokeError) {
          console.error('Invoke error:', invokeError);
          throw invokeError;
        }
      }

      return newThreadId;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return 'stream-aborted';
      }
      
      // 检查是否是 403 错误（额度用完）
      if (error.message?.includes('403') || error.status === 403 || error.code === 403) {
        console.error('[agent] 403 Error detected in catch - quota exceeded');
        mainWindow.webContents.send('agent:quotaExceeded', {
          message: 'API额度已用完，请前往设置更换模型',
          error: error.message || '403 Forbidden',
        });
      }
      
      // 检查是否是 429 错误（配额/额度不足）
      if (error.name === 'InsufficientQuotaError' || 
          error.message?.includes('429') || 
          error.message?.includes('quota') ||
          error.status === 429 || 
          error.code === 429) {
        console.error('[agent] 429 Error detected in catch - insufficient quota');
        mainWindow.webContents.send('agent:quotaExceeded', {
          message: 'API配额不足，请检查您的账户余额和套餐详情',
          error: error.message || '429 Insufficient Quota',
          details: '您已超出当前配额，请检查您的计划和账单详情。详情请参阅：https://help.aliyun.com/zh/model-studio/error-code#token-limit',
        });
      }
      
      console.error('Agent error:', error);
      throw error;
    } finally {
      // 无论成功还是失败，都要恢复环境变量
      if (previousSessionId !== undefined) {
        process.env.AGENT_SESSION_ID = previousSessionId;
      } else {
        delete process.env.AGENT_SESSION_ID;
      }
    }
  });

  ipcMain.handle('agent:stopStream', async () => {
    if (currentStreamController) {
      currentStreamController.abort();
      currentStreamController = null;
    }
  });
}
