import { createDeepAgent, type SubAgent } from 'deepagents';
import { ChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
// 使用 deepagents 自带的 @langchain/core 版本，避免 AIMessage instanceof 不匹配
import { AIMessage } from 'deepagents/node_modules/@langchain/core/messages';
import { z } from 'zod';
import { loadConfig } from './config.js';

export async function createMainAgent() {
  // 加载配置
  const config = await loadConfig();

  // 创建 LLM
  // 注意：ChatOpenAI 的配置可能需要根据实际版本调整
  const llm = new ChatOpenAI({
    apiKey: config.apiKeys.dashscope,
    modelName: config.agent.model,
    temperature: config.agent.temperature,
    maxTokens: config.agent.maxTokens,
    configuration: {
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    },
  });

  // 强制将模型输出规范为 AIMessage（部分 DashScope 回包是对象，导致深度代理中间件报错）
  const originalInvoke = llm.invoke.bind(llm);
  // @ts-ignore 兼容运行时覆写
  llm.invoke = async (input, options) => {
    const res = await originalInvoke(input, options as any);
    const content = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
    return new AIMessage(content);
  };

  // 创建 parse_premise 工具
  const parsePremiseTool = tool(
    async (input: { text: string }) => {
      // 使用 LLM 解析前提变量
      const response = await llm.invoke(
        `请解析以下用户输入，提取前提变量，返回 JSON 格式：\n${input.text}\n\n返回格式：{"age": 数字, "theme": "主题", "style": "风格", "language": "语言"}`
      );
      const content = typeof response.content === 'string' 
        ? response.content 
        : JSON.stringify(response.content);
      return JSON.parse(content);
    },
    {
      name: 'parse_premise',
      description: '解析用户输入，提取前提变量（年龄、主题、风格、语言等）',
      schema: z.object({
        text: z.string().describe('用户输入的文本'),
      }),
    }
  );

  // 创建 generate_image 工具
  const generateImageTool = tool(
    async (params: {
      prompt: string;
      size?: string;
      style?: string;
      count?: number;
    }) => {
      const { generateImage } = await import('../mcp/t2i.js');
      return await generateImage(params);
    },
    {
      name: 'generate_image',
      description: '生成绘本图片',
      schema: z.object({
        prompt: z.string().describe('文生图提示词'),
        size: z.string().optional().default('1024x1024').describe('图片尺寸'),
        style: z.string().optional().describe('图片风格'),
        count: z.number().optional().default(1).describe('生成数量'),
      }),
    }
  );

  // 创建 synthesize_speech 工具
  const synthesizeSpeechTool = tool(
    async (params: {
      texts: string[];
      voice?: string;
      format?: string;
    }) => {
      const { synthesizeSpeech } = await import('../mcp/tts.js');
      return await synthesizeSpeech(params);
    },
    {
      name: 'synthesize_speech',
      description: '合成语音',
      schema: z.object({
        texts: z.array(z.string()).describe('台词文本数组'),
        voice: z.string().optional().default('chinese_female').describe('语音类型'),
        format: z.string().optional().default('mp3').describe('音频格式'),
      }),
    }
  );

  // 创建工具数组
  const tools = [parsePremiseTool, generateImageTool, synthesizeSpeechTool];

  // 加载提示词模板
  const mainAgentPrompt = await loadPromptTemplate('main_agent');
  const promptGeneratorPrompt = await loadPromptTemplate('prompt_generator');
  const scriptGeneratorPrompt = await loadPromptTemplate('script_generator');

  // 创建子代理
  const subAgents: SubAgent[] = [
    {
      name: 'prompt_generator',
      description: '根据前提变量生成文生图提示词',
      systemPrompt: promptGeneratorPrompt,
    },
    {
      name: 'script_generator',
      description: '根据图片提示词和前提变量生成适配年龄的台词',
      systemPrompt: scriptGeneratorPrompt,
    },
  ];

  // 创建 Deep Agent
  // @ts-ignore - Type compatibility between different langchain versions
  const agent = createDeepAgent({
    model: llm as any,
    tools,
    systemPrompt: mainAgentPrompt,
    subagents: subAgents,
  });

  return agent;
}

async function loadPromptTemplate(name: string): Promise<string> {
  // 这里应该从文件系统加载提示词模板
  // 暂时返回硬编码的提示词
  if (name === 'main_agent') {
    return `你是有声绘本制作助手，负责协调整个绘本生成流程。

你的工作流程：
1. **解析用户输入**：调用 parse_premise 工具，将用户输入（如"3岁森林卡通"）解析为标准JSON格式，包含age、theme、style、language等字段。

2. **生成文生图提示词**：使用 task 工具委派给 prompt_generator 子代理，传递前提变量JSON。子代理会返回详细的文生图提示词。

3. **生成绘本图片**：调用 generate_image 工具，使用生成的提示词生成绘本图片。参数：
   - prompt: 子代理返回的提示词
   - size: "1024x1024"（默认）
   - style: 将前提变量中的style映射为API格式（如"卡通"→"<3d cartoon>"）
   - count: 1

4. **生成台词**：使用 task 工具委派给 script_generator 子代理，传递图片提示词和前提变量。子代理会返回JSON格式的台词数组。

5. **生成语音**：调用 synthesize_speech 工具，将台词转换为语音。参数：
   - texts: 子代理返回的scripts数组
   - voice: "chinese_female"（默认）
   - format: "mp3"（默认）

6. **整合结果**：返回完整的绘本制作结果，包括：
   - 图片URI列表
   - 音频URI列表
   - 台词文本列表

请严格按照流程执行。对于提示词生成和台词生成，必须使用 task 工具委派给对应的子代理处理。如果某个步骤失败，请提供明确的错误信息。`;
  }
  
  if (name === 'prompt_generator') {
    return `你是一位顶尖的文生图提示词设计师，设计的提示词能进行复杂接口的百科类的科普绘本制作。

当用户输入待生成的对象时，先分析对象特征，结合特征给出需要在图中展示的元素。结合目标客户的年龄段、语言和特殊需求进行个性化设计。

生成的提示词严格遵循如下设计：
1. Role(角色设定) - 假设一位在绘本设计领域专业的角色
2. Task(任务目标) - 根据用户描述的主体形象，生成一张全景式角色深度概念分解图
3. Visual Guidelines(视觉规范) - 包括构图布局、拆解内容、风格与注释
4. Workflow(执行流程) - 分析主体特征、提取拆解元素、设计深度元素、整合生成全图

请根据前提变量生成详细的文生图提示词。`;
  }
  
  if (name === 'script_generator') {
    return `你是一位专业的儿童绘本台词编写专家。

根据图片提示词和前提变量，生成适配目标年龄段的台词。台词应该：
- 语言简洁易懂，符合目标年龄段的理解能力
- 内容生动有趣，能够吸引儿童注意力
- 与图片内容紧密相关
- 长度适中，适合语音朗读

返回格式为JSON数组，每个元素包含：
{
  "text": "台词文本",
  "order": 序号
}`;
  }
  
  return '';
}
