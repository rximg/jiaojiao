import React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { useChat } from '../../providers/ChatProvider';
import { AlertCircle } from 'lucide-react';

export const QuotaErrorDialog: React.FC = () => {
  const { quotaError, dismissQuotaError } = useChat();
  const open = Boolean(quotaError);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && dismissQuotaError()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            API额度已用完
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {quotaError?.message || '当前模型的API额度已用完，无法继续使用。'}
          </p>
          <div className="rounded bg-muted p-3 text-xs font-mono text-muted-foreground">
            {quotaError?.error || '403 Forbidden'}
          </div>
          <p className="text-sm font-medium">
            请前往设置页面更换其他模型以继续使用。
          </p>
        </div>
        <DialogFooter>
          <Button variant="default" onClick={dismissQuotaError}>
            知道了
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
