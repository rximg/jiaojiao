import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AppConfig } from '@/types/types';
import { DASHSCOPE_APPLY_STEPS, ZHIPU_APPLY_STEPS } from '@/data/api-key-apply-steps';

/** LLM 模型选项，与 backend/config/ai_models.json 的 llm 保持一致 */
const LLM_OPTIONS = {
  dashscope: {
    default: 'qwen-plus-2025-12-01',
    models: [
      { id: 'qwen-plus-2025-12-01', label: '通义 Qwen Plus' },
      { id: 'qwen-turbo', label: '通义 Qwen Turbo' },
    ],
  },
  zhipu: {
    default: 'glm-4.7',
    models: [
      { id: 'glm-4.5', label: '智谱 GLM-4.5' },
      { id: 'glm-4.5-flash', label: '智谱 GLM-4.5 Flash' },
      { id: 'glm-4.6', label: '智谱 GLM-4.6' },
      { id: 'glm-4.7', label: '智谱 GLM-4.7' },
    ],
  },
} as const;

type Provider = 'dashscope' | 'zhipu';

interface ConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (config: Partial<AppConfig>) => Promise<void>;
  initialConfig?: AppConfig | null;
}

export default function ConfigDialog({
  open,
  onOpenChange,
  onSave,
  initialConfig,
}: ConfigDialogProps) {
  const [provider, setProvider] = useState<Provider>('dashscope');
  const [dashscopeApiKey, setDashscopeApiKey] = useState('');
  const [zhipuApiKey, setZhipuApiKey] = useState('');
  /** 当前选中的 LLM 模型（agent.current）；首次为空时在下方赋值为 default，下拉即有显示 */
  const [model, setModel] = useState('');
  const [temperature, setTemperature] = useState(0.1);
  const [maxTokens, setMaxTokens] = useState(20000);
  const [outputPath, setOutputPath] = useState('./outputs');
  const [ttsStartNumber, setTtsStartNumber] = useState(6000);
  const [applyStepsOpen, setApplyStepsOpen] = useState(false);

  useEffect(() => {
    if (open && initialConfig) {
      const p = (initialConfig.agent?.provider === 'zhipu' ? 'zhipu' : 'dashscope') as Provider;
      setProvider(p);
      setDashscopeApiKey(initialConfig.apiKeys?.dashscope ?? '');
      setZhipuApiKey(initialConfig.apiKeys?.zhipu ?? '');
      const opts = LLM_OPTIONS[p];
      const currentRaw = (initialConfig.agent?.current ?? initialConfig.agent?.model ?? '').trim();
      const currentOrDefault = currentRaw && opts.models.some((m) => m.id === currentRaw)
        ? currentRaw
        : opts.default;
      setModel(currentOrDefault);
      setTemperature(initialConfig.agent?.temperature ?? 0.1);
      setMaxTokens(initialConfig.agent?.maxTokens ?? 20000);
      setOutputPath(initialConfig.storage?.outputPath ?? './outputs');
      setTtsStartNumber(initialConfig.storage?.ttsStartNumber ?? 6000);
    }
  }, [open, initialConfig]);

  useEffect(() => {
    if (!open) return;
    const opts = LLM_OPTIONS[provider];
    const valid = opts.models.some((m) => m.id === model);
    if (!valid) setModel(opts.default);
  }, [open, provider]);

  const currentApiKey = provider === 'dashscope' ? dashscopeApiKey : zhipuApiKey;
  const setCurrentApiKey = provider === 'dashscope' ? setDashscopeApiKey : setZhipuApiKey;
  const llmOpts = LLM_OPTIONS[provider];

  const handleSave = async () => {
    if (!dashscopeApiKey.trim() && !zhipuApiKey.trim()) {
      alert('请至少填写一个供应商的 API Key');
      return;
    }

    try {
      await onSave({
        apiKeys: {
          dashscope: dashscopeApiKey.trim() || undefined,
          zhipu: zhipuApiKey.trim() || undefined,
        },
        agent: {
          model: model || llmOpts.default,
          current: model || llmOpts.default,
          temperature,
          maxTokens,
          provider,
        },
        storage: {
          outputPath,
          ttsStartNumber,
        },
        ui: {
          theme: 'light',
          language: 'zh',
        },
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save config:', error);
      alert('保存配置失败');
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>配置</DialogTitle>
          <DialogDescription>
            配置 API Key 和 Agent 参数。配置将保存在本地。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 py-4">
          <div className="space-y-2">
            <Label htmlFor="provider" className="text-foreground">供应商</Label>
            <div className="flex gap-2">
              <select
                id="provider"
                className="flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={provider}
                onChange={(e) => setProvider(e.target.value as Provider)}
              >
                <option value="dashscope">阿里百炼</option>
                <option value="zhipu">智谱</option>
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 rounded-md"
                onClick={() => setApplyStepsOpen(true)}
              >
                申请
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="apikey" className="text-foreground">API Key</Label>
            <Input
              id="apikey"
              type="password"
              placeholder={provider === 'dashscope' ? 'sk-...（阿里百炼）' : 'sk-...（智谱）'}
              value={currentApiKey}
              onChange={(e) => setCurrentApiKey(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="model" className="text-foreground">模型</Label>
              <select
                id="model"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={model || llmOpts.default}
                onChange={(e) => setModel(e.target.value)}
              >
                {llmOpts.models.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="temperature" className="text-foreground">温度</Label>
              <Input
                id="temperature"
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxTokens" className="text-foreground">最大 Token 数</Label>
            <Input
              id="maxTokens"
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="outputPath" className="text-foreground">输出路径</Label>
            <Input
              id="outputPath"
              value={outputPath}
              onChange={(e) => setOutputPath(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ttsStartNumber" className="text-foreground">TTS 起始编号</Label>
            <Input
              id="ttsStartNumber"
              type="number"
              min={1}
              value={ttsStartNumber}
              onChange={(e) => setTtsStartNumber(parseInt(e.target.value, 10) || 6000)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-lg">
            取消
          </Button>
          <Button onClick={handleSave} className="rounded-lg">保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* 申请步骤弹窗：按当前供应商显示对应 Markdown 文档 */}
    <Dialog open={applyStepsOpen} onOpenChange={setApplyStepsOpen}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {provider === 'dashscope' ? '阿里百炼' : '智谱'} API Key 申请步骤
          </DialogTitle>
          <DialogDescription>按以下步骤申请并获取 API Key，填入上方输入框后保存。</DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto pr-2 -mr-2 border-t border-border pt-4 mt-1 text-foreground text-sm [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h1:first-child]:mt-0 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5 [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:ml-4 [&_li]:list-disc [&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground [&_blockquote]:pl-3 [&_blockquote]:italic [&_strong]:font-semibold">
          <ReactMarkdown
            components={{
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  {children}
                </a>
              ),
            }}
          >
            {provider === 'dashscope' ? DASHSCOPE_APPLY_STEPS : ZHIPU_APPLY_STEPS}
          </ReactMarkdown>
        </div>
        <DialogFooter className="shrink-0 pt-4">
          <Button variant="outline" onClick={() => setApplyStepsOpen(false)} className="rounded-lg">
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
  );
}
