import { CheckCircle2, Clock3, Loader2 } from 'lucide-react';
import type { TodoItem } from '@/types/types';

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
  const total = todos.length;
  const completed = todos.filter((t) => t.status === 'completed').length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  console.log('[TodoPanel] rendering with todos:', todos.length, 'items:', todos);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between text-sm font-medium text-foreground">
        <span>任务进度</span>
        <span className="text-muted-foreground">{completed}/{total} · {percent}%</span>
      </div>
      {total === 0 ? (
        <div className="text-sm text-muted-foreground">暂无待办，输入消息后查看进度。</div>
      ) : (
        <div className="flex flex-col gap-2 max-h-48 overflow-auto pr-1">
          {todos.map((todo) => (
            <div
              key={todo.content}
              className="flex items-start gap-2 rounded-md bg-background/60 px-2 py-1.5 shadow-sm"
            >
              <div className="mt-0.5">{statusIcon(todo.status)}</div>
              <div className="flex-1 text-sm leading-tight text-foreground">
                <div>{todo.content}</div>
                <div className="text-xs text-muted-foreground mt-1">{statusLabel(todo.status)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
