export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  status: "pending" | "completed" | "error" | "interrupted";
}

export interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
  updatedAt?: Date;
  artifacts?: {
    images?: Array<{ path: string; prompt?: string }>;
    audio?: Array<{ path: string; text?: string }>;
    llmOutput?: any;
  };
}

export interface Thread {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  lastMessage?: string;
}

/** 单条步骤结果，用于聊天流中渲染文档/图片/音频块 */
export type StepResult =
  | { type: 'image'; payload: { path: string; prompt?: string } }
  | { type: 'audio'; payload: { path: string; text?: string } }
  | { type: 'document'; payload: { pathOrContent: string; title?: string } };

/** 已结束的 HITL 确认记录，用于在聊天历史中保留确认块 */
export interface HitlBlockRecord {
  requestId: string;
  actionType: string;
  payload: Record<string, unknown>;
  approved: boolean;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  /** 与该条消息关联的步骤结果（文档/图片/音频），由 agent:stepResult 写入 */
  stepResults?: StepResult[];
  /** 已结束的 HITL 确认块，用于在历史中显示并保留「继续/取消」结果 */
  hitlBlock?: HitlBlockRecord;
}

export interface Book {
  id: string;
  title: string;
  createdAt: string;
  premise: {
    age: number;
    theme: string;
    style: string;
    language: string;
  };
  images: Array<{
    path: string;
    prompt: string;
  }>;
  scripts: Array<{
    text: string;
    audioPath: string;
    order: number;
  }>;
}

export interface AppConfig {
  /** 配置版本号，与 package.json version 一致（如 "1.0.0"） */
  configVersion?: string;
  /** LLM 专用：按供应商区分的 API Key */
  apiKeys: {
    dashscope?: string;
    zhipu?: string;
  };
  /** 多模态（VL/TTS/T2I）专用：按供应商区分的 API Key */
  multimodalApiKeys?: {
    dashscope?: string;
    zhipu?: string;
  };
  agent: {
    /** 当前使用的模型 id，为空时使用默认模型（见 ai_models.json） */
    model: string;
    /** 用户当前选择的模型，首次加载为空则使用默认模型 */
    current?: string;
    temperature: number;
    maxTokens: number;
    /** LLM 供应商：dashscope（阿里百炼）| zhipu（智谱） */
    provider?: 'dashscope' | 'zhipu';
    /** 多模态（VL/TTS/T2I）供应商，可与 LLM 不同 */
    multimodalProvider?: 'dashscope' | 'zhipu';
  };
  storage: {
    outputPath: string;
    /** TTS 起始编号，如 6000，后续生成 6001、6002… */
    ttsStartNumber?: number;
  };
  ui: {
    theme: "light" | "dark";
    language: "zh" | "en";
    welcome?: WelcomeConfig;
    quickOptions?: QuickOption[];
    /** @deprecated 使用 quickOptions，YAML/后端兼容 */
    quick_options?: QuickOption[];
  };
}

export interface WelcomeConfig {
  title: string;
  subtitle: string;
  instructions: {
    title: string;
    items: string[];
  };
  footer: string;
}

export interface QuickOption {
  label: string;
  description: string;
  prompt: string;
}
