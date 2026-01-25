import { ChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { createDeepAgent, type SubAgent } from 'deepagents';
import { ConfigLoader, type AgentConfig } from './ConfigLoader.js';
import { loadConfig } from './config.js';
import type { BrowserWindow as BWType, IpcMain as IpcMainType } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { DEFAULT_SESSION_ID } from '../services/fs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AgentFactory {
  private configLoader: ConfigLoader;
  private agentConfig: AgentConfig;
  private appConfig: any;
  private projectRoot: string;

  constructor(configPath?: string) {
    // 计算配置目录路径
    // 开发环境：backend/agent -> backend/config
    // 生产环境：dist-electron -> backend/config
    let configDir: string;
    let projectRoot: string;
    
    if (__dirname.includes('dist-electron')) {
      // 生产环境：从dist-electron找到app根目录
      projectRoot = path.resolve(__dirname, '..');
      configDir = path.join(projectRoot, 'backend', 'config');
    } else {
      // 开发环境：backend/agent -> backend/config
      configDir = path.join(__dirname, '..', 'config');
      // 从backend/config向上两级到app根目录
      projectRoot = path.resolve(configDir, '..', '..');
    }
    
    console.log(`[AgentFactory] __dirname: ${__dirname}`);
    console.log(`[AgentFactory] Project root: ${projectRoot}`);
    console.log(`[AgentFactory] Config directory: ${configDir}`);
    
    this.projectRoot = projectRoot;
    this.configLoader = new ConfigLoader(configDir, projectRoot);

    // 加载主配置
    this.agentConfig = this.configLoader.loadMainConfig(configPath);

    // 验证配置
    const validation = this.configLoader.validateConfig(this.agentConfig);
    if (!validation.valid) {
      throw new Error(`配置验证失败:\n${validation.errors.join('\n')}`);
    }

    console.log(`[AgentFactory] 配置加载成功: ${this.agentConfig.name} v${this.agentConfig.version}`);
  }

  /**
   * 创建LLM实例
   */
  private async createLLM(): Promise<ChatOpenAI> {
    this.appConfig = await loadConfig();

    const llmConfig = this.agentConfig.agent.llm;
    const debugConfig = this.agentConfig.agent.debug || { log_llm_calls: true, save_llm_calls: true };
    const projectRoot = this.projectRoot; // 捕获到闭包中

    return new ChatOpenAI({
      apiKey: this.appConfig.apiKeys.dashscope,
      modelName: llmConfig.model,
      temperature: llmConfig.temperature,
      maxTokens: llmConfig.max_tokens,
      configuration: {
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      },
      callbacks: [
        {
          handleLLMStart({ name }, prompts) {
            const modelName = name ?? 'llm';
            const promptContent = prompts[0] || '';
            const promptLength = promptContent.length || 0;
            
            // 根据配置决定是否打印
            if (debugConfig.log_llm_calls) {
              console.log('[LLM start]', modelName, 'prompt length:', promptLength);
              console.log('[LLM prompt]', promptContent);
            }
            
            // 根据配置决定是否保存到文件
            if (debugConfig.save_llm_calls) {
              try {
                const debugDir = path.resolve(projectRoot, 'outputs', 'debug');
                if (!fs.existsSync(debugDir)) {
                  fs.mkdirSync(debugDir, { recursive: true });
                }
                const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
                const filename = `llm_call_${modelName}_${timestamp}.txt`;
                const filePath = path.join(debugDir, filename);
                const content = `Model: ${modelName}\nTimestamp: ${new Date().toISOString()}\nPrompt Length: ${promptLength}\n\n=== Prompt ===\n${promptContent}`;
                fs.writeFileSync(filePath, content, 'utf-8');
                if (debugConfig.log_llm_calls) {
                  console.log(`[LLM] 调用已缓存: ${filePath}`);
                }
              } catch (error) {
                console.error('[LLM] 缓存调用失败:', error);
              }
            }
          },
          handleLLMEnd(output) {
            if (debugConfig.log_llm_calls) {
              console.log('[LLM end]', JSON.stringify(output, null, 2));
            }
          },
          handleLLMError(err) {
            console.error('[LLM error]', err);
          },
        },
      ],
    });
  }

  /**
   * Human-in-the-loop确认
   */
  private async requestHumanConfirm(action: 't2i' | 'tts', payload: any): Promise<void> {
    if (process.env.RUN_INTEGRATION_TESTS === 'false' || process.env.NODE_ENV === 'test') return;
    
    try {
      const { BrowserWindow, ipcMain } = await import('electron') as {
        BrowserWindow: typeof BWType;
        IpcMain: typeof IpcMainType;
      };
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;

      win.webContents.send('agent:confirmRequest', { action, payload });

      const result = await new Promise<{ ok: boolean }>((resolve) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            resolve({ ok: false });
          }
        }, 30_000);

        ipcMain.once('agent:confirmAction', (_event, data) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(data || { ok: false });
        });
      });

      if (!result?.ok) {
        throw new Error(`${action} cancelled by user`);
      }
    } catch (err) {
      console.warn('[confirm] fallback allow:', err);
    }
  }

  /**
   * 创建MCP工具
   */
  private async createMCPTool(mcpKey: string, mcpEntry: AgentConfig['mcp_services'][string]): Promise<any> {
    if (!mcpEntry.enable || !mcpEntry.config) {
      return null;
    }

    const mcpConfig = mcpEntry.config;
    const toolName = mcpEntry.name;
    const serviceType = mcpConfig.service.type;

    console.log(`[AgentFactory] 创建MCP工具: ${toolName} (${serviceType})`);

    // 根据服务类型创建工具
    if (serviceType === 't2i') {
          return tool(
        async (params: { prompt: string; size?: string; style?: string; count?: number; sessionId?: string }) => {
          await this.requestHumanConfirm('t2i', params);
          const { generateImage } = await import('../mcp/t2i.js');
          // 动态从环境变量获取sessionId，优先使用参数传入的sessionId
          const sessionId = params.sessionId || process.env.AGENT_SESSION_ID || DEFAULT_SESSION_ID;
          console.log(`[t2i tool] Using sessionId: ${sessionId} (from params: ${params.sessionId}, env: ${process.env.AGENT_SESSION_ID})`);
          return await generateImage({ ...params, sessionId });
        },
        {
          name: toolName,
          description: mcpEntry.description,
          schema: z.object({
            prompt: z.string().describe('文生图提示词'),
            size: z.string().optional().default(mcpConfig.service.default_params.size).describe('图片尺寸'),
            style: z.string().optional().describe('图片风格'),
            count: z.number().optional().default(mcpConfig.service.default_params.count).describe('生成数量'),
            sessionId: z.string().optional().describe('文件写入使用的会话ID（留空则使用当前会话）'),
          }),
        }
      );
    } else if (serviceType === 'tts') {
      return tool(
        async (params: { texts: string[]; voice?: string; format?: string; sessionId?: string }) => {
          await this.requestHumanConfirm('tts', params);
          const { synthesizeSpeech } = await import('../mcp/tts.js');
          // 动态从环境变量获取sessionId，优先使用参数传入的sessionId
          const sessionId = params.sessionId || process.env.AGENT_SESSION_ID || DEFAULT_SESSION_ID;
          console.log(`[tts tool] Using sessionId: ${sessionId} (from params: ${params.sessionId}, env: ${process.env.AGENT_SESSION_ID})`);
          return await synthesizeSpeech({ ...params, sessionId });
        },
        {
          name: toolName,
          description: mcpEntry.description,
          schema: z.object({
            texts: z.array(z.string()).describe('台词文本数组'),
            voice: z.string().optional().default(mcpConfig.service.default_params.voice).describe('语音类型'),
            format: z.string().optional().default(mcpConfig.service.default_params.format).describe('音频格式'),
            sessionId: z.string().optional().describe('文件写入使用的会话ID（留空则使用当前会话）'),
          }),
        }
      );
    }

    console.warn(`[AgentFactory] 未知的MCP服务类型: ${serviceType}`);
    return null;
  }

  /**
   * 将提示词缓存到文件
   */
  private cachePromptToFile(filename: string, content: string): void {
    try {
      const debugDir = path.resolve(this.projectRoot, 'outputs', 'debug');
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }
      const filePath = path.join(debugDir, filename);
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log(`[AgentFactory] 提示词已缓存: ${filePath}`);
    } catch (error) {
      console.error(`[AgentFactory] 缓存提示词失败:`, error);
    }
  }

  /**
   * 创建parse_premise工具（内置工具）
   */
  private async createParsePremiseTool(llm: ChatOpenAI): Promise<any> {
    // 加载parse_premise提示词
    const promptPath = path.join(__dirname, '..', 'prompts', 'zh', 'parse_premise.yaml');
    const promptText = this.configLoader.loadPromptFromYaml(promptPath);

    // 缓存提示词到文件
    this.cachePromptToFile('parse_premise_prompt.txt', promptText);

    return tool(
      async (input: { text: string }) => {
        const response = await llm.invoke(`${promptText}\n\n用户输入：${input.text}`);
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
  }

  /**
   * 创建SubAgents
   */
  private createSubAgents(): SubAgent[] {
    const subAgents: SubAgent[] = [];

    for (const [key, subEntry] of Object.entries(this.agentConfig.sub_agents)) {
      if (!subEntry.enable || !subEntry.config) {
        continue;
      }

      const subConfig = subEntry.config;
      const systemPrompt = subConfig.system_prompt_text;

      if (!systemPrompt) {
        console.warn(`[AgentFactory] SubAgent ${key} 缺少系统提示词`);
        continue;
      }

      subAgents.push({
        name: subEntry.name,
        description: subEntry.description,
        systemPrompt: systemPrompt,
      });

      // 缓存子Agent提示词
      this.cachePromptToFile(`subagent_${subEntry.name}_prompt.txt`, systemPrompt);

      console.log(`[AgentFactory] 注册SubAgent: ${subEntry.name}`);
    }

    return subAgents;
  }

  /**
   * 创建主Agent
   */
  async createMainAgent(): Promise<any> {
    // 创建LLM
    const llm = await this.createLLM();

    // 创建工具
    const tools: any[] = [];

    // 添加parse_premise工具
    const parseTool = await this.createParsePremiseTool(llm);
    tools.push(parseTool);

    // 添加MCP工具
    for (const [mcpKey, mcpEntry] of Object.entries(this.agentConfig.mcp_services)) {
      const tool = await this.createMCPTool(mcpKey, mcpEntry);
      if (tool) {
        tools.push(tool);
      }
    }

    console.log(`[AgentFactory] 已加载 ${tools.length} 个工具`);

    // 加载主Agent提示词
    const mainPromptPath = path.resolve(
      this.projectRoot,
      'backend',
      this.agentConfig.agent.system_prompt.path.replace('../', '')
    );
    const mainSystemPrompt = this.configLoader.loadPromptFromYaml(mainPromptPath);

    // 缓存系统提示词到文件
    this.cachePromptToFile('main_agent_system_prompt.txt', mainSystemPrompt);

    // 创建SubAgents
    const subAgents = this.createSubAgents();
    console.log(`[AgentFactory] 已注册 ${subAgents.length} 个SubAgent`);

    // 创建主Agent
    // @ts-ignore - Type compatibility with deepagents
    const agent = createDeepAgent({
      model: llm,
      tools,
      systemPrompt: mainSystemPrompt,
      subagents: subAgents,
    });

    console.log(`[AgentFactory] 主Agent创建成功: ${this.agentConfig.agent.name}`);

    return agent;
  }
}
