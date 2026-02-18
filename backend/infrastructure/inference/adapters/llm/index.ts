/**
 * LLM 工厂：根据 provider 创建 LangChain Chat 模型（构建时由 getAIConfig('llm') 注入）
 */
import type { Provider, LLMAIConfig } from '#backend/domain/inference/types.js';
import { createLLMDashScope, type CreateLLMOptions, type ChatModelInstance } from './dashscope.js';
import { createLLMZhipu } from './zhipu.js';

export type { ChatModelInstance, CreateLLMOptions };

export interface CreateLLMParams extends LLMAIConfig {
  callbacks?: CreateLLMOptions['callbacks'];
}

export function createLLM(provider: Provider, options: CreateLLMOptions): ChatModelInstance {
  if (provider === 'zhipu') {
    return createLLMZhipu(options);
  }
  return createLLMDashScope(options);
}

export function createLLMFromAIConfig(cfg: CreateLLMParams): ChatModelInstance {
  const opts: CreateLLMOptions = {
    apiKey: cfg.apiKey,
    endpoint: cfg.endpoint,
    model: cfg.model,
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens,
    callbacks: cfg.callbacks,
  };
  return createLLM(cfg.provider, opts);
}
