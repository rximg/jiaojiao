import React, { useState, useRef, useCallback, FormEvent, useEffect } from 'react';
import { ArrowUp, Square, Settings, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import ChatMessage from './ChatMessage';
import WelcomeMessage from './WelcomeMessage';
import QuickOptions from './QuickOptions';
import HitlConfirmBlock from './HitlConfirmBlock';
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

  /** 单行高度，多行时随内容扩展（不超过 max） */
  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 52), 200)}px`;
  }, []);
  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);
  const { messages, todos, isLoading, sendMessage, stopStream, currentSessionId, createNewSession, loadSession, resetSession, lastArtifactTime, pendingHitlRequest, respondConfirm } = useChat();
  const waitingForConfirmation = Boolean(pendingHitlRequest);
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
      // 若有待确认的 HITL，发送 = 新消息：先取消确认再发送
      if (pendingHitlRequest) {
        await respondConfirm(pendingHitlRequest.requestId, false);
        if (!messageText) return;
        if (!currentSessionId) {
          onBack();
          return;
        }
        setShowWelcome(false);
        await sendMessage(messageText);
        setInput('');
        if (textareaRef.current) textareaRef.current.focus();
        return;
      }
      if (!messageText || isLoading) return;
      if (!currentSessionId) {
        onBack();
        return;
      }
      setShowWelcome(false);
      await sendMessage(messageText);
      setInput('');
      if (textareaRef.current) textareaRef.current.focus();
    },
    [input, isLoading, currentSessionId, sendMessage, onBack, pendingHitlRequest, respondConfirm]
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
      if (!currentSessionId) {
        onBack();
        return;
      }
      setInput(option);
      setShowWelcome(false);
      setTimeout(() => handleSubmit(), 0);
    },
    [currentSessionId, handleSubmit, onBack]
  );

  const handleHitlContinue = useCallback(
    (editedPayload?: Record<string, unknown>) => {
      if (pendingHitlRequest) {
        respondConfirm(pendingHitlRequest.requestId, true, editedPayload);
      }
    },
    [pendingHitlRequest, respondConfirm]
  );

  const handleHitlCancel = useCallback(
    (cancelReason?: string) => {
      if (pendingHitlRequest) {
        respondConfirm(pendingHitlRequest.requestId, false, undefined, cancelReason);
      }
    },
    [pendingHitlRequest, respondConfirm]
  );

  return (
    <div className="flex h-screen flex-col">
      {/* 配置栏 */}
      <header className="flex h-16 items-center justify-between border-b border-border bg-card/80 px-6 shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回
          </Button>
          <h1 className="text-xl font-semibold text-foreground">百科绘本</h1>
        </div>
        <div className="flex items-center gap-2">
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
          </div>

          <div
            className="flex-1 overflow-y-auto p-6 space-y-4"
            ref={messagesEndRef}
          >
            {showWelcome && messages.length === 0 && (
              <WelcomeMessage />
            )}
            {messages.map((message) => (
              <React.Fragment key={message.id}>
                {message.hitlBlock && !message.content ? (
                  <HitlConfirmBlock request={message.hitlBlock} />
                ) : (
                  <>
                    <ChatMessage message={message} />
                    {message.hitlBlock && <HitlConfirmBlock request={message.hitlBlock} />}
                  </>
                )}
              </React.Fragment>
            ))}
            {pendingHitlRequest && (
              <HitlConfirmBlock
                request={pendingHitlRequest}
                sessionId={currentSessionId}
                onContinue={handleHitlContinue}
                onCancel={handleHitlCancel}
              />
            )}
            {isLoading && !waitingForConfirmation && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="h-2 w-2 bg-current rounded-full animate-pulse" />
                <span>AI 正在思考...</span>
              </div>
            )}
            {waitingForConfirmation && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>等待您确认</span>
              </div>
            )}
          </div>

          {/* 快捷选项：等待确认时显示 [继续][取消]，否则欢迎页显示 config 选项 */}
          {waitingForConfirmation && (
            <div className="px-6 pb-2 flex flex-wrap gap-2">
              <Button variant="default" size="sm" onClick={() => handleHitlContinue()} className="rounded-full">
                继续
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleHitlCancel()} className="rounded-full border-border">
                取消
              </Button>
            </div>
          )}
          {showWelcome && messages.length === 0 && !waitingForConfirmation && (
            <div className="px-6 pb-2">
              <QuickOptions onOptionClick={handleQuickOptionClick} />
            </div>
          )}

          {/* 输入框 */}
          <div className="border-t border-border bg-card/50 p-4">
            <form onSubmit={handleSubmit} className="flex gap-3 items-end">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  waitingForConfirmation
                    ? '输入新消息并发送将取消当前确认并开始新对话'
                    : isLoading
                      ? '正在处理...'
                      : '输入消息...'
                }
                rows={1}
                className="min-h-[52px] max-h-[200px] resize-none overflow-y-auto rounded-xl border-border py-3 leading-normal"
                disabled={isLoading}
              />
              <Button
                type={waitingForConfirmation || !isLoading ? 'submit' : 'button'}
                variant={isLoading && !waitingForConfirmation ? 'destructive' : 'default'}
                onClick={isLoading && !waitingForConfirmation ? stopStream : handleSubmit}
                disabled={!waitingForConfirmation && !isLoading && !input.trim()}
                className="shrink-0 h-[52px] min-h-[52px] px-4 rounded-xl"
              >
                {isLoading && !waitingForConfirmation ? (
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
