/**
 * 通义（DashScope）LLM 适配：LangChain ChatOpenAI + baseURL
 */
import { ChatOpenAI } from '@langchain/openai';
import type { LLMAIConfig } from '../types.js';
import type { BaseMessage, BaseChatMessage } from '@langchain/core/messages';

export interface CreateLLMOptions {
  apiKey: string;
  baseURL: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  callbacks?: Array<{ handleLLMStart?: (args: unknown) => void; handleLLMEnd?: (args: unknown) => void }>;
}

export type ChatModelInstance = InstanceType<typeof ChatOpenAI>;

export function createLLMDashScope(options: CreateLLMOptions): ChatModelInstance {
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
  return createLLMDashScope({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL,
    model: cfg.model,
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens,
    callbacks,
  });
}
