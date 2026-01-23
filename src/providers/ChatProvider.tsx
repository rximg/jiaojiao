import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { Message, TodoItem } from '../types/types';

interface ChatContextType {
  messages: Message[];
  todos: TodoItem[];
  isLoading: boolean;
  currentThreadId: string | null;
  sendMessage: (text: string, threadId?: string) => Promise<void>;
  stopStream: () => Promise<void>;
  setCurrentThreadId: (id: string | null) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);

  useEffect(() => {
    // 监听 Agent 消息
    window.electronAPI.agent.onMessage((data: any) => {
      if (data.threadId === currentThreadId) {
        // 处理消息更新
        const newMessages = data.messages.map((msg: any) => ({
          id: msg.id || `msg-${Date.now()}-${Math.random()}`,
          role: msg.role || 'assistant',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          timestamp: new Date(),
        }));
        setMessages((prev) => [...prev, ...newMessages]);
      }
    });

    window.electronAPI.agent.onTodoUpdate((data: any) => {
      if (data.threadId === currentThreadId) {
        setTodos(data.todos || []);
      }
    });
  }, [currentThreadId]);

  const sendMessage = useCallback(async (text: string, threadId?: string) => {
    const thread = threadId || currentThreadId || undefined;
    if (!thread) {
      const newThreadId = `thread-${Date.now()}`;
      setCurrentThreadId(newThreadId);
    }

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
      if (!currentThreadId) {
        setCurrentThreadId(newThreadId);
      }
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
        isLoading,
        currentThreadId,
        sendMessage,
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
