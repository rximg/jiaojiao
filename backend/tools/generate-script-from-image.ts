/**
 * generate_script_from_image：以图生剧本，调用 MultimodalPort（prompt 来自 config/tools/vl_script.yaml）
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getMultimodalPortAsync } from '../infrastructure/repositories.js';
import type { GenerateScriptFromImageParams } from '#backend/domain/inference/types.js';
import type { ToolConfig, ToolContext } from './registry.js';
import { registerTool } from './registry.js';

function create(config: ToolConfig, context: ToolContext) {
  const toolName = config.name ?? 'generate_script_from_image';
  const description = config.description ?? '根据图片路径，用视觉模型生成台词及坐标';
  const promptFromConfig = (config.serviceConfig as { prompt?: string })?.prompt as string | undefined;

  return tool(
    async (params: { imagePath: string; sessionId?: string; userPrompt?: string }) => {
      const merged = await context.requestApprovalViaHITL('ai.vl_script', params as Record<string, unknown>);
      const sessionId = (merged.sessionId as string) || context.getDefaultSessionId();

      const port = await getMultimodalPortAsync();
      return port.generateScriptFromImage({
        imagePath: merged.imagePath as string,
        sessionId,
        userPrompt: merged.userPrompt as string | undefined,
        prompt: promptFromConfig,
      } as GenerateScriptFromImageParams);
    },
    {
      name: toolName,
      description,
      schema: z.object({
        imagePath: z.string().describe('图片路径（步骤3 generate_image 返回的 imagePath）'),
        sessionId: z.string().optional().describe('会话ID（留空则使用当前会话）'),
        userPrompt: z
          .string()
          .optional()
          .describe('用户对以图生剧本的补充或修改要求，会与系统提示词一起传给 VL'),
      }),
    }
  );
}

registerTool('generate_script_from_image', create);
