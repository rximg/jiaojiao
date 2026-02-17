/**
 * 产物仓储接口
 */
export interface LsEntry {
  path: string;
  name: string;
  isDir: boolean;
  size: number | null;
}

export interface GrepMatch {
  path: string;
  line: number;
  text: string;
}

export interface ArtifactRepository {
  write(sessionId: string, relativePath: string, content: string | Buffer): Promise<void>;
  read(sessionId: string, relativePath: string): Promise<string | Buffer>;
  exists(sessionId: string, relativePath: string): Promise<boolean>;
  list(sessionId: string, relativePath?: string): Promise<LsEntry[]>;
  delete(sessionId: string, relativePath: string): Promise<void>;
  /** 解析会话内相对路径为绝对路径（用于 sendFile 等） */
  resolvePath(sessionId: string, relativePath: string): string;
  glob(sessionId: string, pattern?: string): Promise<string[]>;
  grep(sessionId: string, pattern: string | RegExp, options?: { glob?: string }): Promise<GrepMatch[]>;
}
