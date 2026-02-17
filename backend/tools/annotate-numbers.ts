import path from 'path';
import { promises as fs } from 'fs';
import sharp from 'sharp';
import { DEFAULT_SESSION_ID, getWorkspaceFilesystem } from '../services/fs.js';

export interface AnnotationPoint {
  number: number;
  x: number;
  y: number;
}

export interface AnnotateImageNumbersParams {
  imagePath: string;
  annotations: AnnotationPoint[];
  sessionId?: string;
}

export interface AnnotateImageNumbersResult {
  imagePath: string;
  imageUri: string;
  sessionId: string;
}

function resolveImageAbsolutePath(
  imagePath: string,
  sessionId: string,
  workspaceRoot: string
): string {
  const normalized = imagePath.replace(/\\/g, '/');
  if (path.isAbsolute(imagePath)) {
    return imagePath;
  }
  const workspacesMatch = normalized.match(/workspaces\/([^/]+)\/(.+)$/);
  if (workspacesMatch) {
    const sid = workspacesMatch[1];
    const rel = workspacesMatch[2];
    const targetSessionId = sid === sessionId ? sessionId : sid;
    return path.join(workspaceRoot, targetSessionId, rel);
  }
  return path.join(workspaceRoot, sessionId, normalized);
}

const LABEL_WIDTH = 36;
const LABEL_HEIGHT = 24;
const FONT_SIZE = 16;
const PADDING = 8;

/**
 * 在图片上按坐标绘制白底数字标签，保存为新图 images/{原basename}_annotated.png
 */
export async function annotateImageNumbers(
  params: AnnotateImageNumbersParams
): Promise<AnnotateImageNumbersResult> {
  const sessionId = params.sessionId ?? DEFAULT_SESSION_ID;
  const workspaceFs = getWorkspaceFilesystem({});
  const workspaceRoot = workspaceFs.root;

  const absolutePath = resolveImageAbsolutePath(params.imagePath, sessionId, workspaceRoot);
  await fs.access(absolutePath);

  const image = sharp(absolutePath);
  const meta = await image.metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 1024;

  // 为每个标注生成白底数字的 SVG 片段（圆角矩形 + 数字）
  const labelElements = params.annotations.map((a) => {
    const x = Math.max(0, Math.min(a.x, width - LABEL_WIDTH));
    const y = Math.max(0, Math.min(a.y, height - LABEL_HEIGHT));
    const num = String(a.number);
    return `
      <g transform="translate(${x}, ${y})">
        <rect width="${LABEL_WIDTH}" height="${LABEL_HEIGHT}" rx="6" ry="6" fill="white" stroke="#333" stroke-width="1.5"/>
        <text x="${LABEL_WIDTH / 2}" y="${PADDING + FONT_SIZE - 2}" text-anchor="middle" dominant-baseline="middle" fill="black" font-size="${FONT_SIZE}" font-family="sans-serif" font-weight="bold">${escapeXml(num)}</text>
      </g>`;
  });

  const svgOverlay = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  ${labelElements.join('\n  ')}
</svg>`
  );

  const composed = await image
    .composite([{ input: svgOverlay, blend: 'over' }])
    .png()
    .toBuffer();

  const basename = path.basename(absolutePath, path.extname(absolutePath));
  const outFileName = `${basename}_annotated.png`;
  const relativeOutPath = path.posix.join('images', outFileName);
  const outAbsolutePath = await workspaceFs.writeFile(sessionId, relativeOutPath, composed);
  const imageUri = workspaceFs.toFileUri(outAbsolutePath);

  return {
    imagePath: outAbsolutePath,
    imageUri,
    sessionId,
  };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
