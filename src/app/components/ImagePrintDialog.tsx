import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckSquare, Printer, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DEFAULT_PRINT_LAYOUT,
  type PerPage,
  type PrintableImage,
  type PrintLayoutConfig,
  computePrintPages,
  normalizeLayoutConfig,
} from './print-layout';

interface ImagePrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: Array<{ name: string; path: string }>;
  sessionId?: string; // 会话ID，用于记录打印操作
}

const LOCAL_STORAGE_KEY = 'image-print-layout-v1';

function readStoredLayout(): PrintLayoutConfig {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return DEFAULT_PRINT_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<PrintLayoutConfig>;
    return normalizeLayoutConfig({
      ...DEFAULT_PRINT_LAYOUT,
      ...parsed,
    });
  } catch {
    return DEFAULT_PRINT_LAYOUT;
  }
}

function toRatioClass(width: number, height: number): PrintableImage['ratioClass'] {
  const ratio = width / height;
  return Math.abs(ratio - 4 / 3) <= 0.03 ? '4:3' : 'other';
}

function probeImageRatio(filePath: string): Promise<PrintableImage['ratioClass']> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        resolve(toRatioClass(image.naturalWidth, image.naturalHeight));
      } else {
        resolve('unknown');
      }
    };
    image.onerror = () => resolve('unknown');
    image.src = `local-file://${filePath}`;
  });
}

export default function ImagePrintDialog({ open, onOpenChange, images, sessionId }: ImagePrintDialogProps) {
  const [items, setItems] = useState<PrintableImage[]>([]);
  const [selectedMap, setSelectedMap] = useState<Record<string, boolean>>({});
  const [layout, setLayout] = useState<PrintLayoutConfig>(DEFAULT_PRINT_LAYOUT);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    if (!open) return;
    setLayout(readStoredLayout());
    const sorted = [...images].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    setItems(sorted.map((entry) => ({ ...entry, ratioClass: 'unknown' as const })));
    setSelectedMap(
      sorted.reduce<Record<string, boolean>>((acc, entry) => {
        acc[entry.path] = true;
        return acc;
      }, {})
    );
    setCurrentPage(0);
  }, [open]);

  useEffect(() => {
    if (!open || items.length === 0) return;
    let cancelled = false;
    const loadRatios = async () => {
      const ratioEntries = await Promise.all(
        items.map(async (item) => ({
          path: item.path,
          ratioClass: await probeImageRatio(item.path),
        }))
      );
      if (cancelled) return;
      const ratioMap = ratioEntries.reduce<Record<string, PrintableImage['ratioClass']>>((acc, entry) => {
        acc[entry.path] = entry.ratioClass;
        return acc;
      }, {});
      setItems((prev) =>
        prev.map((item) => ({
          ...item,
          ratioClass: ratioMap[item.path] ?? 'unknown',
        }))
      );
    };
    void loadRatios();
    return () => {
      cancelled = true;
    };
  }, [open, items.length]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedMap[item.path]),
    [items, selectedMap]
  );

  const pages = useMemo(() => computePrintPages(selectedItems, layout), [selectedItems, layout]);

  useEffect(() => {
    if (pages.length === 0) {
      setCurrentPage(0);
      return;
    }
    setCurrentPage((prev) => Math.min(prev, pages.length - 1));
  }, [pages.length]);

  const current = pages[currentPage];
  const summary = `A4${layout.orientation === 'portrait' ? '纵向' : '横向'} · ${layout.perPage}张/页 · ${layout.fitMode === 'contain' ? '居中' : '拉伸'} · 间距${layout.gapMm}mm`;

  const updateNumberField = (key: keyof Pick<PrintLayoutConfig, 'marginTopMm' | 'marginRightMm' | 'marginBottomMm' | 'marginLeftMm' | 'gapMm'>, value: string) => {
    const numeric = Number(value);
    const next = { ...layout, [key]: Number.isFinite(numeric) ? numeric : 0 };
    setLayout(normalizeLayoutConfig(next));
  };

  const toggleAll = (checked: boolean) => {
    setSelectedMap(
      items.reduce<Record<string, boolean>>((acc, item) => {
        acc[item.path] = checked;
        return acc;
      }, {})
    );
  };

  const validateBeforePrint = (): boolean => {
    if (selectedItems.length === 0) {
      alert('请先选择至少一张图片');
      return false;
    }
    const usableWidth = (layout.orientation === 'portrait' ? 210 : 297) - layout.marginLeftMm - layout.marginRightMm;
    const usableHeight = (layout.orientation === 'portrait' ? 297 : 210) - layout.marginTopMm - layout.marginBottomMm;
    if (usableWidth <= 0 || usableHeight <= 0) {
      alert('边距过大，导致可用排版区域为0，请调整边距');
      return false;
    }
    if (layout.fitMode === 'stretch') {
      const confirmed = window.confirm('拉伸模式会破坏图片原始比例，确认继续打印吗？');
      if (!confirmed) return false;
    }
    return true;
  };

  const handlePrint = () => {
    if (!validateBeforePrint()) return;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(layout));
    
    // 记录打印操作到会话元数据
    if (sessionId) {
      window.electronAPI.session.update(sessionId, {
        lastPrintAt: new Date().toISOString(),
      }).catch((error) => {
        console.warn('Failed to update print timestamp:', error);
        // 不阻断打印流程
      });
    }
    
    window.print();
  };

  const renderPage = (page: NonNullable<typeof current>, mode: 'preview' | 'print') => {
    const isPreview = mode === 'preview';
    const paperStyle = isPreview
      ? ({ aspectRatio: `${page.paperWidthMm} / ${page.paperHeightMm}` } as const)
      : ({ width: `${page.paperWidthMm}mm`, height: `${page.paperHeightMm}mm` } as const);

    return (
      <div
        key={`${mode}-page-${page.index}`}
        className={isPreview ? 'relative w-full bg-white border border-border shadow-sm overflow-hidden' : 'ipd-print-page ipd-sheet relative bg-white overflow-hidden'}
        style={paperStyle}
      >
        {page.cells.map((cell, cellIndex) => {
          const left = (cell.xMm / page.paperWidthMm) * 100;
          const top = (cell.yMm / page.paperHeightMm) * 100;
          const width = (cell.widthMm / page.paperWidthMm) * 100;
          const height = (cell.heightMm / page.paperHeightMm) * 100;
          return (
            <div
              key={`${mode}-cell-${cellIndex}`}
              className="absolute border border-border/50 bg-muted/20"
              style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
            >
              {cell.image ? (
                <img
                  src={`local-file://${cell.image.path}`}
                  alt={cell.image.name}
                  className="h-full w-full"
                  style={{ objectFit: layout.fitMode === 'contain' ? 'contain' : 'fill' }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1200px] w-[95vw] h-[92vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Printer className="h-4 w-4" />
            图片排版打印
          </DialogTitle>
        </DialogHeader>

        <div className="ipd-screen-root h-[calc(92vh-68px)] grid grid-cols-[380px_1fr]">
          <div className="ipd-controls border-r border-border p-4 overflow-y-auto space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>图片选择（{selectedItems.length}/{items.length}）</Label>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => toggleAll(true)}>
                    <CheckSquare className="h-3.5 w-3.5" />
                    <span className="ml-1">全选</span>
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => toggleAll(false)}>
                    <Square className="h-3.5 w-3.5" />
                    <span className="ml-1">清空</span>
                  </Button>
                </div>
              </div>
              <div className="max-h-60 overflow-y-auto border border-border rounded-xl p-2 space-y-2">
                {items.map((item) => (
                  <label key={item.path} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-accent/70 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!selectedMap[item.path]}
                      onChange={(event) =>
                        setSelectedMap((prev) => ({
                          ...prev,
                          [item.path]: event.target.checked,
                        }))
                      }
                    />
                    <img src={`local-file://${item.path}`} alt={item.name} className="h-10 w-10 rounded object-cover border border-border" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs truncate">{item.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {item.ratioClass === '4:3' ? '4:3' : item.ratioClass === 'other' ? '非4:3' : '比例检测中'}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label>排版参数</Label>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>方向</Label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                    value={layout.orientation}
                    onChange={(event) =>
                      setLayout((prev) => ({ ...prev, orientation: event.target.value as PrintLayoutConfig['orientation'] }))
                    }
                  >
                    <option value="portrait">纵向</option>
                    <option value="landscape">横向</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>每页数量</Label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                    value={layout.perPage}
                    onChange={(event) =>
                      setLayout((prev) => ({ ...prev, perPage: Number(event.target.value) as PerPage }))
                    }
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={4}>4</option>
                    <option value={6}>6</option>
                    <option value={9}>9</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <Label>图片模式</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  value={layout.fitMode}
                  onChange={(event) =>
                    setLayout((prev) => ({ ...prev, fitMode: event.target.value as PrintLayoutConfig['fitMode'] }))
                  }
                >
                  <option value="contain">居中（保持比例）</option>
                  <option value="stretch">拉伸（填满）</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>上边距(mm)</Label>
                  <Input type="number" min={0} max={20} value={layout.marginTopMm} onChange={(event) => updateNumberField('marginTopMm', event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>右边距(mm)</Label>
                  <Input type="number" min={0} max={20} value={layout.marginRightMm} onChange={(event) => updateNumberField('marginRightMm', event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>下边距(mm)</Label>
                  <Input type="number" min={0} max={20} value={layout.marginBottomMm} onChange={(event) => updateNumberField('marginBottomMm', event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>左边距(mm)</Label>
                  <Input type="number" min={0} max={20} value={layout.marginLeftMm} onChange={(event) => updateNumberField('marginLeftMm', event.target.value)} />
                </div>
              </div>

              <div className="space-y-1">
                <Label>图片间距(mm)</Label>
                <Input type="number" min={2} max={10} value={layout.gapMm} onChange={(event) => updateNumberField('gapMm', event.target.value)} />
              </div>

              {layout.fitMode === 'stretch' && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 mt-0.5" />
                  <span>拉伸模式可能导致图片比例失真，打印前会再次确认。</span>
                </div>
              )}
            </div>

            <div className="pt-2 flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setLayout(DEFAULT_PRINT_LAYOUT);
                  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(DEFAULT_PRINT_LAYOUT));
                }}
              >
                重置参数
              </Button>
              <Button type="button" onClick={handlePrint} disabled={selectedItems.length === 0 || pages.length === 0}>
                <Printer className="h-4 w-4 mr-1" />
                打印
              </Button>
            </div>
          </div>

          <div className="ipd-preview p-4 overflow-y-auto space-y-3">
            <div className="text-sm font-medium">预览</div>
            <div className="text-xs text-muted-foreground">{summary}</div>

            {pages.length === 0 || !current ? (
              <div className="h-64 border border-dashed border-border rounded-xl flex items-center justify-center text-sm text-muted-foreground">
                当前参数下暂无可预览内容
              </div>
            ) : (
              <>
                <div className="max-w-[640px]">{renderPage(current, 'preview')}</div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 0))} disabled={currentPage <= 0}>
                    上一页
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, pages.length - 1))}
                    disabled={currentPage >= pages.length - 1}
                  >
                    下一页
                  </Button>
                  <span className="text-xs text-muted-foreground ml-2">第 {currentPage + 1} 页 / 共 {pages.length} 页</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="ipd-print-root">
          {pages.map((page) => renderPage(page, 'print'))}
        </div>

        <style>{`
          @media print {
            @page {
              size: A4 ${layout.orientation === 'portrait' ? 'portrait' : 'landscape'};
              margin: 0 !important;
              padding: 0 !important;
            }
            * {
              margin: 0 !important;
              padding: 0 !important;
              box-sizing: border-box !important;
            }
            html, body {
              width: 100% !important;
              height: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              display: block !important;
            }
            body * {
              visibility: hidden !important;
            }
            .ipd-print-root,
            .ipd-print-root * {
              visibility: visible !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .ipd-print-root {
              position: fixed !important;
              top: 0 !important;
              left: 0 !important;
              width: 100% !important;
              height: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              display: block !important;
            }
            .ipd-print-page {
              width: 100% !important;
              page-break-after: always !important;
              break-after: page !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: hidden !important;
            }
            .ipd-print-page:last-child {
              page-break-after: auto !important;
              break-after: auto !important;
            }
          }
          @media screen {
            .ipd-print-root {
              display: none;
            }
          }
        `}</style>
      </DialogContent>
    </Dialog>
  );
}
