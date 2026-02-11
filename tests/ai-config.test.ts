import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAIConfig } from '../backend/ai/config';

vi.mock('../backend/app-config', () => ({
  loadConfig: vi.fn(),
}));

async function getLoadConfig() {
  const { loadConfig } = await import('../backend/app-config');
  return loadConfig as ReturnType<typeof vi.fn>;
}

describe('getAIConfig', () => {
  beforeEach(async () => {
    const loadConfig = await getLoadConfig();
    loadConfig.mockResolvedValue({
      apiKeys: { dashscope: 'sk-dashscope', zhipu: 'sk-zhipu' },
      agent: {
        model: 'qwen-plus-2025-12-01',
        temperature: 0.1,
        maxTokens: 20000,
        provider: 'dashscope',
      },
      storage: { outputPath: './outputs', ttsStartNumber: 6000 },
      ui: { theme: 'light', language: 'zh' },
    });
  });

  it('returns LLM config with dashscope provider by default', async () => {
    const cfg = await getAIConfig('llm');
    expect(cfg.provider).toBe('dashscope');
    expect(cfg.apiKey).toBe('sk-dashscope');
    const llmCfg = cfg as import('../backend/ai/types').LLMAIConfig;
    expect(llmCfg.baseURL).toContain('dashscope');
    expect(llmCfg.model).toBeDefined();
    expect(llmCfg.temperature).toBe(0.1);
    expect(llmCfg.maxTokens).toBe(20000);
  });

  it('returns LLM config with zhipu when agent.model is zhipu model', async () => {
    const loadConfig = await getLoadConfig();
    loadConfig.mockResolvedValue({
      apiKeys: { dashscope: '', zhipu: 'sk-zhipu' },
      agent: { model: 'glm-4.5', temperature: 0.7, maxTokens: 4096, provider: 'zhipu' },
      storage: { outputPath: './outputs' },
      ui: { theme: 'light', language: 'zh' },
    });
    const cfg = await getAIConfig('llm');
    expect(cfg.provider).toBe('zhipu');
    expect(cfg.apiKey).toBe('sk-zhipu');
    const llmCfg = cfg as import('../backend/ai/types').LLMAIConfig;
    expect(llmCfg.baseURL).toContain('open.bigmodel.cn');
  });

  it('returns VL config with provider and apiKey', async () => {
    const cfg = await getAIConfig('vl');
    expect(cfg).toHaveProperty('provider');
    expect(cfg).toHaveProperty('apiKey');
    const vlCfg = cfg as import('../backend/ai/types').VLAIConfig;
    expect(vlCfg).toHaveProperty('baseUrl');
    expect(vlCfg).toHaveProperty('model');
    expect(vlCfg).toHaveProperty('prompt');
  });

  it('returns TTS config with endpoint and rateLimitMs', async () => {
    const cfg = await getAIConfig('tts');
    const ttsCfg = cfg as import('../backend/ai/types').TTSAIConfig;
    expect(ttsCfg).toHaveProperty('endpoint');
    expect(ttsCfg).toHaveProperty('model');
    expect(typeof ttsCfg.rateLimitMs).toBe('number');
  });

  it('returns T2I config with endpoint and taskEndpoint', async () => {
    const cfg = await getAIConfig('t2i');
    const t2iCfg = cfg as import('../backend/ai/types').T2IAIConfig;
    expect(t2iCfg).toHaveProperty('endpoint');
    expect(t2iCfg).toHaveProperty('taskEndpoint');
    expect(t2iCfg).toHaveProperty('model');
  });
});
