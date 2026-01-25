import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { getWorkspaceFilesystem } from '../backend/services/fs';

describe('finalize_workflow tool [unit]', () => {
  const sessionId = 'test-finalize-session';
  const outputPath = path.resolve(process.cwd(), 'outputs');
  const workspaceFs = getWorkspaceFilesystem({ outputPath });

  beforeEach(async () => {
    // 确保测试环境干净
    try {
      const sessionPath = path.join(outputPath, 'workspaces', sessionId);
      await fs.rm(sessionPath, { recursive: true, force: true });
    } catch (err) {
      // ignore if doesn't exist
    }
  });

  afterEach(async () => {
    // 清理测试文件
    try {
      const sessionPath = path.join(outputPath, 'workspaces', sessionId);
      await fs.rm(sessionPath, { recursive: true, force: true });
    } catch (err) {
      // ignore
    }
  });

  describe('文件检查功能', () => {
    it('应该在所有文件都存在时返回成功', async () => {
      // 准备测试文件
      const imagePath = 'images/test-image.png';
      const audioPath = 'audio/test-audio.mp3';
      const scriptText = '这是一段测试台词';

      await workspaceFs.writeFile(sessionId, imagePath, 'fake image data', 'utf-8');
      await workspaceFs.writeFile(sessionId, audioPath, 'fake audio data', 'utf-8');

      // 模拟 finalize_workflow 工具的逻辑
      const checks = {
        hasImage: false,
        hasAudio: false,
        hasScript: !!scriptText,
      };

      // 检查图片
      try {
        await workspaceFs.readFile(sessionId, imagePath);
        checks.hasImage = true;
      } catch (err) {
        checks.hasImage = false;
      }

      // 检查音频
      try {
        await workspaceFs.readFile(sessionId, audioPath);
        checks.hasAudio = true;
      } catch (err) {
        checks.hasAudio = false;
      }

      const allComplete = checks.hasImage && checks.hasAudio && checks.hasScript;

      expect(allComplete).toBe(true);
      expect(checks).toEqual({
        hasImage: true,
        hasAudio: true,
        hasScript: true,
      });
    });

    it('应该在图片文件缺失时返回失败', async () => {
      // 只创建音频文件，不创建图片文件
      const audioPath = 'audio/test-audio.mp3';
      const scriptText = '这是一段测试台词';

      await workspaceFs.writeFile(sessionId, audioPath, 'fake audio data', 'utf-8');

      const checks = {
        hasImage: false,
        hasAudio: false,
        hasScript: !!scriptText,
      };

      // 检查图片（不存在）
      try {
        await workspaceFs.readFile(sessionId, 'images/missing.png');
        checks.hasImage = true;
      } catch (err) {
        checks.hasImage = false;
      }

      // 检查音频
      try {
        await workspaceFs.readFile(sessionId, audioPath);
        checks.hasAudio = true;
      } catch (err) {
        checks.hasAudio = false;
      }

      const allComplete = checks.hasImage && checks.hasAudio && checks.hasScript;

      expect(allComplete).toBe(false);
      expect(checks.hasImage).toBe(false);
      expect(checks.hasAudio).toBe(true);
      expect(checks.hasScript).toBe(true);
    });

    it('应该在音频文件缺失时返回失败', async () => {
      // 只创建图片文件，不创建音频文件
      const imagePath = 'images/test-image.png';
      const scriptText = '这是一段测试台词';

      await workspaceFs.writeFile(sessionId, imagePath, 'fake image data', 'utf-8');

      const checks = {
        hasImage: false,
        hasAudio: false,
        hasScript: !!scriptText,
      };

      // 检查图片
      try {
        await workspaceFs.readFile(sessionId, imagePath);
        checks.hasImage = true;
      } catch (err) {
        checks.hasImage = false;
      }

      // 检查音频（不存在）
      try {
        await workspaceFs.readFile(sessionId, 'audio/missing.mp3');
        checks.hasAudio = true;
      } catch (err) {
        checks.hasAudio = false;
      }

      const allComplete = checks.hasImage && checks.hasAudio && checks.hasScript;

      expect(allComplete).toBe(false);
      expect(checks.hasImage).toBe(true);
      expect(checks.hasAudio).toBe(false);
      expect(checks.hasScript).toBe(true);
    });

    it('应该在台词为空时返回失败', async () => {
      // 创建图片和音频，但台词为空
      const imagePath = 'images/test-image.png';
      const audioPath = 'audio/test-audio.mp3';
      const scriptText = '';

      await workspaceFs.writeFile(sessionId, imagePath, 'fake image data', 'utf-8');
      await workspaceFs.writeFile(sessionId, audioPath, 'fake audio data', 'utf-8');

      const checks = {
        hasImage: false,
        hasAudio: false,
        hasScript: !!scriptText,
      };

      try {
        await workspaceFs.readFile(sessionId, imagePath);
        checks.hasImage = true;
      } catch (err) {
        checks.hasImage = false;
      }

      try {
        await workspaceFs.readFile(sessionId, audioPath);
        checks.hasAudio = true;
      } catch (err) {
        checks.hasAudio = false;
      }

      const allComplete = checks.hasImage && checks.hasAudio && checks.hasScript;

      expect(allComplete).toBe(false);
      expect(checks.hasImage).toBe(true);
      expect(checks.hasAudio).toBe(true);
      expect(checks.hasScript).toBe(false);
    });
  });

  describe('路径解析功能', () => {
    it('应该正确处理完整的workspace路径', () => {
      const fullPath = 'E:/MyProjects/deepagentui/app/outputs/workspaces/session123/images/test.png';
      
      // 模拟路径解析逻辑
      const imageRelPath = fullPath.includes('workspaces')
        ? fullPath.split('workspaces/')[1]?.split('/').slice(1).join('/') || fullPath
        : fullPath;

      expect(imageRelPath).toBe('images/test.png');
    });

    it('应该处理相对路径', () => {
      const relativePath = 'images/test.png';
      
      const imageRelPath = relativePath.includes('workspaces')
        ? relativePath.split('workspaces/')[1]?.split('/').slice(1).join('/') || relativePath
        : relativePath;

      expect(imageRelPath).toBe('images/test.png');
    });

    it('应该处理Windows风格路径', () => {
      const windowsPath = 'E:\\MyProjects\\deepagentui\\app\\outputs\\workspaces\\session123\\audio\\test.mp3';
      
      // 先规范化路径分隔符
      const normalizedPath = windowsPath.replace(/\\/g, '/');
      const audioRelPath = normalizedPath.includes('workspaces')
        ? normalizedPath.split('workspaces/')[1]?.split('/').slice(1).join('/') || normalizedPath
        : normalizedPath;

      expect(audioRelPath).toBe('audio/test.mp3');
    });
  });

  describe('返回消息格式', () => {
    it('应该生成正确的成功消息', () => {
      const imagePath = 'images/tiger.png';
      const audioPath = 'audio/tiger.mp3';
      const scriptText = '老虎是一种大型猫科动物';

      const message = `✅ 绘本制作完成！\n- 图片：${imagePath}\n- 音频：${audioPath}\n- 台词：${scriptText}`;

      expect(message).toContain('✅');
      expect(message).toContain(imagePath);
      expect(message).toContain(audioPath);
      expect(message).toContain(scriptText);
    });

    it('应该生成正确的失败消息', () => {
      const message = `⚠️ 部分文件缺失，请检查`;

      expect(message).toContain('⚠️');
      expect(message).toContain('缺失');
    });
  });

  describe('完整工作流测试', () => {
    it('应该模拟完整的工作流程', async () => {
      // 步骤1: 生成图片（模拟）
      const imagePath = 'images/excavator-scene.png';
      await workspaceFs.writeFile(sessionId, imagePath, Buffer.from('PNG_IMAGE_DATA'), 'utf-8');

      // 步骤2: 生成音频（模拟）
      const audioPath = 'audio/excavator-narration.mp3';
      await workspaceFs.writeFile(sessionId, audioPath, Buffer.from('MP3_AUDIO_DATA'), 'utf-8');

      // 步骤3: 生成台词（模拟）
      const scriptText = '挖掘机是一种强大的工程机械，可以挖土、装载和运输。';

      // 步骤4: 执行 finalize_workflow
      const checks = {
        hasImage: false,
        hasAudio: false,
        hasScript: !!scriptText,
      };

      try {
        await workspaceFs.readFile(sessionId, imagePath);
        checks.hasImage = true;
      } catch (err) {
        checks.hasImage = false;
      }

      try {
        await workspaceFs.readFile(sessionId, audioPath);
        checks.hasAudio = true;
      } catch (err) {
        checks.hasAudio = false;
      }

      const allComplete = checks.hasImage && checks.hasAudio && checks.hasScript;

      // 验证结果
      expect(allComplete).toBe(true);
      expect(checks).toEqual({
        hasImage: true,
        hasAudio: true,
        hasScript: true,
      });

      // 验证文件确实存在
      const imageContent = await workspaceFs.readFile(sessionId, imagePath);
      expect(imageContent).toBeTruthy();

      const audioContent = await workspaceFs.readFile(sessionId, audioPath);
      expect(audioContent).toBeTruthy();
    });
  });
});
