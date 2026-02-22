import path from 'path';
import { promises as fs } from 'fs';
import { readLineNumbers } from '../tools/line-numbers.js';
import { loadConfig } from '../app-config.js';
import { getWorkspaceFilesystem } from './fs.js';

const WORKSPACES_DIRNAME = 'workspaces';

export interface SyncAudioToStoreResult {
  copied: number;
  storeDir: string;
  files: string[];
}

/**
 * 从工作目录读取 audio_record.json，将音频复制到 syncTargetDir。
 * 优先使用配置中的 outputPath；否则从 JIAOJIAO_WORKSPACE_ROOT 环境变量（主进程设置为 userData/workspace）；
 * 兼容回退：当 audio_record.json 缺失当前会话登记时，直接扫描会话 audio/ 目录。
 * @param syncTargetDir 同步目标目录
 * @param sessionId 若传入，则只同步该 session 下的音频；否则同步全部
 */
export async function syncSessionAudioToStore(
  syncTargetDir: string,
  sessionId?: string
): Promise<SyncAudioToStoreResult> {
  const targetDir = path.resolve(syncTargetDir);
  await fs.mkdir(targetDir, { recursive: true });

  const config = await loadConfig();
  // 优先用配置的路径，其次用环境变量（主进程已设置），再次用默认 root
  const configOutputPath = (config.storage?.outputPath ?? '').trim();
  const envWorkspaceRoot = process.env.JIAOJIAO_WORKSPACE_ROOT?.trim() || '';
  let baseDir = configOutputPath || envWorkspaceRoot;
  if (!baseDir) {
    // 最后兜底：环境变量未设时直接用 getWorkspaceFilesystem().root（通常是 cwd/outputs/workspaces）
    baseDir = getWorkspaceFilesystem().root;
  }
  const workspacesDir = baseDir.endsWith(WORKSPACES_DIRNAME) ? baseDir : path.join(baseDir, WORKSPACES_DIRNAME);

  const ttsStartNumber = config.storage.ttsStartNumber ?? 6000;
  const { entries } = await readLineNumbers(ttsStartNumber);
  const toSync = sessionId ? entries.filter((e) => e.sessionId === sessionId) : entries;

  const copiedFiles: string[] = [];
  
  if (toSync.length > 0) {
    for (const entry of toSync) {
      const sessionDir = path.join(workspacesDir, entry.sessionId);
      const srcPath = path.join(sessionDir, entry.relativePath);
      try {
        await fs.access(srcPath);
        const destPath = path.join(targetDir, `${entry.number}.mp3`);
        await fs.copyFile(srcPath, destPath);
        copiedFiles.push(`${entry.number}.mp3`);
      } catch (err) {
        console.warn(`[sync-audio-to-store] Skip (not found or error): ${srcPath}`, err);
      }
    }
  }
  
  // 如果 audio_record.json 中登记的文件没有成功复制任何文件，且指定了 sessionId，使用 fallback
  if (copiedFiles.length === 0 && sessionId) {
    console.log(`[sync-audio-to-store] No files copied from audio_record.json, using fallback scan for session ${sessionId}`);
    // 兼容回退：audio_record.json 缺失当前会话登记时，直接扫描会话 audio 目录
    const audioDir = path.join(workspacesDir, sessionId, 'audio');
    try {
      const audioFiles = await fs.readdir(audioDir, { withFileTypes: true });
      for (const file of audioFiles) {
        if (!file.isFile() || !/\.mp3$/i.test(file.name)) continue;
        const srcPath = path.join(audioDir, file.name);
        // 从 "序号_文字.mp3" 格式中提取序号，重新命名为 "序号.mp3"
        const match = file.name.match(/^(\d+)/);
        const numberPart = match ? match[1] : file.name.replace(/[^0-9]/g, '').slice(0, 4) || 'unknown';
        const destFileName = `${numberPart}.mp3`;
        const destPath = path.join(targetDir, destFileName);
        try {
          await fs.copyFile(srcPath, destPath);
          copiedFiles.push(destFileName);
        } catch (err) {
          console.warn(`[sync-audio-to-store] Fallback skip (copy error): ${srcPath}`, err);
        }
      }
    } catch (err) {
      console.warn(`[sync-audio-to-store] Fallback skip (audio dir not found): ${audioDir}`, err);
    }
  }

  return { copied: copiedFiles.length, storeDir: targetDir, files: copiedFiles };
}
