import type { SessionMeta } from '../value-objects/session-meta.js';

/**
 * 会话聚合根（简化）
 */
export interface Session {
  sessionId: string;
  meta: SessionMeta;
}
