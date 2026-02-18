/**
 * Inference 层：getAIConfig 按 provider 返回正确配置
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAIConfig } from '../../../backend/infrastructure/inference/ai-config.js';
import type { LLMAIConfig, VLAIConfig, TTSAIConfig, T2IAIConfig } from '#backend/domain/inference/types.js';

vi.mock('../../../backend/app-config.js', () => ({ loadConfig: vi.fn() }));

async function getLoadConfig() {
  const { loadConfig } = await import('../../../backend/app-config.js');
  return loadConfig as ReturnType<typeof vi.fn>;
}

describe('Inference / getAIConfig', () => {
  beforeEach(async () => {
    const loadConfig = await getLoadConfig();
    loadConfig.mockResolvedValue({
      apiKeys: { dashscope: 'sk-dashscope', zhipu: 'sk-zhipu' },
      agent: { model: 'qwen-plus-2025-12-01', temperature: 0.1, maxTokens: 20000, provider: 'dashscope' },
      storage: { outputPath: './outputs', ttsStartNumber: 6000 },
      ui: { theme: 'light', language: 'zh' },
    });
  });

  it('returns LLM config with dashscope by default', async () => {
    const cfg = await getAIConfig('llm');
    expect(cfg.provider).toBe('dashscope');
    expect((cfg as LLMAIConfig).endpoint).toBeDefined();
  });

  it('returns VL config with endpoint', async () => {
    const cfg = await getAIConfig('vl');
    expect((cfg as VLAIConfig).endpoint).toBeDefined();
  });

  it('returns TTS config with endpoint', async () => {
    const cfg = await getAIConfig('tts');
    expect((cfg as TTSAIConfig).endpoint).toBeDefined();
  });

  it('returns T2I config with endpoint and taskEndpoint', async () => {
    const cfg = await getAIConfig('t2i');
    const t2i = cfg as T2IAIConfig;
    expect(t2i.endpoint).toBeDefined();
    expect(t2i.taskEndpoint).toBeDefined();
  });
});
