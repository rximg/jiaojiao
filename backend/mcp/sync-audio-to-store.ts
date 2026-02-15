import path from 'path';
import { promises as fs } from 'fs';
import { readLineNumbers } from './line-numbers.js';
import { loadConfig } from '../agent/config.js';
import { getWorkspaceBase } from '../services/fs.js';

const WORKSPACES_DIRNAME = 'workspaces';
const STORE_DIRNAME = 'store';

export interface SyncAudioToStoreResult {
  copied: number;
  storeDir: string;
  files: string[];
}

/**
 * 从固定工作目录（userData/workspace）读取 audio_record.json，将音频复制到 syncTargetDir/store。
 * 工作目录不可配置；syncTargetDir 为配置项「音频同步目标路径」。
 */
export async function syncSessionAudioToStore(
  syncTargetDir: string
): Promise<SyncAudioToStoreResult> {
  const storeDir = path.join(path.resolve(syncTargetDir), STORE_DIRNAME);
  await fs.mkdir(storeDir, { recursive: true });

  const workspaceBase = getWorkspaceBase();
  const workspacesDir = path.join(workspaceBase, WORKSPACES_DIRNAME);

  const config = await loadConfig();
  const ttsStartNumber = config.storage.ttsStartNumber ?? 6000;
  const { entries } = await readLineNumbers(ttsStartNumber);

  const copiedFiles: string[] = [];
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
