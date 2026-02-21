/**
 * annotate_image_numbers：在图片上按坐标绘制白底数字标签并保存
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { loadConfig } from '../app-config.js';
import { getWorkspaceFilesystem } from '../services/fs.js';
import { annotateImageNumbers } from '../services/image-annotation.js';
import { readLineNumbers } from './line-numbers.js';
import type { ToolConfig, ToolContext } from './registry.js';
import { registerTool } from './registry.js';

function create(_config: ToolConfig, context: ToolContext) {
  return tool(
    async (input: {
      imagePath: string;
      annotations?: Array<{ number: number; x: number; y: number }>;
      lines?: Array<{ text?: string; x: number; y: number }>;
      numbers?: number[];
      sessionId?: string;
    }) => {
      const sessionId = input.sessionId || context.getDefaultSessionId();
      let annotations: Array<{ number: number; x: number; y: number }>;

      if (input.annotations?.length) {
        annotations = input.annotations;
      } else if (input.lines?.length) {
        let numbers: number[];
        if (input.numbers?.length === input.lines.length) {
          numbers = input.numbers;
        } else {
          const config = await loadConfig();
          const { entries } = await readLineNumbers(config.storage.ttsStartNumber ?? 6000);
          const sessionEntries = entries.filter((e) => e.sessionId === sessionId);
          const n = input.lines.length;
          const lastN = sessionEntries.slice(-n);
          numbers = lastN.map((e) => e.number);
        }
        annotations = input.lines.map((line, i) => ({
          number: numbers[i] ?? i + 1,
          x: line.x,
          y: line.y,
        }));
      } else {
        throw new Error('annotate_image_numbers 需要 annotations 或 lines 参数');
      }

      let imageWidth: number | undefined;
      let imageHeight: number | undefined;
      try {
        const workspaceFs = getWorkspaceFilesystem({});
        const normalized = input.imagePath.replace(/\\/g, '/');
        const workspacesMatch = normalized.match(/workspaces\/([^/]+)\/(.+)$/);
        const relPath = workspacesMatch ? workspacesMatch[2] : normalized.replace(/^[^/]+[/\\]/, '');
        const absPath = workspaceFs.sessionPath(sessionId, relPath);
        const sharp = (await import('sharp')).default;
        const meta = await sharp(absPath).metadata();
        imageWidth = meta.width ?? undefined;
        imageHeight = meta.height ?? undefined;
      } catch {
        // 忽略尺寸获取失败
      }

      const hitlPayload: Record<string, unknown> = {
        imagePath: input.imagePath,
        annotations,
        lines: input.lines,
        numbers: input.numbers,
        sessionId,
      };
      if (imageWidth != null) hitlPayload.imageWidth = imageWidth;
      if (imageHeight != null) hitlPayload.imageHeight = imageHeight;

      const merged = await context.requestApprovalViaHITL('ai.image_label_order', hitlPayload);
      const finalAnnotations = (merged.annotations as Array<{ number: number; x: number; y: number }>) ?? annotations;

      return annotateImageNumbers({
        imagePath: input.imagePath,
        annotations: finalAnnotations,
        sessionId,
      });
    },
    {
      name: 'annotate_image_numbers',
      description:
        '在图片上按坐标绘制白底数字标签并保存为新图（如 images/xxx_annotated.png）。使用 lines 时，优先使用 numbers 参数（来自 TTS 返回），否则从 audio_record.json 读取；使用 annotations 时直接使用传入的 number。',
      schema: z.object({
        imagePath: z
          .string()
          .describe('当前 session 下图片路径（与 generate_image / generate_script_from_image 一致）'),
        annotations: z
          .array(z.object({ number: z.number(), x: z.number(), y: z.number() }))
          .optional()
          .describe('标注点：number, x, y；与 lines 二选一'),
        lines: z
          .array(z.object({ text: z.string().optional(), x: z.number(), y: z.number() }))
          .optional()
          .describe(
            'vl_script 返回的 lines，序号将使用 numbers 参数（如果提供）或 audio_record.json 中当前 session 对应条目的 number'
          ),
        numbers: z
          .array(z.number())
          .optional()
          .describe('可选的 number 列表（来自 TTS 返回的 numbers），与 lines 按索引一一对应'),
        sessionId: z.string().optional().describe('会话ID（留空使用当前会话）'),
      }),
    }
  );
}

registerTool('annotate_image_numbers', create);
