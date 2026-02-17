import { CheckCircle2, Clock3, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { useState, memo } from 'react';
import type { TodoItem } from '@/types/types';
import ArtifactViewer from './ArtifactViewer';

interface TodoPanelProps {
  todos: TodoItem[];
}

function statusIcon(status: TodoItem['status']) {
  if (status === 'completed') {
    return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />;
  }
  if (status === 'in_progress') {
    return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />;
  }
  return <Clock3 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
}

function statusLabel(status: TodoItem['status']) {
  if (status === 'completed') return '已完成';
  if (status === 'in_progress') return '进行中';
  return '待处理';
}

function statusBadgeClass(status: TodoItem['status']) {
  if (status === 'completed') return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
  if (status === 'in_progress') return 'bg-primary/15 text-primary';
  return 'bg-muted text-muted-foreground';
}

function TodoPanelInner({ todos }: TodoPanelProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const total = todos.length;
  const completed = todos.filter((t) => t.status === 'completed').length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const hasArtifacts = (todo: TodoItem) => {
    return todo.artifacts && (
      (todo.artifacts.images && todo.artifacts.images.length > 0) ||
      (todo.artifacts.audio && todo.artifacts.audio.length > 0) ||
      todo.artifacts.llmOutput
    );
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between text-xs font-medium text-foreground">
        <span>任务进度</span>
        <span className="text-muted-foreground tabular-nums">{completed}/{total} · {percent}%</span>
      </div>
      {total === 0 ? (
        <div className="text-xs text-muted-foreground py-1">暂无待办，输入消息后查看进度。</div>
      ) : (
        <div className="flex flex-col gap-1 max-h-[360px] overflow-auto pr-0.5">
          {todos.map((todo, index) => {
            const todoId = todo.id || `todo-${index}`;
            const isExpanded = expandedIds.has(todoId);
            const showArtifacts = hasArtifacts(todo);

            return (
              <div
                key={todoId}
                className="rounded-lg border border-border/80 bg-card overflow-hidden"
              >
                <div
                  className={`flex items-center gap-2 px-2.5 py-1.5 min-h-0 ${showArtifacts ? 'cursor-pointer hover:bg-muted/50' : ''}`}
                  onClick={() => showArtifacts && toggleExpanded(todoId)}
                >
                  {statusIcon(todo.status)}
                  <span className="flex-1 text-xs text-foreground truncate min-w-0" title={todo.content}>
                    {todo.content}
                  </span>
                  <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${statusBadgeClass(todo.status)}`}>
                    {statusLabel(todo.status)}
                  </span>
                  {showArtifacts && (
                    isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                    )
                  )}
                </div>
                {isExpanded && showArtifacts && (
                  <div className="px-2.5 py-2 border-t border-border/50 bg-muted/20">
                    <ArtifactViewer artifacts={todo.artifacts} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// 仅当 todos 引用变化时重渲染，避免 ChatProvider 其它 state（messages、isLoading 等）更新时重复渲染
export default memo(TodoPanelInner);
