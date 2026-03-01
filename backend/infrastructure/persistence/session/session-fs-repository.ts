/**
 * 会话仓储实现：基于 WorkspaceFilesystem
 */
import { promises as fs } from 'fs';
import path from 'path';
import type { SessionRepository } from '#backend/domain/session/repositories/session-repository.js';
import type { Session } from '#backend/domain/session/entities/session.js';
import type { WorkspaceFilesystem } from '#backend/services/fs.js';

const META_PATH = 'meta/session.json';
const UUID_DIR_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class SessionFsRepository implements SessionRepository {
  constructor(private readonly workspace: WorkspaceFilesystem) {}

  async findById(sessionId: string): Promise<Session | null> {
    try {
      const content = (await this.workspace.readFile(sessionId, META_PATH, 'utf-8')) as string;
      const meta = JSON.parse(content);
      return { sessionId, meta };
    } catch {
      return null;
    }
  }

  async list(): Promise<Session[]> {
    const rootDir = this.workspace.root;
    let sessionDirs: string[] = [];
    try {
      const entries = await fs.readdir(rootDir, { withFileTypes: true });
      sessionDirs = entries
        .filter((e) => e.isDirectory() && UUID_DIR_PATTERN.test(e.name))
        .map((e) => e.name);
    } catch {
      return [];
    }

    const sessions = await Promise.all(
      sessionDirs.map(async (sessionId) => {
        const session = await this.findById(sessionId);
        if (session) return session;
        return {
          sessionId,
          meta: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            title: '未命名对话',
          },
        } as Session;
      })
    );

    sessions.sort(
      (a, b) =>
        new Date(b.meta.updatedAt ?? 0).getTime() - new Date(a.meta.updatedAt ?? 0).getTime()
    );
    return sessions;
  }

  async save(session: Session): Promise<void> {
    const meta = {
      ...session.meta,
      sessionId: session.sessionId,
      updatedAt: new Date().toISOString(),
    };
    await this.workspace.writeFile(
      session.sessionId,
      META_PATH,
      JSON.stringify(meta, null, 2),
      'utf-8'
    );
  }

  async delete(sessionId: string): Promise<void> {
    const sessionPath = path.join(this.workspace.root, sessionId);
    await fs.rm(sessionPath, { recursive: true, force: true });
  }
}
