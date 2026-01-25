import { CheckCircle2, Clock3, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { TodoItem } from '@/types/types';
import ArtifactViewer from './ArtifactViewer';

interface TodoPanelProps {
  todos: TodoItem[];
}

function statusIcon(status: TodoItem['status']) {
  if (status === 'completed') {
    return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  }
  if (status === 'in_progress') {
    return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
  }
  return <Clock3 className="h-4 w-4 text-muted-foreground" />;
}

function statusLabel(status: TodoItem['status']) {
  if (status === 'completed') return '已完成';
  if (status === 'in_progress') return '进行中';
  return '待处理';
}

export default function TodoPanel({ todos }: TodoPanelProps) {
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

  console.log('[TodoPanel] rendering with todos:', todos.length, 'items:', todos);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between text-sm font-medium text-foreground">
        <span>任务进度</span>
        <span className="text-muted-foreground">{completed}/{total} · {percent}%</span>
      </div>
      {total === 0 ? (
        <div className="text-sm text-muted-foreground">暂无待办，输入消息后查看进度。</div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[480px] overflow-auto pr-1">
          {todos.map((todo, index) => {
            const todoId = todo.id || `todo-${index}`;
            const isExpanded = expandedIds.has(todoId);
            const showArtifacts = hasArtifacts(todo);

            return (
              <div
                key={todoId}
                className="rounded-md bg-card border border-border shadow-sm overflow-hidden"
              >
                <div
                  className={`flex items-start gap-2 px-3 py-2 ${showArtifacts ? 'cursor-pointer hover:bg-muted/50' : ''}`}
                  onClick={() => showArtifacts && toggleExpanded(todoId)}
                >
                  <div className="mt-0.5">{statusIcon(todo.status)}</div>
                  <div className="flex-1 text-sm leading-tight text-foreground">
                    <div>{todo.content}</div>
                    <div className="text-xs text-muted-foreground mt-1">{statusLabel(todo.status)}</div>
                  </div>
                  {showArtifacts && (
                    <div className="mt-0.5">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  )}
                </div>
                {isExpanded && showArtifacts && (
                  <div className="px-3 pb-3 border-t border-border bg-muted/20">
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
