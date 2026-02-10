/**
 * 智谱 TTS：按官方文档实现（当前文档未给出完整 TTS 接口，先实现与通义一致的「请求→URL→下载」占位）
 * 若智谱提供异步 TTS，可在此改为 submit + poll 后取 URL 再下载
 */
import type { TTSAIConfig } from '../types.js';
import type { DoOneTtsOptions, DoOneTtsResult } from './dashscope.js';

export async function doOneTtsZhipu(options: DoOneTtsOptions): Promise<DoOneTtsResult> {
  const { cfg, sessionId, relativePath, workspaceFs } = options;
  // 智谱 TTS 若为同步：与 dashscope 类似，POST 后返回 url；若为异步：需先 POST 得 task_id，再轮询取 url
  const res = await fetch(cfg.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      input: { text: options.text },
      parameters: { format: options.format },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`TTS API error: ${res.status} ${res.statusText} ${body}`);
  }
  const data = (await res.json()) as { data?: { url?: string }; url?: string };
  const audioUrl = data?.data?.url ?? data?.url;
  if (!audioUrl) throw new Error('TTS API did not return audio URL');
  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) throw new Error(`TTS audio download failed: ${audioResponse.status}`);
  const buffer = Buffer.from(await audioResponse.arrayBuffer());
  const audioPath = await workspaceFs.writeFile(sessionId, relativePath, buffer);
  return { audioPath, audioUri: workspaceFs.toFileUri(audioPath) };
}
