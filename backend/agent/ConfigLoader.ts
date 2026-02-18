import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface AgentConfig {
  name: string;
  version: string;
  description: string;
  agent: {
    name: string;
    version: string;
    type: string;
    system_prompt: string | {
      path: string;
    };
    storage: {
      type: string;
      path: string;
    };
    llm: {
      model: string;
      temperature: number;
      max_tokens: number;
    };
    debug?: {
      log_llm_calls?: boolean;
      save_llm_calls?: boolean;
    };
  };
  sub_agents: {
    [key: string]: {
      enable: boolean;
      name: string;
      description: string;
      config_path: string;
      config?: any;
    };
  };
  /** 工具配置：工具名 -> 选项；config_path 指向 AI 服务配置时自动加载为 serviceConfig */
  tools?: Record<
    string,
    { enable?: boolean; description?: string; config_path?: string; config?: any }
  >;
  workflow?: {
    steps: Array<{
      id: number;
      name: string;
      tool?: string;
      subagent?: string;
      type?: string;
      required: boolean;
    }>;
  };
}

export interface MCPConfig {
  name: string;
  version: string;
  description: string;
  service: {
    type: string;
    provider: string;
    endpoint: string;
    task_endpoint?: string;
    model: string;
    default_params: any;
    timeout?: any;
    batch?: any;
    output: {
      directory: string;
      format: string;
    };
  };
}

export interface SubAgentConfig {
  sub_agent: {
    name: string;
    version: string;
    description: string;
    system_prompt: {
      path: string;
    };
    capabilities?: string[];
    output?: any;
  };
}

export class ConfigLoader {
  private configDir: string;
  private projectRoot: string;

  constructor(configDir: string, projectRoot?: string) {
    this.configDir = path.resolve(configDir);
    
    // 如果指定了projectRoot，直接使用；否则自动计算
    if (projectRoot) {
      this.projectRoot = path.resolve(projectRoot);
    } else {
      // 自动计算：从configDir (backend/config) 向上两级到app根目录
      this.projectRoot = path.resolve(this.configDir, '..', '..');
    }
  }

  /**
   * 加载YAML文件
   */
  private loadYaml<T = any>(filePath: string): T {
    let absolutePath: string;
    
    if (path.isAbsolute(filePath)) {
      // 绝对路径直接使用
      absolutePath = filePath;
    } else if (filePath.startsWith('../')) {
      // ../开头的路径基于configDir解析
      absolutePath = path.resolve(this.configDir, filePath);
    } else if (filePath.startsWith('./')) {
      // ./开头的路径基于configDir解析（config目录内的相对路径）
      absolutePath = path.resolve(this.configDir, filePath.substring(2));
    } else {
      // 其他相对路径基于configDir
      absolutePath = path.resolve(this.configDir, filePath);
    }

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`配置文件不存在: ${absolutePath}`);
    }

    const content = fs.readFileSync(absolutePath, 'utf-8');
    const parsed = yaml.load(content) as T;

    if (!parsed || typeof parsed !== 'object') {
      throw new Error(`配置文件格式错误: ${absolutePath}`);
    }

    return parsed;
  }

  /**
   * 加载文本文件（提示词等）
   */
  loadTextFile(filePath: string): string {
    // 如果是相对路径，基于项目根目录
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.projectRoot, filePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`文件不存在: ${absolutePath}`);
    }

    return fs.readFileSync(absolutePath, 'utf-8');
  }

  /**
   * 从YAML文件加载提示词
   */
  loadPromptFromYaml(yamlPath: string): string {
    const config = this.loadYaml<any>(yamlPath);
    
    if (!config.system_prompt) {
      throw new Error(`YAML文件缺少system_prompt字段: ${yamlPath}`);
    }

    return config.system_prompt;
  }

  /**
   * 加载 MCP 配置（保留供后续模块使用；主 Agent 当前仅用 tools 配置，不加载 MCP）
   */
  loadMCPConfig(configPath: string): MCPConfig {
    return this.loadYaml<MCPConfig>(configPath);
  }

  /**
   * 加载SubAgent配置
   */
  loadSubAgentConfig(configPath: string): SubAgentConfig {
    return this.loadYaml<SubAgentConfig>(configPath);
  }

  /**
   * 加载主配置并递归加载所有子配置
   */
  loadMainConfig(configPath?: string): AgentConfig {
    const mainConfigPath = configPath || path.join(this.configDir, 'main_agent_config.yaml');
    const config = this.loadYaml<AgentConfig>(mainConfigPath);
    // 确保 sub_agents 始终为对象，避免 YAML 缺失或打包后配置不完整导致 Object.entries 报错
    if (config.sub_agents == null || typeof config.sub_agents !== 'object') {
      config.sub_agents = {};
    }

    // 加载工具配置（含 config_path 的从文件加载）
    if (config.tools) {
      for (const [key, toolEntry] of Object.entries(config.tools)) {
        const entry = toolEntry as { enable?: boolean; config_path?: string; config?: any };
        if (entry.config_path) {
          try {
            entry.config = this.loadYaml<any>(entry.config_path);
          } catch (error) {
            console.warn(`加载工具配置失败 (${key}):`, error);
          }
        }
      }
    }

    // 加载所有SubAgent配置
    if (config.sub_agents) {
      for (const [key, subAgentEntry] of Object.entries(config.sub_agents)) {
        if (subAgentEntry.enable && subAgentEntry.config_path) {
          try {
            const subConfig = this.loadYaml<any>(subAgentEntry.config_path);
            subAgentEntry.config = subConfig;

            // 加载SubAgent的提示词（支持直接嵌入或外部文件）
            if (typeof subConfig.sub_agent.system_prompt === 'string') {
              // 直接嵌入的提示词
              subAgentEntry.config.system_prompt_text = subConfig.sub_agent.system_prompt;
            } else if (subConfig.sub_agent.system_prompt?.path) {
              // 外部文件引用（向后兼容）
              const promptPath = subConfig.sub_agent.system_prompt.path;
              const promptYamlPath = path.resolve(this.projectRoot, promptPath);
              subAgentEntry.config.system_prompt_text = this.loadPromptFromYaml(promptYamlPath);
            }
          } catch (error) {
            console.warn(`加载SubAgent配置失败 (${key}):`, error);
          }
        }
      }
    }

    return config;
  }

  /**
   * 验证配置
   */
  validateConfig(config: AgentConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 验证基本字段
    if (!config.name) errors.push('缺少配置名称');
    if (!config.agent) errors.push('缺少agent配置');
    
    if (config.agent) {
      // 支持直接嵌入或path引用
      const hasSystemPrompt = typeof config.agent.system_prompt === 'string' || 
                               (typeof config.agent.system_prompt === 'object' && config.agent.system_prompt?.path);
      if (!hasSystemPrompt) {
        errors.push('缺少主agent提示词');
      }
      if (!config.agent.storage?.path) {
        errors.push('缺少存储路径配置');
      }
    }

    // 验证SubAgent
    if (config.sub_agents) {
      for (const [key, sub] of Object.entries(config.sub_agents)) {
        if (sub.enable) {
          if (!sub.name) errors.push(`SubAgent ${key} 缺少name字段`);
          if (!sub.config_path) errors.push(`SubAgent ${key} 缺少config_path`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
