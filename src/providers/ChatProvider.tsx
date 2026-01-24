import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import type { Message, TodoItem } from '../types/types';

interface ChatContextType {
  messages: Message[];
  todos: TodoItem[];
  pendingAction: { action: 't2i' | 'tts'; payload: any } | null;
  isLoading: boolean;
  currentThreadId: string | null;
  sendMessage: (text: string, threadId?: string) => Promise<void>;
  respondConfirm: (ok: boolean) => Promise<void>;
  stopStream: () => Promise<void>;
  setCurrentThreadId: (id: string | null) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [pendingAction, setPendingAction] = useState<{ action: 't2i' | 'tts'; payload: any } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const threadRef = useRef<string | null>(null);
  const allMessagesRef = useRef<Message[]>([]);

  useEffect(() => {
    threadRef.current = currentThreadId;
  }, [currentThreadId]);

  // 从消息内容中提取artifacts
  const extractArtifacts = useCallback((content: string): TodoItem['artifacts'] | undefined => {
    const artifacts: TodoItem['artifacts'] = {};
    let hasArtifacts = false;

    // 解析图片路径
    const imageMatches = content.match(/(?:图片：|outputs[/\\]images[/\\])[^\n\s]+\.(?:png|jpg|jpeg)/gi);
    if (imageMatches) {
      artifacts.images = imageMatches.map(path => ({
        path: path.replace(/^图片：/, '').trim()
      }));
      hasArtifacts = true;
    }

    // 解析音频路径
    const audioMatches = content.match(/(?:音频：|outputs[/\\]audio[/\\])[^\n\s]+\.(?:mp3|wav)/gi);
    if (audioMatches) {
      artifacts.audio = audioMatches.map(path => ({
        path: path.replace(/^音频：/, '').trim()
      }));
      hasArtifacts = true;
    }

    // 解析LLM输出：优先JSON，其次纯文本
    const jsonMatch = content.match(/\{[\s\S]*?"(?:age|theme|text|style|language)"[\s\S]*?\}/);
    if (jsonMatch) {
      try {
        artifacts.llmOutput = JSON.parse(jsonMatch[0]);
        hasArtifacts = true;
      } catch (e) {
        console.warn('[ChatProvider] Failed to parse JSON:', e);
      }
    } else if (content && content.length > 20 && content.length < 2000 && !content.includes('outputs')) {
      // 如果是合理长度的纯文本（不是路径信息），作为llmOutput
      artifacts.llmOutput = { text: content };
      hasArtifacts = true;
    }

    return hasArtifacts ? artifacts : undefined;
  }, []);

  // 匹配todos和消息，附加artifacts
  const attachArtifactsToTodos = useCallback((currentTodos: TodoItem[], allMessages: Message[]) => {
    if (allMessages.length === 0) return currentTodos;

    return currentTodos.map((todo, index) => {
      // 如果已有artifacts，跳过
      if (todo.artifacts && Object.keys(todo.artifacts).length > 0) {
        return todo;
      }

      // 只为completed状态的todo附加artifacts
      if (todo.status !== 'completed') {
        return todo;
      }

      // 尝试找到对应的消息（按顺序，第n个completed todo对应第n个assistant消息）
      const assistantMessages = allMessages.filter(m => m.role === 'assistant');
      const completedIndex = currentTodos.slice(0, index + 1).filter(t => t.status === 'completed').length - 1;
      
      if (assistantMessages[completedIndex]) {
        const artifacts = extractArtifacts(assistantMessages[completedIndex].content);
        if (artifacts) {
          console.log('[ChatProvider] Attaching artifacts to todo:', todo.content, artifacts);
          return { ...todo, artifacts };
        }
      }

      return todo;
    });
  }, [extractArtifacts]);

  useEffect(() => {
    // 监听 Agent 消息
    const handleMessage = (data: any) => {
      // 如果收到消息但threadId不匹配且当前threadId为空，则自动同步
      if (!threadRef.current && data.threadId) {
        console.log('[renderer] auto-syncing threadId from message:', data.threadId);
        setCurrentThreadId(data.threadId);
      }
      
      if (data.threadId === threadRef.current) {
        const newMessages = data.messages.map((msg: any) => ({
          id: msg.id || `msg-${Date.now()}-${Math.random()}`,
          role: msg.role || 'assistant',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          timestamp: new Date(),
        }));
        
        setMessages((prev) => {
          const updated = [...prev, ...newMessages];
          allMessagesRef.current = updated;
          return updated;
        });
        
        // 当有新消息时，尝试匹配并附加artifacts到todos
        setTodos(prev => attachArtifactsToTodos(prev, [...allMessagesRef.current, ...newMessages]));
      }
    };

    const handleTodo = (data: any) => {
      console.log('[renderer] received todoUpdate:', data);
      
      const newTodos = data.todos || [];
      
      // 如果收到todos但threadId不匹配且当前threadId为空，则自动同步
      if (!threadRef.current && data.threadId) {
        console.log('[renderer] auto-syncing threadId from todos:', data.threadId);
        setCurrentThreadId(data.threadId);
        // 立即更新todos并附加artifacts
        console.log('[renderer] updating todos immediately:', newTodos);
        setTodos(attachArtifactsToTodos(newTodos, allMessagesRef.current));
      } else if (data.threadId === threadRef.current) {
        console.log('[renderer] updating todos to:', newTodos);
        setTodos(attachArtifactsToTodos(newTodos, allMessagesRef.current));
      } else {
        console.log('[renderer] skipping todo update, wrong thread:', data.threadId, 'vs', threadRef.current);
      }
    };

    const handleConfirm = (data: any) => {
      console.log('[renderer] received confirmRequest:', data);
      setPendingAction(data);
    };

    window.electronAPI.agent.onMessage(handleMessage);
    window.electronAPI.agent.onTodoUpdate(handleTodo);

    if (typeof window.electronAPI.agent.onConfirmRequest === 'function') {
      window.electronAPI.agent.onConfirmRequest(handleConfirm);
    } else {
      // eslint-disable-next-line no-console
      console.warn('[agent] onConfirmRequest not available in preload');
    }

    return () => {
      // 无法移除监听，因为 preload 未暴露 off；依赖单次注册
    };
  }, [attachArtifactsToTodos]);

  const respondConfirm = useCallback(async (ok: boolean) => {
    console.log('[renderer] responding to confirm with:', ok);
    if (typeof window.electronAPI.agent.confirmAction === 'function') {
      await window.electronAPI.agent.confirmAction(ok);
    } else {
      // eslint-disable-next-line no-console
      console.warn('[agent] confirmAction not available in preload');
    }
    setPendingAction(null);
  }, []);

  const sendMessage = useCallback(async (text: string, threadId?: string) => {
    const thread = threadId || currentThreadId || undefined;

    // 添加用户消息
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);

    setIsLoading(true);
    try {
      const newThreadId = await window.electronAPI.agent.sendMessage(text, thread);
      console.log('[renderer] backend returned threadId:', newThreadId, 'current:', currentThreadId);
      // Always update to the backend's threadId to keep in sync
      setCurrentThreadId(newThreadId);
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentThreadId]);

  const stopStream = useCallback(async () => {
    await window.electronAPI.agent.stopStream();
    setIsLoading(false);
  }, []);

  return (
    <ChatContext.Provider
      value={{
        messages,
        todos,
        pendingAction,
        isLoading,
        currentThreadId,
        sendMessage,
        respondConfirm,
        stopStream,
        setCurrentThreadId,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
