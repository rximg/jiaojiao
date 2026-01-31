import { useState, useRef, useCallback, FormEvent, useEffect } from 'react';
import { ArrowUp, Square, Settings, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import ChatMessage from './ChatMessage';
import WelcomeMessage from './WelcomeMessage';
import QuickOptions from './QuickOptions';
import TodoPanel from './TodoPanel';
import WorkspacePanel from './WorkspacePanel';
import { useChat } from '../../providers/ChatProvider';

interface ChatInterfaceProps {
  loadSessionId: string | null;
  onBack: () => void;
  onConfigClick: () => void;
}

export default function ChatInterface({
  loadSessionId,
  onBack,
  onConfigClick,
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { messages, todos, isLoading, sendMessage, stopStream, currentSessionId, createNewSession, loadSession, lastArtifactTime } = useChat();
  const [showWelcome, setShowWelcome] = useState(true);
  const [showWorkspace] = useState(true);

  // 加载或创建会话
  useEffect(() => {
    if (loadSessionId) {
      // 点击历史记录：加载指定的session
      console.log('[ChatInterface] Loading session:', loadSessionId);
      loadSession(loadSessionId).catch(console.error);
      setShowWelcome(false);
    } else if (!currentSessionId) {
      // 点击案例：创建新session
      console.log('[ChatInterface] Creating new session');
      createNewSession('新对话').catch(console.error);
    }
  }, [loadSessionId, currentSessionId, createNewSession, loadSession]);

  const handleSubmit = useCallback(
    async (e?: FormEvent) => {
      if (e) {
        e.preventDefault();
      }
      const messageText = input.trim();
      if (!messageText || isLoading) return;

      setShowWelcome(false);
      await sendMessage(messageText);
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    },
    [input, isLoading, sendMessage]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleQuickOptionClick = useCallback(
    (option: string) => {
      setInput(option);
      setShowWelcome(false);
      setTimeout(() => {
        handleSubmit();
      }, 0);
    },
    [handleSubmit]
  );

  return (
    <div className="flex h-screen flex-col">
      {/* 配置栏 */}
      <header className="flex h-16 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回
          </Button>
          <h1 className="text-xl font-semibold">百科绘本</h1>
        </div>
        <Button variant="outline" size="sm" onClick={onConfigClick}>
          <Settings className="mr-2 h-4 w-4" />
          配置
        </Button>
      </header>

      {/* 主聊天区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 历史记录面板（可选，暂时隐藏） */}
        <div className="hidden w-64 border-r border-border">
          {/* 历史记录 */}
        </div>

        {/* 聊天内容 + 待办面板 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 待办进度 */}
          <div className="px-6 pt-4">
            <TodoPanel todos={todos} />
            <div className="text-xs text-muted-foreground mt-1">Debug: todos.length = {todos.length}</div>
          </div>

          <div
            className="flex-1 overflow-y-auto p-6 space-y-4"
            ref={messagesEndRef}
          >
            {showWelcome && messages.length === 0 && (
              <WelcomeMessage />
            )}
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="h-2 w-2 bg-current rounded-full animate-pulse" />
                <span>AI 正在思考...</span>
              </div>
            )}
          </div>

          {/* 快捷选项 */}
          {showWelcome && messages.length === 0 && (
            <div className="px-6 pb-2">
              <QuickOptions onOptionClick={handleQuickOptionClick} />
            </div>
          )}

          {/* 输入框 */}
          <div className="border-t border-border p-4">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isLoading ? '正在处理...' : '输入消息...'}
                className="min-h-[60px] max-h-[200px] resize-none"
                disabled={isLoading}
              />
              <Button
                type={isLoading ? 'button' : 'submit'}
                variant={isLoading ? 'destructive' : 'default'}
                onClick={isLoading ? stopStream : handleSubmit}
                disabled={!isLoading && !input.trim()}
                className="self-end"
              >
                {isLoading ? (
                  <>
                    <Square className="h-4 w-4" />
                    停止
                  </>
                ) : (
                  <>


                    <ArrowUp className="h-4 w-4" />
                    发送
                  </>
                )}
              </Button>
            </form>
          </div>

        </div>
                          {/* 工作区面板 */}
        {showWorkspace && <WorkspacePanel sessionId={currentSessionId} lastArtifactTime={lastArtifactTime} />}
      </div>
    </div>
  );
}
