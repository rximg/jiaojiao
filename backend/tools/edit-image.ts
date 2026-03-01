/**
 * edit_image：图像编辑，调用 MultimodalPort（DashScope wan2.6-image 同步接口）
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getMultimodalPortAsync } from '../infrastructure/repositories.js';
import { normalizePromptInput } from '#backend/domain/inference/value-objects/content-input.js';
import type { EditImageParams } from '#backend/domain/inference/types.js';
import type { ToolConfig, ToolContext } from './registry.js';
import { registerTool } from './registry.js';

function create(config: ToolConfig, context: ToolContext) {
  const toolName = config.name ?? 'edit_image';
  const description = config.description ?? '编辑现有图片并生成新图';
  const serviceConfig = config.serviceConfig as { default_params?: Record<string, unknown> } | undefined;
  const defaultParams = serviceConfig?.default_params ?? {};

  return tool(
    async (params: {
      prompt?: string;
      promptFile?: string;
      imagePath?: string;
      imagePaths?: string[];
      size?: string;
      count?: number;
      model?: string;
      strength?: number;
      promptExtend?: boolean;
      watermark?: boolean;
      sessionId?: string;
    }) => {
      const merged = await context.requestApprovalViaHITL('ai.image_edit', params as Record<string, unknown>);
      const sessionId = (merged.sessionId as string) || context.getDefaultSessionId();
      const promptInput = normalizePromptInput({
        prompt: merged.prompt as string | { fromFile: string } | undefined,
        promptFile: merged.promptFile as string | undefined,
      });
      if (!promptInput) throw new Error('Either prompt or promptFile must be provided');

      const imagePathsFromArray = Array.isArray(merged.imagePaths)
        ? (merged.imagePaths as string[]).filter((it) => typeof it === 'string' && it.trim())
        : [];
      const singleImagePath = (merged.imagePath as string | undefined)?.trim();
      const imagePaths = imagePathsFromArray.length > 0
        ? imagePathsFromArray
        : singleImagePath
          ? [singleImagePath]
          : [];
      if (!imagePaths.length) {
        throw new Error('Either imagePath or imagePaths must be provided');
      }

      const port = await getMultimodalPortAsync();
      return port.editImage({
        prompt: promptInput,
        imagePaths,
        size: (merged.size as string) ?? (defaultParams.size as string) ?? '1280*1280',
        count: (merged.count as number) ?? (defaultParams.count as number) ?? 1,
        model: merged.model as string | undefined,
        promptExtend:
          (merged.promptExtend as boolean | undefined) ??
          (defaultParams.prompt_extend as boolean | undefined) ??
          true,
        watermark:
          (merged.watermark as boolean | undefined) ??
          (defaultParams.watermark as boolean | undefined) ??
          false,
        sessionId,
      } as EditImageParams);
    },
    {
      name: toolName,
      description,
      schema: z.object({
        prompt: z.string().optional().describe('图像编辑提示词（与promptFile二选一）'),
        promptFile: z.string().optional().describe('提示词文件路径（workspace相对路径，与prompt二选一）'),
        imagePath: z.string().optional().describe('单张参考图片路径（workspace相对路径）'),
        imagePaths: z.array(z.string()).optional().describe('多张参考图片路径（workspace相对路径）'),
        size: z.string().optional().default((defaultParams.size as string) ?? '1280*1280').describe('输出图片尺寸，如 1280*1280'),
        count: z.number().optional().default((defaultParams.count as number) ?? 1).describe('输出图片数量（1-4，默认1）'),
        model: z.string().optional().describe('模型名称（默认使用 AI 配置中的模型）'),
        strength: z.number().optional().describe('兼容参数，当前接口未使用'),
        promptExtend: z.boolean().optional().describe('是否启用提示词智能改写（默认true）'),
        watermark: z.boolean().optional().describe('是否添加水印（默认false）'),
        sessionId: z.string().optional().describe('文件写入使用的会话ID（留空则使用当前会话）'),
      }),
    }
  );
}

registerTool('edit_image', create);
