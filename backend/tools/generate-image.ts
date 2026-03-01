/**
 * generate_image：文生图，调用 MultimodalPort（配置来自 config/tools/t2i.yaml）
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getMultimodalPortAsync } from '../infrastructure/repositories.js';
import { normalizePromptInput } from '#backend/domain/inference/value-objects/content-input.js';
import type { GenerateImageParams } from '#backend/domain/inference/types.js';
import type { ToolConfig, ToolContext } from './registry.js';
import { registerTool } from './registry.js';

function create(config: ToolConfig, context: ToolContext) {
  const toolName = config.name ?? 'generate_image';
  const description = config.description ?? '生成绘本图片';
  const serviceConfig = config.serviceConfig;
  const defaultParams = (serviceConfig as { default_params?: Record<string, unknown>; negative_prompt?: string })?.default_params ?? {};
  const negativePromptFromConfig = (serviceConfig as { negative_prompt?: string })?.negative_prompt as string | undefined;

  return tool(
    async (params: {
      prompt?: string;
      promptFile?: string;
      imageName?: string;
      size?: string;
      style?: string;
      count?: number;
      model?: string;
      sessionId?: string;
    }) => {
      const merged = await context.requestApprovalViaHITL('ai.text2image', params as Record<string, unknown>);
      const sessionId = (merged.sessionId as string) || context.getDefaultSessionId();
      const promptInput = normalizePromptInput({
        prompt: merged.prompt as string | { fromFile: string } | undefined,
        promptFile: merged.promptFile as string | undefined,
      });
      if (!promptInput) throw new Error('Either prompt or promptFile must be provided');

      const port = await getMultimodalPortAsync();
      return port.generateImage({
        prompt: promptInput,
        imageName: (merged.imageName as string | undefined)?.trim() || undefined,
        size: (merged.size as string) ?? (defaultParams.size as string) ?? '1024*1024',
        style: merged.style as string | undefined,
        count: (merged.count as number) ?? (defaultParams.count as number) ?? 1,
        model: merged.model as string | undefined,
        sessionId,
        negativePrompt: negativePromptFromConfig,
      } as GenerateImageParams);
    },
    {
      name: toolName,
      description,
      schema: z.object({
        prompt: z.string().optional().describe('文生图提示词（与promptFile二选一）'),
        promptFile: z.string().optional().describe('提示词文件路径（workspace相对路径，与prompt二选一）'),
        imageName: z.string().optional().describe('输出文件名，如 rabbit_角色.png（不含路径）'),
        size: z.string().optional().default((defaultParams.size as string) ?? '1024*1024').describe('图片尺寸'),
        style: z.string().optional().describe('图片风格'),
        count: z.number().optional().default((defaultParams.count as number) ?? 1).describe('生成数量'),
        model: z.string().optional().describe('模型名称'),
        sessionId: z.string().optional().describe('文件写入使用的会话ID（留空则使用当前会话）'),
      }),
    }
  );
}

registerTool('generate_image', create);
