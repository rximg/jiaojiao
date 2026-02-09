import { useState, useEffect } from 'react';
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
  const [dashscopeApiKey, setDashscopeApiKey] = useState('');
  const [model, setModel] = useState('qwen-plus-2025-12-01');
  const [temperature, setTemperature] = useState(0.1);
  const [maxTokens, setMaxTokens] = useState(20000);
  const [outputPath, setOutputPath] = useState('./outputs');
  const [ttsStartNumber, setTtsStartNumber] = useState(6000);

  useEffect(() => {
    if (open && initialConfig) {
      setDashscopeApiKey(initialConfig.apiKeys?.dashscope || '');
      setModel(initialConfig.agent?.model || 'qwen-plus-2025-12-01');
      setTemperature(initialConfig.agent?.temperature || 0.1);
      setMaxTokens(initialConfig.agent?.maxTokens || 20000);
      setOutputPath(initialConfig.storage?.outputPath || './outputs');
      setTtsStartNumber(initialConfig.storage?.ttsStartNumber ?? 6000);
    }
  }, [open, initialConfig]);

  const handleSave = async () => {
    if (!dashscopeApiKey) {
      alert('请填写阿里百炼 API Key');
      return;
    }

    try {
      await onSave({
        apiKeys: {
          dashscope: dashscopeApiKey,
        },
        agent: {
          model,
          temperature,
          maxTokens,
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
            <Label htmlFor="dashscope" className="text-foreground">阿里百炼 API Key *</Label>
            <Input
              id="dashscope"
              type="password"
              placeholder="sk-..."
              value={dashscopeApiKey}
              onChange={(e) => setDashscopeApiKey(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="model" className="text-foreground">模型</Label>
              <Input
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
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
  );
}
