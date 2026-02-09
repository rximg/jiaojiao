import { useState } from 'react';
import { Settings, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import HistoryPanel from './HistoryPanel';
import CaseList from './CaseList';
import ConfigDialog from './ConfigDialog';
import { useConfig } from '@/providers/ConfigProvider';

interface WelcomePageProps {
  onCaseClick: (caseId: string) => void;
  onHistoryClick: (sessionId: string) => void;
  onConfigClick: () => void;
}

export default function WelcomePage({
  onCaseClick,
  onHistoryClick,
}: WelcomePageProps) {
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const { config, updateConfig } = useConfig();

  return (
    <>
      <div className="flex h-screen flex-col">
        {/* 配置栏 */}
        <header className="flex h-16 items-center justify-between border-b border-border bg-card/80 px-6 shadow-sm">
          <h1 className="text-xl font-semibold text-foreground">有声绘本智能体</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const res = await window.electronAPI?.sync?.syncAudioToStore?.();
                  if (res?.success !== undefined) {
                    alert(res.message ?? `已同步 ${res.copied ?? 0} 个 mp3`);
                  } else {
                    alert('同步功能不可用');
                  }
                } catch (e) {
                  console.error(e);
                  alert('同步失败：' + (e instanceof Error ? e.message : String(e)));
                }
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              同步
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfigDialogOpen(true)}
            >
              <Settings className="mr-2 h-4 w-4" />
              配置
            </Button>
          </div>
        </header>

        {/* 主内容区 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 历史记录面板 */}
          <div className="w-64 border-r border-border">
            <HistoryPanel onSessionClick={onHistoryClick} />
          </div>

          {/* 案例列表 */}
          <div className="flex-1 overflow-y-auto p-6">
            <CaseList onCaseClick={onCaseClick} />
          </div>
        </div>
      </div>

      <ConfigDialog
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        onSave={updateConfig}
        initialConfig={config}
      />
    </>
  );
}
