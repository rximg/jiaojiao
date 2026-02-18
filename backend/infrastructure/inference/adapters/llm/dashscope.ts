/**
 * 通义（DashScope）LLM 适配：同步接口，仅 endpoint
 */
import { ChatOpenAI } from '@langchain/openai';
import type { LLMAIConfig } from '#backend/domain/inference/types.js';

export interface CreateLLMOptions {
  apiKey: string;
  endpoint: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  callbacks?: Array<{ handleLLMStart?: (args: unknown) => void; handleLLMEnd?: (args: unknown) => void }>;
}

export type ChatModelInstance = InstanceType<typeof ChatOpenAI>;

export function createLLMDashScope(options: CreateLLMOptions): ChatModelInstance {
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
  return createLLMDashScope({
    apiKey: cfg.apiKey,
    endpoint: cfg.endpoint,
    model: cfg.model,
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens,
    callbacks,
  });
}
