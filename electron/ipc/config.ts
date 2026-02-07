import { ipcMain } from 'electron';
import Store from 'electron-store';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 延迟初始化 Store：在首次 get/set 时再创建，此时 handleConfigIPC 已在 app.whenReady 中执行，
// app.getPath('userData') 可正确返回，避免打包后保存配置失败
let store: Store<Record<string, unknown>> | null = null;

function getStore(): Store<Record<string, unknown>> {
  if (store) return store;
  store = new Store({
    name: 'config',
    projectName: 'agent-app',
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
        ttsStartNumber: 6000,
      },
      ui: {
        theme: 'light',
        language: 'zh',
      },
    },
  });
  return store;
}

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

export function handleConfigIPC() {
  ipcMain.handle('config:get', async () => {
    const s = getStore();
    const latestUIConfig = loadUIConfigFromYaml();
    const currentStore = s.store as any;
    return {
      ...currentStore,
      ui: {
        ...currentStore.ui,
        ...latestUIConfig,
      },
    };
  });

  ipcMain.handle('config:set', async (_event, config: any) => {
    try {
      const s = getStore();
      s.set(config);
      return s.store;
    } catch (error) {
      console.error('[config:set] Save failed:', error);
      throw error;
    }
  });
}
