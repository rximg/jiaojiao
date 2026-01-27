import { useState, useEffect } from 'react';
import { Clock, Image as ImageIcon } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface Session {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  firstMessage?: string;
  firstImage?: string;
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
                <div className="flex gap-3">
                  {/* 第一张图片预览 */}
                  {session.firstImage ? (
                    <div className="flex-shrink-0 w-16 h-16 rounded overflow-hidden bg-muted flex items-center justify-center">
                      <img 
                        src={`file://${session.firstImage}`} 
                        alt="预览" 
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const img = e.target as HTMLImageElement;
                          img.style.display = 'none';
                        }}
                      />
                      <ImageIcon className="h-6 w-6 text-muted-foreground absolute" />
                    </div>
                  ) : (
                    <div className="flex-shrink-0 w-16 h-16 rounded overflow-hidden bg-muted flex items-center justify-center">
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  
                  {/* 文字信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{session.title}</div>
                    {session.firstMessage && (
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {session.firstMessage}
                      </div>
                    )}
                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDate(session.updatedAt)}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
