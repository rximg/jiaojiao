/**
 * 删除会话用例：关闭运行时、删除会话仓储记录、写审计日志
 */
import type { SessionRepository } from '#backend/domain/session/repositories/session-repository.js';

export interface DeleteSessionUseCaseDeps {
  sessionRepo: SessionRepository;
  closeRuntime: (sessionId: string) => Promise<void>;
  logAudit: (sessionId: string, payload: Record<string, unknown>) => Promise<void>;
}

export interface DeleteSessionUseCaseResult {
  success: boolean;
}

export async function deleteSessionUseCase(
  deps: DeleteSessionUseCaseDeps,
  sessionId: string
): Promise<DeleteSessionUseCaseResult> {
  await deps.closeRuntime(sessionId);
  await new Promise((r) => setTimeout(r, 300));
  await deps.sessionRepo.delete(sessionId);
  await deps.logAudit(sessionId, { action: 'session_deleted' });
  return { success: true };
}
