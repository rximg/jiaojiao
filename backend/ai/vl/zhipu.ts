/**
 * 智谱 VL：chat/completions 多模态（content 中 type: "image", image_url）
 */
import type { VLAIConfig } from '../types.js';

export interface CallVLParams {
  cfg: VLAIConfig;
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
          { type: 'image', image_url: dataUrl },
          { type: 'text', text: prompt },
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
