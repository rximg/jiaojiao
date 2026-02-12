/**
 * 智谱 VL：chat/completions 多模态，与 OpenAI 兼容格式（content 中 type: "image_url", image_url: { url }）。
 * 本地图片无 http URL，传 base64 时使用 Data URL：dataUrl = `data:image/png;base64,<base64>`，由调用方（如 index.ts）拼好传入。
 */
import type { VLAIConfig } from '../types.js';

export interface CallVLParams {
  cfg: VLAIConfig;
  /** 图片 URL 或 Data URL（本地图用 base64：data:image/png;base64,...） */
  dataUrl: string;
  prompt: string;
}

/** 调用智谱多模态接口，返回助手回复文本（应为 JSON 数组字符串） */
export async function callVLZhipu(params: CallVLParams): Promise<string> {
  const { cfg, dataUrl, prompt } = params;
  const chatUrl = cfg.baseUrl.replace(/\/$/, '') + '/chat/completions';
  const body = {
    model: cfg.model,
    messages: [
      {
        role: 'user' as const,
        content: [
          { type: 'image_url' as const, image_url: { url: dataUrl } },
          { type: 'text' as const, text: prompt },
        ],
      },
    ],
  };

  const res = await fetch(chatUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`VL API failed: ${res.status} ${res.statusText} ${text}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data?.choices?.[0]?.message?.content;
  if (content == null || typeof content !== 'string') {
    throw new Error('VL API did not return message content');
  }
  return content;
}
