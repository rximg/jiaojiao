import { Bot } from 'lucide-react';
import DocumentBlock from './DocumentBlock';
import ImageBlock from './ImageBlock';

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
};

interface HitlConfirmBlockProps {
  request: PendingHitlRequest;
  onContinue: () => void;
  onCancel: () => void;
}

export default function HitlConfirmBlock({ request, onContinue, onCancel }: HitlConfirmBlockProps) {
  const title = ACTION_TITLE[request.actionType] ?? '确认操作';
  const payload = request.payload;

  const renderPayload = () => {
    if (request.actionType === 'ai.text2image') {
      const prompt = typeof payload.prompt === 'string' ? payload.prompt : null;
      const promptFile = typeof payload.promptFile === 'string' ? payload.promptFile : null;
      if (prompt) {
        return <DocumentBlock pathOrContent={prompt} title="提示词" />;
      }
      if (promptFile) {
        return <DocumentBlock pathOrContent={`将使用文件：${promptFile}`} title="提示词文件" />;
      }
      return <div className="text-sm opacity-80">无提示词</div>;
    }
    if (request.actionType === 'ai.text2speech') {
      const texts = Array.isArray(payload.texts) ? payload.texts : [];
      const content = texts.map((t: unknown, i: number) => `${i + 1}. ${String(t)}`).join('\n') || '无台词';
      return <DocumentBlock pathOrContent={content} title="台词" />;
    }
    if (request.actionType === 'ai.vl_script') {
      const imagePath = typeof payload.imagePath === 'string' ? payload.imagePath : '';
      if (imagePath) {
        return <ImageBlock path={imagePath} />;
      }
      return <div className="text-sm opacity-80">无图片路径</div>;
    }
    return (
      <pre className="text-xs whitespace-pre-wrap break-words max-h-32 overflow-auto rounded bg-background/80 p-2 border border-border/50">
        {JSON.stringify(payload, null, 2)}
      </pre>
    );
  };

  return (
    <div className="flex gap-4 justify-start">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
        <Bot className="h-4 w-4 text-primary" />
      </div>
      <div className="max-w-[80%] rounded-2xl px-4 py-3 shadow-sm bg-muted text-muted-foreground">
        <div className="font-medium text-foreground mb-2">{title}</div>
        <div className="mt-2 space-y-2">{renderPayload()}</div>
        <div className="flex gap-2 mt-3 pt-3 border-t border-border/50">
          <button
            type="button"
            onClick={onContinue}
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
      </div>
    </div>
  );
}
