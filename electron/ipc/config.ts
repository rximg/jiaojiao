import { ipcMain } from 'electron';
import Store from 'electron-store';

const store = new Store({
  name: 'config',
  defaults: {
    apiKeys: {
      dashscope: '',
      t2i: '',
      tts: '',
    },
    agent: {
      model: 'qwen-plus',
      temperature: 0.7,
      maxTokens: 2048,
    },
    storage: {
      outputPath: './outputs',
    },
    ui: {
      theme: 'light',
      language: 'zh',
    },
  },
});

export function handleConfigIPC() {
  ipcMain.handle('config:get', async () => {
    return store.store;
  });

  ipcMain.handle('config:set', async (_event, config: any) => {
    store.set(config);
    return store.store;
  });
}
