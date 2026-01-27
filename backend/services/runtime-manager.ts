/**
 * Runtime Manager - 统一的 Agent 运行时管理
 * 集成所有核心服务并关联到 sessionId
 */

import type { WorkspaceFilesystem } from './fs.js';
import type { PersistenceService } from './persistence-service.js';
import type { LogManager } from './log-manager.js';
import { HITLService } from './hitl-service.js';

export interface AgentRuntime {
  sessionId: string;
  workspaceService: WorkspaceFilesystem;
  persistenceService: PersistenceService;
  logManager: LogManager;
  hitlService: HITLService;  // 新增
  
  // 新增功能
  auditService?: any;  // 后续 Phase 4 实现
  
  // 元数据
  metadata: {
    createdAt: string;
    lastActiveAt: string;
    totalTokens: number;
    totalRequests: number;
  };
}

/**
 * 运行时管理器
 */
export class RuntimeManager {
  private runtimes = new Map<string, AgentRuntime>();
  
  constructor(
    private workspaceService: WorkspaceFilesystem,
    private persistenceService: PersistenceService,
    private logManager: LogManager
  ) {}
  
  /**
   * 创建或获取 Agent 运行时
   * 统一入口点，关联所有服务到 sessionId
   */
  async createAgentRuntime(sessionId: string): Promise<AgentRuntime> {
    // 如果已存在，更新活跃时间并返回
    if (this.runtimes.has(sessionId)) {
      const runtime = this.runtimes.get(sessionId)!;
      runtime.metadata.lastActiveAt = new Date().toISOString();
      return runtime;
    }
    
    // 创建新运行时
    const runtime: AgentRuntime = {
      sessionId,
      workspaceService: this.workspaceService,
      persistenceService: this.persistenceService,
      logManager: this.logManager,
      hitlService: new HITLService(sessionId, this.logManager),  // 新增
      
      metadata: {
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        totalTokens: 0,
        totalRequests: 0,
      },
    };
    
    this.runtimes.set(sessionId, runtime);
    
    // 记录系统日志
    await this.logManager.logSystem('info', 'Agent runtime created', { sessionId });
    
    return runtime;
  }
  
  /**
   * 获取运行时
   */
  getRuntime(sessionId: string): AgentRuntime | undefined {
    return this.runtimes.get(sessionId);
  }
  
  /**
   * 检查运行时是否存在
   */
  hasRuntime(sessionId: string): boolean {
    return this.runtimes.has(sessionId);
  }
  
  /**
   * 更新运行时元数据
   */
  async updateRuntimeMetadata(
    sessionId: string,
    updates: Partial<AgentRuntime['metadata']>
  ): Promise<void> {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) {
      throw new Error(`Runtime not found: ${sessionId}`);
    }
    
    Object.assign(runtime.metadata, updates);
    runtime.metadata.lastActiveAt = new Date().toISOString();
  }
  
  /**
   * 增加 token 计数
   */
  async incrementTokens(sessionId: string, tokens: number): Promise<void> {
    const runtime = this.runtimes.get(sessionId);
    if (runtime) {
      runtime.metadata.totalTokens += tokens;
      runtime.metadata.totalRequests += 1;
    }
  }
  
  /**
   * 关闭指定运行时
   */
  async closeRuntime(sessionId: string): Promise<void> {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) return;
    
    // 清理资源
    await this.persistenceService.closeCheckpointer(sessionId);
    
    this.runtimes.delete(sessionId);
    
    await this.logManager.logSystem('info', 'Agent runtime closed', { sessionId });
  }
  
  /**
   * 关闭所有运行时
   */
  async closeAllRuntimes(): Promise<void> {
    const sessionIds = Array.from(this.runtimes.keys());
    
    await Promise.all(
      sessionIds.map(id => this.closeRuntime(id))
    );
    
    await this.logManager.logSystem('info', 'All agent runtimes closed');
  }
  
  /**
   * 获取所有活跃的运行时
   */
  getActiveRuntimes(): AgentRuntime[] {
    return Array.from(this.runtimes.values());
  }
  
  /**
   * 获取运行时统计信息
   */
  getRuntimeStats(sessionId: string): AgentRuntime['metadata'] | null {
    const runtime = this.runtimes.get(sessionId);
    return runtime ? runtime.metadata : null;
  }
  
  /**
   * 清理不活跃的运行时
   * @param inactiveMinutes 不活跃时间阈值（分钟）
   */
  async cleanupInactiveRuntimes(inactiveMinutes: number = 30): Promise<void> {
    const now = new Date();
    const threshold = new Date(now.getTime() - inactiveMinutes * 60 * 1000);
    
    const toClose: string[] = [];
    
    for (const [sessionId, runtime] of this.runtimes.entries()) {
      const lastActive = new Date(runtime.metadata.lastActiveAt);
      if (lastActive < threshold) {
        toClose.push(sessionId);
      }
    }
    
    await Promise.all(toClose.map(id => this.closeRuntime(id)));
    
    if (toClose.length > 0) {
      await this.logManager.logSystem('info', `Cleaned up ${toClose.length} inactive runtimes`);
    }
  }
}

// 单例实例
let runtimeManagerInstance: RuntimeManager | null = null;

/**
 * 初始化 RuntimeManager 单例
 */
export function initRuntimeManager(
  workspaceService: WorkspaceFilesystem,
  persistenceService: PersistenceService,
  logManager: LogManager
): RuntimeManager {
  if (!runtimeManagerInstance) {
    runtimeManagerInstance = new RuntimeManager(
      workspaceService,
      persistenceService,
      logManager
    );
  }
  return runtimeManagerInstance;
}

/**
 * 获取 RuntimeManager 单例
 */
export function getRuntimeManager(): RuntimeManager {
  if (!runtimeManagerInstance) {
    throw new Error('RuntimeManager not initialized. Call initRuntimeManager first.');
  }
  return runtimeManagerInstance;
}

/**
 * createAgentRuntime 便捷函数
 */
export async function createAgentRuntime(sessionId: string): Promise<AgentRuntime> {
  const manager = getRuntimeManager();
  return manager.createAgentRuntime(sessionId);
}
