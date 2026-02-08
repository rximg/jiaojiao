import { promises as fs } from 'fs';
import type { Dirent } from 'fs';
import path from 'path';
import fg from 'fast-glob';

export const DEFAULT_SESSION_ID = 'default';
const WORKSPACES_DIRNAME = 'workspaces';

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

function normalizeRelative(relativePath: string): string {
  return relativePath.replace(/\\/g, '/');
}

function toFileUriInternal(targetPath: string): string {
  const normalized = path.resolve(targetPath).replace(/\\/g, '/');
  if (normalized.startsWith('/')) {
    return `file://${normalized}`;
  }
  return `file:///${normalized}`;
}

function ensureTrailingSep(dir: string): string {
  return dir.endsWith(path.sep) ? dir : `${dir}${path.sep}`;
}

function resolveRootDir(outputPath?: string): string {
  const base = outputPath ? path.resolve(outputPath) : path.resolve(process.cwd(), 'outputs');
  return path.join(base, WORKSPACES_DIRNAME);
}

export class WorkspaceFilesystem {
  private readonly rootDir: string;
  private readonly rootWithSep: string;

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
    this.rootWithSep = ensureTrailingSep(this.rootDir);
  }

  get root(): string {
    return this.rootDir;
  }

  async ensureRoot(): Promise<void> {
    await fs.mkdir(this.rootDir, { recursive: true });
  }

  sessionPath(sessionId: string, relativePath = ''): string {
    const safeSession = sessionId || DEFAULT_SESSION_ID;
    // 若传入绝对路径会导致 resolve 结果脱离 root，只接受相对路径
    const trimmed = relativePath.replace(/\\/g, '/').replace(/^\/+/, '').trim();
    if (path.isAbsolute(relativePath) || trimmed.includes('..')) {
      throw new Error('Path escapes workspace root');
    }
    const normalizedRelative = normalizeRelative(trimmed || relativePath);
    const resolved = path.resolve(this.rootDir, safeSession, normalizedRelative);
    const resolvedNorm = path.normalize(resolved);
    const rootNorm = path.normalize(this.rootWithSep);
    if (!resolvedNorm.startsWith(rootNorm) && resolvedNorm !== path.normalize(this.rootDir)) {
      throw new Error('Path escapes workspace root');
    }
    return resolved;
  }

  toFileUri(targetPath: string): string {
    return toFileUriInternal(targetPath);
  }

  async writeFile(
    sessionId: string,
    relativePath: string,
    data: string | NodeJS.ArrayBufferView,
    encoding?: BufferEncoding
  ): Promise<string> {
    await this.ensureRoot();
    const targetPath = this.sessionPath(sessionId, relativePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, data, encoding);
    return targetPath;
  }

  async appendFile(
    sessionId: string,
    relativePath: string,
    data: string | NodeJS.ArrayBufferView,
    encoding?: BufferEncoding
  ): Promise<string> {
    await this.ensureRoot();
    const targetPath = this.sessionPath(sessionId, relativePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    const payload: string | Uint8Array = typeof data === 'string'
      ? data
      : data instanceof Uint8ClampedArray
        ? new Uint8Array(data)
        : (data as Uint8Array);
    await fs.appendFile(targetPath, payload, encoding);
    return targetPath;
  }

  async readFile(
    sessionId: string,
    relativePath: string,
    encoding?: BufferEncoding
  ): Promise<string | Buffer> {
    await this.ensureRoot();
    const targetPath = this.sessionPath(sessionId, relativePath);
    
    // Check if file exists before trying to read
    try {
      await fs.access(targetPath);
    } catch (error) {
      throw new Error(`File not found: ${relativePath} in session ${sessionId}. Full path: ${targetPath}`);
    }
    
    return fs.readFile(targetPath, encoding);
  }

  async ls(sessionId: string, relativePath = '.'): Promise<LsEntry[]> {
    const dirPath = this.sessionPath(sessionId, relativePath);
    await this.ensureRoot();
    let entries: Dirent[] = [];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return [];
    }

    const stats = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name);
        const stat = await fs.stat(fullPath).catch(() => null);
        return {
          path: fullPath,
          name: entry.name,
          isDir: entry.isDirectory(),
          size: stat ? stat.size : null,
        } satisfies LsEntry;
      })
    );

    return stats;
  }

  async glob(sessionId: string, pattern = '**/*'): Promise<string[]> {
    const baseDir = this.sessionPath(sessionId);
    await this.ensureRoot();
    const matches = await fg(pattern, {
      cwd: baseDir,
      dot: true,
      onlyFiles: false,
      unique: true,
    });
    return matches.map((match) => path.resolve(baseDir, match));
  }

  async grep(
    sessionId: string,
    pattern: string | RegExp,
    options?: { glob?: string }
  ): Promise<GrepMatch[]> {
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i');
    const baseDir = this.sessionPath(sessionId);
    await this.ensureRoot();
    const files = await fg(options?.glob || '**/*', {
      cwd: baseDir,
      dot: true,
      onlyFiles: true,
    });

    const matches: GrepMatch[] = [];

    for (const file of files) {
      const absPath = path.resolve(baseDir, file);
      let content: string;
      try {
        content = await fs.readFile(absPath, 'utf-8');
      } catch {
        continue;
      }
      const lines = content.split(/\r?\n/);
      lines.forEach((line, idx) => {
        if (regex.test(line)) {
          matches.push({ path: absPath, line: idx + 1, text: line });
        }
      });
    }

    return matches;
  }

  async rm(sessionId: string, relativePath: string): Promise<void> {
    const targetPath = this.sessionPath(sessionId, relativePath);
    const maxRetries = 3;
    const retryDelayMs = 200;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await fs.rm(targetPath, { recursive: true, force: true });
        return;
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException)?.code;
        const isRetryable = code === 'EPERM' || code === 'EBUSY';
        if (!isRetryable || attempt === maxRetries) throw err;
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }
    }
  }
}

const cache = new Map<string, WorkspaceFilesystem>();

export function getWorkspaceFilesystem(options?: { outputPath?: string }): WorkspaceFilesystem {
  const rootDir = resolveRootDir(options?.outputPath);
  if (!cache.has(rootDir)) {
    cache.set(rootDir, new WorkspaceFilesystem(rootDir));
  }
  return cache.get(rootDir) as WorkspaceFilesystem;
}

export function resolveWorkspaceRoot(outputPath?: string): string {
  return resolveRootDir(outputPath);
}

export function toFileUri(targetPath: string): string {
  return toFileUriInternal(targetPath);
}
