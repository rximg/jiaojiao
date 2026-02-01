import { useState } from 'react';
import { ConfigProvider, useConfig } from './providers/ConfigProvider';
import { ChatProvider } from './providers/ChatProvider';
import WelcomePage from './app/components/WelcomePage';
import ChatInterface from './app/components/ChatInterface';
import ConfigDialog from './app/components/ConfigDialog';
import { ConfirmDialog } from './app/components/ConfirmDialog';
import { QuotaErrorDialog } from './app/components/QuotaErrorDialog';
import { AgentErrorDialog } from './app/components/AgentErrorDialog';
import type { AppConfig } from './types/types';

type View = 'welcome' | 'chat';

function AppContent() {
  const { config, updateConfig } = useConfig();
  const [view, setView] = useState<View>('welcome');
  const [loadSessionId, setLoadSessionId] = useState<string | null>(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);

  const handleCaseClick = () => {
    // 点击案例：清空loadSessionId，ChatInterface会创建新session
    setLoadSessionId(null);
    setView('chat');
  };

  const handleHistoryClick = (sessionId: string) => {
    // 点击历史记录：设置loadSessionId，ChatInterface会加载该session
    setLoadSessionId(sessionId);
    setView('chat');
  };

  const handleBackToWelcome = () => {
    setView('welcome');
    setLoadSessionId(null);
  };

  const handleConfigSave = async (newConfig: Partial<AppConfig>) => {
    await updateConfig(newConfig);
    setConfigDialogOpen(false);
  };

  if (!config) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">欢迎使用有声绘本智能体</h1>
          <p className="text-muted-foreground mb-4">请先配置 API Key</p>
          <button
            onClick={() => setConfigDialogOpen(true)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            打开配置
          </button>
        </div>
        <ConfigDialog
          open={configDialogOpen}
          onOpenChange={setConfigDialogOpen}
          onSave={handleConfigSave}
          initialConfig={config}
        />
      </div>
    );
  }

  return (
    <>
      <ChatProvider>
        <div className="h-screen flex flex-col">
          <ConfirmDialog />
          <QuotaErrorDialog />
          <AgentErrorDialog />
          {view === 'welcome' ? (
            <WelcomePage
              onCaseClick={handleCaseClick}
              onHistoryClick={handleHistoryClick}
              onConfigClick={() => setConfigDialogOpen(true)}
            />
          ) : (
            <ChatInterface
              loadSessionId={loadSessionId}
              onBack={handleBackToWelcome}
              onConfigClick={() => setConfigDialogOpen(true)}
            />
          )}
        </div>
      </ChatProvider>
      <ConfigDialog
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        onSave={handleConfigSave}
        initialConfig={config}
      />
    </>
  );
}

function App() {
  return (
    <ConfigProvider>
      <AppContent />
    </ConfigProvider>
  );
}

export default App;
