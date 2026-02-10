import { ChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { createAgent } from 'langchain';
import { createDeepAgent, createFilesystemMiddleware, FilesystemBackend, type SubAgent, type CompiledSubAgent } from 'deepagents';
import { ConfigLoader, type AgentConfig } from './ConfigLoader.js';
import { loadConfig } from './config.js';
import { createLLMCallbacks } from './LLMCallbacks.js';
import { getAIConfig } from '../ai/config.js';
import { createLLMFromAIConfig } from '../ai/llm/index.js';
import type { LLMAIConfig } from '../ai/types.js';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_SESSION_ID } from '../services/fs.js';
import { createAgentRuntime, type AgentRuntime } from '../services/runtime-manager.js';
import { readLineNumbers } from '../mcp/line-numbers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AgentFactory {
  private configLoader: ConfigLoader;
  private agentConfig: AgentConfig;
  private appConfig: any;
  private projectRoot: string;
  private runtime?: AgentRuntime;  // 新增：Runtime 实例

  constructor(configPath?: string) {
    // 计算配置目录路径
    // 优先使用主进程注入的目录（打包后为 resources/backend/config）
    // 开发环境：backend/agent -> backend/config；生产 dist-electron 或 asar 内用 __dirname
    let configDir: string;
    let projectRoot: string;

    if (process.env.AGENT_CONFIG_DIR) {
      configDir = path.resolve(process.env.AGENT_CONFIG_DIR);
      projectRoot = path.resolve(configDir, '..', '..');
    } else if (__dirname.includes('dist-electron')) {
      projectRoot = path.resolve(__dirname, '..');
      configDir = path.join(projectRoot, 'backend', 'config');
    } else {
      configDir = path.join(__dirname, '..', 'config');
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

  /**初始化运行时（新增）
   */
  async initRuntime(sessionId: string): Promise<void> {
    this.runtime = await createAgentRuntime(sessionId);
    console.log(`[AgentFactory] Runtime initialized for session: ${sessionId}`);
  }

  /**
   * 创建LLM实例（通过 ai/llm 统一层，支持 dashscope / zhipu）
   */
  private async createLLM(_sessionId?: string): Promise<ChatOpenAI> {
    const cfg = (await getAIConfig('llm')) as LLMAIConfig;
    return createLLMFromAIConfig({
      ...cfg,
      callbacks: [createLLMCallbacks(this.agentConfig.agent.debug)],
    });
  }

  /**
   * 通过 HITL 请求人工确认（使用 runtime.hitlService）
   */
  private async requestApprovalViaHITL(actionType: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.runtime) {
      throw new Error('Runtime not initialized; cannot request HITL approval');
    }
    const approved = await this.runtime.hitlService.requestApproval(actionType, payload);
    if (!approved) {
      throw new Error(`${actionType} cancelled by user`);
    }
  }

  /**
   * 创建MCP工具
   */
  private async createMCPTool(_mcpKey: string, mcpEntry: AgentConfig['mcp_services'][string]): Promise<any> {
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
        async (params: { prompt?: string; promptFile?: string; size?: string; style?: string; count?: number; model?: string; sessionId?: string }) => {
          await this.requestApprovalViaHITL('ai.text2image', params as Record<string, unknown>);
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
            prompt: z.string().optional().describe('文生图提示词（与promptFile二选一）'),
            promptFile: z.string().optional().describe('提示词文件路径（workspace相对路径，与prompt二选一）'),
            size: z.string().optional().default(mcpConfig.service.default_params.size).describe('图片尺寸'),
            style: z.string().optional().describe('图片风格'),
            count: z.number().optional().default(mcpConfig.service.default_params.count).describe('生成数量'),
            model: z.string().optional().default(mcpConfig.service.model).describe('模型名称（留空则使用配置文件中的默认值）'),
            sessionId: z.string().optional().describe('文件写入使用的会话ID（留空则使用当前会话）'),
          }),
        }
      );
    } else if (serviceType === 'tts') {
      return tool(
        async (params: { texts: string[]; voice?: string; format?: string; sessionId?: string }) => {
          await this.requestApprovalViaHITL('ai.text2speech', params as Record<string, unknown>);
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
    } else if (serviceType === 'vl_script') {
      return tool(
        async (params: { imagePath: string; sessionId?: string }) => {
          await this.requestApprovalViaHITL('ai.vl_script', params as Record<string, unknown>);
          const { generateScriptFromImage } = await import('../mcp/vl_script.js');
          const sessionId = params.sessionId || process.env.AGENT_SESSION_ID || DEFAULT_SESSION_ID;
          console.log(`[vl_script tool] Using sessionId: ${sessionId} (from params: ${params.sessionId}, env: ${process.env.AGENT_SESSION_ID})`);
          return await generateScriptFromImage({ ...params, sessionId });
        },
        {
          name: toolName,
          description: mcpEntry.description,
          schema: z.object({
            imagePath: z.string().describe('图片路径（步骤3 generate_image 返回的 imagePath）'),
            sessionId: z.string().optional().describe('会话ID（留空则使用当前会话）'),
          }),
        }
      );
    }

    console.warn(`[AgentFactory] 未知的MCP服务类型: ${serviceType}`);
    return null;
  }

  /**
   * 创建finalize_workflow工具（检查文件并完成工作流）
   */
  private createFinalizeWorkflowTool(): any {
    return tool(
      async (input: { imagePath?: string; audioPath?: string; scriptText?: string; sessionId?: string }) => {
        const { imagePath, audioPath, scriptText, sessionId = process.env.AGENT_SESSION_ID || DEFAULT_SESSION_ID } = input;
        const { getWorkspaceFilesystem } = await import('../services/fs.js');
        const config = await loadConfig();
        const workspaceFs = getWorkspaceFilesystem({ outputPath: config.storage.outputPath });
        
        // 辅助函数：从绝对路径提取相对路径（相对于 sessionId 目录）
        const extractRelativePath = (absolutePath: string, expectedSessionId: string): string => {
          const normalized = absolutePath.replace(/\\/g, '/');
          // 如果包含 workspaces/{sessionId}/，提取相对路径
          const workspacesMatch = normalized.match(/workspaces\/([^/]+)\/(.+)$/);
          if (workspacesMatch) {
            const pathSessionId = workspacesMatch[1];
            const relativePath = workspacesMatch[2];
            // 验证 sessionId 是否匹配
            if (pathSessionId === expectedSessionId) {
              return relativePath;
            } else {
              console.warn(`[finalize_workflow] SessionId mismatch: expected ${expectedSessionId}, found ${pathSessionId}`);
            }
          }
          // 如果不包含 workspaces，假设是相对路径
          return absolutePath;
        };
        
        // 检查文件是否存在
        const checks = {
          hasImage: false,
          hasAudio: false,
          hasScript: !!scriptText
        };
        
        if (imagePath) {
          try {
            // 从绝对路径提取相对路径（相对于 sessionId 目录）
            const imageRelPath = extractRelativePath(imagePath, sessionId);
            await workspaceFs.readFile(sessionId, imageRelPath);
            checks.hasImage = true;
            console.log(`[finalize_workflow] Image verified: ${imageRelPath} (session: ${sessionId})`);
          } catch (error) {
            console.warn(`[finalize_workflow] Image not found: ${imagePath}`, error);
          }
        }
        
        if (audioPath) {
          try {
            // audioPath 可能是数组（多个音频文件），取第一个
            const actualAudioPath = Array.isArray(audioPath) ? audioPath[0] : audioPath;
            const audioRelPath = extractRelativePath(actualAudioPath, sessionId);
            await workspaceFs.readFile(sessionId, audioRelPath);
            checks.hasAudio = true;
            console.log(`[finalize_workflow] Audio verified: ${audioRelPath} (session: ${sessionId})`);
          } catch (error) {
            console.warn(`[finalize_workflow] Audio not found: ${audioPath}`, error);
          }
        }
        
        const allComplete = checks.hasImage && checks.hasAudio && checks.hasScript;
        
        if (allComplete) {
          console.log(`[finalize_workflow] All files verified, workflow complete`);
          return {
            status: 'WORKFLOW_COMPLETE',
            success: true,
            completed: true,
            message: `✅ 绘本生成完成！文件已全部验证通过。`,
            summary: {
              imagePath: imagePath,
              audioPath: audioPath,
              scriptText: scriptText,
              sessionId: sessionId
            },
            checks: checks
          };
        } else {
          return {
            status: 'WORKFLOW_INCOMPLETE',
            success: false,
            completed: false,
            message: `⚠️ 部分文件缺失，请检查`,
            checks: checks
          };
        }
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

  /**
   * 创建 annotate_image_numbers 工具（按坐标在图上画白底数字标签并保存新图）
   */
  private createAnnotateImageNumbersTool(): any {
    return tool(
      async (input: {
        imagePath: string;
        annotations?: Array<{ number: number; x: number; y: number }>;
        lines?: Array<{ text?: string; x: number; y: number }>;
        numbers?: number[];
        sessionId?: string;
      }) => {
        const sessionId = input.sessionId || process.env.AGENT_SESSION_ID || DEFAULT_SESSION_ID;
        let annotations: Array<{ number: number; x: number; y: number }>;
        if (input.annotations && input.annotations.length > 0) {
          annotations = input.annotations;
        } else if (input.lines && input.lines.length > 0) {
          // 优先使用传入的 numbers（来自 TTS 返回），否则从 audio_record.json 读取
          let numbers: number[];
          if (input.numbers && input.numbers.length === input.lines.length) {
            // 使用传入的 numbers（与 lines 按索引对应）
            numbers = input.numbers;
          } else {
            // 从 audio_record.json 读取当前 session 的 number（向后兼容）
            const config = await loadConfig();
            const { entries } = await readLineNumbers(config.storage.outputPath);
            const sessionEntries = entries.filter((e) => e.sessionId === sessionId);
            const n = input.lines.length;
            const lastN = sessionEntries.slice(-n);
            numbers = lastN.map((e) => e.number);
          }
          annotations = input.lines.map((line, i) => ({
            number: numbers[i] ?? i + 1,
            x: line.x,
            y: line.y,
          }));
        } else {
          throw new Error('annotate_image_numbers 需要 annotations 或 lines 参数');
        }
        const { annotateImageNumbers } = await import('../mcp/annotate_numbers.js');
        return await annotateImageNumbers({
          imagePath: input.imagePath,
          annotations,
          sessionId,
        });
      },
      {
        name: 'annotate_image_numbers',
        description: '在图片上按坐标绘制白底数字标签并保存为新图（如 images/xxx_annotated.png）。使用 lines 时，优先使用 numbers 参数（来自 TTS 返回），否则从 audio_record.json 读取；使用 annotations 时直接使用传入的 number。',
        schema: z.object({
          imagePath: z.string().describe('当前 session 下图片路径（与 generate_image / generate_script_from_image 一致）'),
          annotations: z
            .array(z.object({ number: z.number(), x: z.number(), y: z.number() }))
            .optional()
            .describe('标注点：number, x, y；与 lines 二选一'),
          lines: z
            .array(z.object({ text: z.string().optional(), x: z.number(), y: z.number() }))
            .optional()
            .describe('vl_script 返回的 lines，序号将使用 numbers 参数（如果提供）或 audio_record.json 中当前 session 对应条目的 number（与音频 6000.mp3 等对应）；与 annotations 二选一'),
          numbers: z
            .array(z.number())
            .optional()
            .describe('可选的 number 列表（来自 TTS 返回的 numbers），与 lines 按索引一一对应；如果提供则优先使用，否则从 audio_record.json 读取'),
          sessionId: z.string().optional().describe('会话ID（留空使用当前会话）'),
        }),
      }
    );
  }

  /**
   * 创建 write_prompt_file 工具（保存提示词到文件）。
   * 保留实现供日后使用；当前 prompt_generator 使用 FilesystemMiddleware 的 write_file。
   */
  private createWritePromptFileTool(): any {
    return tool(
      async (input: { content: string; filename?: string; sessionId?: string }) => {
        // Capture sessionId at execution time
        const capturedSessionId = input.sessionId || process.env.AGENT_SESSION_ID || DEFAULT_SESSION_ID;
        const { content, filename = 'image_prompt.txt' } = input;
        
        console.log(`[write_prompt_file] Tool invoked with:`);
        console.log(`  - input.sessionId: ${input.sessionId}`);
        console.log(`  - process.env.AGENT_SESSION_ID: ${process.env.AGENT_SESSION_ID}`);
        console.log(`  - Using sessionId: ${capturedSessionId}`);
        console.log(`  - filename: ${filename}`);
        
        const { getWorkspaceFilesystem } = await import('../services/fs.js');
        const config = await loadConfig();
        const workspaceFs = getWorkspaceFilesystem({ outputPath: config.storage.outputPath });
        
        try {
          const filePath = await workspaceFs.writeFile(capturedSessionId, filename, content, 'utf-8');
          console.log(`[write_prompt_file] Successfully saved prompt to: ${filePath}`);
          console.log(`[write_prompt_file] Content length: ${content.length} bytes`);
          
          // Verify the file was written
          const verifyContent = await workspaceFs.readFile(capturedSessionId, filename, 'utf-8');
          if (typeof verifyContent === 'string' && verifyContent === content) {
            console.log(`[write_prompt_file] Verification successful`);
          } else {
            console.warn(`[write_prompt_file] Warning: File content verification failed`);
          }
          
          return {
            success: true,
            filename: filename,
            path: filePath,
            sessionId: capturedSessionId,
            message: `提示词已保存到文件: ${filename} (session: ${capturedSessionId})`
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`[write_prompt_file] Failed to save file:`, errorMsg);
          throw new Error(`Failed to save prompt file: ${errorMsg}`);
        }
      },
      {
        name: 'write_prompt_file',
        description: '将生成的提示词保存到workspace文件中，避免长文本占用上下文',
        schema: z.object({
          content: z.string().describe('要保存的提示词内容'),
          filename: z.string().optional().default('image_prompt.txt').describe('文件名（默认: image_prompt.txt）'),
          sessionId: z.string().optional().describe('会话ID（留空使用当前会话）'),
        }),
      }
    );
  }

  /**
   * 创建SubAgents
   * @param sessionId 会话ID（用于配置 FilesystemMiddleware）
   */
  private async createSubAgents(sessionId: string = DEFAULT_SESSION_ID): Promise<Array<SubAgent | CompiledSubAgent>> {
    const subAgents: Array<SubAgent | CompiledSubAgent> = [];

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

      try {
        // 使用 createSubAgent 统一创建子代理
        const subAgent = await this.createSubAgent(subEntry.name, sessionId, false);
        subAgents.push(subAgent);
      } catch (error) {
        console.error(`[AgentFactory] 创建 SubAgent ${subEntry.name} 失败:`, error);
      }
    }

    return subAgents;
  }

  /**
   * 创建单个子代理
   * @param subAgentName 子代理名称
   * @param sessionId 会话ID（用于配置 FilesystemMiddleware 的根目录）
   * @param returnRawRunnable 是否返回原始 runnable（用于测试），默认 false 返回包装后的 SubAgent/CompiledSubAgent
   */
  async createSubAgent(subAgentName: string, sessionId: string = DEFAULT_SESSION_ID, returnRawRunnable: boolean = false): Promise<SubAgent | CompiledSubAgent | any> {
    const subEntry = Object.values(this.agentConfig.sub_agents).find(
      (entry) => entry.name === subAgentName && entry.enable
    );

    if (!subEntry || !subEntry.config) {
      throw new Error(`SubAgent ${subAgentName} 未找到或未启用`);
    }

    const subConfig = subEntry.config;
    const systemPrompt = subConfig.system_prompt_text;

    if (!systemPrompt) {
      throw new Error(`SubAgent ${subAgentName} 缺少系统提示词`);
    }

    // 从配置中读取 agent_type 和 use_filesystem_middleware
    const agentType = subConfig.sub_agent?.agent_type || 'createDeepAgent';
    const useFilesystemMiddleware = subConfig.sub_agent?.use_filesystem_middleware || false;

    // 如果配置为 createAgent，使用 createAgent 创建独立代理
    if (agentType === 'createAgent') {
      console.log(`[AgentFactory] 为 ${subAgentName} 创建独立 agent（使用 createAgent）`);
      
      const subLlm = await this.createLLM();
      
      // 如果需要 FilesystemMiddleware，创建新实例
      let middleware: any[] = [];
      if (useFilesystemMiddleware) {
        // 获取 workspace 根目录路径，使用 sessionId 作为子目录
        const config = await loadConfig();
        const { resolveWorkspaceRoot } = await import('../services/fs.js');
        const workspaceRoot = resolveWorkspaceRoot(config.storage.outputPath);
        const sessionWorkspaceRoot = path.join(workspaceRoot, sessionId);
        
        // FilesystemMiddleware 使用 workspaces/{sessionId} 作为根目录
        // 确保文件写入到正确的 session 目录
        const fsMiddleware = createFilesystemMiddleware({
          backend: new FilesystemBackend({
            rootDir: sessionWorkspaceRoot,  // 使用 sessionId 目录
            virtualMode: true,  // 沙箱模式，限制路径逃逸
          }),
        });
        middleware = [fsMiddleware];
        console.log(`[AgentFactory] ${subAgentName} 启用 FilesystemMiddleware`);
        console.log(`[AgentFactory] Session workspace root: ${sessionWorkspaceRoot}`);
      }
      
      // 使用 createAgent 创建子代理
      const subAgentRunnable = createAgent({
        model: subLlm,
        tools: [],  // FilesystemMiddleware 会提供 write_file 等工具
        systemPrompt: systemPrompt,
        middleware: middleware.length > 0 ? middleware : undefined,
      });
      
      // 如果是测试调用，直接返回 runnable
      if (returnRawRunnable) {
        return subAgentRunnable;
      }
      
      // 包装为 CompiledSubAgent
      const compiledSubAgent: CompiledSubAgent = {
        name: subEntry.name,
        description: subEntry.description,
        runnable: subAgentRunnable as any,  // 类型兼容性处理
      };
      
      console.log(`[AgentFactory] 创建 CompiledSubAgent: ${subEntry.name} (agent_type: ${agentType}, middleware: ${useFilesystemMiddleware})`);
      return compiledSubAgent;
    }

    // createDeepAgent 类型：使用 SubAgent 方式
    const subAgentTools: any[] = [];
    
    // 根据配置中的 tools 字段添加工具（子代理专用；write_prompt_file 已由 FilesystemMiddleware 的 write_file 替代）
    if (subConfig.sub_agent && subConfig.sub_agent.tools) {
      for (const _toolName of subConfig.sub_agent.tools) {
        // 可在此添加更多子代理工具的映射，例如：if (_toolName === 'xxx') subAgentTools.push(this.createXxxTool());
      }
    }

    const subAgent: SubAgent = {
      name: subEntry.name,
      description: subEntry.description,
      systemPrompt: systemPrompt,
      tools: subAgentTools.length > 0 ? subAgentTools : undefined,
    };

    console.log(`[AgentFactory] 创建 SubAgent: ${subEntry.name} (${subAgentTools.length} tools)`);
    return subAgent;
  }

  /**
   * 根据配置中的名称创建内置工具（非 MCP），未在配置中声明的工具不会创建
   */
  private createBuiltInTool(toolName: string): any | null {
    switch (toolName) {
      case 'finalize_workflow':
        return this.createFinalizeWorkflowTool();
      case 'annotate_image_numbers':
        return this.createAnnotateImageNumbersTool();
      default:
        return null;
    }
  }

  /**
   * 创建主Agent
   * @param sessionId 会话ID（新增）
   */
  async createMainAgent(sessionId: string = DEFAULT_SESSION_ID): Promise<any> {
    // 初始化运行时（新增）
    await this.initRuntime(sessionId);

    // 创建LLM
    const llm = await this.createLLM(sessionId);

    // 创建工具：先按配置添加内置工具，再添加 MCP 工具
    const tools: any[] = [];
    const toolsConfig = this.agentConfig.tools ?? {};
    for (const [name, opts] of Object.entries(toolsConfig)) {
      if ((opts as { enable?: boolean })?.enable === false) continue;
      const tool = this.createBuiltInTool(name);
      if (tool) {
        tools.push(tool);
        console.log(`[AgentFactory] 添加内置工具: ${name}`);
      }
    }

    // 添加MCP工具
    for (const [mcpKey, mcpEntry] of Object.entries(this.agentConfig.mcp_services)) {
      const tool = await this.createMCPTool(mcpKey, mcpEntry);
      if (tool) {
        tools.push(tool);
      }
    }

    console.log(`[AgentFactory] 已加载 ${tools.length} 个工具`);

    // 新增：记录审计日志
    if (this.runtime) {
      await this.runtime.logManager.logAudit(sessionId, {
        action: 'agent_created',
        toolsCount: tools.length,
        agentName: this.agentConfig.agent.name,
      });
    }

    // 加载主Agent提示词（已嵌入配置）
    const mainSystemPrompt = typeof this.agentConfig.agent.system_prompt === 'string'
      ? this.agentConfig.agent.system_prompt
      : this.agentConfig.agent.system_prompt.path 
        ? this.configLoader.loadPromptFromYaml(
            path.resolve(this.projectRoot, this.agentConfig.agent.system_prompt.path.replace('../', ''))
          )
        : '';

    if (!mainSystemPrompt) {
      throw new Error('主Agent系统提示词未配置');
    }

    // 创建SubAgents
    const subAgents = await this.createSubAgents(sessionId);
    console.log(`[AgentFactory] 已注册 ${subAgents.length} 个SubAgent`);

    // 创建主Agent
    // 注意：不在主 Agent 中添加 FilesystemMiddleware，因为 prompt_generator 子代理已经通过 createAgent 添加了
    // 这样可以避免 middleware 重复定义的错误
    // @ts-ignore - Type compatibility with deepagents
    const agent = createDeepAgent({
      model: llm,
      tools,
      systemPrompt: mainSystemPrompt,
      subagents: subAgents,
    });

    console.log(`[AgentFactory] 主Agent创建成功: ${this.agentConfig.agent.name} (session: ${sessionId})`);

    return agent;
  }
}
