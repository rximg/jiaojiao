/**
 * 测试脚本：实际运行Agent进行一次完整的调用
 * 运行方式: tsx backend/tests/test-agent-run.ts
 * 注意：这会调用实际的LLM API，需要配置DASHSCOPE_API_KEY环境变量
 */

import { AgentFactory } from '../agent/AgentFactory.js';
import { initializeServices } from '../services/service-initializer.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function testAgentRun() {
  // 初始化服务（包括 RuntimeManager）
  console.log('\n[初始化服务]');
  await initializeServices();
  console.log('✅ 服务初始化完成');
  console.log('='.repeat(60));
  console.log('测试 Agent 实际运行');
  console.log('='.repeat(60));

  try {
    // 检查API密钥
    if (!process.env.DASHSCOPE_API_KEY) {
      console.error('❌ 缺少 DASHSCOPE_API_KEY 环境变量');
      console.log('请在 .env 文件中设置 DASHSCOPE_API_KEY');
      process.exit(1);
    }

    console.log('✅ API密钥已配置');
    console.log('API密钥:', process.env.DASHSCOPE_API_KEY?.slice(0, 10) + '...');

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
