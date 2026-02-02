import React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { useChat } from '../../providers/ChatProvider';
import { AlertTriangle } from 'lucide-react';

export const AgentErrorDialog: React.FC = () => {
  const { agentError, dismissAgentError } = useChat();
  const open = Boolean(agentError);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) dismissAgentError();
  };


  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            执行出错
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {agentError?.message || '代理执行过程中发生异常。'}
          </p>
          <p className="text-sm font-medium text-destructive">
            执行已中断。如需重试，请重新发送消息。
          </p>
        </div>
        <DialogFooter>
          <Button variant="default" onClick={dismissAgentError}>
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
