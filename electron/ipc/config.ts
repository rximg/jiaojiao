import { ipcMain } from 'electron';
import Store from 'electron-store';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载 main_agent_config.yaml 中的 UI 配置（仅在此处调用，get 时合并到返回值）
function loadUIConfigFromYaml(): Record<string, unknown> {
  try {
    let configPath: string;
    if (__dirname.includes('dist-electron')) {
      configPath = path.resolve(__dirname, '..', 'backend', 'config', 'main_agent_config.yaml');
    } else {
      configPath = path.resolve(__dirname, '..', '..', 'backend', 'config', 'main_agent_config.yaml');
    }
    if (!fs.existsSync(configPath)) {
      console.warn('[loadUIConfigFromYaml] main_agent_config.yaml not found:', configPath);
      return {};
    }
    const fileContent = fs.readFileSync(configPath, 'utf-8');
    const config = yaml.load(fileContent) as any;
    return config.ui || {};
  } catch (error) {
    console.error('Failed to load UI config from YAML:', error);
    return {};
  }
}

const store = new Store({
  name: 'config',
  defaults: {
    apiKeys: {
      dashscope: '',
      t2i: '',
      tts: '',
    },
    agent: {
      model: 'qwen-plus-2025-12-01',
      temperature: 0.7,
      maxTokens: 4096,
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
    // 每次都重新加载 UI 配置，确保最新
    const latestUIConfig = loadUIConfigFromYaml();
    const currentStore = store.store as any;
    return {
      ...currentStore,
      ui: {
        ...currentStore.ui,
        ...latestUIConfig,
      },
    };
  });

  ipcMain.handle('config:set', async (_event, config: any) => {
    store.set(config);
    return store.store;
  });
}
