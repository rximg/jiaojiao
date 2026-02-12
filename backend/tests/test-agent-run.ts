/**
 * 测试脚本：实际运行Agent进行一次完整的调用
 * 运行方式: tsx backend/tests/test-agent-run.ts
 * 注意：会调用实际 LLM API，需在应用设置（用户目录配置）中配置 API Key
 */

import { AgentFactory } from '../agent/AgentFactory.js';
import { initializeServices } from '../services/service-initializer.js';
import { loadConfig } from '../agent/config.js';
import { initLangSmithEnv } from '../agent/langsmith.js';

async function testAgentRun() {
  console.log('\n[初始化服务]');
  initLangSmithEnv();
  const config = await loadConfig();
  const provider = (config.agent?.provider ?? 'dashscope') as 'dashscope' | 'zhipu';
  const apiKey = (config.apiKeys as { dashscope?: string; zhipu?: string })?.[provider]?.trim();
  if (!apiKey) {
    console.error('❌ 未配置 API Key');
    console.log('请在应用设置（用户目录配置）中配置当前供应商的 API Key 后再运行');
    process.exit(1);
  }
  await initializeServices({ outputPath: config.storage?.outputPath });
  console.log('✅ 服务初始化完成');
  console.log('✅ API Key 已从用户目录配置加载');
  console.log('='.repeat(60));
  console.log('测试 Agent 实际运行');
  console.log('='.repeat(60));

  try {

    // 创建Agent
    console.log('\n[创建Agent]');
    const factory = new AgentFactory();
    const mainAgent = await factory.createMainAgent();
    console.log('✅ Agent创建成功');

    // 测试用例
    const testInput = {
      input: '一个小猫咪在花园里玩耍的故事',
      config: {
        // 可以在这里添加配置选项
      }
    };

    console.log('\n[运行测试]');
    console.log('输入:', testInput.input);
    console.log('开始时间:', new Date().toISOString());
    console.log('\n' + '-'.repeat(60));

    // 执行Agent
    const result = await mainAgent.invoke(testInput);

    console.log('-'.repeat(60));
    console.log('\n[执行结果]');
    console.log('结束时间:', new Date().toISOString());
    console.log('\n输出结果:');
    console.log(JSON.stringify(result, null, 2));

    console.log('\n' + '='.repeat(60));
    console.log('✅ 测试运行成功！');
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
testAgentRun().catch(error => {
  console.error('未捕获的错误:', error);
  process.exit(1);
});
