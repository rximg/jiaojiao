// 统一配置系统 - Agent工厂
// 使用AgentFactory类创建完全配置化的Agent
export { AgentFactory } from './AgentFactory.js';
export { ConfigLoader } from './ConfigLoader.js';

// 主入口函数：创建Agent实例
import { AgentFactory } from './AgentFactory.js';

export async function createMainAgent(sessionId?: string) {
  const factory = new AgentFactory();
  return await factory.createMainAgent(sessionId);
}
