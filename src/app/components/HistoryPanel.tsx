import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface Session {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface HistoryPanelProps {
  onSessionClick: (sessionId: string) => void;
}

export default function HistoryPanel({ onSessionClick }: HistoryPanelProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const { sessions } = await window.electronAPI.session.list();
      setSessions(sessions);
    } catch (error) {
      console.error('Failed to load sessions:', error);
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
        {sessions.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            暂无历史记录
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sessions.map((session) => (
              <button
                key={session.sessionId}
                onClick={() => onSessionClick(session.sessionId)}
                className="w-full p-4 text-left hover:bg-accent transition-colors"
              >
                <div className="font-medium text-sm truncate">{session.title}</div>
                <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatDate(session.updatedAt)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
