/**
 * HITL IPC Handler
 * 处理 Human-in-the-Loop 确认请求的 IPC 通信
 */

import { ipcMain } from 'electron';
import { resolveHitlResponse } from './hitl-response-bridge.js';
import { loadConfig, saveConfig } from '../../backend/app-config.js';

type HitlMode = 'auto' | 'allowlist' | 'strict';

interface HitlPolicy {
  mode: HitlMode;
  allowlist: string[];
}

function normalizePolicy(input?: { mode?: string; allowlist?: unknown }): HitlPolicy {
  const mode: HitlMode =
    input?.mode === 'auto' || input?.mode === 'allowlist' || input?.mode === 'strict'
      ? input.mode
      : 'strict';
  const allowlist = Array.isArray(input?.allowlist)
    ? Array.from(
        new Set(
          input.allowlist
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean)
        )
      )
    : [];
  return { mode, allowlist };
}

async function readPolicy(): Promise<HitlPolicy> {
  const config = await loadConfig();
  return normalizePolicy(config.hitl as { mode?: string; allowlist?: unknown } | undefined);
}

async function writePolicy(policy: HitlPolicy): Promise<HitlPolicy> {
  const normalized = normalizePolicy(policy);
  await saveConfig({ hitl: normalized });
  return normalized;
}

export function handleHITLIPC() {
  // 用户响应确认请求
  ipcMain.handle('hitl:respond', async (_event, requestId: string, response: { approved: boolean; reason?: string; payload?: Record<string, unknown> }) => {
    try {
      // 通知 hitl-service 的等待 Promise（通过 bridge）
      resolveHitlResponse(requestId, response);
      // 同时发送给 renderer（若有监听）
      const { BrowserWindow } = await import('electron');
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        win.webContents.send(`hitl:confirmResponse:${requestId}`, response);
      }
      return { success: true };
    } catch (error) {
      console.error('[HITL IPC] Failed to respond:', error);
      throw error;
    }
  });

  // 获取待处理的确认请求
  ipcMain.handle('hitl:getPendingRequests', async () => {
    // 此功能需要访问 RuntimeManager
    // 暂时返回空数组，后续可以通过 RuntimeManager 获取
    return { requests: [] };
  });

  // 取消确认请求
  ipcMain.handle('hitl:cancel', async (_event, requestId: string) => {
    try {
      // 发送取消响应
      const { BrowserWindow } = await import('electron');
      const win = BrowserWindow.getAllWindows()[0];
      
      if (win) {
        win.webContents.send(`hitl:confirmResponse:${requestId}`, { approved: false, reason: 'Cancelled by user' });
      }
      
      return { success: true };
    } catch (error) {
      console.error('[HITL IPC] Failed to cancel:', error);
      throw error;
    }
  });

  ipcMain.handle('hitl:getPolicy', async () => {
    return readPolicy();
  });

  ipcMain.handle('hitl:setMode', async (_event, mode: HitlMode) => {
    const current = await readPolicy();
    return writePolicy({ ...current, mode });
  });

  ipcMain.handle('hitl:addAllowlist', async (_event, actionType: string) => {
    const normalizedAction = typeof actionType === 'string' ? actionType.trim() : '';
    if (!normalizedAction) {
      return readPolicy();
    }
    const current = await readPolicy();
    return writePolicy({
      ...current,
      allowlist: Array.from(new Set([...current.allowlist, normalizedAction])),
    });
  });

  ipcMain.handle('hitl:removeAllowlist', async (_event, actionType: string) => {
    const normalizedAction = typeof actionType === 'string' ? actionType.trim() : '';
    const current = await readPolicy();
    return writePolicy({
      ...current,
      allowlist: current.allowlist.filter((item) => item !== normalizedAction),
    });
  });

  ipcMain.handle('hitl:clearAllowlist', async () => {
    const current = await readPolicy();
    return writePolicy({ ...current, allowlist: [] });
  });
}
