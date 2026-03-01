import { useState, useEffect, useCallback, useMemo } from 'react';
import { Folder, FolderOpen, Image, Music, FileText, RefreshCw, ChevronDown, ChevronRight, X, Upload, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ImagePrintDialog from './ImagePrintDialog';

interface FileEntry {
  path: string;
  name: string;
  isDir: boolean;
  size: number | null;
}

interface WorkspacePanelProps {
  sessionId: string | null;
  lastArtifactTime?: number; // 最后一次产物生成的时间戳
  onClose?: () => void;
}

export default function WorkspacePanel({ sessionId, lastArtifactTime, onClose }: WorkspacePanelProps) {
  const [files, setFiles] = useState<Record<string, FileEntry[]>>({
    images: [],
    audio: [],
    llm_logs: [],
  });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    images: true,
    audio: true,
    llm_logs: false,
  });
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);

  const printableImages = useMemo(
    () =>
      files.images
        .filter((entry) => !entry.isDir)
        .map((entry) => ({ name: entry.name, path: entry.path })),
    [files.images]
  );

  const loadFiles = useCallback(async () => {
    if (!sessionId) return;

    setLoading(true);
    try {
      const categories = ['images', 'audio', 'llm_logs'];
      const results = await Promise.all(
        categories.map(async (category) => {
          try {
            const { entries } = await window.electronAPI.fs.ls(sessionId, category);
            // 过滤所有以.开头的文件
            const filteredEntries = (entries || []).filter(
              (entry: FileEntry) => !entry.name.startsWith('.')
            );
            return { category, files: filteredEntries };
          } catch (error) {
            console.error(`Failed to load ${category}:`, error);
            return { category, files: [] };
          }
        })
      );

      const newFiles = results.reduce((acc, { category, files }) => {
        acc[category] = files;
        return acc;
      }, {} as Record<string, FileEntry[]>);

      setFiles(newFiles);
      // 当文件列表更新时，清除旧的图片预览（防止显示过时的图片）
      setPreviewUrl(null);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // 监听lastArtifactTime的变化，当有新产物生成时自动刷新（如每生成一个音频就触发一次）
  useEffect(() => {
    if (lastArtifactTime && lastArtifactTime > 0) {
      const delayMs = 500;
      const timer = setTimeout(() => {
        loadFiles();
      }, delayMs);
      return () => clearTimeout(timer);
    }
  }, [lastArtifactTime, loadFiles]);

  const toggleExpand = (category: string) => {
    setExpanded((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  const handleFileClick = async (file: FileEntry, category: string) => {
    if (file.isDir || !sessionId) return;

    try {
      const { path: fullPath } = await window.electronAPI.fs.getFilePath(
        sessionId,
        `${category}/${file.name}`
      );

      if (category === 'images') {
        // 图片预览 - 使用local-file协议，强制刷新通过先清空再设置
        setPreviewUrl(null);
        // 使用setTimeout确保先清空后再设置新的URL
        setTimeout(() => {
          setPreviewUrl(`local-file://${encodeURIComponent(fullPath)}`);
        }, 10);
      } else if (category === 'llm_logs') {
        // 日志查看 - 读取内容后显示
        const { content } = await window.electronAPI.fs.readFile(
          sessionId,
          `${category}/${file.name}`
        );
        // 创建临时窗口显示日志
        const logWindow = window.open('', '_blank');
        if (logWindow) {
          logWindow.document.write(`<pre>${content}</pre>`);
        }
      }
    } catch (error) {
      console.error('Failed to handle file click:', error);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'images':
        return <Image className="h-4 w-4" />;
      case 'audio':
        return <Music className="h-4 w-4" />;
      case 'llm_logs':
        return <FileText className="h-4 w-4" />;
      default:
        return <Folder className="h-4 w-4" />;
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'images':
        return '图片';
      case 'audio':
        return '音频';
      case 'llm_logs':
        return '日志';
      default:
        return category;
    }
  };

  const handleSyncAudio = useCallback(async () => {
    if (!sessionId) return;
    setSyncing(true);
    try {
      const res = await window.electronAPI?.sync?.syncAudioToStore?.(sessionId);
      if (res?.success !== undefined) {
        if (res.success) {
          // 记录同步操作到会话元数据
          try {
            await window.electronAPI.session.update(sessionId, {
              lastSyncAudioAt: new Date().toISOString(),
            });
          } catch (error) {
            console.warn('Failed to update sync timestamp:', error);
            // 不阻断同步流程
          }
          alert(res.message ?? `已同步 ${res.copied ?? 0} 个 mp3`);
        } else {
          alert(res.message ?? '同步失败');
        }
      } else {
        alert('同步功能不可用');
      }
    } catch (e) {
      console.error(e);
      alert('同步失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSyncing(false);
    }
  }, [sessionId]);

  if (!sessionId) {
    return (
      <div className="w-80 border-l border-border bg-sidebar p-6">
        <div className="text-center text-sm text-muted-foreground rounded-xl py-6">
          <Folder className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>开始对话后将显示工作区文件</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 border-l border-border bg-sidebar flex flex-col">
      {/* 标题栏 */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Folder className="h-4 w-4 text-sidebar-foreground" />
          <span className="font-semibold text-sm text-sidebar-foreground">工作区</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              try {
                const { path: dirPath } = await window.electronAPI.fs.getFilePath(sessionId, '.');
                if (dirPath) window.electronAPI.config?.openFolder?.(dirPath);
              } catch (e) {
                console.error('[WorkspacePanel] openFolder failed:', e);
              }
            }}
            className="h-7 w-7 p-0"
            title="打开工作区文件夹"
          >
            <FolderOpen className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadFiles}
            disabled={loading}
            className="h-7 w-7 p-0"
            title="刷新"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* 会话ID */}
      <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border">
        会话: {sessionId.slice(0, 8)}...
      </div>

      {/* 文件列表 */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          {Object.entries(files).map(([category, entries]) => (
            <div key={category} className="mb-2">
              <div className="flex items-center gap-2 w-full p-2.5 rounded-xl text-sm">
                <button
                  onClick={() => toggleExpand(category)}
                  className="flex items-center gap-2 flex-1 min-w-0 hover:bg-accent/80 rounded-lg py-1 transition-colors text-left"
                >
                  {expanded[category] ? (
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  )}
                  {getCategoryIcon(category)}
                  <span className="font-medium">{getCategoryLabel(category)}</span>
                  <span className="ml-auto text-xs text-muted-foreground shrink-0">
                    ({entries.length})
                  </span>
                </button>
                {category === 'audio' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={syncing}
                    onClick={handleSyncAudio}
                    className="h-7 shrink-0"
                    title="将本会话音频同步到目标目录"
                  >
                    <Upload className={`h-3.5 w-3.5 ${syncing ? 'animate-pulse' : ''}`} />
                    <span className="ml-1 text-xs">同步</span>
                  </Button>
                )}
                {category === 'images' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={entries.filter((entry) => !entry.isDir).length === 0}
                    onClick={() => setPrintDialogOpen(true)}
                    className="h-7 shrink-0"
                    title="图片排版打印"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span className="ml-1 text-xs">打印</span>
                  </Button>
                )}
              </div>

              {expanded[category] && (
                <div className="ml-4 mt-1 space-y-1">
                  {entries.length === 0 ? (
                    <div className="text-xs text-muted-foreground p-2 rounded-lg">
                      暂无文件
                    </div>
                  ) : category === 'images' ? (
                    // 图片显示为列表，带缩略图
                    entries.map((file) => (
                      <button
                        key={file.path}
                        onClick={() => handleFileClick(file, category)}
                        className="flex items-center gap-2 w-full p-2 hover:bg-accent/80 rounded-xl transition-colors text-left"
                      >
                        <div className="w-12 h-12 flex-shrink-0 rounded-lg border border-border overflow-hidden bg-muted">
                          <img
                            src={`local-file://${encodeURIComponent(file.path)}`}
                            alt={file.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs truncate">{file.name}</div>
                          {file.size && (
                            <div className="text-xs text-muted-foreground">
                              {(file.size / 1024).toFixed(1)}KB
                            </div>
                          )}
                        </div>
                      </button>
                    ))
                  ) : category === 'audio' ? (
                    // 音频使用HTML5原生控件
                    entries.map((file) => (
                      <div
                        key={file.path}
                        className="p-2.5 rounded-xl bg-card border border-border shadow-sm"
                      >
                        <div className="text-xs mb-1 truncate">{file.name}</div>
                        <audio
                          controls
                          preload="metadata"
                          className="w-full h-8"
                          style={{ maxHeight: '32px' }}
                        >
                          <source src={`local-file://${encodeURIComponent(file.path)}`} type="audio/mpeg" />
                          您的浏览器不支持音频播放
                        </audio>
                      </div>
                    ))
                  ) : (
                    // 其他文件类型的默认显示
                    entries.map((file) => (
                      <button
                        key={file.path}
                        onClick={() => handleFileClick(file, category)}
                        className="flex items-center gap-2 w-full p-2 hover:bg-accent/80 rounded-xl text-xs transition-colors text-left"
                      >
                        <span className="truncate flex-1">{file.name}</span>
                        {file.size && (
                          <span className="text-muted-foreground">
                            {(file.size / 1024).toFixed(1)}KB
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 图片预览 */}
      {previewUrl && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
          onClick={() => setPreviewUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img
              src={previewUrl}
              alt="Preview"
              className="max-w-full max-h-[90vh] object-contain rounded-xl"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => { e.stopPropagation(); setPreviewUrl(null); }}
              className="absolute top-4 right-4 rounded-xl"
            >
              关闭
            </Button>
          </div>
        </div>
      )}

      <ImagePrintDialog
        open={printDialogOpen}
        onOpenChange={setPrintDialogOpen}
        images={printableImages}
        sessionId={sessionId}
      />
    </div>
  );
}
