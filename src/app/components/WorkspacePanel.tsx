import { useState, useEffect, useCallback } from 'react';
import { Folder, Image, Music, FileText, RefreshCw, ChevronDown, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // 监听lastArtifactTime的变化，当有新产物生成时自动刷新
  useEffect(() => {
    if (lastArtifactTime && lastArtifactTime > 0) {
      console.log('[WorkspacePanel] Artifact generated, refreshing in 2s...');
      // 延迟2秒刷新，确保文件已经写入完成
      const timer = setTimeout(() => {
        console.log('[WorkspacePanel] Refreshing files...');
        loadFiles();
      }, 2000);
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
        // 图片预览 - 使用local-file协议
        setPreviewUrl(`local-file://${fullPath}`);
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

  if (!sessionId) {
    return (
      <div className="w-80 border-l border-border bg-muted/20 p-4">
        <div className="text-center text-sm text-muted-foreground">
          <Folder className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>开始对话后将显示工作区文件</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 border-l border-border bg-muted/20 flex flex-col">
      {/* 标题栏 */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Folder className="h-4 w-4" />
          <span className="font-semibold text-sm">工作区</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={loadFiles}
            disabled={loading}
            className="h-7 w-7 p-0"
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
              <button
                onClick={() => toggleExpand(category)}
                className="flex items-center gap-2 w-full p-2 hover:bg-muted rounded-md text-sm transition-colors"
              >
                {expanded[category] ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                {getCategoryIcon(category)}
                <span className="font-medium">{getCategoryLabel(category)}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  ({entries.length})
                </span>
              </button>

              {expanded[category] && (
                <div className="ml-6 mt-1 space-y-1">
                  {entries.length === 0 ? (
                    <div className="text-xs text-muted-foreground p-2">
                      暂无文件
                    </div>
                  ) : category === 'images' ? (
                    // 图片显示为列表，带缩略图
                    entries.map((file) => (
                      <button
                        key={file.path}
                        onClick={() => handleFileClick(file, category)}
                        className="flex items-center gap-2 w-full p-2 hover:bg-muted rounded-md transition-colors text-left"
                      >
                        <div className="w-12 h-12 flex-shrink-0 rounded border border-border overflow-hidden bg-muted">
                          <img
                            src={`local-file://${file.path}`}
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
                        className="p-2 rounded-md bg-card border border-border"
                      >
                        <div className="text-xs mb-1 truncate">{file.name}</div>
                        <audio
                          controls
                          preload="metadata"
                          className="w-full h-8"
                          style={{ maxHeight: '32px' }}
                        >
                          <source src={`local-file://${file.path}`} type="audio/mpeg" />
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
                        className="flex items-center gap-2 w-full p-2 hover:bg-muted rounded-md text-xs transition-colors text-left"
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
              className="max-w-full max-h-[90vh] object-contain"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPreviewUrl(null)}
              className="absolute top-4 right-4"
            >
              关闭
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
