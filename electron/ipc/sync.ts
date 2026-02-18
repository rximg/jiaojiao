import { ipcMain } from 'electron';
import { loadConfig } from '../../backend/app-config.js';
import { syncSessionAudioToStore } from '../../backend/services/sync-audio-to-store.js';

export function handleSyncIPC() {
  ipcMain.handle('sync:audioToStore', async (_event, sessionId?: string) => {
    const config = await loadConfig();
    const syncTargetPath = (config.storage?.syncTargetPath ?? config.storage?.outputPath ?? '').trim();
    if (!syncTargetPath) {
      return {
        success: false,
        copied: 0,
        storeDir: '',
        files: [] as string[],
        message: '请先在配置界面设置音频同步目标路径',
      };
    }
    const result = await syncSessionAudioToStore(syncTargetPath, sessionId);
    return {
      success: true,
      copied: result.copied,
      storeDir: result.storeDir,
      files: result.files,
      message: `已同步 ${result.copied} 个 mp3 到 ${result.storeDir}`,
    };
  });
}
