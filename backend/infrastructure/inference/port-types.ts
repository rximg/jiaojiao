/**
 * 推理端口入参/出参类型（infrastructure 层，供 SyncInferencePort / AsyncInferencePort 使用）
 */

export interface VLPortInput {
  dataUrl: string;
  prompt: string;
}

export interface T2IPortInput {
  prompt: string;
  parameters: Record<string, unknown>;
}

export interface EditImagePortInput {
  model?: string;
  prompt: string;
  imageDataUrls: string[];
  parameters: {
    size: string;
    n: number;
    prompt_extend: boolean;
    watermark: boolean;
    enable_interleave: boolean;
  };
}

export interface TTSPortInput {
  text: string;
  voice: string;
}

export interface TtsAsyncPortOutput {
  audioUrl: string;
}
