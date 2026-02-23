import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';
import { createDeepAgent, createFilesystemMiddleware, FilesystemBackend, type SubAgent, type CompiledSubAgent } from 'deepagents';
import { ConfigLoader, type AgentConfig } from './ConfigLoader.js';
import { getAIConfig } from '../infrastructure/inference/ai-config.js';
import { createLLMFromAIConfig } from '../infrastructure/inference/adapters/llm/index.js';
import type { LLMAIConfig } from '#backend/domain/inference/types.js';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_SESSION_ID, getWorkspaceFilesystem, resolveWorkspaceRoot } from '../services/fs.js';
import { createAgentRuntime, type AgentRuntime } from '../services/runtime-manager.js';
import { createTool } from '../tools/index.js';
import { resolveMainAgentConfigPath } from './case-config-resolver.js';
import { getRunContext } from '../application/agent/run-context.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AgentFactory {
  private configLoader: ConfigLoader;
  private agentConfig: AgentConfig;
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

    this.projectRoot = projectRoot;
    this.configLoader = new ConfigLoader(configDir, projectRoot);

    // 加载主配置（优先显式 configPath；其次按 AGENT_CASE_ID 读取 config/agent_cases/{caseId}.yaml；默认 encyclopedia.yaml）
    const caseIdFromEnv = process.env.AGENT_CASE_ID?.trim();
    const resolvedConfigPath = configPath ?? resolveMainAgentConfigPath(configDir, caseIdFromEnv);
    if (caseIdFromEnv && !configPath) {
      console.log(`[AgentFactory] 当前案例: ${caseIdFromEnv}，加载配置: ${resolvedConfigPath}`);
    }

    this.agentConfig = this.configLoader.loadMainConfig(resolvedConfigPath);
    if (this.agentConfig.sub_agents == null || typeof this.agentConfig.sub_agents !== 'object') {
      console.warn('[AgentFactory] 主配置缺少 sub_agents，请检查是否加载了正确配置:', resolvedConfigPath);
      this.agentConfig.sub_agents = {};
    }

    // 验证配置
    const validation = this.configLoader.validateConfig(this.agentConfig);
    if (!validation.valid) {
      throw new Error(`配置验证失败:\n${validation.errors.join('\n')}`);
    }

  }

  /**初始化运行时（新增）
   */
  async initRuntime(sessionId: string): Promise<void> {
    this.runtime = await createAgentRuntime(sessionId);
  }

  /**
   * 创建 LLM 实例（通过 infrastructure/inference/adapters/llm，支持 dashscope / zhipu）
   */
  private async createLLM(_sessionId?: string): Promise<ChatOpenAI> {
    const cfg = (await getAIConfig('llm')) as LLMAIConfig;
    return createLLMFromAIConfig({
      ...cfg,
      callbacks: [],
    });
  }

  /**
   * 通过 HITL 请求人工确认（使用 runtime.hitlService）。
   * 约定：所有需要 HITL 的操作必须在此返回后才执行实际逻辑，且必须使用返回的 merged
   * 作为唯一数据源（原 payload + 用户编辑），确保「仅在用户确认后执行」且「编辑内容传入下一步」。
   * @returns 合并后的 payload（含用户编辑），拒绝/取消时抛出
   */
  private async requestApprovalViaHITL(actionType: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.runtime) {
      throw new Error('Runtime not initialized; cannot request HITL approval');
    }
    const result = await this.runtime.hitlService.requestApproval(actionType, payload);
    if (result === null) {
      throw new Error(`${actionType} cancelled by user`);
    }
    return result;
  }

  /**
   * 创建SubAgents
   * @param sessionId 会话ID（用于配置 FilesystemMiddleware）
   */
  private async createSubAgents(sessionId: string = DEFAULT_SESSION_ID): Promise<Array<SubAgent | CompiledSubAgent>> {
    const subAgents: Array<SubAgent | CompiledSubAgent> = [];
    const subAgentsConfig = this.agentConfig.sub_agents ?? {};

    for (const [key, subEntry] of Object.entries(subAgentsConfig)) {
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
      const subLlm = await this.createLLM();
      
      // 如果需要 FilesystemMiddleware，创建新实例
      let middleware: any[] = [];
      if (useFilesystemMiddleware) {
        // 获取 workspace 根目录路径，使用 sessionId 作为子目录
        const workspaceRoot = resolveWorkspaceRoot();
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

    return subAgent;
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

    // 创建工具：配置驱动，通过 tools 注册表创建；Phase 5 注入 getSessionBackend 供 Agent 模块使用 FilesystemBackend
    const workspaceRoot = resolveWorkspaceRoot();
    const toolContext = {
      requestApprovalViaHITL: this.requestApprovalViaHITL.bind(this),
      getDefaultSessionId: () => process.env.AGENT_SESSION_ID || sessionId || DEFAULT_SESSION_ID,
      getSessionBackend: (sid: string) =>
        new FilesystemBackend({
          rootDir: path.join(workspaceRoot, sid || DEFAULT_SESSION_ID),
          virtualMode: true,
        }),
      getRunContext,
    };

    const tools: any[] = [];
    const toolsConfig = this.agentConfig.tools ?? {};
    for (const [name, opts] of Object.entries(toolsConfig)) {
      const entry = opts as { enable?: boolean; description?: string; config?: any };
      if (entry.enable === false) continue;
      const config = {
        enable: true,
        name: name,
        description: entry.description,
        serviceConfig: entry.config,
      };
      const t = createTool(name, config, toolContext);
      const resolved = t instanceof Promise ? await t : t;
      if (resolved) tools.push(resolved);
    }

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

    // 有 sessionId 时使用 WorkspaceCheckpointSaver，按 session/checkpoints/ 持久化，stream/invoke 时需传 config.configurable.thread_id = sessionId
    let checkpointer: InstanceType<typeof import('../services/workspace-checkpoint-saver.js').WorkspaceCheckpointSaver> | undefined;
    if (sessionId) {
      const workspace = getWorkspaceFilesystem({});
      const { WorkspaceCheckpointSaver } = await import('../services/workspace-checkpoint-saver.js');
      checkpointer = new WorkspaceCheckpointSaver(workspace);
    }

    // 创建主Agent
    // 注意：不在主 Agent 中添加 FilesystemMiddleware，因为 prompt_generator 子代理已经通过 createAgent 添加了
    // 这样可以避免 middleware 重复定义的错误
    // @ts-ignore - Type compatibility with deepagents
    const agent = createDeepAgent({
      model: llm,
      tools,
      systemPrompt: mainSystemPrompt,
      subagents: subAgents,
      ...(checkpointer ? { checkpointer } : {}),
    });

    return agent;
  }
}

/** 对外入口：创建主 Agent 实例（无 session 时使用 DEFAULT_SESSION_ID）。 */
export async function createMainAgent(sessionId?: string) {
  const factory = new AgentFactory();
  return await factory.createMainAgent(sessionId ?? DEFAULT_SESSION_ID);
}
