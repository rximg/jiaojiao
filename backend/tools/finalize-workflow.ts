/**
 * finalize_workflow：检查图片、音频、台词文件是否齐全，完成工作流
 * - 支持 audioPath 为目录（如 sessionId/audio）：按目录 list，存在非 .gitkeep 文件即视为有音频
 * - 对图片/音频检查做短暂重试，缓解写入刚完成时文件系统未同步导致的“找不到”
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getArtifactRepository } from '../infrastructure/repositories.js';
import type { ToolConfig, ToolContext } from './registry.js';
import { registerTool } from './registry.js';

const CHECK_RETRIES = 3;
const CHECK_RETRY_DELAY_MS = 350;

function extractRelativePath(absolutePath: string, expectedSessionId: string): string {
  const normalized = absolutePath.replace(/\\/g, '/');
  const workspacesMatch = normalized.match(/workspaces\/([^/]+)\/(.+)$/);
  if (workspacesMatch) {
    const pathSessionId = workspacesMatch[1];
    const relativePath = workspacesMatch[2];
    if (pathSessionId === expectedSessionId) return relativePath;
    console.warn(`[finalize_workflow] SessionId mismatch: expected ${expectedSessionId}, found ${pathSessionId}`);
  }
  return absolutePath;
}

function isLikelyAudioDir(relativePath: string): boolean {
  const n = relativePath.replace(/\\/g, '/').replace(/\/+$/, '');
  return n === 'audio' || n.endsWith('/audio') || !/[./]/.test(n);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function create(_config: ToolConfig, _context: ToolContext) {
  const artifactRepo = getArtifactRepository();
  return tool(
    async (input: { imagePath?: string; audioPath?: string; scriptText?: string; sessionId?: string }) => {
      const sessionId = input.sessionId || _context.getDefaultSessionId();
      const checks = { hasImage: false, hasAudio: false, hasScript: !!input.scriptText };

      if (input.imagePath) {
        const relPath = extractRelativePath(input.imagePath, sessionId);
        for (let attempt = 1; attempt <= CHECK_RETRIES; attempt++) {
          try {
            await artifactRepo.read(sessionId, relPath);
            checks.hasImage = true;
            break;
          } catch {
            if (attempt < CHECK_RETRIES) await sleep(CHECK_RETRY_DELAY_MS);
            else console.warn(`[finalize_workflow] Image not found: ${input.imagePath}`);
          }
        }
      }
      if (input.audioPath) {
        const actualPath = Array.isArray(input.audioPath) ? input.audioPath[0] : input.audioPath;
        const relPath = extractRelativePath(actualPath, sessionId);
        for (let attempt = 1; attempt <= CHECK_RETRIES; attempt++) {
          try {
            if (isLikelyAudioDir(relPath)) {
              const entries = await artifactRepo.list(sessionId, relPath);
              const hasRealFile = entries.some((e) => !e.isDir && e.name !== '.gitkeep');
              if (hasRealFile) {
                checks.hasAudio = true;
                break;
              }
            } else {
              await artifactRepo.read(sessionId, relPath);
              checks.hasAudio = true;
              break;
            }
          } catch {
            // list/read failed (e.g. dir/file not found)
          }
          if (attempt < CHECK_RETRIES) await sleep(CHECK_RETRY_DELAY_MS);
          else console.warn(`[finalize_workflow] Audio not found: ${input.audioPath}`);
        }
      }

      const allComplete = checks.hasImage && checks.hasAudio && checks.hasScript;
      return allComplete
        ? {
            status: 'WORKFLOW_COMPLETE',
            success: true,
            completed: true,
            message: '✅ 绘本生成完成！文件已全部验证通过。',
            summary: { imagePath: input.imagePath, audioPath: input.audioPath, scriptText: input.scriptText, sessionId },
            checks,
          }
        : {
            status: 'WORKFLOW_INCOMPLETE',
            success: false,
            completed: false,
            message: '⚠️ 部分文件缺失，请检查',
            checks,
          };
    },
    {
      name: 'finalize_workflow',
      description: '检查图片、音频文件是否生成，如果都存在则完成工作流并向用户展示结果摘要',
      schema: z.object({
        imagePath: z.string().optional().describe('生成的图片文件路径'),
        audioPath: z.string().optional().describe('生成的音频文件路径'),
        scriptText: z.string().optional().describe('生成的台词文本'),
        sessionId: z.string().optional().describe('会话ID（留空使用当前会话）'),
      }),
    }
  );
}

registerTool('finalize_workflow', create);
