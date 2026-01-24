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

  useEffect(() => {
    threadRef.current = currentThreadId;
  }, [currentThreadId]);

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
        setMessages((prev) => [...prev, ...newMessages]);
      }
    };

    const handleTodo = (data: any) => {
      console.log('[renderer] received todoUpdate:', data);
      
      // 如果收到todos但threadId不匹配且当前threadId为空，则自动同步
      if (!threadRef.current && data.threadId) {
        console.log('[renderer] auto-syncing threadId from todos:', data.threadId);
        setCurrentThreadId(data.threadId);
        // 立即更新todos，因为threadRef在下次渲染才会更新
        console.log('[renderer] updating todos immediately:', data.todos);
        setTodos(data.todos || []);
      } else if (data.threadId === threadRef.current) {
        console.log('[renderer] updating todos to:', data.todos);
        setTodos(data.todos || []);
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
  }, []);

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
