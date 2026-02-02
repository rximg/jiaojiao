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

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
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
  apiKeys: {
    dashscope: string;
    t2i?: string;
    tts?: string;
  };
  agent: {
    model: string;
    temperature: number;
    maxTokens: number;
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
