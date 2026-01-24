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
    if (!pendingAction) return 'Confirm action';
    return pendingAction.action === 't2i' ? 'Generate image?' : 'Synthesize speech?';
  }, [pendingAction]);

  const payloadText = useMemo(() => formatPayload(pendingAction?.payload), [pendingAction]);

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="rounded bg-neutral-900 p-3 text-sm font-mono whitespace-pre-wrap max-h-64 overflow-auto border border-neutral-800">
          {payloadText || 'No payload'}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={() => respondConfirm(false)}>
            Cancel
          </Button>
          <Button variant="default" onClick={() => respondConfirm(true)}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
