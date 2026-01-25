import path from 'path';
import { loadConfig } from '../agent/config';
import { DEFAULT_SESSION_ID, getWorkspaceFilesystem } from '../services/fs';

export interface GenerateImageParams {
  prompt: string;
  size?: string;
  style?: string;
  count?: number;
  sessionId?: string;
}

export interface GenerateImageResult {
  imagePath: string;
  imageUri: string;
  imageUrl?: string;
  sessionId: string;
}

export async function generateImage(
  params: GenerateImageParams
): Promise<GenerateImageResult> {
  const config = await loadConfig();
  const { prompt, size = '1024*1024', style, count = 1, sessionId = DEFAULT_SESSION_ID } = params;
  const workspaceFs = getWorkspaceFilesystem({ outputPath: config.storage.outputPath });

  const token = config.apiKeys.t2i || config.apiKeys.dashscope || '';
  const endpoint = process.env.DASHSCOPE_T2I_ENDPOINT
    || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis';
  const taskEndpoint = process.env.DASHSCOPE_T2I_TASK_ENDPOINT
    || 'https://dashscope.aliyuncs.com/api/v1/tasks';
  const model = process.env.DASHSCOPE_T2I_MODEL || 'wanx-v1';

  // 1. 发起异步文生图请求（需要 X-DashScope-Async: enable 头）
  const parameters: Record<string, any> = {
    size,
    n: count,
  };
  if (style) {
    parameters.style = style;
  }

  const asyncResponse = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      input: {
        prompt,
      },
      parameters,
    }),
  });

  if (!asyncResponse.ok) {
    const body = await asyncResponse.text().catch(() => '');
    throw new Error(`T2I async request failed: ${asyncResponse.status} ${asyncResponse.statusText} ${body}`);
  }

  const asyncData = await asyncResponse.json() as any;
  const taskId = asyncData?.output?.task_id;

  if (!taskId) {
    throw new Error('T2I async request did not return task_id');
  }

  // 2. 轮询任务状态直到完成或失败
  const maxAttempts = 60;
  let taskStatus = '';
  let taskResult: any = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // 等待后再轮询
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const pollResponse = await fetch(`${taskEndpoint}/${taskId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!pollResponse.ok) {
      const body = await pollResponse.text().catch(() => '');
      throw new Error(`T2I poll failed: ${pollResponse.status} ${pollResponse.statusText} ${body}`);
    }

    const pollData = await pollResponse.json() as any;
    taskStatus = pollData?.output?.task_status;

    if (taskStatus === 'SUCCEEDED') {
      taskResult = pollData?.output;
      break;
    } else if (taskStatus === 'FAILED') {
      const msg = pollData?.output?.message || 'Task failed';
      throw new Error(`T2I task failed: ${msg}`);
    }

    // eslint-disable-next-line no-console
    console.log(`T2I task status (${attempt + 1}/${maxAttempts}): ${taskStatus}`);
  }

  if (!taskResult) {
    throw new Error('T2I task polling timeout');
  }

  // 3. 提取图片URL
  const results = taskResult.results || [];
  if (!results.length) {
    throw new Error('T2I task completed but returned no results');
  }

  const imageUrls = results
    .map((r: any) => r.url)
    .filter((url: string | undefined): url is string => !!url);

  if (!imageUrls.length) {
    throw new Error('T2I results contain no valid image URLs');
  }

  // 4. 下载并保存图片
  const savedArtifacts: Array<{ path: string; uri: string }> = [];
  for (const imageUrl of imageUrls) {
    try {
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        const body = await imageResponse.text().catch(() => '');
        throw new Error(`Image download failed: ${imageResponse.status} ${imageResponse.statusText} ${body}`);
      }
      const imageBuffer = await imageResponse.arrayBuffer();

      const imageFileName = `image_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.png`;
      const relativePath = path.posix.join('images', imageFileName);
      const imagePath = await workspaceFs.writeFile(sessionId, relativePath, Buffer.from(imageBuffer));
      const imageUri = workspaceFs.toFileUri(imagePath);
      savedArtifacts.push({ path: imagePath, uri: imageUri });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`Failed to download image ${imageUrl}`);
      continue;
    }
  }

  if (!savedArtifacts.length) {
    throw new Error('Failed to download any images');
  }

  // 返回第一张图片路径（或可返回所有路径）
  const [first] = savedArtifacts;

  return {
    imagePath: first.path,
    imageUri: first.uri,
    sessionId,
    imageUrl: imageUrls[0],
  };
}
