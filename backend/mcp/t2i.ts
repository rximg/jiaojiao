import path from 'path';
import { loadConfig } from '../agent/config';
import { DEFAULT_SESSION_ID, getWorkspaceFilesystem } from '../services/fs';

export interface GenerateImageParams {
  prompt?: string;
  promptFile?: string;
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
  const { size = '1024*1024', style, count = 1, sessionId = DEFAULT_SESSION_ID } = params;
  const workspaceFs = getWorkspaceFilesystem({ outputPath: config.storage.outputPath });

  // 支持从文件读取提示词或直接使用参数
  let prompt: string;
  if (params.promptFile) {
    console.log(`[T2I] Reading prompt from file: ${params.promptFile}`);
    try {
      // FilesystemMiddleware 将文件直接保存在 workspaces/ 根目录下
      // 所以这里直接从文件系统读取，不使用 workspaceFs（它会自动加 sessionId 层级）
      const fs = await import('fs/promises');
      const workspaceRoot = workspaceFs.root;
      const fullPath = path.join(workspaceRoot, params.promptFile);
      console.log(`[T2I] Reading from path: ${fullPath}`);
      
      const promptContent = await fs.readFile(fullPath, 'utf-8');
      prompt = promptContent;
      console.log(`[T2I] Successfully read prompt file, length: ${prompt.length}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[T2I] Failed to read prompt file:`, errorMsg);
      throw new Error(`Failed to read prompt file '${params.promptFile}': ${errorMsg}. Make sure the file was created successfully by the prompt generator.`);
    }
  } else if (params.prompt) {
    prompt = params.prompt;
  } else {
    throw new Error('Either prompt or promptFile must be provided');
  }

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
