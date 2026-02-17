/**
 * synthesize_speech：语音合成，调用 MultimodalPort
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getArtifactRepository, getMultimodalPort } from '../infrastructure/repositories.js';
import type { SynthesizeSpeechParams } from '#backend/domain/inference/types.js';
import type { ToolConfig, ToolContext } from './registry.js';
import { registerTool } from './registry.js';

function create(config: ToolConfig, context: ToolContext) {
  const toolName = config.name ?? 'synthesize_speech';
  const description = config.description ?? '合成语音';
  const defaultParams = config.serviceConfig?.service?.default_params ?? {};
  const defaultVoice = (defaultParams.voice as string) ?? 'chinese_female';
  const defaultFormat = (defaultParams.format as string) ?? 'mp3';

  return tool(
    async (params: { texts?: string[]; voice?: string; format?: string; sessionId?: string }) => {
      const merged = await context.requestApprovalViaHITL('ai.text2speech', params as Record<string, unknown>);
      const sessionId = (merged.sessionId as string) || context.getDefaultSessionId();
      const texts = Array.isArray(merged.texts) ? merged.texts : [];

      const artifactRepo = getArtifactRepository();
      const scriptRelPath = 'lines/tts_confirmed.json';
      await artifactRepo.write(sessionId, scriptRelPath, JSON.stringify(texts, null, 2));

      const port = getMultimodalPort();
      return port.synthesizeSpeech({
        content: { fromFile: scriptRelPath },
        voice: (merged.voice as string) ?? defaultVoice,
        format: (merged.format as string) ?? defaultFormat,
        sessionId,
      } as SynthesizeSpeechParams);
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
