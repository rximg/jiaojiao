/**
 * 调用 Agent 用例：创建 Agent、加载历史、流式执行并通过回调推送消息/步骤/工具调用/todos
 * 不依赖 Electron，由 IPC 注入 createAgent、getSessionMessages 与 callbacks
 */
export type StepResult =
  | { type: 'image'; payload: { path: string; prompt?: string } }
  | { type: 'audio'; payload: { path: string; text?: string } }
  | { type: 'document'; payload: { pathOrContent: string; title?: string } };

export interface InvokeAgentUseCaseCallbacks {
  onMessage: (threadId: string, messages: Array<{ id: string; role: string; content: string; stepResults?: StepResult[] }>) => void;
  onStepResult?: (threadId: string, messageId: string, stepResults: StepResult[]) => void;
  onToolCall?: (threadId: string, toolCalls: any[]) => void;
  onTodoUpdate?: (threadId: string, todos: any[]) => void;
}

export interface InvokeAgentUseCaseDeps {
  createAgent: (sessionId?: string) => Promise<any>;
  getSessionMessages: (sessionId: string) => Promise<any[]>;
  /** 可选：解析步骤结果中的相对路径为绝对路径 */
  resolveStepResultPaths?: (sessionId: string | undefined, stepResults: StepResult[]) => Promise<StepResult[]>;
}

export interface InvokeAgentUseCaseParams {
  message: string;
  sessionId?: string;
  signal: AbortSignal;
  callbacks: InvokeAgentUseCaseCallbacks;
}

const MAX_HISTORY = 30;

function fixToolCallsInMessages(messages: any[]): any[] {
  return messages.map((msg) => {
    if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
      msg.tool_calls = msg.tool_calls.map((toolCall: any, index: number) => {
        if (!toolCall.id) {
          toolCall.id = `call_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 9)}`;
        }
        return toolCall;
      });
    }
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

function extractStepResultsFromContent(content: string): StepResult[] {
  if (!content || typeof content !== 'string') return [];
  const results: StepResult[] = [];
  const imagePatterns = [
    /(?:图片[：:]\s*)([^\s\n]+\.(?:png|jpg|jpeg))/gi,
    /(?:outputs[/\\]workspaces[/\\][^/\\]+[/\\]images[/\\][^\s\n]+\.(?:png|jpg|jpeg))/gi,
    /(?:images[/\\][^\s\n]+\.(?:png|jpg|jpeg))/gi,
    /([A-Za-z]:[\\/][^\s\n]+\.(?:png|jpg|jpeg))/g,
    /(\/[^\s\n]+\.(?:png|jpg|jpeg))/g,
  ];
  const seenImages = new Set<string>();
  for (const re of imagePatterns) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(content)) !== null) {
      const p = (m[1] ?? m[0]).replace(/^图片[：:]\s*/i, '').trim();
      if (p && !seenImages.has(p)) {
        seenImages.add(p);
        results.push({ type: 'image', payload: { path: p } });
      }
    }
  }
  const audioPatterns = [
    /(?:音频[：:]\s*)([^\s\n]+\.(?:mp3|wav))/gi,
    /(?:outputs[/\\]workspaces[/\\][^/\\]+[/\\]audio[/\\][^\s\n]+\.(?:mp3|wav))/gi,
    /(?:audio[/\\][^\s\n]+\.(?:mp3|wav))/gi,
    /([A-Za-z]:[\\/][^\s\n]+\.(?:mp3|wav))/g,
    /(\/[^\s\n]+\.(?:mp3|wav))/g,
  ];
  const seenAudio = new Set<string>();
  for (const re of audioPatterns) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(content)) !== null) {
      const p = (m[1] ?? m[0]).replace(/^音频[：:]\s*/i, '').trim();
      if (p && !seenAudio.has(p)) {
        seenAudio.add(p);
        results.push({ type: 'audio', payload: { path: p } });
      }
    }
  }
  return results;
}

/**
 * 执行流式调用。成功返回 sessionId，用户中止返回 'stream-aborted'。
 */
export async function invokeAgentUseCase(
  deps: InvokeAgentUseCaseDeps,
  params: InvokeAgentUseCaseParams
): Promise<string> {
  const { createAgent, getSessionMessages, resolveStepResultPaths } = deps;
  const { message, sessionId, signal, callbacks } = params;

  const agent = await createAgent(sessionId);
  // 统一使用 sessionId 作为 thread_id，如果没有则生成临时 ID
  const effectiveSessionId = sessionId ?? `session-${Date.now()}`;

  let inputMessages: any[];
  if (sessionId) {
    const history = await getSessionMessages(sessionId);
    const recent = history.slice(-MAX_HISTORY);
    const historyForAgent = recent.map((m: any) => ({
      role: m.role || 'user',
      content: typeof m.content === 'string' ? m.content : (m.content ?? ''),
    }));
    const isReopenedSession = recent.length > 0;
    const userContent = isReopenedSession
      ? `【当前为已有会话的继续；请结合对话历史和 checkpoint 中的 todo 状态，仅执行用户在本条消息中要求的步骤（如「重新生成台词」则只做第 3 步，勿从头重跑）。】\n\n${message}`
      : message;
    inputMessages = [...historyForAgent, { role: 'user', content: userContent }];
  } else {
    inputMessages = [{ role: 'user', content: message }];
  }
  const fixedMessages = fixToolCallsInMessages(inputMessages);

  const runConfig: { signal: AbortSignal; recursionLimit: number; configurable?: { thread_id: string } } = {
    signal,
    recursionLimit: 200,
  };
  if (sessionId) runConfig.configurable = { thread_id: sessionId };

  const stream = await (agent as any).stream({ messages: fixedMessages }, runConfig);

  let streamingAssistantId: string | null = null;
  for await (const chunk of stream) {
    if (signal.aborted) break;

    const chunkKeys = Object.keys(chunk);
    const nodeKey = chunkKeys[0];
    const state = nodeKey ? (chunk as any)[nodeKey] : chunk;

    if (state?.messages && Array.isArray(state.messages)) {
      const fixedStateMessages = fixToolCallsInMessages(state.messages);
      const newMessages = fixedStateMessages
        .filter((msg: any) => msg.role === 'assistant')
        .slice(-1);
      if (newMessages.length > 0) {
        const msg = newMessages[0];
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? '');
        const stableId: string = streamingAssistantId ?? (msg.id ?? `stream-${effectiveSessionId}`);
        streamingAssistantId = stableId;
        let stepResults = extractStepResultsFromContent(content);
        if (resolveStepResultPaths && stepResults.length > 0) {
          stepResults = await resolveStepResultPaths(sessionId, stepResults);
        }
        const mapped = [
          {
            id: stableId,
            role: msg.role,
            content,
            ...(stepResults.length > 0 ? { stepResults } : {}),
          },
        ];
        callbacks.onMessage(effectiveSessionId, mapped);
        if (stepResults.length > 0 && callbacks.onStepResult) {
          callbacks.onStepResult(effectiveSessionId, stableId, stepResults);
        }
      }
    }

    if (state?.tool_calls || state?.toolCalls) {
      const toolCalls = state.tool_calls ?? state.toolCalls;
      if (callbacks.onToolCall) {
        callbacks.onToolCall(effectiveSessionId, Array.isArray(toolCalls) ? toolCalls : [toolCalls]);
      }
    }

    if (state?.todos && Array.isArray(state.todos) && state.todos.length > 0 && callbacks.onTodoUpdate) {
      callbacks.onTodoUpdate(effectiveSessionId, state.todos);
    }
  }

  return effectiveSessionId;
}
