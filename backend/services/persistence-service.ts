/**
 * Persistence Service - 基于文件的 Checkpoint 持久化
 * 简化版：移除 threadId，只使用 sessionId
 */

import { randomUUID } from 'crypto';
import type { WorkspaceFilesystem } from './fs.js';

export interface CheckpointState {
  checkpointId: string;
  sessionId: string;
  timestamp: string;
  
  // Agent 状态
  messages: any[];
  todos: any[];
  context: Record<string, any>;
  
  // 执行状态
  executionStep: number;
  pendingActions?: any[];
  
  // 元数据
  metadata: {
    totalTokens: number;
    model: string;
    recursionDepth: number;
  };
}

export interface CheckpointMetadata {
  checkpointId: string;
  timestamp: string;
  executionStep: number;
  messageCount: number;
}

export interface CleanupOptions {
  keepLatest?: number;
  olderThan?: Date;
}

/**
 * 基于文件的 Checkpoint 管理器
 * 简化为只需要 sessionId（单线程运行）
 */
export class FileBasedCheckpointer {
  private checkpointDir: string;
  private indexPath: string;
  
  constructor(
    private sessionId: string,
    private workspaceService: WorkspaceFilesystem
  ) {
    this.checkpointDir = 'checkpoints';
    this.indexPath = `${this.checkpointDir}/index.json`;
  }
  
  /**
   * 保存 checkpoint 状态
   */
  async save(state: Partial<CheckpointState>): Promise<string> {
    const checkpointId = randomUUID();
    const timestamp = new Date().toISOString();
    
    const fullState: CheckpointState = {
      checkpointId,
      sessionId: this.sessionId,
      timestamp,
      messages: state.messages || [],
      todos: state.todos || [],
      context: state.context || {},
      executionStep: state.executionStep || 0,
      pendingActions: state.pendingActions,
      metadata: state.metadata || {
        totalTokens: 0,
        model: 'unknown',
        recursionDepth: 0,
      },
    };
    
    // 保存状态文件
    const statePath = `${this.checkpointDir}/state_${checkpointId}.json`;
    await this.workspaceService.writeFile(
      this.sessionId,
      statePath,
      JSON.stringify(fullState, null, 2),
      'utf-8'
    );
    
    // 更新最新状态
    const latestPath = `${this.checkpointDir}/state_latest.json`;
    await this.workspaceService.writeFile(
      this.sessionId,
      latestPath,
      JSON.stringify(fullState, null, 2),
      'utf-8'
    );
    
    // 更新索引
    await this.updateIndex({
      checkpointId,
      timestamp,
      executionStep: fullState.executionStep,
      messageCount: fullState.messages.length,
    });
    
    return checkpointId;
  }
  
  /**
   * 加载 checkpoint 状态
   * @param checkpointId 不传则加载最新
   */
  async load(checkpointId?: string): Promise<CheckpointState | null> {
    try {
      let statePath: string;
      
      if (checkpointId) {
        statePath = `${this.checkpointDir}/state_${checkpointId}.json`;
      } else {
        statePath = `${this.checkpointDir}/state_latest.json`;
      }
      
      const content = await this.workspaceService.readFile(
        this.sessionId,
        statePath,
        'utf-8'
      );
      
      return JSON.parse(content as string) as CheckpointState;
    } catch (error) {
      console.error(`[Checkpointer] Failed to load checkpoint:`, error);
      return null;
    }
  }
  
  /**
   * 列出所有 checkpoint
   */
  async list(): Promise<CheckpointMetadata[]> {
    try {
      const content = await this.workspaceService.readFile(
        this.sessionId,
        this.indexPath,
        'utf-8'
      );
      
      const index = JSON.parse(content as string) as { checkpoints: CheckpointMetadata[] };
      return index.checkpoints || [];
    } catch {
      return [];
    }
  }
  
  /**
   * 获取最新 checkpoint
   */
  async getLatest(): Promise<CheckpointState | null> {
    return this.load();
  }
  
  /**
   * 检查 checkpoint 是否存在
   */
  async exists(checkpointId: string): Promise<boolean> {
    try {
      const statePath = `${this.checkpointDir}/state_${checkpointId}.json`;
      await this.workspaceService.readFile(this.sessionId, statePath, 'utf-8');
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * 删除指定 checkpoint
   */
  async delete(checkpointId: string): Promise<void> {
    const statePath = `${this.checkpointDir}/state_${checkpointId}.json`;
    await this.workspaceService.rm(this.sessionId, statePath);
    
    // 从索引中移除
    const checkpoints = await this.list();
    const updated = checkpoints.filter(c => c.checkpointId !== checkpointId);
    await this.saveIndex({ checkpoints: updated });
  }
  
  /**
   * 清空所有 checkpoint
   */
  async clear(): Promise<void> {
    await this.workspaceService.rm(this.sessionId, this.checkpointDir);
  }
  
  /**
   * 清理旧 checkpoint
   */
  async cleanup(options: CleanupOptions = {}): Promise<void> {
    const checkpoints = await this.list();
    
    // 按时间排序（降序）
    checkpoints.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    let toDelete: string[] = [];
    
    // 保留最新 N 个
    if (options.keepLatest !== undefined && options.keepLatest > 0) {
      toDelete = checkpoints.slice(options.keepLatest).map(c => c.checkpointId);
    }
    
    // 删除早于指定时间的
    if (options.olderThan) {
      const threshold = options.olderThan.getTime();
      const oldCheckpoints = checkpoints
        .filter(c => new Date(c.timestamp).getTime() < threshold)
        .map(c => c.checkpointId);
      toDelete = [...new Set([...toDelete, ...oldCheckpoints])];
    }
    
    // 批量删除
    await Promise.all(toDelete.map(id => this.delete(id)));
  }
  
  /**
   * 更新索引
   */
  private async updateIndex(metadata: CheckpointMetadata): Promise<void> {
    const checkpoints = await this.list();
    checkpoints.push(metadata);
    await this.saveIndex({ checkpoints });
  }
  
  /**
   * 保存索引
   */
  private async saveIndex(data: { checkpoints: CheckpointMetadata[] }): Promise<void> {
    await this.workspaceService.writeFile(
      this.sessionId,
      this.indexPath,
      JSON.stringify(data, null, 2),
      'utf-8'
    );
  }
}

/**
 * 持久化服务管理器
 */
export class PersistenceService {
  private checkpointers = new Map<string, FileBasedCheckpointer>();
  
  constructor(private workspaceService: WorkspaceFilesystem) {}
  
  /**
   * 获取或创建 checkpointer（简化为只需 sessionId）
   */
  getCheckpointer(sessionId: string): FileBasedCheckpointer {
    if (!this.checkpointers.has(sessionId)) {
      this.checkpointers.set(
        sessionId,
        new FileBasedCheckpointer(sessionId, this.workspaceService)
      );
    }
    return this.checkpointers.get(sessionId)!;
  }
  
  /**
   * 关闭指定 session 的 checkpointer
   */
  async closeCheckpointer(sessionId: string): Promise<void> {
    this.checkpointers.delete(sessionId);
  }
  
  /**
   * 关闭所有 checkpointer
   */
  async closeAllCheckpointers(): Promise<void> {
    this.checkpointers.clear();
  }
  
  /**
   * 保存消息历史
   */
  async saveMessages(sessionId: string, messages: any[]): Promise<void> {
    await this.workspaceService.writeFile(
      sessionId,
      'meta/messages.json',
      JSON.stringify(messages, null, 2),
      'utf-8'
    );
  }
  
  /**
   * 加载消息历史
   */
  async loadMessages(sessionId: string): Promise<any[]> {
    try {
      const content = await this.workspaceService.readFile(
        sessionId,
        'meta/messages.json',
        'utf-8'
      );
      return JSON.parse(content as string);
    } catch {
      return [];
    }
  }
  
  /**
   * 保存 Todos
   */
  async saveTodos(sessionId: string, todos: any[]): Promise<void> {
    await this.workspaceService.writeFile(
      sessionId,
      'meta/todos.json',
      JSON.stringify(todos, null, 2),
      'utf-8'
    );
  }
  
  /**
   * 加载 Todos
   */
  async loadTodos(sessionId: string): Promise<any[]> {
    try {
      const content = await this.workspaceService.readFile(
        sessionId,
        'meta/todos.json',
        'utf-8'
      );
      return JSON.parse(content as string);
    } catch {
      return [];
    }
  }
}
