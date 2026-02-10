/**
 * LLM 工厂：根据 provider 创建 LangChain Chat 模型
 */
import type { Provider } from '../types.js';
import type { LLMAIConfig } from '../types.js';
import { createLLMDashScope, type CreateLLMOptions, type ChatModelInstance } from './dashscope.js';
import { createLLMZhipu } from './zhipu.js';

export type { ChatModelInstance, CreateLLMOptions };

export interface CreateLLMParams extends LLMAIConfig {
  callbacks?: CreateLLMOptions['callbacks'];
}

/**
 * 根据 provider 创建 LLM 实例（与供应商无关的入口）
 */
export function createLLM(provider: Provider, options: CreateLLMOptions): ChatModelInstance {
  if (provider === 'zhipu') {
    return createLLMZhipu(options);
  }
  return createLLMDashScope(options);
}

/**
 * 从完整 LLM 配置创建（含 callbacks），供 AgentFactory 等调用
 */
export function createLLMFromAIConfig(cfg: CreateLLMParams): ChatModelInstance {
  const opts: CreateLLMOptions = {
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL,
    model: cfg.model,
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens,
    callbacks: cfg.callbacks,
  };
  return createLLM(cfg.provider, opts);
}
