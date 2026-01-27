import { ipcMain, BrowserWindow } from 'electron';

let currentStreamController: AbortController | null = null;

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

      // 动态导入 Agent 工厂（避免在模块加载时执行）
      const { createMainAgent } = await import('../../backend/agent/factory.js');
      
      // 初始化 Agent，传入 sessionId（修改）
      const agent = await createMainAgent(sessionId);

      const newThreadId = threadId || `thread-${Date.now()}`;

      // 发送消息并流式返回结果
      // deepagentsjs 返回的是 LangGraph graph，支持 stream 方法
      try {
        // @ts-ignore - Type instantiation is too deep with deepagents
        const stream = await (agent as any).stream(
          { messages: [{ role: 'user', content: message }] },
          { 
            signal: currentStreamController.signal,
            recursionLimit: 200  // 增加递归限制，防止无限循环（默认50，增加到200）
          }
        );

        // 处理流式响应
        // LangGraph stream chunks are keyed by node/middleware name
        for await (const chunk of stream) {
          if (currentStreamController.signal.aborted) {
            break;
          }

          // Extract the actual state from the keyed chunk
          // Chunks have structure: { "NodeName.step": { messages, todos, ... } }
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
            const newMessages = state.messages
              .filter((msg: any) => msg.role === 'assistant')
              .slice(-1); // 只取最后一条助手消息
            
            if (newMessages.length > 0) {
              mainWindow.webContents.send('agent:message', {
                threadId: newThreadId,
                messages: newMessages.map((msg: any) => ({
                  id: msg.id || `msg-${Date.now()}`,
                  role: msg.role,
                  content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
                  timestamp: new Date(),
                })),
              });
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
        
        // 尝试使用 invoke 方法
        try {
          // @ts-ignore - Type instantiation is too deep with deepagents
          const result = await (agent as any).invoke({ 
            messages: [{ role: 'user', content: message }] 
          }, {
            recursionLimit: 200  // Increase recursion limit for invoke as well
          });
          
          const state = result as any;
          const messages = state.messages || [];
          const lastMessage = messages[messages.length - 1];
          
          if (lastMessage) {
            mainWindow.webContents.send('agent:message', {
              threadId: newThreadId,
              messages: [{
                id: `msg-${Date.now()}`,
                role: lastMessage.role || 'assistant',
                content: typeof lastMessage.content === 'string' 
                  ? lastMessage.content 
                  : JSON.stringify(lastMessage.content),
                timestamp: new Date(),
              }],
            });
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
      
      // 检查是否是 403 错误
      if (error.message?.includes('403') || error.status === 403 || error.code === 403) {
        console.error('[agent] 403 Error detected in catch - quota exceeded');
        mainWindow.webContents.send('agent:quotaExceeded', {
          message: 'API额度已用完，请前往设置更换模型',
          error: error.message || '403 Forbidden',
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
