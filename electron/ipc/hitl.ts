/**
 * HITL IPC Handler
 * 处理 Human-in-the-Loop 确认请求的 IPC 通信
 */

import { ipcMain } from 'electron';

export function handleHITLIPC() {
  // 用户响应确认请求
  ipcMain.handle('hitl:respond', async (_event, requestId: string, response: { approved: boolean; reason?: string }) => {
    try {
      // 发送响应事件（由 HITLService 监听）
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
}
