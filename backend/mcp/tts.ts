import { promises as fs } from 'fs';
import path from 'path';
import { loadConfig } from '../agent/config';

export interface SynthesizeSpeechParams {
  texts: string[];
  voice?: string;
  format?: string;
}

export interface SynthesizeSpeechResult {
  audioPaths: string[];
}

export async function synthesizeSpeech(
  params: SynthesizeSpeechParams
): Promise<SynthesizeSpeechResult> {
  const config = await loadConfig();
  const { texts, voice = 'chinese_female', format = 'mp3' } = params;

  const audioPaths: string[] = [];
  const outputDir = path.join(config.storage.outputPath, 'audios');
  await fs.mkdir(outputDir, { recursive: true });

  // 批量生成语音
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];

    // 调用阿里百炼 TTS API
    const response = await fetch(
      'https://dashscope.aliyuncs.com/api/v1/services/audio/tts',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKeys.dashscope}`,
        },
        body: JSON.stringify({
          model: 'sambert-zhichu-v1',
          input: {
            text,
          },
          parameters: {
            voice,
            format,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`TTS API error: ${response.statusText}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const audioFileName = `script_${i + 1}_${Date.now()}.${format}`;
    const audioPath = path.join(outputDir, audioFileName);

    await fs.writeFile(audioPath, Buffer.from(audioBuffer));
    audioPaths.push(audioPath);

    // 防限流延迟
    if (i < texts.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  return { audioPaths };
}
