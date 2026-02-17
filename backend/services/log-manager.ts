/**
 * Log Manager - 统一日志管理
 * 将所有日志从 outputs/workspaces/{sessionId}/llm_logs 迁移到统一的 logs/ 目录
 */

import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export type LogType = 'audit' | 'hitl' | 'system';

/**
 * 统一日志管理器
 */
export class LogManager {
  private logRoot: string;
  
  constructor(logRoot?: string) {
    this.logRoot = logRoot || path.join(process.cwd(), 'logs');
  }
  
  /**
   * 确保日志目录存在
   */
  private async ensureLogDir(type: LogType, date?: string): Promise<string> {
    const dateStr = date || new Date().toISOString().split('T')[0];
    let dirPath: string;
    
    if (type === 'system') {
      dirPath = path.join(this.logRoot, 'system');
    } else {
      dirPath = path.join(this.logRoot, type, dateStr);
    }
    
    await fs.mkdir(dirPath, { recursive: true });
    return dirPath;
  }
  
  /**
   * 记录审计日志
   */
  async logAudit(sessionId: string, entry: any): Promise<void> {
    try {
      const dirPath = await this.ensureLogDir('audit');
      const logFile = path.join(dirPath, `${sessionId}_audit.jsonl`);
      
      const logEntry = {
        ...entry,
        logId: randomUUID(),
        timestamp: new Date().toISOString(),
      };
      
      const logLine = JSON.stringify(logEntry) + '\n';
      await fs.appendFile(logFile, logLine, 'utf-8');
    } catch (error) {
      console.error('[LogManager] Failed to log audit:', error);
    }
  }
  
  /**
   * 记录 HITL 日志
   */
  async logHITL(sessionId: string, request: any): Promise<void> {
    try {
      const dirPath = await this.ensureLogDir('hitl');
      const logFile = path.join(dirPath, `${sessionId}_hitl.jsonl`);
      
      const logLine = JSON.stringify(request) + '\n';
      await fs.appendFile(logFile, logLine, 'utf-8');
    } catch (error) {
      console.error('[LogManager] Failed to log HITL:', error);
    }
  }
  
  /**
   * 记录系统日志
   */
  async logSystem(level: LogLevel, message: string, meta?: Record<string, any>): Promise<void> {
    try {
      const dirPath = await this.ensureLogDir('system');
      const logFile = path.join(dirPath, level === 'error' ? 'error.log' : 'app.log');
      
      const logEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...meta,
      };
      
      const logLine = JSON.stringify(logEntry) + '\n';
      await fs.appendFile(logFile, logLine, 'utf-8');
      
      // warn/error 输出到控制台；info/debug 仅写文件，减少刷屏
      const consoleMsg = `[${level.toUpperCase()}] ${message}`;
      if (level === 'error') {
        console.error(consoleMsg, meta);
      } else if (level === 'warn') {
        console.warn(consoleMsg, meta);
      }
    } catch (error) {
      console.error('[LogManager] Failed to log system:', error);
    }
  }
  
  /**
   * 清理旧日志
   */
  async cleanupOldLogs(daysToKeep: number = 30): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      const types: LogType[] = ['audit', 'hitl'];
      let removedCount = 0;
      
      for (const type of types) {
        const typeDir = path.join(this.logRoot, type);
        
        try {
          const dates = await fs.readdir(typeDir);
          
          for (const dateStr of dates) {
            const dirDate = new Date(dateStr);
            if (dirDate < cutoffDate) {
              const dirPath = path.join(typeDir, dateStr);
              await fs.rm(dirPath, { recursive: true, force: true });
              removedCount++;
            }
          }
        } catch {
          // 目录不存在，跳过
        }
      }
      
      if (removedCount > 0) {
        await this.logSystem('info', `[LogManager] Cleaned up ${removedCount} old log directories`);
      }
    } catch (error) {
      console.error('[LogManager] Failed to cleanup old logs:', error);
    }
  }
}

// 单例实例
let logManagerInstance: LogManager | null = null;
/** 由主进程在启动时设置（如打包后设为 exe 目录），与 electron/logger 同一根目录便于用户查看 */
let defaultLogRoot: string | null = null;

/**
 * 设置日志根目录（主进程在 app.whenReady 时调用，打包后传 exe 同目录）
 */
export function setDefaultLogRoot(root: string): void {
  defaultLogRoot = root;
}

/**
 * 获取 LogManager 单例
 */
export function getLogManager(): LogManager {
  if (!logManagerInstance) {
    logManagerInstance = new LogManager(defaultLogRoot ?? undefined);
  }
  return logManagerInstance;
}
