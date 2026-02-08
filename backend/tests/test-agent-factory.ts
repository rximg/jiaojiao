/**
 * 测试脚本：验证AgentFactory能否正确加载完整的agent配置
 * 运行方式: tsx backend/tests/test-agent-factory.ts
 */

import { AgentFactory } from '../agent/AgentFactory.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testAgentFactory() {
  console.log('='.repeat(60));
  console.log('开始测试 AgentFactory');
  console.log('='.repeat(60));

  try {
    // 1. 创建工厂实例
    console.log('\n[步骤 1] 创建 AgentFactory 实例...');
    const factory = new AgentFactory();
    console.log('✅ AgentFactory 实例创建成功');

    // 2. 加载主Agent
    console.log('\n[步骤 2] 加载主Agent配置...');
    console.log('配置路径:', path.join(__dirname, '../../backend/config/main_agent_config.yaml'));
    
    const mainAgent = await factory.createMainAgent();
    console.log('✅ 主Agent创建成功');

    // 3. 验证Agent结构
    console.log('\n[步骤 3] 验证Agent结构...');
    console.log('- Agent类型:', mainAgent.constructor.name);
    console.log('- Agent节点数量:', Object.keys(mainAgent.nodes || {}).length);
    
    // 4. 测试简单调用（可选，注释掉避免实际API调用）
    console.log('\n[步骤 4] 测试Agent调用（跳过，避免实际API调用）');
    console.log('如需测试实际调用，请取消注释以下代码：');
    console.log('// const result = await mainAgent.invoke({ input: "测试消息" });');

    // 5. 打印配置信息
    console.log('\n[配置信息]');
    console.log('- 项目根目录:', path.resolve(__dirname, '../..'));
    console.log('- 配置目录:', path.resolve(__dirname, '../../backend/config'));
    console.log('- 提示词: 使用各配置内的内联 system_prompt');

    console.log('\n' + '='.repeat(60));
    console.log('✅ 所有测试通过！');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ 测试失败');
    console.error('='.repeat(60));
    console.error('\n错误详情:');
    console.error(error);
    
    if (error instanceof Error) {
      console.error('\n错误堆栈:');
      console.error(error.stack);
    }

    process.exit(1);
  }
}

// 运行测试
testAgentFactory().catch(error => {
  console.error('未捕获的错误:', error);
  process.exit(1);
});
