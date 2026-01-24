import React, { useMemo } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { useChat } from '../../providers/ChatProvider';

function formatPayload(payload: any) {
  if (!payload) return '';
  try {
    return JSON.stringify(payload, null, 2);
  } catch (_err) {
    return String(payload);
  }
}

export const ConfirmDialog: React.FC = () => {
  const { pendingAction, respondConfirm } = useChat();
  const open = Boolean(pendingAction);

  console.log('[ConfirmDialog] pendingAction:', pendingAction, 'open:', open);

  const title = useMemo(() => {
    if (!pendingAction) return '确认操作';
    return pendingAction.action === 't2i' ? '生成图像？' : '合成语音？';
  }, [pendingAction]);

  const payloadText = useMemo(() => formatPayload(pendingAction?.payload), [pendingAction]);

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="rounded bg-card p-3 text-sm font-sans whitespace-pre-wrap max-h-64 overflow-auto border border-border text-foreground">
          {payloadText || '无内容'}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={() => respondConfirm(false)}>
            取消
          </Button>
          <Button variant="default" onClick={() => respondConfirm(true)}>
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
