/**
 * 产物仓储实现：基于 WorkspaceFilesystem
 */
import type { ArtifactRepository, LsEntry } from '#backend/domain/workspace/repositories/artifact-repository.js';
import type { WorkspaceFilesystem } from '#backend/services/fs.js';

export class ArtifactFsRepository implements ArtifactRepository {
  constructor(private readonly workspace: WorkspaceFilesystem) {}

  async write(sessionId: string, relativePath: string, content: string | Buffer): Promise<void> {
    const encoding = typeof content === 'string' ? 'utf-8' : undefined;
    await this.workspace.writeFile(sessionId, relativePath, content, encoding);
  }

  async read(sessionId: string, relativePath: string): Promise<string | Buffer> {
    return this.workspace.readFile(sessionId, relativePath);
  }

  async exists(sessionId: string, relativePath: string): Promise<boolean> {
    try {
      await this.workspace.readFile(sessionId, relativePath);
      return true;
    } catch {
      return false;
    }
  }

  async list(sessionId: string, relativePath = '.'): Promise<LsEntry[]> {
    return this.workspace.ls(sessionId, relativePath);
  }

  async delete(sessionId: string, relativePath: string): Promise<void> {
    await this.workspace.rm(sessionId, relativePath);
  }
}
