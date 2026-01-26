import * as path from 'path';
import * as fs from 'fs';

export interface DebugConfig {
  log_llm_calls?: boolean;
  save_llm_calls?: boolean;
}

export function createLLMCallbacks(debugConfig: DebugConfig, projectRoot: string) {
  return {
    handleLLMStart({ name }: any, prompts: string[], runId?: string, parentRunId?: string, extraParams?: any, tags?: string[], metadata?: any) {
      const modelName = name ?? 'llm';
      const promptContent = prompts[0] || '';
      const promptLength = promptContent.length || 0;
      const timestamp = new Date().toISOString();
      
      // 根据配置决定是否打印
      if (debugConfig.log_llm_calls) {
        console.log('\n' + '='.repeat(80));
        console.log('🚀 [LLM START]');
        console.log('='.repeat(80));
        console.log(`📅 Timestamp: ${timestamp}`);
        console.log(`🤖 Model: ${modelName}`);
        console.log(`📏 Prompt Length: ${promptLength} characters`);
        console.log(`📊 Prompt Count: ${prompts.length}`);
        
        if (runId) console.log(`🔑 Run ID: ${runId}`);
        if (parentRunId) console.log(`🔗 Parent Run ID: ${parentRunId}`);
        if (tags && tags.length > 0) console.log(`🏷️  Tags: ${JSON.stringify(tags)}`);
        
        if (metadata && Object.keys(metadata).length > 0) {
          console.log('-'.repeat(80));
          console.log('📋 Metadata:');
          console.log(JSON.stringify(metadata, null, 2));
        }
        
        // if (extraParams && Object.keys(extraParams).length > 0) {
        //   console.log('-'.repeat(80));
        //   console.log('⚙️  Extra Params:');
        //   console.log(JSON.stringify(extraParams, null, 2));
        // }
        
        console.log('-'.repeat(80));
        console.log('📝 Prompt Content:');
        console.log('-'.repeat(80));
        console.log(promptContent.substring(0, 50) + (promptContent.length > 50 ? '...' : ''));
        console.log('='.repeat(80) + '\n');
      }
      
      // 根据配置决定是否保存到文件
      if (debugConfig.save_llm_calls) {
        try {
          const debugDir = path.resolve(projectRoot, 'outputs', 'debug');
          if (!fs.existsSync(debugDir)) {
            fs.mkdirSync(debugDir, { recursive: true });
          }
          const fileTimestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
          const filename = `llm_start_${modelName}_${fileTimestamp}.txt`;
          const filePath = path.join(debugDir, filename);
          
          let content = `Model: ${modelName}\nTimestamp: ${timestamp}\nPrompt Length: ${promptLength}\nPrompt Count: ${prompts.length}\n`;
          if (runId) content += `Run ID: ${runId}\n`;
          if (parentRunId) content += `Parent Run ID: ${parentRunId}\n`;
          if (tags && tags.length > 0) content += `Tags: ${JSON.stringify(tags)}\n`;
          if (metadata && Object.keys(metadata).length > 0) {
            content += `\n=== Metadata ===\n${JSON.stringify(metadata, null, 2)}\n`;
          }
          if (extraParams && Object.keys(extraParams).length > 0) {
            content += `\n=== Extra Params ===\n${JSON.stringify(extraParams, null, 2)}\n`;
          }
          content += `\n=== Prompt ===\n${promptContent}`;
          
          fs.writeFileSync(filePath, content, 'utf-8');
          if (debugConfig.log_llm_calls) {
            console.log(`💾 [LLM START] 已缓存: ${filePath}\n`);
          }
        } catch (error) {
          console.error('❌ [LLM START] 缓存失败:', error);
        }
      }
    },

    handleLLMEnd(output: any, runId?: string, parentRunId?: string, tags?: string[]) {
      const timestamp = new Date().toISOString();
      
      if (debugConfig.log_llm_calls) {
        console.log('\n' + '='.repeat(80));
        console.log('✅ [LLM END]');
        console.log('='.repeat(80));
        console.log(`📅 Timestamp: ${timestamp}`);
        
        if (runId) console.log(`🔑 Run ID: ${runId}`);
        if (parentRunId) console.log(`🔗 Parent Run ID: ${parentRunId}`);
        if (tags && tags.length > 0) console.log(`🏷️  Tags: ${JSON.stringify(tags)}`);
        
        console.log('-'.repeat(80));
        console.log('📤 Output:');
        console.log('-'.repeat(80));
        console.log(JSON.stringify(output, null, 2));
        console.log('='.repeat(80) + '\n');
      }
      
      // 根据配置决定是否保存到文件
      if (debugConfig.save_llm_calls) {
        try {
          const debugDir = path.resolve(projectRoot, 'outputs', 'debug');
          if (!fs.existsSync(debugDir)) {
            fs.mkdirSync(debugDir, { recursive: true });
          }
          const fileTimestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
          const filename = `llm_end_${fileTimestamp}.txt`;
          const filePath = path.join(debugDir, filename);
          
          let content = `Timestamp: ${timestamp}\n`;
          if (runId) content += `Run ID: ${runId}\n`;
          if (parentRunId) content += `Parent Run ID: ${parentRunId}\n`;
          if (tags && tags.length > 0) content += `Tags: ${JSON.stringify(tags)}\n`;
          content += `\n=== Output ===\n${JSON.stringify(output, null, 2)}`;
          
          fs.writeFileSync(filePath, content, 'utf-8');
          if (debugConfig.log_llm_calls) {
            console.log(`💾 [LLM END] 已缓存: ${filePath}\n`);
          }
        } catch (error) {
          console.error('❌ [LLM END] 缓存失败:', error);
        }
      }
    },

    handleLLMError(err: any, runId?: string, parentRunId?: string, tags?: string[]) {
      const timestamp = new Date().toISOString();
      
      console.error('\n' + '='.repeat(80));
      console.error('❌ [LLM ERROR]');
      console.error('='.repeat(80));
      console.error(`📅 Timestamp: ${timestamp}`);
      
      if (runId) console.error(`🔑 Run ID: ${runId}`);
      if (parentRunId) console.error(`🔗 Parent Run ID: ${parentRunId}`);
      if (tags && tags.length > 0) console.error(`🏷️  Tags: ${JSON.stringify(tags)}`);
      
      console.error('-'.repeat(80));
      console.error('Error Details:');
      console.error('-'.repeat(80));
      console.error(err);
      console.error('='.repeat(80) + '\n');
      
      // 始终保存错误到文件
      try {
        const debugDir = path.resolve(projectRoot, 'outputs', 'debug');
        if (!fs.existsSync(debugDir)) {
          fs.mkdirSync(debugDir, { recursive: true });
        }
        const fileTimestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
        const filename = `llm_error_${fileTimestamp}.txt`;
        const filePath = path.join(debugDir, filename);
        
        let content = `Timestamp: ${timestamp}\n`;
        if (runId) content += `Run ID: ${runId}\n`;
        if (parentRunId) content += `Parent Run ID: ${parentRunId}\n`;
        if (tags && tags.length > 0) content += `Tags: ${JSON.stringify(tags)}\n`;
        content += `\n=== Error ===\n${err instanceof Error ? err.stack : JSON.stringify(err, null, 2)}`;
        
        fs.writeFileSync(filePath, content, 'utf-8');
        console.error(`💾 [LLM ERROR] 已缓存: ${filePath}\n`);
      } catch (error) {
        console.error('❌ [LLM ERROR] 缓存失败:', error);
      }
    },
  };
}
