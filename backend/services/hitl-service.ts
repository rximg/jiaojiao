/**
 * HITL Service - Human-in-the-Loop 服务
 * 实现操作确认机制，支持文件、网络、系统操作的人工审批。
 *
 * 超时与恢复：
 * - 后端不做超时：仅等待前端 respond，无定时器、无超时后自动批准。
 * - 取消/超时后：工具抛错，当前 run 结束；同一 session 的 LangGraph checkpoint 仍保留在「执行该工具前」的状态。
 * - 同一会话内再次发消息（或继续）时，会按 thread_id 加载该 checkpoint，从断点继续，会再次进入同一 HITL，用户可点击「继续」通过。
 */

import { randomUUID } from 'crypto';
import { getHITLRule, requiresApproval, getTimeout, type HITLConfig, DEFAULT_HITL_CONFIG } from '../config/hitl-config.js';
import type { LogManager } from './log-manager.js';
import { registerHitlResponseWaiter } from '../../electron/ipc/hitl-response-bridge.js';

export interface HITLRequest {
  requestId: string;
  sessionId: string;
  actionType: string;
  priority: 'high' | 'medium' | 'low';
  payload: Record<string, any>;
  timestamp: string;
  timeout: number;
  status: 'pending' | 'approved' | 'rejected' | 'timeout';
  response?: {
    approved: boolean;
    reason?: string;
    timestamp: string;
  };
}

export interface HITLResponse {
  approved: boolean;
  reason?: string;
  /** 用户编辑后的 payload 覆盖（仅 approved 时有效） */
  payload?: Record<string, unknown>;
}

/**
 * HITL 服务
 */
export class HITLService {
  private pendingRequests = new Map<string, HITLRequest>();
  private config: HITLConfig;
  
  constructor(
    private sessionId: string,
    private logManager?: LogManager,
    config?: Partial<HITLConfig>
  ) {
    this.config = { ...DEFAULT_HITL_CONFIG, ...config };
  }
  
  /**
   * 请求人工确认。调用方必须在收到批准且拿到返回值后，仅使用返回的 merged 执行后续操作，
   * 不得使用原始 payload，以保证所有编辑修改都能正确传入下一步。
   * @returns 批准时返回合并后的 payload（原 payload + response.payload 用户编辑），拒绝（含前端超时取消）返回 null
   */
  async requestApproval(
    actionType: string,
    payload: Record<string, any>
  ): Promise<Record<string, unknown> | null> {
    // 检查是否需要确认
    if (!requiresApproval(actionType, this.config)) {
      return { ...payload };
    }
    
    const rule = getHITLRule(actionType, this.config);
    const priority = rule?.priority || 'medium';
    const timeout = getTimeout(actionType, this.config);
    
    const request: HITLRequest = {
      requestId: randomUUID(),
      sessionId: this.sessionId,
      actionType,
      priority,
      payload,
      timestamp: new Date().toISOString(),
      timeout,
      status: 'pending',
    };
    
    this.pendingRequests.set(request.requestId, request);
    
    // 记录 HITL 日志
    if (this.logManager) {
      await this.logManager.logHITL(this.sessionId, request);
    }
    
    try {
      // 发送确认请求到前端
      const response = await this.sendConfirmationRequest(request);
      
      // 更新请求状态
      request.status = response.approved ? 'approved' : 'rejected';
      request.response = {
        approved: response.approved,
        reason: response.reason,
        timestamp: new Date().toISOString(),
      };
      
      // 记录响应日志
      if (this.logManager) {
        await this.logManager.logHITL(this.sessionId, {
          ...request,
          response: request.response,
        });
      }
      
      if (!response.approved) {
        const reason = response.reason?.trim();
        throw new Error(
          reason
            ? `${actionType} cancelled by user. User modification: ${reason}`
            : `${actionType} cancelled by user`
        );
      }
      const merged = { ...payload, ...(response.payload ?? {}) };
      return merged as Record<string, unknown>;
    } catch (error) {
      // 仅用于发送请求失败等异常；超时由前端控制并会通过 response 返回取消
      request.status = 'rejected';
      if (this.logManager) {
        await this.logManager.logHITL(this.sessionId, {
          ...request,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return null;
    } finally {
      this.pendingRequests.delete(request.requestId);
    }
  }
  
  /**
   * 发送确认请求到前端
   */
  private async sendConfirmationRequest(request: HITLRequest): Promise<HITLResponse> {
    try {
      const { BrowserWindow } = await import('electron');

      const win = BrowserWindow.getAllWindows()[0];
      if (!win) {
        throw new Error('Main window not found');
      }
      
      // 发送确认请求
      win.webContents.send('hitl:confirmRequest', {
        requestId: request.requestId,
        actionType: request.actionType,
        priority: request.priority,
        payload: request.payload,
        timeout: request.timeout,
      });
      
      // 仅等待前端响应，超时由前端倒计时控制并发送取消
      return await new Promise<HITLResponse>((resolve) => {
        registerHitlResponseWaiter(request.requestId, (data) => {
          resolve({
            approved: data.approved,
            reason: data.reason,
            payload: data.payload,
          });
        });
      });
    } catch (error) {
      console.error('[HITLService] Failed to send confirmation request:', error);
      throw error;
    }
  }
  
  /**
   * 获取待处理请求
   */
  getPendingRequests(): HITLRequest[] {
    return Array.from(this.pendingRequests.values());
  }
  
  /**
   * 取消请求
   */
  cancelRequest(requestId: string): void {
    this.pendingRequests.delete(requestId);
  }
  
  /**
   * 清除所有待处理请求
   */
  clearPendingRequests(): void {
    this.pendingRequests.clear();
  }
}

/**
 * 便捷函数：文件删除确认
 */
export async function confirmFileDelete(
  hitlService: HITLService,
  filePath: string
): Promise<boolean> {
  return (await hitlService.requestApproval('file.delete', { filePath })) !== null;
}

/**
 * 便捷函数：文件执行确认
 */
export async function confirmFileExecute(
  hitlService: HITLService,
  filePath: string,
  command: string
): Promise<boolean> {
  return (await hitlService.requestApproval('file.execute', { filePath, command })) !== null;
}

/**
 * 便捷函数：网络请求确认
 */
export async function confirmNetworkRequest(
  hitlService: HITLService,
  url: string,
  method: string
): Promise<boolean> {
  return (await hitlService.requestApproval('network.http', { url, method })) !== null;
}

/**
 * 便捷函数：系统命令确认
 */
export async function confirmSystemCommand(
  hitlService: HITLService,
  command: string,
  args?: string[]
): Promise<boolean> {
  return (await hitlService.requestApproval('system.command', { command, args })) !== null;
}
