import path from 'path';
import { promises as fs } from 'fs';
import jsyaml from 'js-yaml';
import { loadConfig } from '../agent/config';
import { DEFAULT_SESSION_ID, getWorkspaceFilesystem } from '../services/fs';

export interface GenerateImageParams {
  prompt?: string;
  promptFile?: string;
  size?: string;
  style?: string;
  count?: number;
  model?: string;
  sessionId?: string;
}

export interface GenerateImageResult {
  imagePath: string;
  imageUri: string;
  imageUrl?: string;
  sessionId: string;
}

/**
 * 使用传统异步API生成图片（wanx-v1等模型）
 * 或新格式异步API（wan2.6-image等模型）
 */
async function generateImageAsync(
  endpoint: string,
  taskEndpoint: string,
  token: string,
  model: string,
  prompt: string,
  parameters: Record<string, any>,
  isNewAsyncFormat = false
): Promise<string> {
  // 准备请求体
  const requestBody = isNewAsyncFormat
    ? {
        model,
        input: {
          messages: [
            {
              role: 'user',
              content: [{ text: prompt }],
            },
          ],
        },
        parameters,
      }
    : {
        model,
        input: { prompt },
        parameters,
      };

  // 准备请求头
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // 统一使用X-DashScope-Async
  headers['X-DashScope-Async'] = 'enable';

  console.log('[T2I] Async request endpoint:', endpoint);
  console.log('[T2I] Async request format:', isNewAsyncFormat ? 'new' : 'legacy');
  console.log('[T2I] Async request model:', model);
  console.log('[T2I] Async request prompt length:', requestBody.input?.messages?.[0]?.content?.[0]?.text?.length || requestBody.input?.prompt?.length || 0);
  console.log('[T2I] Async request body:', JSON.stringify(requestBody, null, 2).substring(0, 1000) + '...');

  // 发起异步请求
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`T2I async request failed: ${response.status} ${response.statusText} ${body}`);
  }

  const responseData = await response.json() as any;
  const taskId = responseData?.output?.task_id;

  if (!taskId) {
    throw new Error('T2I async request did not return task_id');
  }

  // 轮询任务状态
  const maxAttempts = 60;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const pollResponse = await fetch(`${taskEndpoint}/${taskId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!pollResponse.ok) {
      throw new Error(`T2I task polling failed: ${pollResponse.status}`);
    }

    const taskData = await pollResponse.json() as any;
    const taskStatus = taskData?.output?.task_status;

    console.log(`T2I task status (${attempt + 1}/${maxAttempts}): ${taskStatus}`);

    if (taskStatus === 'SUCCEEDED') {
      let imageUrl: string | null = null;
      
      // 新格式：choices数组（wan2.6-image）
      const content = taskData?.output?.choices?.[0]?.message?.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item.type === 'image' && item.image) {
            imageUrl = item.image;
            break;
          }
        }
      }
      
      // 旧格式：results数组（wanx-v1）
      if (!imageUrl) {
        const imageUrls = taskData?.output?.results?.map((r: any) => r.url) || [];
        if (imageUrls.length > 0) {
          imageUrl = imageUrls[0];
        }
      }
      
      if (!imageUrl) {
        console.error('[T2I] Task response structure:', JSON.stringify(taskData, null, 2));
        throw new Error('T2I task succeeded but no image URLs returned');
      }
      return imageUrl;
    }

    if (taskStatus === 'FAILED') {
      const message = taskData?.output?.message || 'Unknown error';
      throw new Error(`T2I task failed: ${message}`);
    }
  }

  throw new Error('T2I task timeout after 60 attempts');
}

/**
 * 使用同步API生成图片（wan2.6-image, z-image-turbo等multimodal模型）
 */
async function generateImageSync(
  endpoint: string,
  token: string,
  model: string,
  prompt: string,
  parameters: Record<string, any>
): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // wan2.6-image需要SSE头
  if (model === 'wan2.6-image') {
    headers['X-DashScope-Sse'] = 'enable';
  }

  const requestBody = {
    model,
    input: {
      messages: [
        {
          role: 'user',
          content: [{ text: prompt }],
        },
      ],
    },
    parameters,
  };

  console.log('[T2I] Sync request endpoint:', endpoint);
  console.log('[T2I] Sync request model:', model);
  console.log('[T2I] Sync request parameters:', JSON.stringify(parameters, null, 2));
  console.log('[T2I] Sync request body:', JSON.stringify(requestBody, null, 2));

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`T2I sync request failed: ${response.status} ${response.statusText} ${body}`);
  }

  // wan2.6-image返回SSE格式，需要特殊处理
  if (model === 'wan2.6-image') {
    const text = await response.text();
    console.log('[T2I] Raw SSE response:', text.substring(0, 500));
    
    // 解析SSE格式: id:xxx\nevent:xxx\ndata:{"output":...}\n\n
    // SSE流式返回多个数据块，需要找到包含图像的最后一个完成的数据块
    const lines = text.split('\n');
    let lastImageUrl: string | null = null;
    
    for (const line of lines) {
      if (line.startsWith('data:')) {
        try {
          const jsonData = line.substring(5).trim();
          const responseData = JSON.parse(jsonData);
          
          // 检查choices中的content数组，找到type为image的项
          const content = responseData?.output?.choices?.[0]?.message?.content;
          if (Array.isArray(content)) {
            for (const item of content) {
              if (item.type === 'image' && item.image) {
                lastImageUrl = item.image;
                console.log('[T2I] Found image URL:', lastImageUrl);
              }
            }
          }
        } catch (e) {
          // 跳过无效的JSON行
          continue;
        }
      }
    }
    
    if (!lastImageUrl) {
      // 打印完整响应帮助调试
      console.error('[T2I] Full SSE response:', text);
      throw new Error('T2I sync request did not return image URL in expected format');
    }
    
    return lastImageUrl;
  }

  // 其他multimodal模型返回普通JSON
  const responseData = await response.json() as any;
  console.log('[T2I] Sync response:', JSON.stringify(responseData, null, 2).substring(0, 500));

  const imageUrl = responseData?.output?.results?.[0]?.url;
  if (!imageUrl) {
    throw new Error('T2I sync request did not return image URL');
  }

  return imageUrl;
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
      // promptFile路径相对于workspace目录（带session）
      const workspaceRoot = path.join(config.storage.outputPath, 'workspaces', sessionId);
      const fullPath = path.join(workspaceRoot, params.promptFile);
      console.log(`[T2I] Reading from path: ${fullPath}`);
      
      const promptContent = await fs.readFile(fullPath, 'utf-8');
      prompt = promptContent;
      console.log(`[T2I] Successfully read prompt file, length: ${prompt.length}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[T2I] Failed to read prompt file:`, errorMsg);
      throw new Error(`Failed to read prompt file '${params.promptFile}': ${errorMsg}`);
    }
  } else if (params.prompt) {
    prompt = params.prompt;
  } else {
    throw new Error('Either prompt or promptFile must be provided');
  }

  // 从t2i_config.yaml加载配置
  let t2iConfig: any = {};
  try {
    const configPath = path.join(process.cwd(), 'backend', 'config', 'mcp', 't2i_config.yaml');
    const configContent = await fs.readFile(configPath, 'utf-8');
    t2iConfig = jsyaml.load(configContent);
  } catch (error) {
    console.warn('[T2I] Failed to load t2i_config.yaml, using defaults:', error);
  }

  const token = config.apiKeys.t2i || config.apiKeys.dashscope || '';
  
  // 先确定使用的模型
  const model = params.model
    || process.env.DASHSCOPE_T2I_MODEL
    || t2iConfig.service?.model
    || 'wan2.6-image';
  
  // 检测是否使用multimodal API的模型（同步调用）
  const isMultimodalModel = model === 'z-image-turbo' || model === 'wan2.6-i2v' || model.startsWith('flux');
  
  // wan2.6-image使用新的image-generation异步API
  const isWan26Image = model === 'wan2.6-image';
  
  // 根据模型类型选择endpoint
  let endpoint: string;
  if (isWan26Image) {
    // wan2.6-image使用image-generation endpoint（异步）
    endpoint = process.env.DASHSCOPE_T2I_ENDPOINT
      || t2iConfig.service?.endpoint
      || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation';
  } else if (isMultimodalModel) {
    // z-image-turbo等使用multimodal-generation endpoint
    endpoint = process.env.DASHSCOPE_T2I_ENDPOINT
      || t2iConfig.service?.endpoint
      || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
  } else {
    // wanx系列使用text2image endpoint
    endpoint = process.env.DASHSCOPE_T2I_ENDPOINT
      || t2iConfig.service?.endpoint
      || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis';
  }
  
  const taskEndpoint = process.env.DASHSCOPE_T2I_TASK_ENDPOINT
    || t2iConfig.service?.task_endpoint
    || 'https://dashscope.aliyuncs.com/api/v1/tasks';

  // 保存输入参数到文件用于调试
  try {
    const debugDir = path.join(process.cwd(), 'outputs', 't2idebug');
    await fs.mkdir(debugDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const debugFile = path.join(debugDir, `t2i_input_${timestamp}.json`);
    
    const debugData = {
      timestamp: new Date().toISOString(),
      sessionId,
      model,
      endpoint,
      isMultimodal: isMultimodalModel,
      prompt: prompt.substring(0, 500) + (prompt.length > 500 ? '...' : ''),
      fullPromptLength: prompt.length,
      fullPrompt: prompt, // 保存完整prompt
      parameters: { size, style, count },
      config: {
        promptFile: params.promptFile,
        promptProvided: !!params.prompt,
      },
    };
    
    await fs.writeFile(debugFile, JSON.stringify(debugData, null, 2), 'utf-8');
    console.log(`[T2I] Input parameters saved to: ${debugFile}`);
    console.log(`[T2I] Full prompt length: ${prompt.length} characters`);
  } catch (error) {
    console.error('[T2I] Failed to save input parameters:', error);
  }

  // 准备参数
  const parameters: Record<string, any> = { size };
  
  if (isWan26Image) {
    // wan2.6-image使用新的image-generation API参数
    parameters.max_images = count;
    parameters.enable_interleave = true;
    if (style) parameters.negative_prompt = style;
  } else if (isMultimodalModel) {
    // z-image-turbo等multimodal模型
    parameters.prompt_extend = false;
    if (count > 1) parameters.n = count;
  } else {
    // wanx系列使用传统text2image API参数
    parameters.n = count;
    if (style) parameters.style = style;
  }

  // 根据模型类型调用相应的方法
  let imageUrl: string;
  if (isWan26Image) {
    // wan2.6-image使用新的异步API
    imageUrl = await generateImageAsync(endpoint, taskEndpoint, token, model, prompt, parameters, true);
  } else if (isMultimodalModel) {
    // multimodal模型使用同步API
    imageUrl = await generateImageSync(endpoint, token, model, prompt, parameters);
  } else {
    // wanx系列使用传统异步API
    imageUrl = await generateImageAsync(endpoint, taskEndpoint, token, model, prompt, parameters, false);
  }

  // 下载并保存图片
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

    return {
      imagePath,
      imageUri,
      imageUrl,
      sessionId,
    };
  } catch (e) {
    throw new Error(`Failed to download image: ${e instanceof Error ? e.message : String(e)}`);
  }
}
