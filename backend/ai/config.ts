/**
 * AI 能力配置：从 loadConfig 与各 *_config.yaml 解析 provider、apiKey、endpoint
 */
import path from 'path';
import { promises as fs } from 'fs';
import jsyaml from 'js-yaml';
import { loadConfig } from '../app-config.js';
import type {
  Provider,
  AIAbility,
  LLMAIConfig,
  VLAIConfig,
  TTSAIConfig,
  T2IAIConfig,
  AIConfig,
  AiModelsSchema,
  ProviderAbilityModelsConfig,
} from './types.js';

const DEFAULT_DASHSCOPE_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DEFAULT_ZHIPU_BASE = 'https://open.bigmodel.cn/api/paas/v4';

function getConfigDir(): string {
  if (process.env.AGENT_CONFIG_DIR) {
    return path.resolve(process.env.AGENT_CONFIG_DIR);
  }
  return path.join(process.cwd(), 'backend', 'config');
}

async function loadYaml(name: string): Promise<Record<string, unknown>> {
  try {
    const configDir = getConfigDir();
    const filePath = path.join(configDir, 'ai', name);
    const content = await fs.readFile(filePath, 'utf-8');
    return (jsyaml.load(content) as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

/** 从 backend/config/ai_models.json 加载（第一层级为 provider） */
async function loadAiModels(): Promise<AiModelsSchema> {
  try {
    const configDir = getConfigDir();
    const filePath = path.join(configDir, 'ai_models.json');
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as AiModelsSchema;
  } catch (e) {
    throw new Error(`未能获取到 ai_models.json: ${(e as Error).message}`);
  }
}

/** 从 provider 优先的 schema 中取某能力配置，无则回退到 dashscope */
function getAbilityConfig(
  schema: AiModelsSchema,
  provider: Provider,
  ability: AIAbility
): ProviderAbilityModelsConfig {
  const byProvider = schema[provider]?.[ability] ?? schema.dashscope?.[ability];
  if (byProvider?.models?.length) return byProvider;
  return {
    default: ability === 'llm' ? 'qwen-plus-2025-12-01' : ability === 'vl' ? 'qwen3-vl-plus' : ability === 'tts' ? 'qwen-tts' : 'wan2.6-t2i',
    models: [],
  };
}

/**
 * 根据 provider、能力配置与可选指定模型，解析出实际使用的 model id。
 */
function resolveModel(abilityConfig: ProviderAbilityModelsConfig, specifiedModel?: string | null): string {
  const modelId = specifiedModel?.trim();
  const found = modelId ? abilityConfig.models.some((m) => m.id === modelId) : false;
  return found && modelId ? modelId : (abilityConfig.default || abilityConfig.models[0]?.id || '');
}

/**
 * 集成测试时可通过环境变量指定只测某一方：TEST_API_PROVIDER=zhipu | dashscope
 * 未设置时使用应用配置中的 agent.provider；未配置则抛异常，不回退默认值。
 */
function resolveProviderForAbility(
  agentProvider: Provider | undefined,
  _ability: AIAbility
): Provider {
  const envProvider = process.env.TEST_API_PROVIDER;
  if (envProvider === 'zhipu' || envProvider === 'dashscope') return envProvider;
  if (agentProvider !== 'zhipu' && agentProvider !== 'dashscope') {
    throw new Error(
      '未配置 AI 供应商（agent.provider）：请在应用设置中选择通义（dashscope）或智谱（zhipu）后再使用'
    );
  }
  return agentProvider;
}

/**
 * 获取指定能力的 AI 配置（provider、apiKey、endpoint 等）。
 * LLM 使用 agent.provider + apiKeys；多模态（VL/TTS/T2I）使用 agent.multimodalProvider + multimodalApiKeys。
 */
export async function getAIConfig(ability: AIAbility): Promise<AIConfig> {
  const appConfig = await loadConfig();
  const apiKeys = appConfig.apiKeys as { dashscope?: string; zhipu?: string };
  const multimodalApiKeys = (appConfig.multimodalApiKeys ?? appConfig.apiKeys) as { dashscope?: string; zhipu?: string };
  const aiModels = await loadAiModels();
  const agent = appConfig.agent as {
    model?: string;
    current?: string;
    provider?: Provider;
    multimodalProvider?: Provider;
    temperature?: number;
    maxTokens?: number;
  };
  const isLlm = ability === 'llm';
  const provider: Provider = resolveProviderForAbility(
    isLlm ? agent?.provider : (agent?.multimodalProvider ?? agent?.provider),
    ability
  );
  const abilityConfig = getAbilityConfig(aiModels, provider, ability);
  /** 用户当前选择的模型（current 优先，空则用 model；空字符串时 resolveModel 使用 ai_models 默认） */
  const raw = (ability === 'llm' ? (agent?.current ?? agent?.model) : agent?.model)?.trim();
  const specifiedModelForUser = raw || undefined;

  const keysForAbility = isLlm ? apiKeys : multimodalApiKeys;
  const getApiKey = (p: Provider): string => {
    const key = (keysForAbility[p] ?? '').trim();
    if (!key) {
      const label = isLlm ? 'LLM' : '多模态（视觉/语音/图像）';
      throw new Error(
        `未配置 ${label} API Key：请在应用设置中配置${p === 'zhipu' ? '智谱（Zhipu）' : '通义（DashScope）'}的 API Key`
      );
    }
    return key;
  };

  switch (ability) {
    case 'llm': {
      const model = resolveModel(abilityConfig, specifiedModelForUser);
      const apiKey = getApiKey(provider);
      const baseURL = provider === 'zhipu' ? DEFAULT_ZHIPU_BASE : (process.env.DASHSCOPE_BASE_URL ?? DEFAULT_DASHSCOPE_BASE);
      const cfg: LLMAIConfig = {
        provider,
        apiKey,
        baseURL: baseURL.replace(/\/$/, ''),
        model,
        temperature: agent?.temperature ?? 0.1,
        maxTokens: agent?.maxTokens ?? 20000,
      };
      return cfg;
    }
    case 'vl': {
      const yaml = await loadYaml('vl_script_config.yaml');
      const service = (yaml.service as Record<string, unknown>) ?? {};
      const model = resolveModel(abilityConfig);
      const apiKey = getApiKey(provider);
      const baseUrl =
        provider === 'zhipu'
          ? DEFAULT_ZHIPU_BASE
          : (process.env.DASHSCOPE_VL_BASE_URL as string) ?? (service.base_url as string) ?? DEFAULT_DASHSCOPE_BASE;
      const promptFromConfig = service.prompt as string | undefined;
      const fallbackPrompt = `你是一个有声绘本台词设计师，找出图片中的元素，给每个元素设计一个台词。返回一个列表，列表里是台词和对应元素坐标，坐标原点为图片左上角。 格式为：[{"text": "台词", "x": "x坐标", "y": "y坐标"}]`;
      const prompt = promptFromConfig && String(promptFromConfig).trim() ? String(promptFromConfig).trim() : fallbackPrompt;
      const cfg: VLAIConfig = {
        provider,
        apiKey,
        baseUrl: baseUrl.replace(/\/$/, ''),
        model,
        prompt,
      };
      return cfg;
    }
    case 'tts': {
      const yaml = await loadYaml('tts_config.yaml');
      const service = (yaml.service as Record<string, unknown>) ?? {};
      const model = resolveModel(abilityConfig);
      const apiKey = getApiKey(provider);
      const endpoint =
        provider === 'zhipu'
          ? `${DEFAULT_ZHIPU_BASE.replace(/\/$/, '')}/audio/speech`
          : (process.env.DASHSCOPE_TTS_ENDPOINT as string) ??
            (service.endpoint as string) ??
            'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
      const batch = (service.batch as { delay?: number }) ?? {};
      const rateLimitMs = Number(process.env.TTS_RATE_LIMIT_MS) || (typeof batch.delay === 'number' ? batch.delay : 2000);
      const cfg: TTSAIConfig = {
        provider,
        apiKey,
        endpoint,
        model,
        rateLimitMs,
      };
      return cfg;
    }
    case 't2i': {
      const yaml = await loadYaml('t2i_config.yaml');
      const service = (yaml.service as Record<string, unknown>) ?? {};
      const defaultParams = (service.default_params as Record<string, unknown>) ?? {};
      const model = resolveModel(abilityConfig);
      const apiKey = getApiKey(provider);
      const endpoint =
        provider === 'zhipu'
          ? `${DEFAULT_ZHIPU_BASE.replace(/\/$/, '')}/async/images/generations`
          : (process.env.DASHSCOPE_T2I_ENDPOINT as string) ?? (service.endpoint as string) ?? 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation';
      const taskEndpoint =
        provider === 'zhipu'
          ? `${DEFAULT_ZHIPU_BASE.replace(/\/$/, '')}/async-result`
          : (process.env.DASHSCOPE_T2I_RESULT_ENDPOINT as string) ?? (service.task_endpoint as string) ?? 'https://dashscope.aliyuncs.com/api/v1/tasks';
      const negativePrompt =
        typeof defaultParams.negative_prompt === 'string'
          ? defaultParams.negative_prompt
          : typeof service.negative_prompt === 'string'
            ? service.negative_prompt
            : undefined;
      const cfg: T2IAIConfig = {
        provider,
        apiKey,
        endpoint,
        taskEndpoint: taskEndpoint.replace(/\/$/, ''),
        model,
        ...(negativePrompt ? { negativePrompt } : {}),
      };
      return cfg;
    }
    default:
      throw new Error(`Unknown ability: ${ability}`);
  }
}
