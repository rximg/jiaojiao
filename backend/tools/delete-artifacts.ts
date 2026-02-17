/**
 * delete_artifacts：删除 session 下的图片/音频等产物
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getArtifactRepository } from '../infrastructure/repositories.js';
import type { ToolConfig, ToolContext } from './registry.js';
import { registerTool } from './registry.js';

function create(_config: ToolConfig, context: ToolContext) {
  const artifactRepo = getArtifactRepository();
  return tool(
    async (input: { sessionId?: string; category?: 'images' | 'audio' | 'both'; paths?: string[] }) => {
      const sessionId = input.sessionId || context.getDefaultSessionId();
      let pathsToDelete: string[] = [];

      if (input.paths?.length) {
        pathsToDelete = input.paths.map((p) => p.replace(/\\/g, '/').replace(/^[^/]+[/\\]/, ''));
      } else {
        const category = input.category || 'both';
        if (category === 'images' || category === 'both') {
          const entries = await artifactRepo.list(sessionId, 'images');
          pathsToDelete.push(...entries.filter((e) => !e.isDir).map((e) => `images/${e.name}`));
        }
        if (category === 'audio' || category === 'both') {
          const entries = await artifactRepo.list(sessionId, 'audio');
          pathsToDelete.push(...entries.filter((e) => !e.isDir).map((e) => `audio/${e.name}`));
        }
      }

      if (pathsToDelete.length === 0) {
        return { success: true, deleted: 0, message: '无待删除文件' };
      }

      const merged = await context.requestApprovalViaHITL('artifacts.delete', {
        sessionId,
        paths: pathsToDelete,
      });
      const confirmedPaths = (merged.paths as string[]) ?? [];
      if (confirmedPaths.length === 0) {
        return { success: true, deleted: 0, message: '用户取消删除' };
      }

      let deleted = 0;
      for (const relPath of confirmedPaths) {
        try {
          await artifactRepo.delete(sessionId, relPath);
          deleted++;
        } catch (err) {
          console.warn(`[delete_artifacts] Failed to delete ${relPath}:`, err);
        }
      }
      return { success: true, deleted, message: `已删除 ${deleted} 个文件` };
    },
    {
      name: 'delete_artifacts',
      description:
        '删除当前 session 下的产物（图片、音频等）。重新生成前需先调用此工具删除旧产物。category 为 images|audio|both；也可直接传 paths 数组。',
      schema: z.object({
        sessionId: z.string().optional().describe('会话ID（留空使用当前会话）'),
        category: z.enum(['images', 'audio', 'both']).optional().default('both').describe('要删除的类别'),
        paths: z.array(z.string()).optional().describe('指定要删除的路径（相对 session），若提供则忽略 category'),
      }),
    }
  );
}

registerTool('delete_artifacts', create);
