/**
 * 智谱（GLM）LLM 适配：同步接口，仅 endpoint
 */
import { ChatOpenAI } from '@langchain/openai';
import type { LLMAIConfig } from '#backend/domain/inference/types.js';
import type { CreateLLMOptions, ChatModelInstance } from './dashscope.js';

export function createLLMZhipu(options: CreateLLMOptions): ChatModelInstance {
  const { apiKey, endpoint, model, temperature = 0.1, maxTokens = 20000, callbacks = [] } = options;
  return new ChatOpenAI({
    apiKey,
    modelName: model,
    temperature,
    maxTokens,
    configuration: {
      baseURL: endpoint.replace(/\/$/, ''),
    },
    callbacks,
  }) as ChatModelInstance;
}

export function createLLMFromConfig(
  cfg: LLMAIConfig,
  callbacks: CreateLLMOptions['callbacks']
): ChatModelInstance {
  return createLLMZhipu({
    apiKey: cfg.apiKey,
    endpoint: cfg.endpoint,
    model: cfg.model,
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens,
    callbacks,
  });
}
