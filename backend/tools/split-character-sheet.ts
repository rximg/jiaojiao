import path from 'path';
import sharp from 'sharp';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getArtifactRepository } from '../infrastructure/repositories.js';
import type { ToolConfig, ToolContext } from './registry.js';
import { registerTool } from './registry.js';

function normalizeRelativePath(imagePath: string, sessionId: string): string {
  const normalized = imagePath.replace(/\\/g, '/').trim();
  const marker = `/workspaces/${sessionId}/`;
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex >= 0) {
    return normalized.slice(markerIndex + marker.length);
  }
  return normalized.replace(/^\/+/, '');
}

function ensureEvenSplit(value: number, label: string): void {
  if (value <= 0 || value % 2 !== 0) {
    throw new Error(`${label} must be a positive even number for 2x2 splitting`);
  }
}

function create(config: ToolConfig, context: ToolContext) {
  const toolName = config.name ?? 'split_character_sheet';
  const description = config.description ?? '将 2x2 四宫格角色图拆分为四张单角色参考图';
  const artifactRepo = getArtifactRepository();

  return tool(
    async (params: {
      imagePath?: string;
      outputDir?: string;
      sessionId?: string;
    }) => {
      const sessionId = params.sessionId?.trim() || context.getDefaultSessionId();
      const relativeImagePath = normalizeRelativePath(
        params.imagePath?.trim() || 'images/character_sheet_4grid.png',
        sessionId
      );
      const outputDir = (params.outputDir?.trim() || 'images').replace(/\\/g, '/').replace(/\/+$/, '');

      const rawImage = await artifactRepo.read(sessionId, relativeImagePath);
      const imageBuffer = Buffer.isBuffer(rawImage) ? rawImage : Buffer.from(rawImage);
      const image = sharp(imageBuffer);
      const metadata = await image.metadata();

      if (!metadata.width || !metadata.height) {
        throw new Error('Unable to determine character sheet dimensions');
      }

      ensureEvenSplit(metadata.width, 'Image width');
      ensureEvenSplit(metadata.height, 'Image height');

      const cellWidth = metadata.width / 2;
      const cellHeight = metadata.height / 2;
      const slots = [
        { name: 'slot1', left: 0, top: 0, relativePath: `${outputDir}/character_slot1.png` },
        { name: 'slot2', left: cellWidth, top: 0, relativePath: `${outputDir}/character_slot2.png` },
        { name: 'slot3', left: 0, top: cellHeight, relativePath: `${outputDir}/character_slot3.png` },
        { name: 'slot4', left: cellWidth, top: cellHeight, relativePath: `${outputDir}/character_slot4.png` },
      ] as const;

      await Promise.all(
        slots.map(async (slot) => {
          const slotBuffer = await image
            .clone()
            .extract({ left: slot.left, top: slot.top, width: cellWidth, height: cellHeight })
            .png()
            .toBuffer();
          await artifactRepo.write(sessionId, slot.relativePath, slotBuffer);
        })
      );

      return {
        imagePath: relativeImagePath,
        outputDir,
        cellSize: `${cellWidth}*${cellHeight}`,
        slotImages: Object.fromEntries(slots.map((slot) => [slot.name, slot.relativePath])),
        absoluteSlotImages: Object.fromEntries(
          slots.map((slot) => [slot.name, artifactRepo.resolvePath(sessionId, slot.relativePath)])
        ),
      };
    },
    {
      name: toolName,
      description,
      schema: z.object({
        imagePath: z.string().optional().describe('四宫格角色图路径，可传相对路径或当前会话下的绝对路径'),
        outputDir: z.string().optional().describe('输出目录，默认 images'),
        sessionId: z.string().optional().describe('会话ID（留空则使用当前会话）'),
      }),
    }
  );
}

registerTool('split_character_sheet', create);