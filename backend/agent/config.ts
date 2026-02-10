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

/** 旧版按能力存 key，迁移为按 provider：有任意能力 key 则填入对应 provider（通义/智谱由 agent.provider 推断） */
function migrateApiKeys(legacy: Record<string, unknown> | undefined, agentProvider?: string): { dashscope: string; zhipu: string } {
  const hasNew = (legacy?.dashscope as string)?.trim() || (legacy?.zhipu as string)?.trim();
  if (hasNew) {
    return {
      dashscope: (legacy?.dashscope as string)?.trim() || '',
      zhipu: (legacy?.zhipu as string)?.trim() || '',
    };
  }
  const llm = (legacy?.llm as string)?.trim();
  const t2i = (legacy?.t2i as string)?.trim();
  const tts = (legacy?.tts as string)?.trim();
  const vl = (legacy?.vl as string)?.trim();
  const anyLegacy = llm || t2i || tts || vl;
  if (anyLegacy && agentProvider === 'zhipu') {
    return { dashscope: '', zhipu: llm || t2i || tts || vl };
  }
  if (anyLegacy) {
    return { dashscope: llm || t2i || tts || vl, zhipu: '' };
  }
  return {
    dashscope: process.env.DASHSCOPE_API_KEY ?? process.env.LLM_API_KEY ?? '',
    zhipu: process.env.ZHIPU_API_KEY ?? '',
  };
}

export async function loadConfig(): Promise<AppConfig> {
  const store = getConfigStore();
  try {
    const storedConfig = store.store as Partial<AppConfig>;
    const apiKeys = migrateApiKeys(storedConfig?.apiKeys as Record<string, unknown>, storedConfig?.agent?.provider);

    return {
      apiKeys: {
        dashscope: apiKeys.dashscope,
        zhipu: apiKeys.zhipu,
      },
      agent: {
        model: storedConfig?.agent?.model || process.env.DASHSCOPE_MODEL || 'qwen-plus-2025-12-01',
        temperature: storedConfig?.agent?.temperature ?? 0.1,
        maxTokens: storedConfig?.agent?.maxTokens ?? 20000,
        provider: storedConfig?.agent?.provider ?? (process.env.AI_LLM_PROVIDER as 'dashscope' | 'zhipu' | undefined),
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
    const apiKeys = migrateApiKeys(undefined, undefined);
    return {
      apiKeys: {
        dashscope: apiKeys.dashscope || process.env.DASHSCOPE_API_KEY || process.env.LLM_API_KEY || '',
        zhipu: apiKeys.zhipu || process.env.ZHIPU_API_KEY || '',
      },
      agent: {
        model: process.env.DASHSCOPE_MODEL || 'qwen-plus-2025-12-01',
        temperature: 0.1,
        maxTokens: 20000,
        provider: process.env.AI_LLM_PROVIDER as 'dashscope' | 'zhipu' | undefined,
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
