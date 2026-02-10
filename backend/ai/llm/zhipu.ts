/**
 * 智谱（GLM）LLM 适配：OpenAI 兼容接口，使用 ChatOpenAI + baseURL 指向智谱
 */
import { ChatOpenAI } from '@langchain/openai';
import type { LLMAIConfig } from '../types.js';
import type { CreateLLMOptions, ChatModelInstance } from './dashscope.js';

export function createLLMZhipu(options: CreateLLMOptions): ChatModelInstance {
  const { apiKey, baseURL, model, temperature = 0.1, maxTokens = 20000, callbacks = [] } = options;
  return new ChatOpenAI({
    apiKey,
    modelName: model,
    temperature,
    maxTokens,
    configuration: {
      baseURL: baseURL.replace(/\/$/, ''),
    },
    callbacks,
  }) as ChatModelInstance;
}

export function createLLMFromConfig(cfg: LLMAIConfig, callbacks: CreateLLMOptions['callbacks']): ChatModelInstance {
  return createLLMZhipu({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL,
    model: cfg.model,
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens,
    callbacks,
  });
}
