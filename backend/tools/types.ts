/**
 * 工具层共享类型：单步/批量抽象
 */

/** 批量工具的单个子任务 */
export interface BatchSubTask {
  /** 子任务序号（1-based） */
  index: number;
  /** 传给单步工具的参数 */
  params: Record<string, unknown>;
  /** 可选的标签（如角色名、分镜页码） */
  label?: string;
}

/** 批量执行进度（后端推送给前端） */
export interface BatchProgress {
  /** 批次标识（与 toolCallId 关联） */
  batchId: string;
  /** 单步工具名（如 generate_image） */
  toolName: string;
  /** 当前完成数 */
  current: number;
  /** 总数 */
  total: number;
  /** 当前子任务状态 */
  currentSubTask?: {
    index: number;
    label?: string;
    status: 'pending' | 'running' | 'completed' | 'error';
    result?: unknown;
    error?: string;
  };
}
