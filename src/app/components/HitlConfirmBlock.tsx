import { useState, useEffect, useCallback, useRef } from 'react';
import { Bot } from 'lucide-react';
import type { HitlBlockRecord } from '@/types/types';
import DocumentBlock from './DocumentBlock';
import ImageBlock from './ImageBlock';
import EditableDocumentBlock from './EditableDocumentBlock';
import ImageWithBoundingBoxes from './ImageWithBoundingBoxes';

export interface PendingHitlRequest {
  requestId: string;
  actionType: string;
  payload: Record<string, unknown>;
  timeout: number;
}

const ACTION_TITLE: Record<string, string> = {
  'ai.text2image': '生成图像？',
  'ai.text2speech': '合成语音？',
  'ai.vl_script': '以图生剧本？',
  'ai.image_label_order': '标注图片序号？',
  'artifacts.delete': '删除以下产物？',
};

interface HitlConfirmBlockProps {
  /** 待确认请求（含 timeout）或已结束记录（含 approved） */
  request: PendingHitlRequest | HitlBlockRecord;
  /** 会话 ID，用于读取 promptFile 内容（仅 pending 时需要） */
  sessionId?: string | null;
  onContinue?: (editedPayload?: Record<string, unknown>) => void;
  onCancel?: () => void;
}

/** 将 "1. xxx\n2. yyy" 解析回 string[] */
function parseNumberedLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*\d+\.\s*/, '').trim())
    .filter(Boolean);
}

export default function HitlConfirmBlock({ request, sessionId, onContinue, onCancel }: HitlConfirmBlockProps) {
  const resolved = 'approved' in request ? { approved: request.approved } : undefined;
  const title = ACTION_TITLE[request.actionType] ?? '确认操作';
  const payload = request.payload;

  // 可编辑内容状态（仅 pending 时使用）
  const [editablePrompt, setEditablePrompt] = useState<string>('');
  const [editableTexts, setEditableTexts] = useState<string>('');
  const [promptFileLoading, setPromptFileLoading] = useState(false);
  const [promptLoadedFromFile, setPromptLoadedFromFile] = useState(false);
  const [labelAnnotations, setLabelAnnotations] = useState<Array<{ number: number; x: number; y: number }>>([]);
  const labelAnnotationsRef = useRef<Array<{ number: number; x: number; y: number }>>([]);

  // 加载 promptFile 内容
  useEffect(() => {
    if (resolved || request.actionType !== 'ai.text2image') return;
    const prompt = typeof payload.prompt === 'string' ? payload.prompt : null;
    const promptFile = typeof payload.promptFile === 'string' ? payload.promptFile : null;
    if (prompt) {
      setEditablePrompt(prompt);
      setPromptLoadedFromFile(false);
      return;
    }
    if (promptFile && sessionId && typeof window.electronAPI?.fs?.readFile === 'function') {
      setPromptFileLoading(true);
      setPromptLoadedFromFile(false);
      window.electronAPI.fs
        .readFile(sessionId, promptFile)
        .then((res: { content?: string }) => {
          setEditablePrompt(res?.content ?? '');
          setPromptLoadedFromFile(true);
        })
        .catch(() => {
          setEditablePrompt(`将使用文件：${promptFile}`);
          setPromptLoadedFromFile(false);
        })
        .finally(() => setPromptFileLoading(false));
    } else if (promptFile) {
      setEditablePrompt(`将使用文件：${promptFile}`);
      setPromptLoadedFromFile(false);
    }
  }, [resolved, request.actionType, payload.prompt, payload.promptFile, sessionId]);

  // 初始化 texts 编辑内容
  useEffect(() => {
    if (resolved || request.actionType !== 'ai.text2speech') return;
    const texts = Array.isArray(payload.texts) ? payload.texts : [];
    setEditableTexts(texts.map((t: unknown, i: number) => `${i + 1}. ${String(t)}`).join('\n') || '');
  }, [resolved, request.actionType, payload.texts]);

  // 初始化图片序号标注
  useEffect(() => {
    if (resolved || request.actionType !== 'ai.image_label_order') return;
    const ann = Array.isArray(payload.annotations) ? payload.annotations : [];
    const lines = Array.isArray(payload.lines) ? payload.lines : [];
    const numbers = Array.isArray(payload.numbers) ? payload.numbers : [];
    let next: Array<{ number: number; x: number; y: number }> = [];
    if (ann.length > 0) {
      next = ann.map((a: unknown) => (typeof a === 'object' && a && 'number' in a && 'x' in a && 'y' in a ? { number: Number((a as { number: unknown }).number) || 1, x: Number((a as { x: unknown }).x) || 0, y: Number((a as { y: unknown }).y) || 0 } : { number: 1, x: 0, y: 0 }));
    } else if (lines.length > 0) {
      next = lines.map((l: unknown, i: number) => {
        const obj = typeof l === 'object' && l && 'x' in l && 'y' in l ? (l as { x: number; y: number }) : { x: 0, y: 0 };
        const num = typeof numbers[i] === 'number' ? numbers[i] : i + 1;
        return { number: num, x: Number(obj.x) || 0, y: Number(obj.y) || 0 };
      });
    }
    if (next.length > 0) {
      setLabelAnnotations(next);
      labelAnnotationsRef.current = next;
    }
  }, [resolved, request.actionType, payload.annotations, payload.lines, payload.numbers]);

  const handleContinue = useCallback(() => {
    if (!onContinue) return;
    if (request.actionType === 'ai.text2image' && !resolved) {
      const trimmed = editablePrompt.trim();
      if (trimmed && (promptLoadedFromFile || !trimmed.startsWith('将使用文件：'))) {
        onContinue({ prompt: trimmed });
      } else {
        onContinue();
      }
    } else if (request.actionType === 'ai.text2speech' && !resolved) {
      const texts = parseNumberedLines(editableTexts);
      // 始终传回用户当前编辑的 texts（含空数组），确保后端只用确认后的台词
      onContinue({ texts });
    } else if (request.actionType === 'ai.image_label_order' && !resolved) {
      const latest = labelAnnotationsRef.current.length > 0 ? labelAnnotationsRef.current : labelAnnotations;
      onContinue(latest.length > 0 ? { annotations: latest } : undefined);
    } else {
      onContinue();
    }
  }, [onContinue, request.actionType, resolved, editablePrompt, editableTexts, promptLoadedFromFile, labelAnnotations]);

  const renderPayload = () => {
    if (request.actionType === 'ai.text2image') {
      const prompt = typeof payload.prompt === 'string' ? payload.prompt : null;
      const promptFile = typeof payload.promptFile === 'string' ? payload.promptFile : null;
      if (resolved) {
        if (prompt) return <DocumentBlock pathOrContent={prompt} title="提示词" />;
        if (promptFile) return <DocumentBlock pathOrContent={`将使用文件：${promptFile}`} title="提示词文件" />;
        return <div className="text-sm opacity-80">无提示词</div>;
      }
      if (promptFileLoading) return <div className="text-sm opacity-80">加载中...</div>;
      return (
        <EditableDocumentBlock
          value={editablePrompt}
          onChange={setEditablePrompt}
          title="提示词"
          placeholder="输入或编辑提示词..."
          minRows={8}
        />
      );
    }
    if (request.actionType === 'ai.text2speech') {
      const texts = Array.isArray(payload.texts) ? payload.texts : [];
      const content = texts.map((t: unknown, i: number) => `${i + 1}. ${String(t)}`).join('\n') || '无台词';
      if (resolved) {
        return <DocumentBlock pathOrContent={content} title="台词" />;
      }
      return (
        <EditableDocumentBlock
          value={editableTexts}
          onChange={setEditableTexts}
          title="台词"
          placeholder="每行一段台词，可带序号（如 1. xxx）"
          minRows={10}
        />
      );
    }
    if (request.actionType === 'ai.vl_script') {
      const imagePath = typeof payload.imagePath === 'string' ? payload.imagePath : '';
      if (imagePath) {
        return <ImageBlock path={imagePath} />;
      }
      return <div className="text-sm opacity-80">无图片路径</div>;
    }
    if (request.actionType === 'ai.image_label_order') {
      const imagePath = typeof payload.imagePath === 'string' ? payload.imagePath : '';
      if (resolved) {
        const ann = Array.isArray(payload.annotations) ? payload.annotations : [];
        if (imagePath && ann.length > 0) {
          return <ImageBlock path={imagePath} />;
        }
        return imagePath ? <ImageBlock path={imagePath} /> : <div className="text-sm opacity-80">无图片路径</div>;
      }
      if (imagePath && labelAnnotations.length > 0) {
        return (
          <ImageWithBoundingBoxes
            imagePath={imagePath}
            annotations={labelAnnotations}
            imageWidth={typeof payload.imageWidth === 'number' ? payload.imageWidth : undefined}
            imageHeight={typeof payload.imageHeight === 'number' ? payload.imageHeight : undefined}
            onChange={(annotations) => setLabelAnnotations(annotations)}
            latestRef={labelAnnotationsRef}
          />
        );
      }
      return <div className="text-sm opacity-80">加载中或无标注数据...</div>;
    }
    if (request.actionType === 'artifacts.delete') {
      const paths = Array.isArray(payload.paths) ? payload.paths : [];
      const content = paths.length > 0 ? paths.map((p: unknown) => `• ${String(p)}`).join('\n') : '无待删除文件';
      return <DocumentBlock pathOrContent={content} title="待删除文件" />;
    }
    return (
      <pre className="text-xs whitespace-pre-wrap break-words max-h-32 overflow-auto rounded bg-background/80 p-2 border border-border/50">
        {JSON.stringify(payload, null, 2)}
      </pre>
    );
  };

  return (
    <div className="flex gap-4 justify-start w-full">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
        <Bot className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0 w-full rounded-2xl px-4 py-3 shadow-sm bg-muted text-muted-foreground">
        <div className="font-medium text-foreground mb-2">{title}</div>
        <div className="mt-2 space-y-2">{renderPayload()}</div>
        {resolved ? (
          <div className="mt-3 pt-3 border-t border-border/50 text-sm opacity-80">
            {resolved.approved ? '已继续' : '已取消'}
          </div>
        ) : (
          <div className="flex gap-2 mt-3 pt-3 border-t border-border/50">
            <button
              type="button"
              onClick={handleContinue}
              className="px-3 py-1.5 text-sm rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              继续
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-sm rounded-xl border border-border hover:bg-muted/80 transition-colors"
            >
              取消
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
