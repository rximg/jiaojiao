import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import type { Thread } from '@/types/types';
import { formatDate } from '@/lib/utils';

interface HistoryPanelProps {
  onThreadClick: (threadId: string) => void;
}

export default function HistoryPanel({ onThreadClick }: HistoryPanelProps) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const history = await window.electronAPI.storage.getHistory();
      setThreads(history);
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-semibold">历史记录</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            暂无历史记录
          </div>
        ) : (
          <div className="divide-y divide-border">
            {threads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => onThreadClick(thread.id)}
                className="w-full p-4 text-left hover:bg-accent transition-colors"
              >
                <div className="font-medium text-sm truncate">{thread.title}</div>
                <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatDate(thread.updatedAt)}
                </div>
                {thread.lastMessage && (
                  <div className="mt-1 text-xs text-muted-foreground truncate">
                    {thread.lastMessage}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
