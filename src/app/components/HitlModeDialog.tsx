import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export type HitlMode = 'auto' | 'allowlist' | 'strict';

export interface HitlPolicy {
  mode: HitlMode;
  allowlist: string[];
}

interface HitlModeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy: HitlPolicy;
  loading?: boolean;
  onModeChange: (mode: HitlMode) => Promise<void>;
  onRemoveAllowlist: (actionType: string) => Promise<void>;
  onClearAllowlist: () => Promise<void>;
}

const MODE_OPTIONS: Array<{ mode: HitlMode; label: string; description: string }> = [
  { mode: 'auto', label: '完全自动', description: '所有 HITL 操作都自动执行，不再弹出确认。' },
  { mode: 'allowlist', label: '按需确认', description: '允许列表中的操作自动执行，其它操作仍需确认。' },
  { mode: 'strict', label: '每次确认', description: '每次 HITL 操作都需要人工确认后继续。' },
];

export default function HitlModeDialog({
  open,
  onOpenChange,
  policy,
  loading = false,
  onModeChange,
  onRemoveAllowlist,
  onClearAllowlist,
}: HitlModeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>执行模式</DialogTitle>
          <DialogDescription>AI 自动执行与人工确认控制</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto pr-1">
          <div className="space-y-2 rounded-lg border border-border p-3">
            {MODE_OPTIONS.map((item) => {
              const checked = policy.mode === item.mode;
              return (
                <label
                  key={item.mode}
                  className="flex items-start gap-3 rounded-md border border-border/60 p-2 cursor-pointer hover:bg-accent/40"
                >
                  <input
                    type="radio"
                    name="hitl-mode"
                    checked={checked}
                    disabled={loading}
                    onChange={() => {
                      if (!checked) {
                        void onModeChange(item.mode);
                      }
                    }}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="text-sm font-medium text-foreground">{item.label}</span>
                    <span className="block text-xs text-muted-foreground mt-1">{item.description}</span>
                  </span>
                </label>
              );
            })}
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-foreground">自动通过列表</div>
                <div className="text-xs text-muted-foreground mt-1">仅在“按需确认”模式下生效。</div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading || policy.allowlist.length === 0}
                onClick={() => void onClearAllowlist()}
              >
                清空列表
              </Button>
            </div>

            {policy.allowlist.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                还没有自动通过项。你可以在 HITL 确认卡片点击“加入自动通过列表”。
              </div>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {policy.allowlist.map((actionType) => (
                  <div key={actionType} className="flex items-center justify-between gap-2 rounded-md border border-border/60 p-2">
                    <code className="text-xs text-foreground break-all">{actionType}</code>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={loading}
                      onClick={() => void onRemoveAllowlist(actionType)}
                    >
                      移除
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
