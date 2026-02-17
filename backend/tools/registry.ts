/**
 * Tools 注册表：按配置驱动工具创建，消除 hardcode
 */
import type { StructuredToolInterface } from '@langchain/core/tools';

export interface ToolContext {
  requestApprovalViaHITL: (actionType: string, payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  getDefaultSessionId: () => string;
}

export interface ToolConfig {
  enable?: boolean;
  /** 服务配置（generate_image、synthesize_speech 等 AI 工具使用） */
  serviceConfig?: {
    service?: {
      type?: string;
      default_params?: Record<string, unknown>;
      model?: string;
    };
  };
  /** 工具显示名称（MCP 可覆盖） */
  name?: string;
  /** 工具描述（MCP 可覆盖） */
  description?: string;
}

export type ToolFactory = (
  config: ToolConfig,
  context: ToolContext
) => Promise<StructuredToolInterface | null> | StructuredToolInterface | null;

const registry = new Map<string, ToolFactory>();

export function registerTool(name: string, factory: ToolFactory): void {
  registry.set(name, factory);
}

export function createTool(
  name: string,
  config: ToolConfig,
  context: ToolContext
): Promise<StructuredToolInterface | null> | StructuredToolInterface | null {
  const factory = registry.get(name);
  if (!factory) return null;
  if (config.enable === false) return null;
  return factory(config, context);
}

export function getRegisteredToolNames(): string[] {
  return Array.from(registry.keys());
}
