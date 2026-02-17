import type { Session } from '../entities/session.js';

/**
 * 会话仓储接口
 */
export interface SessionRepository {
  findById(sessionId: string): Promise<Session | null>;
  list(): Promise<Session[]>;
  save(session: Session): Promise<void>;
  delete(sessionId: string): Promise<void>;
}
