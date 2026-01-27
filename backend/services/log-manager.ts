/**
 * Log Manager - 统一日志管理
 * 将所有日志从 outputs/workspaces/{sessionId}/llm_logs 迁移到统一的 logs/ 目录
 */

import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export type LogType = 'llm' | 'audit' | 'hitl' | 'system';

export interface LLMCallData {
  model: string;
  prompt: string;
  response: string;
  tokens: number;
  duration: number;
  timestamp: string;
  error?: string;
}

export interface LogFilter {
  startDate?: string;
  endDate?: string;
  level?: LogLevel;
  search?: string;
}

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
   * 记录 LLM 调用日志
   */
  async logLLMCall(sessionId: string, data: LLMCallData): Promise<void> {
    try {
      const dirPath = await this.ensureLogDir('llm');
      const logFile = path.join(dirPath, `${sessionId}_llm.log`);
      
      const logEntry = {
        timestamp: data.timestamp || new Date().toISOString(),
        sessionId,
        model: data.model,
        tokens: data.tokens,
        duration: data.duration,
        prompt: data.prompt.substring(0, 500), // 截断过长内容
        response: data.response.substring(0, 500),
        error: data.error,
      };
      
      const logLine = JSON.stringify(logEntry) + '\n';
      await fs.appendFile(logFile, logLine, 'utf-8');
    } catch (error) {
      console.error('[LogManager] Failed to log LLM call:', error);
    }
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
      
      // 同时输出到控制台
      const consoleMsg = `[${level.toUpperCase()}] ${message}`;
      if (level === 'error') {
        console.error(consoleMsg, meta);
      } else if (level === 'warn') {
        console.warn(consoleMsg, meta);
      } else {
        console.log(consoleMsg, meta);
      }
    } catch (error) {
      console.error('[LogManager] Failed to log system:', error);
    }
  }
  
  /**
   * 查询日志
   */
  async queryLogs(
    sessionId: string,
    type: LogType,
    filter?: LogFilter
  ): Promise<any[]> {
    try {
      const results: any[] = [];
      
      // 确定搜索范围
      const startDate = filter?.startDate || new Date().toISOString().split('T')[0];
      const endDate = filter?.endDate || startDate;
      
      // 读取日期范围内的日志文件
      const dates = this.getDateRange(startDate, endDate);
      
      for (const date of dates) {
        const dirPath = await this.ensureLogDir(type, date);
        const logFile = path.join(
          dirPath,
          type === 'system' ? 'app.log' : `${sessionId}_${type}.${type === 'llm' ? 'log' : 'jsonl'}`
        );
        
        try {
          const content = await fs.readFile(logFile, 'utf-8');
          const lines = content.split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              
              // 应用过滤器
              if (filter?.level && entry.level !== filter.level) continue;
              if (filter?.search && !JSON.stringify(entry).includes(filter.search)) continue;
              
              results.push(entry);
            } catch {
              // 跳过无法解析的行
            }
          }
        } catch {
          // 文件不存在，跳过
        }
      }
      
      return results;
    } catch (error) {
      console.error('[LogManager] Failed to query logs:', error);
      return [];
    }
  }
  
  /**
   * 导出日志
   */
  async exportLogs(
    sessionId: string,
    type: LogType,
    format: 'json' | 'csv'
  ): Promise<string> {
    const logs = await this.queryLogs(sessionId, type);
    
    if (format === 'json') {
      return JSON.stringify(logs, null, 2);
    } else {
      // CSV 格式
      if (logs.length === 0) return '';
      
      const headers = Object.keys(logs[0]);
      const csvLines = [
        headers.join(','),
        ...logs.map(log => 
          headers.map(h => JSON.stringify(log[h] || '')).join(',')
        )
      ];
      
      return csvLines.join('\n');
    }
  }
  
  /**
   * 清理旧日志
   */
  async cleanupOldLogs(daysToKeep: number = 30): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      const types: LogType[] = ['llm', 'audit', 'hitl'];
      
      for (const type of types) {
        const typeDir = path.join(this.logRoot, type);
        
        try {
          const dates = await fs.readdir(typeDir);
          
          for (const dateStr of dates) {
            const dirDate = new Date(dateStr);
            if (dirDate < cutoffDate) {
              const dirPath = path.join(typeDir, dateStr);
              await fs.rm(dirPath, { recursive: true, force: true });
              console.log(`[LogManager] Cleaned up old logs: ${dirPath}`);
            }
          }
        } catch {
          // 目录不存在，跳过
        }
      }
    } catch (error) {
      console.error('[LogManager] Failed to cleanup old logs:', error);
    }
  }
  
  /**
   * 获取日期范围
   */
  private getDateRange(start: string, end: string): string[] {
    const dates: string[] = [];
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    let current = new Date(startDate);
    while (current <= endDate) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }
    
    return dates;
  }
}

// 单例实例
let logManagerInstance: LogManager | null = null;

/**
 * 获取 LogManager 单例
 */
export function getLogManager(): LogManager {
  if (!logManagerInstance) {
    logManagerInstance = new LogManager();
  }
  return logManagerInstance;
}
