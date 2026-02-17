/**
 * 产物仓储接口
 */
export interface LsEntry {
  path: string;
  name: string;
  isDir: boolean;
  size: number | null;
}

export interface ArtifactRepository {
  write(sessionId: string, relativePath: string, content: string | Buffer): Promise<void>;
  read(sessionId: string, relativePath: string): Promise<string | Buffer>;
  exists(sessionId: string, relativePath: string): Promise<boolean>;
  list(sessionId: string, relativePath?: string): Promise<LsEntry[]>;
  delete(sessionId: string, relativePath: string): Promise<void>;
}
