import path from 'path';
import { promises as fs } from 'fs';
import { readLineNumbers } from './line-numbers.js';

const WORKSPACES_DIRNAME = 'workspaces';
const STORE_DIRNAME = 'store';

export interface SyncAudioToStoreResult {
  copied: number;
  storeDir: string;
  files: string[];
}

/**
 * 同步所有 session 的 mp3 到 outputPath/store：仅从 workspace 下的 audio_record.json 读取 entries，
 * 按 sessionId + relativePath 拷贝到 store 并重命名为 {number}.mp3，不遍历 *.mp3 文件。
 */
export async function syncSessionAudioToStore(
  outputPath: string
): Promise<SyncAudioToStoreResult> {
  const base = outputPath ? path.resolve(outputPath) : path.resolve(process.cwd(), 'outputs');
  const workspacesDir = path.join(base, WORKSPACES_DIRNAME);
  const storeDir = path.join(base, STORE_DIRNAME);

  await fs.mkdir(storeDir, { recursive: true });

  const copiedFiles: string[] = [];

  const { entries } = await readLineNumbers(outputPath, 6000);
  for (const entry of entries) {
    const sessionDir = path.join(workspacesDir, entry.sessionId);
    const srcPath = path.join(sessionDir, entry.relativePath);
    try {
      await fs.access(srcPath);
      const destPath = path.join(storeDir, `${entry.number}.mp3`);
      await fs.copyFile(srcPath, destPath);
      copiedFiles.push(`${entry.number}.mp3`);
    } catch (err) {
      console.warn(`[sync-audio-to-store] Skip (not found or error): ${srcPath}`, err);
    }
  }

  return { copied: copiedFiles.length, storeDir, files: copiedFiles };
}
