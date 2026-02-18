/**
 * 将步骤结果中的相对路径解析为绝对路径（基于 workspace root + sessionId）
 */
import path from 'path';
import { loadConfig } from '../../app-config.js';
import { getWorkspaceFilesystem } from '../../services/fs.js';

export type StepResultLike = { type: string; payload: { path?: string; [k: string]: unknown } };

function isAbsolutePath(p: string): boolean {
  const trimmed = p.trim();
  if (/^[A-Za-z]:[\\/]/.test(trimmed)) return true;
  if (trimmed.startsWith('/')) return true;
  return false;
}

export async function resolveStepResultPaths<T extends StepResultLike>(
  sessionId: string | undefined,
  stepResults: T[]
): Promise<T[]> {
  if (!sessionId || stepResults.length === 0) return stepResults;
  try {
    const appConfig = await loadConfig();
    const outputPath = appConfig?.storage?.outputPath ?? './outputs';
    const workspaceFs = getWorkspaceFilesystem({ outputPath });
    const sessionRoot = path.join(workspaceFs.root, sessionId);
    return stepResults.map((sr) => {
      if (sr.payload?.path && !isAbsolutePath(sr.payload.path)) {
        const abs = path.resolve(sessionRoot, sr.payload.path.replace(/^[/\\]+/, ''));
        return { ...sr, payload: { ...sr.payload, path: abs } };
      }
      return sr;
    });
  } catch {
    return stepResults;
  }
}
