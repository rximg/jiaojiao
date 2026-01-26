/**
 * 测试脚本：验证 prompt_generator 子代理使用 FilesystemMiddleware
 * 运行方式: tsx backend/tests/test-prompt-generator.ts
 */

import { AgentFactory } from '../agent/AgentFactory.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_SESSION_ID } from '../services/fs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function testPromptGenerator() {
  console.log('='.repeat(60));
  console.log('测试 prompt_generator 子代理（FilesystemMiddleware）');
  console.log('='.repeat(60));

  try {
    // 设置测试会话ID
    const testSessionId = `test-prompt-gen-${Date.now()}`;
    process.env.AGENT_SESSION_ID = testSessionId;
    console.log(`✅ 测试会话ID: ${testSessionId}`);

    // 创建子代理
    console.log('\n[创建子代理]');
    const factory = new AgentFactory();
    const promptGeneratorAgent = await factory.createSubAgent('prompt_generator');
    console.log('✅ prompt_generator 子代理创建成功');

    // 测试用例：让 prompt_generator 生成提示词
    const testInput = {
      messages: [{ 
        role: 'user', 
        content: '根据前提变量生成适合3-5岁儿童的老虎科普绘本文生图提示词，风格为卡通，语言为中文'
      }]
    };

    console.log('\n[开始测试]');
    console.log('输入:', testInput.messages[0].content);

    // 直接调用子代理，通过 thread_id 传递 sessionId
    const config = {
      configurable: {
        thread_id: testSessionId,  // 会话 ID，文件将保存到此 session 的 workspace
      }
    };
    
    // @ts-ignore
    const result = await promptGeneratorAgent.invoke(testInput, config);

    console.log('\n[执行结果]');
    console.log('最后消息:', result.messages[result.messages.length - 1]?.content);
    
    // 检查文件是否生成
    console.log('\n[检查文件]');
    const { getWorkspaceFilesystem } = await import('../services/fs.js');
    const appConfig = await import('../agent/config.js').then(m => m.loadConfig());
    const workspaceFs = getWorkspaceFilesystem({ outputPath: appConfig.storage.outputPath });
    
    // 获取文件完整路径
    const expectedPath = workspaceFs.sessionPath(testSessionId, 'image_prompt.txt');
    console.log(`预期文件路径: ${expectedPath}`);
    
    try {
      const content = await workspaceFs.readFile(testSessionId, 'image_prompt.txt', 'utf-8');
      console.log('✅ 文件已生成: image_prompt.txt');
      console.log('文件路径:', expectedPath);
      console.log('内容长度:', typeof content === 'string' ? content.length : 0, '字符');
      console.log('内容预览:', typeof content === 'string' ? content.substring(0, 200) + '...' : '');
      
      // 验证文件确实存在
      const fs = await import('fs');
      if (fs.existsSync(expectedPath)) {
        console.log('✅ 文件系统确认：文件确实存在');
      } else {
        console.log('⚠️  警告：文件系统未找到文件（可能路径不一致）');
      }
    } catch (error) {
      console.log('❌ 文件未生成:', error instanceof Error ? error.message : String(error));
      console.log('尝试读取路径:', expectedPath);
    }

    console.log('\n✅ 测试完成');
  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  }
}

testPromptGenerator();
