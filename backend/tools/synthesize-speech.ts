/**
 * synthesize_speech：语音合成，调用 MultimodalPort（line_numbers 在 tools 层，端口只接收 items）
 */
import path from 'path';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getArtifactRepository, getMultimodalPortAsync } from '../infrastructure/repositories.js';
import { readLineNumbers, appendEntries, type LineNumberEntry } from './line-numbers.js';
import { loadConfig } from '../app-config.js';
import type { ToolConfig, ToolContext } from './registry.js';
import { registerTool } from './registry.js';

function sanitizeForFilename(text: string, maxLen = 40): string {
  const noPunctuation = text.replace(/[\s\p{P}\p{S}]/gu, '').trim();
  const truncated = noPunctuation.slice(0, maxLen);
  const safe = truncated.replace(/[/\\:*?"<>|]/g, '_');
  return safe || 'line';
}

function create(config: ToolConfig, context: ToolContext) {
  const toolName = config.name ?? 'synthesize_speech';
  const description = config.description ?? '合成语音';
  const serviceConfig = config.serviceConfig as {
    default_params?: Record<string, unknown>;
    batch?: { delay?: number };
  };
  const defaultParams = serviceConfig?.default_params ?? {};
  const defaultVoice = (defaultParams.voice as string) ?? 'chinese_female';
  const defaultFormat = (defaultParams.format as string) ?? 'mp3';
  const rateLimitMs = serviceConfig?.batch?.delay ?? 2000;

  return tool(
    async (params: { texts?: string[]; voice?: string; format?: string; sessionId?: string }) => {
      const merged = await context.requestApprovalViaHITL('ai.text2speech', params as Record<string, unknown>);
      const sessionId = (merged.sessionId as string) || context.getDefaultSessionId();
      const texts = Array.isArray(merged.texts) ? merged.texts : [];

      const artifactRepo = getArtifactRepository();
      const scriptRelPath = 'lines/tts_confirmed.json';
      await artifactRepo.write(sessionId, scriptRelPath, JSON.stringify(texts, null, 2));

      const appConfig = await loadConfig();
      const ttsStartNumber = appConfig.storage?.ttsStartNumber ?? 6000;
      const { nextNumber } = await readLineNumbers(ttsStartNumber);
      const voice = (merged.voice as string) ?? defaultVoice;
      const format = (merged.format as string) ?? defaultFormat;
      const items = texts.map((text, i) => {
        const num = nextNumber + i;
        const relativePath = path.posix.join('audio', `${num}_${sanitizeForFilename(text)}.${format}`);
        return { text, relativePath, number: num };
      });

      const port = await getMultimodalPortAsync();
      const runCtx = context.getRunContext?.();
      const onProgress =
        runCtx?.onTtsProgress && runCtx.threadId
          ? (current: number, total: number, path: string) => {
              runCtx.onTtsProgress!(runCtx.threadId!, runCtx.messageId, runCtx.toolCallId, current, total, path);
            }
          : undefined;
      const result = await port.synthesizeSpeech({
        items,
        voice,
        format,
        sessionId,
        rateLimitMs,
        ...(onProgress ? { onProgress } : {}),
      });

      const newEntries: LineNumberEntry[] = items.map((p) => ({
        number: p.number!,
        sessionId,
        relativePath: p.relativePath,
        text: p.text,
      }));
      await appendEntries(newEntries, ttsStartNumber);

      return result;
    },
    {
      name: toolName,
      description,
      schema: z.object({
        texts: z.array(z.string()).describe('台词文本数组'),
        voice: z.string().optional().default(defaultVoice).describe('语音类型'),
        format: z.string().optional().default(defaultFormat).describe('音频格式'),
        sessionId: z.string().optional().describe('文件写入使用的会话ID（留空则使用当前会话）'),
      }),
    }
  );
}

registerTool('synthesize_speech', create);
