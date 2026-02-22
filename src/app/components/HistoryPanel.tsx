import { useState, useEffect } from 'react';
import { Clock, Image as ImageIcon, Trash2, Volume2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface Session {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  firstMessage?: string;
  firstImage?: string;
  hasImage?: boolean;
  hasAudio?: boolean;
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

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!window.confirm('确定删除这条历史记录？删除后无法恢复。')) return;
    try {
      await window.electronAPI.session.delete(sessionId);
      setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 rounded-lg">
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-sidebar">
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-semibold text-sidebar-foreground">历史记录</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground rounded-lg">
            暂无历史记录
          </div>
        ) : (
          <div className="space-y-1">
            {sessions.map((session) => {
              const normalizedTitle = (session.title ?? '').trim();
              const isGenericTitle = normalizedTitle === '新对话' || normalizedTitle === '未命名对话' || normalizedTitle.length === 0;
              const fallbackTitle = (session.firstMessage ?? '').trim().replace(/\s+/g, ' ').slice(0, 30);
              const displayTitle = isGenericTitle ? (fallbackTitle || '未命名') : normalizedTitle;
              const showSnippet = Boolean(session.firstMessage && !isGenericTitle);

              return (
                <div
                key={session.sessionId}
                className="group flex items-center gap-2 p-2 rounded-xl hover:bg-accent/80 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => onSessionClick(session.sessionId)}
                  className="flex-1 flex gap-3 text-left min-w-0"
                >
                  {/* 第一张图片预览 */}
                  {session.firstImage ? (
                    <div className="flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-muted flex items-center justify-center relative">
                      <img 
                        src={`local-file://${session.firstImage}`} 
                        alt="预览" 
                        className="w-full h-full object-cover relative z-10"
                        onError={(e) => {
                          const img = e.target as HTMLImageElement;
                          img.style.display = 'none';
                        }}
                      />
                      <ImageIcon className="h-6 w-6 text-muted-foreground absolute inset-0 m-auto" aria-hidden />
                    </div>
                  ) : (
                    <div className="flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-muted flex items-center justify-center">
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  
                  {/* 文字信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{displayTitle}</div>
                    {showSnippet && (
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {session.firstMessage}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span className="whitespace-nowrap">{formatDate(session.updatedAt)}</span>
                      <span className={`inline-flex items-center gap-1 ${session.hasImage ? 'text-foreground' : 'opacity-40'}`} title={session.hasImage ? '已生成图片' : '未生成图片'}>
                        <ImageIcon className="h-3 w-3" />
                      </span>
                      <span className={`inline-flex items-center gap-1 ${session.hasAudio ? 'text-foreground' : 'opacity-40'}`} title={session.hasAudio ? '已生成音频' : '未生成音频'}>
                        <Volume2 className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="flex-shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => handleDelete(e, session.sessionId)}
                  title="删除"
                  aria-label="删除"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
