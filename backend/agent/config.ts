import type { AppConfig } from '../../src/types/types';
import Store from 'electron-store';

// Initialize Store - use projectName when in Electron, handle Node environment
let store: Store<Partial<AppConfig>>;
try {
  store = new Store(
    { 
      name: 'config',
      projectName: 'agent-app' 
    } as any
  );
} catch {
  // In Node.js/test environment, create a minimal mock store
  store = {
    store: {},
    set: () => {},
    get: () => undefined,
  } as any;
}

export async function loadConfig(): Promise<AppConfig> {
  try {
    // 每次都从 Electron Store 读取，避免缓存导致的旧值
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
