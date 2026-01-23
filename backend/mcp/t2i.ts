import { promises as fs } from 'fs';
import path from 'path';
import { loadConfig } from '../agent/config';

export interface GenerateImageParams {
  prompt: string;
  size?: string;
  style?: string;
  count?: number;
}

export interface GenerateImageResult {
  imagePath: string;
  imageUrl?: string;
}

export async function generateImage(
  params: GenerateImageParams
): Promise<GenerateImageResult> {
  const config = await loadConfig();
  const { prompt, size = '1024x1024', style, count = 1 } = params;

  // 调用阿里百炼文生图 API
  // 这里需要根据实际的 API 实现
  const response = await fetch(
    'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKeys.dashscope}`,
      },
      body: JSON.stringify({
        model: 'wanx-v1',
        input: {
          prompt,
        },
        parameters: {
          size,
          style,
          n: count,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`T2I API error: ${response.statusText}`);
  }

  const data = await response.json();
  const imageUrl = data.output?.results?.[0]?.url;

  if (!imageUrl) {
    throw new Error('Failed to generate image');
  }

  // 下载图片并保存到本地
  const imageResponse = await fetch(imageUrl);
  const imageBuffer = await imageResponse.arrayBuffer();

  const outputDir = path.join(config.storage.outputPath, 'images');
  await fs.mkdir(outputDir, { recursive: true });

  const imageFileName = `image_${Date.now()}.png`;
  const imagePath = path.join(outputDir, imageFileName);

  await fs.writeFile(imagePath, Buffer.from(imageBuffer));

  return {
    imagePath,
    imageUrl,
  };
}
