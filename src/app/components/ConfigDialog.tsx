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
  const [model, setModel] = useState('qwen-plus');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [outputPath, setOutputPath] = useState('./outputs');

  useEffect(() => {
    if (open && initialConfig) {
      setDashscopeApiKey(initialConfig.apiKeys?.dashscope || '');
      setModel(initialConfig.agent?.model || 'qwen-plus');
      setTemperature(initialConfig.agent?.temperature || 0.7);
      setMaxTokens(initialConfig.agent?.maxTokens || 2048);
      setOutputPath(initialConfig.storage?.outputPath || './outputs');
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
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="dashscope">阿里百炼 API Key *</Label>
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
              <Label htmlFor="model">模型</Label>
              <Input
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="temperature">温度</Label>
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
            <Label htmlFor="maxTokens">最大 Token 数</Label>
            <Input
              id="maxTokens"
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="outputPath">输出路径</Label>
            <Input
              id="outputPath"
              value={outputPath}
              onChange={(e) => setOutputPath(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
