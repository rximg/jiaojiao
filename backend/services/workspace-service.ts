/**
 * Workspace Service - WorkspaceFilesystem 增强版
 * 添加资源配额、权限检查、监控功能
 */

import type { WorkspaceFilesystem } from './fs.js';
import type { LogManager } from './log-manager.js';
import {
  isPathAllowed,
  isExtensionAllowed,
  isFileSizeAllowed,
  isTotalSizeAllowed,
  isFileCountAllowed,
  type WorkspaceConfig,
  DEFAULT_WORKSPACE_CONFIG,
} from '../config/workspace-config.js';

export interface WorkspaceStats {
  sessionId: string;
  totalSize: number;
  fileCount: number;
  directoryCount: number;
  lastUpdated: string;
}

export interface WorkspaceQuota {
  maxFileSize: number;
  maxTotalSize: number;
  maxFileCount: number;
  currentSize: number;
  currentFileCount: number;
  usagePercentage: number;
}

export interface WorkspaceOperation {
  operationId: string;
  sessionId: string;
  type: 'read' | 'write' | 'delete' | 'list';
  path: string;
  timestamp: string;
  duration: number;
  success: boolean;
  error?: string;
  size?: number;
}

/**
 * WorkspaceService - WorkspaceFilesystem 的增强包装器
 */
export class WorkspaceService {
  private stats = new Map<string, WorkspaceStats>();
  private operations: WorkspaceOperation[] = [];
  private config: WorkspaceConfig;
  
  constructor(
    private workspaceFs: WorkspaceFilesystem,
    private logManager?: LogManager,
    config?: Partial<WorkspaceConfig>
  ) {
    this.config = { ...DEFAULT_WORKSPACE_CONFIG, ...config };
  }
  
  /**
   * 检查路径权限
   */
  private checkPathPermission(sessionId: string, relativePath: string, operation: 'read' | 'write' | 'delete'): void {
    // 检查路径是否允许
    if (!isPathAllowed(relativePath, this.config)) {
      throw new Error(`Path not allowed: ${relativePath}`);
    }
    
    // 检查操作权限
    const { permissions } = this.config;
    if (operation === 'read' && !permissions.canRead) {
      throw new Error('Read permission denied');
    }
    if (operation === 'write' && !permissions.canWrite) {
      throw new Error('Write permission denied');
    }
    if (operation === 'delete' && !permissions.canDelete) {
      throw new Error('Delete permission denied');
    }
    
    // 检查文件扩展名（仅写入操作）
    if (operation === 'write' && !isExtensionAllowed(relativePath, this.config)) {
      throw new Error(`File extension not allowed: ${relativePath}`);
    }
  }
  
  /**
   * 检查配额
   */
  private async checkQuota(sessionId: string, additionalSize: number = 0): Promise<void> {
    const stats = await this.getStats(sessionId);
    
    // 检查文件数量
    if (!isFileCountAllowed(stats.fileCount + 1, this.config)) {
      throw new Error(`File count quota exceeded: ${stats.fileCount}/${this.config.quotas.maxFileCount}`);
    }
    
    // 检查总大小
    const newTotalSize = stats.totalSize + additionalSize;
    if (!isTotalSizeAllowed(newTotalSize, this.config)) {
      throw new Error(`Total size quota exceeded: ${newTotalSize}/${this.config.quotas.maxTotalSize}`);
    }
    
    // 检查单文件大小
    if (additionalSize > 0 && !isFileSizeAllowed(additionalSize, this.config)) {
      throw new Error(`File size exceeds limit: ${additionalSize}/${this.config.quotas.maxFileSize}`);
    }
  }
  
  /**
   * 记录操作
   */
  private async recordOperation(operation: WorkspaceOperation): Promise<void> {
    this.operations.push(operation);
    
    // 只保留最近 1000 条操作记录
    if (this.operations.length > 1000) {
      this.operations = this.operations.slice(-1000);
    }
    
    // 记录到日志
    if (this.logManager) {
      await this.logManager.logAudit(operation.sessionId, {
        action: `workspace.${operation.type}`,
        path: operation.path,
        duration: operation.duration,
        success: operation.success,
        error: operation.error,
        size: operation.size,
      });
    }
  }
  
  /**
   * 增强的写入文件
   */
  async writeFile(
    sessionId: string,
    relativePath: string,
    content: string | Buffer,
    encoding?: BufferEncoding
  ): Promise<string> {
    const startTime = Date.now();
    const operationId = `write-${Date.now()}`;
    
    try {
      // 检查权限
      this.checkPathPermission(sessionId, relativePath, 'write');
      
      // 计算文件大小
      const size = Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content, encoding);
      
      // 检查配额
      await this.checkQuota(sessionId, size);
      
      // 执行写入
      const result = await this.workspaceFs.writeFile(sessionId, relativePath, content, encoding);
      
      // 更新统计
      await this.updateStats(sessionId);
      
      // 记录操作
      await this.recordOperation({
        operationId,
        sessionId,
        type: 'write',
        path: relativePath,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        success: true,
        size,
      });
      
      return result;
    } catch (error) {
      // 记录失败操作
      await this.recordOperation({
        operationId,
        sessionId,
        type: 'write',
        path: relativePath,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      
      throw error;
    }
  }
  
  /**
   * 增强的读取文件
   */
  async readFile(
    sessionId: string,
    relativePath: string,
    encoding?: BufferEncoding
  ): Promise<string | Buffer> {
    const startTime = Date.now();
    const operationId = `read-${Date.now()}`;
    
    try {
      // 检查权限
      this.checkPathPermission(sessionId, relativePath, 'read');
      
      // 执行读取
      const result = await this.workspaceFs.readFile(sessionId, relativePath, encoding);
      
      // 记录操作
      await this.recordOperation({
        operationId,
        sessionId,
        type: 'read',
        path: relativePath,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        success: true,
      });
      
      return result;
    } catch (error) {
      // 记录失败操作
      await this.recordOperation({
        operationId,
        sessionId,
        type: 'read',
        path: relativePath,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      
      throw error;
    }
  }
  
  /**
   * 增强的删除
   */
  async rm(sessionId: string, relativePath: string): Promise<void> {
    const startTime = Date.now();
    const operationId = `delete-${Date.now()}`;
    
    try {
      // 检查权限
      this.checkPathPermission(sessionId, relativePath, 'delete');
      
      // 执行删除
      await this.workspaceFs.rm(sessionId, relativePath);
      
      // 更新统计
      await this.updateStats(sessionId);
      
      // 记录操作
      await this.recordOperation({
        operationId,
        sessionId,
        type: 'delete',
        path: relativePath,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        success: true,
      });
    } catch (error) {
      // 记录失败操作
      await this.recordOperation({
        operationId,
        sessionId,
        type: 'delete',
        path: relativePath,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      
      throw error;
    }
  }
  
  /**
   * 增强的列表
   */
  async ls(sessionId: string, relativePath: string = '.'): Promise<Array<{ name: string; isDir: boolean }>> {
    const startTime = Date.now();
    const operationId = `list-${Date.now()}`;
    
    try {
      // 检查权限
      this.checkPathPermission(sessionId, relativePath, 'read');
      
      // 执行列表
      const result = await this.workspaceFs.ls(sessionId, relativePath);
      
      // 记录操作
      await this.recordOperation({
        operationId,
        sessionId,
        type: 'list',
        path: relativePath,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        success: true,
      });
      
      return result;
    } catch (error) {
      // 记录失败操作
      await this.recordOperation({
        operationId,
        sessionId,
        type: 'list',
        path: relativePath,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      
      throw error;
    }
  }
  
  /**
   * 获取工作空间统计
   */
  async getStats(sessionId: string): Promise<WorkspaceStats> {
    // 从缓存获取
    if (this.stats.has(sessionId)) {
      const cached = this.stats.get(sessionId)!;
      // 如果缓存不超过 5 分钟，直接返回
      if (Date.now() - new Date(cached.lastUpdated).getTime() < 5 * 60 * 1000) {
        return cached;
      }
    }
    
    // 重新计算
    return this.updateStats(sessionId);
  }
  
  /**
   * 更新统计信息
   */
  private async updateStats(sessionId: string): Promise<WorkspaceStats> {
    let totalSize = 0;
    let fileCount = 0;
    let directoryCount = 0;
    
    // 递归计算
    const calculate = async (relativePath: string = '.'): Promise<void> => {
      try {
        const entries = await this.workspaceFs.ls(sessionId, relativePath);
        
        for (const entry of entries) {
          const entryPath = relativePath === '.' ? entry.name : `${relativePath}/${entry.name}`;
          
          if (entry.isDir) {
            directoryCount++;
            await calculate(entryPath);
          } else {
            fileCount++;
            try {
              const content = await this.workspaceFs.readFile(sessionId, entryPath);
              totalSize += Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content);
            } catch {
              // 忽略无法读取的文件
            }
          }
        }
      } catch {
        // 忽略错误
      }
    };
    
    await calculate();
    
    const stats: WorkspaceStats = {
      sessionId,
      totalSize,
      fileCount,
      directoryCount,
      lastUpdated: new Date().toISOString(),
    };
    
    this.stats.set(sessionId, stats);
    return stats;
  }
  
  /**
   * 获取配额信息
   */
  async getQuota(sessionId: string): Promise<WorkspaceQuota> {
    const stats = await this.getStats(sessionId);
    
    return {
      maxFileSize: this.config.quotas.maxFileSize,
      maxTotalSize: this.config.quotas.maxTotalSize,
      maxFileCount: this.config.quotas.maxFileCount,
      currentSize: stats.totalSize,
      currentFileCount: stats.fileCount,
      usagePercentage: (stats.totalSize / this.config.quotas.maxTotalSize) * 100,
    };
  }
  
  /**
   * 获取最近操作
   */
  getRecentOperations(sessionId: string, limit: number = 50): WorkspaceOperation[] {
    return this.operations
      .filter(op => op.sessionId === sessionId)
      .slice(-limit);
  }
  
  /**
   * 清除统计缓存
   */
  clearStatsCache(sessionId?: string): void {
    if (sessionId) {
      this.stats.delete(sessionId);
    } else {
      this.stats.clear();
    }
  }
  
  /**
   * 导出统计报告
   */
  async exportStats(sessionId: string): Promise<string> {
    const stats = await this.getStats(sessionId);
    const quota = await this.getQuota(sessionId);
    const recentOps = this.getRecentOperations(sessionId, 100);
    
    return JSON.stringify({
      stats,
      quota,
      recentOperations: recentOps,
      exportedAt: new Date().toISOString(),
    }, null, 2);
  }
}
