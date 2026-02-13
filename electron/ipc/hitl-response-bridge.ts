/**
 * HITL 响应桥接：hitl:respond handler 收到响应后，通知 hitl-service 的 Promise
 * 因 ipcMain.once 仅监听 renderer 的 send，而 renderer 使用 invoke，故需此桥接
 */

export interface HITLResponseData {
  approved: boolean;
  reason?: string;
  payload?: Record<string, unknown>;
}

type ResolveFn = (data: HITLResponseData) => void;

const pendingResolves = new Map<string, ResolveFn>();

export function registerHitlResponseWaiter(requestId: string, resolve: ResolveFn): void {
  pendingResolves.set(requestId, resolve);
}

export function resolveHitlResponse(requestId: string, data: HITLResponseData): void {
  const resolve = pendingResolves.get(requestId);
  if (resolve) {
    pendingResolves.delete(requestId);
    resolve(data);
  }
}
