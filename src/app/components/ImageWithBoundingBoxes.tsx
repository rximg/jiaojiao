import { useState, useCallback, useRef, useEffect } from 'react';

export interface LabelAnnotation {
  number: number;
  x: number;
  y: number;
}

interface ImageWithBoundingBoxesProps {
  imagePath: string;
  annotations: LabelAnnotation[];
  imageWidth?: number;
  imageHeight?: number;
  onChange: (annotations: LabelAnnotation[]) => void;
  /** 父组件传入，用于同步写入最新值，确保点击「继续」时能读到编辑后的数据 */
  latestRef?: React.MutableRefObject<LabelAnnotation[]>;
  disabled?: boolean;
}

/** 图片上可拖拽、可编辑序号的标注框，用于 ai.image_label_order HITL。x,y 为像素坐标 */
export default function ImageWithBoundingBoxes({
  imagePath,
  annotations,
  imageWidth: propImgW,
  imageHeight: propImgH,
  onChange,
  latestRef: parentLatestRef,
  disabled = false,
}: ImageWithBoundingBoxesProps) {
  const [localAnnotations, setLocalAnnotations] = useState<LabelAnnotation[]>(annotations);
  const [imgSize, setImgSize] = useState({ w: propImgW ?? 1, h: propImgH ?? 1 });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const latestRef = useRef<LabelAnnotation[]>(annotations);

  useEffect(() => {
    setLocalAnnotations(annotations);
    latestRef.current = annotations;
  }, [annotations]);

  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      setImgSize({ w: propImgW ?? img.naturalWidth, h: propImgH ?? img.naturalHeight });
    },
    [propImgW, propImgH]
  );

  const handleDragStart = useCallback(
    (index: number, e: React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startAnn = localAnnotations[index];

      const onMove = (moveEvent: MouseEvent) => {
        const imgEl = imgRef.current;
        const container = containerRef.current;
        if (!imgEl || !container) return;
        const rect = imgEl.getBoundingClientRect();
        const scaleX = imgSize.w / rect.width;
        const scaleY = imgSize.h / rect.height;
        const dx = (moveEvent.clientX - startX) * scaleX;
        const dy = (moveEvent.clientY - startY) * scaleY;
        setLocalAnnotations((prev) => {
          const next = [...prev];
          next[index] = {
            ...next[index],
            x: Math.max(0, Math.min(imgSize.w - 40, startAnn.x + dx)),
            y: Math.max(0, Math.min(imgSize.h - 30, startAnn.y + dy)),
          };
          latestRef.current = next;
          return next;
        });
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        const next = latestRef.current;
        if (parentLatestRef) parentLatestRef.current = next;
        onChange(next);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [disabled, imgSize, localAnnotations, onChange, parentLatestRef]
  );

  const handleNumberClick = useCallback(
    (index: number) => {
      if (disabled) return;
      setEditingIndex(index);
      setEditValue(String(localAnnotations[index].number));
    },
    [disabled, localAnnotations]
  );

  const handleEditSubmit = useCallback(() => {
    if (editingIndex === null) return;
    const num = parseInt(editValue, 10);
    if (!Number.isNaN(num) && num >= 1) {
      const next = [...localAnnotations];
      next[editingIndex] = { ...next[editingIndex], number: num };
      latestRef.current = next;
      if (parentLatestRef) parentLatestRef.current = next;
      setLocalAnnotations(next);
      queueMicrotask(() => onChange(next));
    }
    setEditingIndex(null);
  }, [editingIndex, editValue, localAnnotations, onChange, parentLatestRef]);

  const handleEditBlur = useCallback(() => {
    handleEditSubmit();
    setEditingIndex(null);
  }, [handleEditSubmit]);

  return (
    <div ref={containerRef} className="relative w-full max-w-2xl rounded-lg overflow-visible border border-border bg-muted/30">
      <div className="relative">
        <div className="overflow-hidden rounded-lg">
          <img
            ref={imgRef}
            src={`local-file://${imagePath}`}
            alt="标注图"
            className="w-full h-auto block"
            onLoad={handleImageLoad}
            draggable={false}
          />
        </div>
        {/* 标注层独立于 overflow-hidden，避免序号输入框被裁剪 */}
        {imgSize.w > 1 && imgSize.h > 1 && (
          <div className="absolute inset-0 overflow-visible pointer-events-none">
            {localAnnotations.map((ann, index) => {
              const leftPct = (ann.x / imgSize.w) * 100;
              const topPct = (ann.y / imgSize.h) * 100;
              return (
                <div
                  key={index}
                  className="absolute min-w-[3rem] min-h-7 rounded-md bg-white border-2 border-primary shadow-md flex items-center justify-center cursor-move select-none overflow-visible z-10 pointer-events-auto"
                      style={{
                    left: `${Math.min(95, Math.max(0, leftPct))}%`,
                    top: `${Math.min(95, Math.max(0, topPct))}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  onMouseDown={(e) => {
                if (editingIndex === index) {
                  e.stopPropagation();
                  return;
                }
                    handleDragStart(index, e);
                  }}
                >
              {editingIndex === index ? (
                <input
                  type="number"
                  min={1}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={handleEditBlur}
                  onKeyDown={(e) => e.key === 'Enter' && handleEditSubmit()}
                  className="min-w-[2.5rem] w-12 h-6 text-sm text-center border border-primary rounded px-1 py-0 box-border"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className="text-xs font-bold text-foreground px-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNumberClick(index);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {ann.number}
                </span>
              )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="px-2 py-1 text-xs text-muted-foreground border-t border-border/50">
        可拖拽移动序号框，点击数字可修改
      </div>
    </div>
  );
}
