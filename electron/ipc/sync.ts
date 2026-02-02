import { ipcMain } from 'electron';
import { loadConfig } from '../../backend/agent/config.js';
import { syncSessionAudioToStore } from '../../backend/mcp/sync-audio-to-store.js';

export function handleSyncIPC() {
  ipcMain.handle('sync:audioToStore', async () => {
    const config = await loadConfig();
    const outputPath = config.storage?.outputPath ?? './outputs';
    const result = await syncSessionAudioToStore(outputPath);
    return {
      success: true,
      copied: result.copied,
      storeDir: result.storeDir,
      files: result.files,
      message: `已同步 ${result.copied} 个 mp3 到 ${result.storeDir}`,
    };
  });
}
