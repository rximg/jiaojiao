import { useState, useEffect } from 'react';
import { Clock, Image as ImageIcon, Printer, Trash2, Upload, Volume2, Download } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { PrintableImage } from './print-layout';
import ImagePrintDialog from './ImagePrintDialog';

interface Session {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  firstMessage?: string;
  firstImage?: string;
  hasImage?: boolean;
  hasAudio?: boolean;
  lastSyncAudioAt?: string;
  lastPrintAt?: string;
}

interface HistoryPanelProps {
  onSessionClick: (sessionId: string) => void;
}

export default function HistoryPanel({ onSessionClick }: HistoryPanelProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshTime, setLastRefreshTime] = useState<number>(0);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState<'print' | 'sync' | 'delete' | null>(null);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printImages, setPrintImages] = useState<Array<{ name: string; path: string; sessionId?: string; sessionTitle?: string }>>([]);

  useEffect(() => {
    loadHistory();
  }, []);

  // 监听会话元数据变化，每2秒检查一次是否需要刷新
  useEffect(() => {
    const interval = setInterval(() => {
      // 仅当距离上次刷新超过1秒时触发刷新
      if (Date.now() - lastRefreshTime >= 1000) {
        loadHistory();
        setLastRefreshTime(Date.now());
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [lastRefreshTime]);

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

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const toggleSelectMode = () => {
    setSelectMode((prev) => {
      if (prev) {
        clearSelection();
      }
      return !prev;
    });
  };

  const toggleSessionSelected = (sessionId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  const selectedSessions = sessions.filter((session) => selectedIds.has(session.sessionId));
  const hasSelection = selectedSessions.length > 0;

  const handleBatchSync = async () => {
    if (!hasSelection || processing) return;
    setProcessing('sync');
    let successCount = 0;
    let failedCount = 0;
    const now = new Date().toISOString();
    try {
      for (const session of selectedSessions) {
        try {
          const result = await window.electronAPI.sync.syncAudioToStore(session.sessionId);
          if (result?.success) {
            successCount += 1;
            await window.electronAPI.session.update(session.sessionId, {
              lastSyncAudioAt: now,
            });
          } else {
            failedCount += 1;
          }
        } catch {
          failedCount += 1;
        }
      }
      await loadHistory();
      alert(`批量同步完成：成功 ${successCount} 个，会话失败 ${failedCount} 个。`);
    } finally {
      setProcessing(null);
    }
  };

  const handleBatchDelete = async () => {
    if (!hasSelection || processing) return;
    if (!window.confirm(`确定批量删除选中的 ${selectedSessions.length} 条会话吗？删除后无法恢复。`)) {
      return;
    }
    setProcessing('delete');
    const failed: string[] = [];
    try {
      for (const session of selectedSessions) {
        try {
          await window.electronAPI.session.delete(session.sessionId);
        } catch {
          failed.push(session.sessionId);
        }
      }
      if (failed.length === 0) {
        setSessions((prev) => prev.filter((session) => !selectedIds.has(session.sessionId)));
        clearSelection();
      } else {
        await loadHistory();
      }
      alert(`批量删除完成：成功 ${selectedSessions.length - failed.length} 个，失败 ${failed.length} 个。`);
    } finally {
      setProcessing(null);
    }
  };

  const handleBatchPrintPreview = async () => {
    if (!hasSelection || processing) return;
    setProcessing('print');
    try {
      const imageEntries: Array<{ name: string; path: string; sessionId?: string; sessionTitle?: string }> = [];
      await Promise.all(
        selectedSessions.map(async (session) => {
          try {
            const details = await window.electronAPI.session.get(session.sessionId);
            const images = Array.isArray(details?.files?.images) ? details.files.images : [];
            const sessionLabel = (session.title ?? '').trim() || session.sessionId.slice(0, 8);
            images
              .filter((entry: { name?: string; path?: string; isDir?: boolean }) => {
                if (entry?.isDir) return false;
                return Boolean(entry?.name && /\.(png|jpg|jpeg|webp|gif)$/i.test(entry.name));
              })
              .forEach((entry: { name: string; path: string }) => {
                imageEntries.push({
                  name: entry.name,
                  path: entry.path,
                  sessionId: session.sessionId,
                  sessionTitle: sessionLabel,
                });
              });
          } catch (error) {
            console.warn('[HistoryPanel] Failed to collect images for session:', session.sessionId, error);
          }
        })
      );

      if (imageEntries.length === 0) {
        alert('选中的会话里没有可打印的图片。');
        return;
      }

      setPrintImages(imageEntries);
      setPrintDialogOpen(true);
    } finally {
      setProcessing(null);
    }
  };

  const handleAfterBatchPrint = async (selectedItems: PrintableImage[]) => {
    const affectedSessionIds = Array.from(
      new Set(
        selectedItems
          .map((item) => item.sessionId)
          .filter((sessionId): sessionId is string => typeof sessionId === 'string' && sessionId.length > 0)
      )
    );
    if (affectedSessionIds.length === 0) return;

    const timestamp = new Date().toISOString();
    await Promise.all(
      affectedSessionIds.map((sessionId) =>
        window.electronAPI.session.update(sessionId, { lastPrintAt: timestamp }).catch((error) => {
          console.warn('[HistoryPanel] Failed to update print timestamp:', sessionId, error);
        })
      )
    );
    await loadHistory();
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
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-sidebar-foreground">历史记录</h2>
          <Button type="button" variant={selectMode ? 'secondary' : 'outline'} size="sm" onClick={toggleSelectMode}>
            {selectMode ? '取消选择' : '选择会话'}
          </Button>
        </div>
        {selectMode && (
          <div className="mt-3 space-y-2">
            <div className="text-xs text-muted-foreground">
              已选择 {selectedSessions.length} / {sessions.length}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!hasSelection || processing !== null}
                onClick={() => void handleBatchPrintPreview()}
              >
                <Printer className="h-3.5 w-3.5" />
                <span className="ml-1">{processing === 'print' ? '处理中...' : '批量打印预览'}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!hasSelection || processing !== null}
                onClick={() => void handleBatchSync()}
              >
                <Upload className="h-3.5 w-3.5" />
                <span className="ml-1">{processing === 'sync' ? '同步中...' : '批量同步音频'}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!hasSelection || processing !== null}
                onClick={() => void handleBatchDelete()}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="ml-1">{processing === 'delete' ? '删除中...' : '批量删除会话'}</span>
              </Button>
            </div>
          </div>
        )}
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
                  className={`group flex items-center gap-2 p-2 rounded-xl transition-colors ${selectMode && selectedIds.has(session.sessionId) ? 'bg-accent/80' : 'hover:bg-accent/80'}`}
                >
                  {selectMode && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(session.sessionId)}
                      onChange={() => toggleSessionSelected(session.sessionId)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (selectMode) {
                        toggleSessionSelected(session.sessionId);
                        return;
                      }
                      onSessionClick(session.sessionId);
                    }}
                    className="flex-1 flex gap-3 text-left min-w-0"
                  >
                    {/* 第一张图片预览 */}
                    {session.firstImage ? (
                      <div className="flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-muted flex items-center justify-center relative">
                        <img
                          src={`local-file://${encodeURIComponent(session.firstImage)}`}
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
                      {/* 时间信息 */}
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span className="whitespace-nowrap">{formatDate(session.updatedAt)}</span>
                      </div>
                      {/* 图标状态行 */}
                      <div className="flex items-center gap-2 mt-1 text-xs">
                        <span
                          className={`inline-flex items-center gap-1 ${session.hasImage ? 'text-foreground' : 'text-muted-foreground opacity-40'}`}
                          title={session.hasImage ? '已生成图片' : '未生成图片'}
                        >
                          <ImageIcon className="h-3 w-3" />
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 ${session.hasAudio ? 'text-foreground' : 'text-muted-foreground opacity-40'}`}
                          title={session.hasAudio ? '已生成音频' : '未生成音频'}
                        >
                          <Volume2 className="h-3 w-3" />
                        </span>
                        {session.lastSyncAudioAt && (
                          <span
                            className="inline-flex items-center gap-1 text-foreground"
                            title={`最近同步于 ${formatDate(session.lastSyncAudioAt)}`}
                          >
                            <Download className="h-3 w-3" />
                          </span>
                        )}
                        {session.lastPrintAt && (
                          <span
                            className="inline-flex items-center gap-1 text-foreground"
                            title={`最近打印于 ${formatDate(session.lastPrintAt)}`}
                          >
                            <Printer className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ImagePrintDialog
        open={printDialogOpen}
        onOpenChange={setPrintDialogOpen}
        images={printImages}
        pageBreakBySession
        onAfterPrint={handleAfterBatchPrint}
      />
    </div>
  );
}
