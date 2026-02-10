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

const ACTION_TITLE: Record<string, string> = {
  'ai.text2image': '生成图像？',
  'ai.text2speech': '合成语音？',
  'ai.vl_script': '以图生剧本？',
};

export const ConfirmDialog: React.FC = () => {
  const { pendingHitlRequest, respondConfirm } = useChat();
  const open = Boolean(pendingHitlRequest);

  const title = useMemo(() => {
    if (!pendingHitlRequest) return '确认操作';
    return ACTION_TITLE[pendingHitlRequest.actionType] ?? '确认操作';
  }, [pendingHitlRequest]);

  const payloadText = useMemo(() => formatPayload(pendingHitlRequest?.payload), [pendingHitlRequest]);

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="rounded-xl bg-card p-4 text-sm font-sans whitespace-pre-wrap max-h-64 overflow-auto border border-border text-foreground">
          {payloadText || '无内容'}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={() => pendingHitlRequest && respondConfirm(pendingHitlRequest.requestId, false)}>
            取消
          </Button>
          <Button variant="default" onClick={() => pendingHitlRequest && respondConfirm(pendingHitlRequest.requestId, true)}>
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
