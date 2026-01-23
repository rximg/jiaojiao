import type { AppConfig } from '../../src/types/types';
import Store from 'electron-store';

const store = new Store({ name: 'config' });

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
        model: storedConfig?.agent?.model || process.env.DASHSCOPE_MODEL || 'qwen-plus',
        temperature: storedConfig?.agent?.temperature ?? 0.7,
        maxTokens: storedConfig?.agent?.maxTokens ?? 2048,
      },
      storage: {
        outputPath: storedConfig?.storage?.outputPath || './outputs',
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
        model: process.env.DASHSCOPE_MODEL || 'qwen-plus',
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
    };
  }
}

// 不再缓存，确保最新配置被读取
