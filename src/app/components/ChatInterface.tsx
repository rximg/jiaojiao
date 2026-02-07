import { useState, useRef, useCallback, FormEvent, useEffect } from 'react';
import { ArrowUp, Square, Settings, ArrowLeft, RefreshCw } from 'lucide-react';
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
  const { messages, todos, isLoading, sendMessage, stopStream, currentSessionId, createNewSession, loadSession, resetSession, lastArtifactTime } = useChat();
  const [showWelcome, setShowWelcome] = useState(true);
  const [showWorkspace] = useState(true);
  const isCreatingSessionRef = useRef(false);
  /** 本次「案例」模式下是否已执行过创建新 session，避免重复创建 */
  const createdForNullRef = useRef(false);

  // 加载或创建会话
  useEffect(() => {
    if (isCreatingSessionRef.current) {
      console.log('[ChatInterface] Already creating session, skipping...');
      return;
    }

    if (loadSessionId) {
      // 点击历史记录：加载指定的 session
      createdForNullRef.current = false;
      console.log('[ChatInterface] Loading session:', loadSessionId);
      loadSession(loadSessionId).catch(console.error);
      setShowWelcome(false);
    } else {
      // loadSessionId === null：点击案例或从欢迎页进入，一律重置并创建新 session
      if (createdForNullRef.current) {
        return;
      }
      console.log('[ChatInterface] Creating new session (case clicked or first load)');
      createdForNullRef.current = true;
      isCreatingSessionRef.current = true;
      resetSession();
      createNewSession('新对话')
        .then(() => {
          isCreatingSessionRef.current = false;
        })
        .catch((err) => {
          isCreatingSessionRef.current = false;
          createdForNullRef.current = false; // 失败后允许重试
          console.error('Failed to create session:', err);
        });
      // 不在这里 setShowWelcome(false)，保留快捷选项，等用户发消息后再隐藏
    }
  }, [loadSessionId, createNewSession, loadSession, resetSession]);

  const handleSubmit = useCallback(
    async (e?: FormEvent) => {
      if (e) {
        e.preventDefault();
      }
      const messageText = input.trim();
      if (!messageText || isLoading) return;
      // 无 session 时回退到欢迎页，让用户点击案例或历史记录
      if (!currentSessionId) {
        onBack();
        return;
      }

      setShowWelcome(false);
      await sendMessage(messageText);
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    },
    [input, isLoading, currentSessionId, sendMessage, onBack]
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
      // 无 session 时回退到欢迎页
      if (!currentSessionId) {
        onBack();
        return;
      }
      // 快捷选项只复用当前 session 发一条消息
      setInput(option);
      setShowWelcome(false);
      setTimeout(() => handleSubmit(), 0);
    },
    [currentSessionId, handleSubmit, onBack]
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
          <Button variant="outline" size="sm" onClick={onConfigClick}>
            <Settings className="mr-2 h-4 w-4" />
            配置
          </Button>
        </div>
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
