import { describe, it, expect, vi } from 'vitest';
import { createLLM, createLLMFromAIConfig } from '../backend/ai/llm/index';

describe('createLLM', () => {
  const baseOptions = {
    apiKey: 'sk-test',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    temperature: 0.1,
    maxTokens: 100,
  };

  it('returns non-null Chat model for dashscope', () => {
    const llm = createLLM('dashscope', baseOptions);
    expect(llm).toBeDefined();
    expect(llm).toHaveProperty('invoke');
  });

  it('returns non-null Chat model for zhipu', () => {
    const llm = createLLM('zhipu', {
      ...baseOptions,
      baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    });
    expect(llm).toBeDefined();
    expect(llm).toHaveProperty('invoke');
  });
});

describe('createLLMFromAIConfig', () => {
  it('creates LLM from full config with callbacks', () => {
    const cfg = {
      provider: 'dashscope' as const,
      apiKey: 'sk-ds',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen-plus',
      temperature: 0.2,
      maxTokens: 2000,
      callbacks: [],
    };
    const llm = createLLMFromAIConfig(cfg);
    expect(llm).toBeDefined();
  });

  it('creates LLM for zhipu from config', () => {
    const cfg = {
      provider: 'zhipu' as const,
      apiKey: 'sk-zhipu',
      baseURL: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'glm-4.5',
      temperature: 0.7,
      maxTokens: 4096,
    };
    const llm = createLLMFromAIConfig(cfg);
    expect(llm).toBeDefined();
  });
});
