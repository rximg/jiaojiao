import type { AppConfig } from '../../src/types/types';
import Store from 'electron-store';

// 与 Electron 主进程 IPC 使用同一 config 文件（userData/config.json），界面修改的配置才能被 backend 读到
function getConfigStore(): Store<Partial<AppConfig>> {
  try {
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      const userData = app.getPath('userData');
      return new Store({
        name: 'config',
        cwd: userData,
      } as any) as Store<Partial<AppConfig>>;
    }
  } catch {
    // 非 Electron 或 app 未 ready
  }
  try {
    return new Store({ name: 'config', projectName: 'jiaojiao' } as any) as Store<Partial<AppConfig>>;
  } catch {
    return {
      store: {},
      set: () => {},
      get: () => undefined,
    } as any;
  }
}

export async function loadConfig(): Promise<AppConfig> {
  const store = getConfigStore();
  try {
    // 每次都从 Electron Store 读取，避免缓存导致的旧值（与界面配置同一文件）
    const storedConfig = store.store as Partial<AppConfig>;
    const dashscopeKey = storedConfig?.apiKeys?.dashscope || process.env.DASHSCOPE_API_KEY || '';

    return {
      apiKeys: {
        dashscope: dashscopeKey,
        t2i: storedConfig?.apiKeys?.t2i ?? process.env.T2I_API_KEY,
        tts: storedConfig?.apiKeys?.tts ?? process.env.TTS_API_KEY,
      },
      agent: {
        model: storedConfig?.agent?.model || process.env.DASHSCOPE_MODEL || 'qwen-plus-2025-12-01',
        temperature: storedConfig?.agent?.temperature ?? 0.1,
        maxTokens: storedConfig?.agent?.maxTokens ?? 20000,
      },
      storage: {
        outputPath: storedConfig?.storage?.outputPath || './outputs',
        ttsStartNumber: storedConfig?.storage?.ttsStartNumber ?? 6000,
      },
      ui: {
        theme: storedConfig?.ui?.theme || 'light',
        language: storedConfig?.ui?.language || 'zh',
      },
    };
  } catch (error) {
    console.warn('Failed to load config from Store, falling back to env:', error);
    return {
      apiKeys: {
        dashscope: process.env.DASHSCOPE_API_KEY || '',
        t2i: process.env.T2I_API_KEY,
        tts: process.env.TTS_API_KEY,
      },
      agent: {
        model: process.env.DASHSCOPE_MODEL || 'qwen-plus-2025-12-01',
        temperature: 0.1,
        maxTokens: 20000,
      },
      storage: {
        outputPath: './outputs',
        ttsStartNumber: 6000,
      },
      ui: {
        theme: 'light',
        language: 'zh',
      },
    };
  }
}

// 不再缓存，确保最新配置被读取
