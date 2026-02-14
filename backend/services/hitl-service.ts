/**
 * HITL Service - Human-in-the-Loop 服务
 * 实现操作确认机制，支持文件、网络、系统操作的人工审批
 */

import { randomUUID } from 'crypto';
import { getHITLRule, requiresApproval, getTimeout, type HITLConfig, DEFAULT_HITL_CONFIG } from '../config/hitl-config.js';
import type { LogManager } from './log-manager.js';

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
   * @returns 批准时返回合并后的 payload（原 payload + response.payload 用户编辑），拒绝/超时返回 null
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
      // 超时或错误
      request.status = 'timeout';
      
      if (this.logManager) {
        await this.logManager.logHITL(this.sessionId, {
          ...request,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      
      // 根据配置决定是否自动批准
      if (rule?.autoApproveAfter) {
        return { ...payload } as Record<string, unknown>;
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
    // 仅在明确为集成测试或单元测试时跳过确认（无 UI）；正常运行时必须等待用户点击确认
    if (process.env.RUN_INTEGRATION_TESTS === 'true' || process.env.NODE_ENV === 'test') {
      return { approved: true };
    }
    
    try {
      const { BrowserWindow } = await import('electron');
      const { registerHitlResponseWaiter } = await import('../../electron/ipc/hitl-response-bridge.js');
      
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
      
      // 等待用户响应（通过 hitl-response-bridge，由 hitl:respond handler 触发）
      return await new Promise<HITLResponse>((resolve, reject) => {
        let settled = false;
        
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(new Error('User confirmation timeout'));
          }
        }, request.timeout);
        
        registerHitlResponseWaiter(request.requestId, (data) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
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
