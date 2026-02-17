/**
 * Tools 模块入口：导入所有工具以触发注册
 */
import './finalize-workflow.js';
import './annotate-image-numbers.js';
import './delete-artifacts.js';
import './generate-image.js';
import './synthesize-speech.js';
import './generate-script-from-image.js';

export { createTool, registerTool, getRegisteredToolNames } from './registry.js';
export type { ToolConfig, ToolContext } from './registry.js';
