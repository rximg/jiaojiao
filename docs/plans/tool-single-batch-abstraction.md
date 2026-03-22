# 设计方案：工具单步/批量抽象与前端统一展示

> **版本**：v2.0  
> **日期**：2026-03-02  
> **状态**：草案（已采纳方案 B）

---

## 1. 问题背景

当前系统中，不同案例对同一工具的使用方式存在两种模式：

| 案例 | 工具 | 使用方式 | 说明 |
|---|---|---|---|
| 百科绘本 | `generate_image` | 单步 | 生成一张图片 |
| 百科绘本 | `generate_audio` + `batch_tool_call` | 批量 | 通过 `batch_tool_call(tool: "generate_audio")` 串行合成 |
| 绘本故事 | `generate_image` | 批量（多次单步） | Agent 循环调用 N 次 generate_image 生成 N 个角色图 |
| 绘本故事 | `edit_image` | 批量（多次单步） | Agent 循环调用 N 次 edit_image 生成 N 个分镜图 |
| 绘本故事 | `generate_audio` + `batch_tool_call` | 批量 | 通过 `batch_tool_call(tool: "generate_audio")` 生成台词音频 |

### 核心问题

1. **前端展示不统一**：批量操作（如 TTS 进度）用了特殊的 `ttsProgressLive` 状态；多次单步调用（如连续生图）没有进度聚合。
2. **HITL 重复确认**：Agent 循环调用 N 次单步工具时，每次都弹 HITL 确认框，用户需要点 N 次。
3. **进度不可见**：多次单步调用的进度信息分散在各条消息中，用户无法一眼看到「已完成 3/10 张图」。
4. **抽象缺失**：TTS 工具自身内置了 batch 循环 + onProgress 回调，而图片类工具没有，进度机制不一致。

---

## 2. 设计目标

1. **统一抽象**：所有工具分为 **单步（Single）** 和 **批量（Batch）** 两种使用方式，批量 = 串行执行多次单步。
2. **进度统一**：批量执行时，后端推送统一的 `batchProgress` 事件，前端用统一的 `BatchWrapper` 组件展示。
3. **HITL 简化**：批量调用只在开始前做一次 HITL 确认，确认后所有子步骤自动执行。
4. **前端复用**：`BatchWrapper` 内部复用单步工具的子页面/结果卡片。
5. **向后兼容**：现有单步调用行为不变，批量模式为新增抽象层。

---

## 3. 整体架构

```
┌─────────────────────────────────────────────────┐
│                  Agent (LLM)                     │
│  调用 generate_images(批量) 或 generate_image(单步) │
└──────────────────┬──────────────────────────────┘
                   │
    ┌──────────────▼──────────────────┐
    │        Tool Layer (后端)         │
    │  ┌───────────┐  ┌────────────┐  │
    │  │  Single    │  │   Batch    │  │
    │  │  Tool      │  │   Tool     │  │
    │  │ (现有工具) │  │ (新增壳层)  │  │
    │  └───────────┘  └─────┬──────┘  │
    │                       │ 串行调用  │
    │                  ┌────▼─────┐   │
    │                  │ Single   │×N │
    │                  │ execute  │   │
    │                  └──────────┘   │
    └──────────────┬──────────────────┘
                   │ IPC Events
    ┌──────────────▼──────────────────┐
    │        Frontend (渲染进程)        │
    │  ┌───────────┐  ┌────────────┐  │
    │  │ SingleTool │  │ Batch      │  │
    │  │ ResultCard │  │ Wrapper    │  │
    │  │ (现有组件) │  │ ┌────────┐ │  │
    │  │           │  │ │进度条   │ │  │
    │  │           │  │ │HITL一次 │ │  │
    │  │           │  │ │子卡片×N │ │  │
    │  │           │  │ └────────┘ │  │
    │  └───────────┘  └────────────┘  │
    └──────────────────────────────────┘
```

---

## 4. 后端设计

### 4.1 工具分类模型

```typescript
// backend/tools/types.ts

/** 工具执行模式 */
export type ToolExecutionMode = 'single' | 'batch';

/** 批量工具的单个子任务 */
export interface BatchSubTask {
  /** 子任务序号（1-based） */
  index: number;
  /** 传给单步工具的参数 */
  params: Record<string, unknown>;
  /** 可选的标签（如角色名、分镜页码） */
  label?: string;
}

/** 批量执行进度 */
export interface BatchProgress {
  /** 批次标识（与 toolCallId 关联） */
  batchId: string;
  /** 工具名（如 generate_image） */
  toolName: string;
  /** 当前完成数 */
  current: number;
  /** 总数 */
  total: number;
  /** 当前子任务状态 */
  currentSubTask?: {
    index: number;
    label?: string;
    status: 'pending' | 'running' | 'completed' | 'error';
    result?: unknown;
    error?: string;
  };
  /** 已完成的子任务结果摘要 */
  completedResults?: Array<{
    index: number;
    label?: string;
    result: unknown;
  }>;
}
```

### 4.2 批量工具注册方案

**核心思路**：不改动现有单步工具，新增带 `_batch` 后缀的批量工具作为壳层。

```typescript
// backend/tools/batch-tool-wrapper.ts

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { ToolConfig, ToolContext } from './registry.js';
import { registerTool, createTool } from './registry.js';

/**
 * 创建批量版本的工具
 * @param singleToolName  基础单步工具名（如 'generate_image'）
 * @param batchToolName   批量工具名（如 'generate_images'）
 * @param batchSchema     批量参数 schema（items 数组 + 公共参数）
 * @param extractSubTasks 从批量参数中拆分出子任务列表
 */
export function registerBatchTool<TBatchParams>(options: {
  singleToolName: string;
  batchToolName: string;
  description: string;
  batchSchema: z.ZodType<TBatchParams>;
  /** 从批量参数中提取子任务列表 */
  extractSubTasks: (params: TBatchParams) => BatchSubTask[];
  /** 从批量参数中提取公共参数（传给 HITL） */
  extractCommonParams?: (params: TBatchParams) => Record<string, unknown>;
}) {
  registerTool(options.batchToolName, (config: ToolConfig, context: ToolContext) => {
    return tool(
      async (params: TBatchParams) => {
        const subTasks = options.extractSubTasks(params);
        const commonParams = options.extractCommonParams?.(params) ?? {};

        // ── 1. 批量 HITL：只确认一次 ──
        const hitlPayload = {
          ...commonParams,
          _batchMode: true,
          _batchTotal: subTasks.length,
          _batchItems: subTasks.map(t => t.label ?? `#${t.index}`),
        };
        await context.requestApprovalViaHITL(
          `ai.${options.singleToolName}`,  // 复用单步的 actionType
          hitlPayload
        );

        // ── 2. 串行执行，逐项推送进度 ──
        const results: unknown[] = [];
        const runCtx = context.getRunContext?.();
        const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        for (let i = 0; i < subTasks.length; i++) {
          const subTask = subTasks[i];

          // 推送进度
          runCtx?.onBatchProgress?.(runCtx.threadId, {
            batchId,
            toolName: options.singleToolName,
            current: i,
            total: subTasks.length,
            currentSubTask: {
              index: subTask.index,
              label: subTask.label,
              status: 'running',
            },
          });

          try {
            // 调用单步工具逻辑（跳过 HITL）
            const result = await executeSingleToolDirectly(
              options.singleToolName,
              subTask.params,
              config,
              context
            );
            results.push(result);

            // 推送子任务完成
            runCtx?.onBatchProgress?.(runCtx.threadId, {
              batchId,
              toolName: options.singleToolName,
              current: i + 1,
              total: subTasks.length,
              currentSubTask: {
                index: subTask.index,
                label: subTask.label,
                status: 'completed',
                result,
              },
            });
          } catch (error) {
            // 子任务失败：记录错误，继续执行剩余
            runCtx?.onBatchProgress?.(runCtx.threadId, {
              batchId,
              toolName: options.singleToolName,
              current: i + 1,
              total: subTasks.length,
              currentSubTask: {
                index: subTask.index,
                label: subTask.label,
                status: 'error',
                error: error instanceof Error ? error.message : String(error),
              },
            });
            results.push({ error: error instanceof Error ? error.message : String(error) });
          }
        }

        return JSON.stringify({
          batchId,
          total: subTasks.length,
          completed: results.filter(r => !(r as any)?.error).length,
          results,
        });
      },
      {
        name: options.batchToolName,
        description: options.description,
        schema: options.batchSchema as any,
      }
    );
  });
}
```

### 4.3 具体批量工具定义

#### 4.3.1 `generate_images`（批量文生图）

```typescript
// backend/tools/generate-images.ts

registerBatchTool({
  singleToolName: 'generate_image',
  batchToolName: 'generate_images',
  description: '批量生成多张图片（角色图、场景图等），串行执行，统一确认',
  batchSchema: z.object({
    items: z.array(z.object({
      prompt: z.string().optional(),
      promptFile: z.string().optional(),
      imageName: z.string().optional(),
      size: z.string().optional(),
      label: z.string().optional().describe('标签（如角色名）'),
    })).describe('要生成的图片列表'),
    size: z.string().optional().default('1280*960').describe('默认尺寸（各项可覆盖）'),
    sessionId: z.string().optional(),
  }),
  extractSubTasks: (params) =>
    params.items.map((item, i) => ({
      index: i + 1,
      label: item.label ?? item.imageName ?? `图片${i + 1}`,
      params: {
        prompt: item.prompt,
        promptFile: item.promptFile,
        imageName: item.imageName,
        size: item.size ?? params.size,
        sessionId: params.sessionId,
      },
    })),
  extractCommonParams: (params) => ({
    total: params.items.length,
    defaultSize: params.size,
  }),
});
```

#### 4.3.2 `edit_images`（批量图像编辑）

```typescript
// backend/tools/edit-images.ts

registerBatchTool({
  singleToolName: 'edit_image',
  batchToolName: 'edit_images',
  description: '批量编辑多张图片（分镜图等），串行执行，统一确认',
  batchSchema: z.object({
    items: z.array(z.object({
      prompt: z.string().optional(),
      promptFile: z.string().optional(),
      imagePath: z.string().optional(),
      imagePaths: z.array(z.string()).optional(),
      imageName: z.string().optional(),
      size: z.string().optional(),
      label: z.string().optional().describe('标签（如分镜页码）'),
    })).describe('要编辑的图片列表'),
    size: z.string().optional().default('1280*960'),
    sessionId: z.string().optional(),
  }),
  extractSubTasks: (params) =>
    params.items.map((item, i) => ({
      index: i + 1,
      label: item.label ?? item.imageName ?? `分镜${i + 1}`,
      params: {
        prompt: item.prompt,
        promptFile: item.promptFile,
        imagePath: item.imagePath,
        imagePaths: item.imagePaths,
        imageName: item.imageName,
        size: item.size ?? params.size,
        sessionId: params.sessionId,
      },
    })),
});
```

#### 4.3.3 `generate_audio` 改造（方案 B：单步工具 + 通用批量壳层）

语音能力当前按单条生成更符合统一抽象。为与 `generate_image` / `edit_image` 保持一致，采用单步工具 `generate_audio`（单条文本→单条音频）+ `batch_tool_call`（批量壳层）的组合。

**采用方案 B 的理由**：
- 与图片类工具的 single/batch 拆分方式完全一致，架构统一
- 单步工具可独立使用（未来可能的场景：只合成一条语音）
- 批量壳层自动获得 `BatchProgress` 推送、HITL 一次确认等统一能力
- `onTtsProgress` 可直接废弃，不需要过渡期双发

##### 4.3.3.1 `generate_audio`（新增单步工具）

```typescript
// backend/tools/generate-audio.ts

import path from 'path';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getArtifactRepository, getMultimodalPortAsync } from '../infrastructure/repositories.js';
import { readLineNumbers, appendEntries, type LineNumberEntry } from './line-numbers.js';
import { loadConfig } from '../app-config.js';
import type { ToolConfig, ToolContext } from './registry.js';
import { registerTool } from './registry.js';

function sanitizeForFilename(text: string, maxLen = 40): string {
  const noPunctuation = text.replace(/[\s\p{P}\p{S}]/gu, '').trim();
  return noPunctuation.slice(0, maxLen).replace(/[/\\:*?"<>|]/g, '_') || 'line';
}

function create(config: ToolConfig, context: ToolContext) {
  const toolName = 'generate_audio';
  const description = '合成单条语音（内部工具，供批量壳层调用）';
  const serviceConfig = config.serviceConfig as {
    default_params?: Record<string, unknown>;
  };
  const defaultParams = serviceConfig?.default_params ?? {};
  const defaultVoice = (defaultParams.voice as string) ?? 'chinese_female';
  const defaultFormat = (defaultParams.format as string) ?? 'mp3';

  return tool(
    async (params: { text: string; voice?: string; format?: string; sessionId?: string }) => {
      // 注意：HITL 由批量壳层统一处理，单步不再调用 requestApprovalViaHITL
      const merged = await context.requestApprovalViaHITL('ai.text2speech_single', params as Record<string, unknown>);
      const sessionId = (merged.sessionId as string) || context.getDefaultSessionId();
      const text = merged.text as string;
      if (!text?.trim()) throw new Error('text is required');

      const voice = (merged.voice as string) ?? defaultVoice;
      const format = (merged.format as string) ?? defaultFormat;

      const appConfig = await loadConfig();
      const ttsStartNumber = appConfig.storage?.ttsStartNumber ?? 6000;
      const { nextNumber } = await readLineNumbers(ttsStartNumber);
      const relativePath = path.posix.join('audio', `${nextNumber}_${sanitizeForFilename(text)}.${format}`);

      const port = await getMultimodalPortAsync();
      const ttsSync = (port as any).deps?.ttsSyncPort ?? port;
      // 直接调用底层 TTS 同步端口，合成单条
      const result = await (port as any).synthesizeSpeechSingleItem(
        text, voice, format, sessionId, relativePath
      );

      // 记录 line number
      await appendEntries([{
        number: nextNumber,
        sessionId,
        relativePath,
        text,
      }], ttsStartNumber);

      return JSON.stringify({
        audioPath: result.audioPath,
        audioUri: result.audioUri,
        number: nextNumber,
        text,
        sessionId,
      });
    },
    {
      name: toolName,
      description,
      schema: z.object({
        text: z.string().describe('要合成的文本'),
        voice: z.string().optional().default(defaultVoice).describe('语音类型'),
        format: z.string().optional().default(defaultFormat).describe('音频格式'),
        sessionId: z.string().optional().describe('会话ID'),
      }),
    }
  );
}

registerTool('generate_audio', create);
```

> **注意**：需要在 `multimodal-port-impl.ts` 中抽取一个 `synthesizeSpeechSingleItem` 方法，将现有单条合成逻辑独立出来，供 `generate_audio` 调用。

##### 4.3.3.2 `batch_tool_call`（用于语音批量执行）

```typescript
// backend/tools/synthesize-speech.ts（改造后）

import { registerBatchTool } from './batch-tool-wrapper.js';
import { z } from 'zod';

registerBatchTool({
  singleToolName: 'generate_audio',
  batchToolName: 'batch_tool_call',
  description: '批量合成语音（传入台词数组，串行合成，统一确认）',
  batchSchema: z.object({
    texts: z.array(z.string()).describe('台词文本数组'),
    voice: z.string().optional().default('chinese_female').describe('语音类型'),
    format: z.string().optional().default('mp3').describe('音频格式'),
    sessionId: z.string().optional().describe('会话ID'),
  }),
  extractSubTasks: (params) =>
    params.texts.map((text, i) => ({
      index: i + 1,
      label: text.length > 20 ? text.slice(0, 20) + '…' : text,
      params: {
        text,
        voice: params.voice,
        format: params.format,
        sessionId: params.sessionId,
      },
    })),
  extractCommonParams: (params) => ({
    total: params.texts.length,
    voice: params.voice,
    format: params.format,
  }),
});
```

Agent 侧通过 `batch_tool_call(tool: "generate_audio", items: [...])` 统一批量生成音频，底层串行调用 `generate_audio` × N，自动获得 `BatchProgress` 推送和 HITL 一次确认。

##### 4.3.3.3 `MultimodalPort` 抽取单条方法

```typescript
// multimodal-port-impl.ts 新增方法

async synthesizeSpeechSingleItem(
  text: string,
  voice: string,
  format: string,
  sessionId: string,
  relativePath: string
): Promise<{ audioPath: string; audioUri: string }> {
  const ttsSync = this.deps.ttsSyncPort;
  const result = await ttsSync.execute({ text, voice });
  let buffer: Buffer;
  if ('audioUrl' in result && result.audioUrl) {
    const res = await fetch(result.audioUrl);
    if (!res.ok) throw new Error(`TTS download failed: ${res.status}`);
    buffer = Buffer.from(await res.arrayBuffer());
  } else if ('pcmBuffer' in result) {
    const { pcmBuffer, sampleRate, channels } = result;
    buffer = format === 'wav'
      ? pcmToWav(pcmBuffer, { sampleRate, channels })
      : await pcmToMp3(pcmBuffer, { sampleRate, channels });
  } else {
    throw new Error('TTS sync port returned unexpected result shape');
  }
  await this.deps.artifactRepo.write(sessionId, relativePath, buffer);
  const absPath = this.deps.artifactRepo.resolvePath(sessionId, relativePath);
  return {
    audioPath: absPath,
    audioUri: pathToFileURL(absPath).href,
  };
}
```

> 原有的 `synthesizeSpeechImpl`（批量循环）可在 Phase 4 清理阶段删除，过渡期暂时保留。

### 4.4 RunContext 扩展

```typescript
// backend/application/agent/run-context.ts 扩展

export interface RunContext {
  threadId: string;
  messageId?: string;
  toolCallId?: string;

  // ── 废弃（Phase 4 移除，方案 B 下无需过渡期双发） ──
  /** @deprecated 由 BatchProgress 统一替代 */
  onTtsProgress?: (...) => void;

  // ── 新增：统一批量进度回调 ──
  onBatchProgress?: (
    threadId: string,
    progress: BatchProgress
  ) => void;
}
```

> **方案 B 优势**：由于音频批量生成已统一为 `batch_tool_call(tool: "generate_audio")`，内部不再直接调用 `onTtsProgress`，所以 `onTtsProgress` 可在 Phase 2 完成后立即去除，无需过渡期双发。

### 4.5 IPC 事件统一

| 现有事件 | 新事件 | 说明 |
|---|---|---|
| `agent:ttsProgress` | `agent:batchProgress` | 统一所有批量进度 |
| — | `agent:batchProgress` | 新增图片批量进度 |

```typescript
// 新增 IPC 事件格式
interface BatchProgressEvent {
  threadId: string;
  messageId?: string;
  toolCallId?: string;
  progress: BatchProgress;
}
```

`agent:ttsProgress` 在方案 B 下可直接废弃（音频批量生成已统一走 `batch_tool_call`，不再触发 `onTtsProgress`）。Phase 4 中统一清理。

### 4.6 单步工具的直接执行（绕过 HITL）

批量工具壳层在整体 HITL 确认后，需要直接执行单步工具逻辑而不再触发 HITL。实现方式：

```typescript
// backend/tools/batch-tool-wrapper.ts

/**
 * 直接执行单步工具的核心逻辑，跳过 HITL
 * 方式：创建一个 bypass context，其 requestApprovalViaHITL 直接返回原参数
 */
async function executeSingleToolDirectly(
  toolName: string,
  params: Record<string, unknown>,
  config: ToolConfig,
  originalContext: ToolContext
): Promise<unknown> {
  // 创建一个绕过 HITL 的 context
  const bypassContext: ToolContext = {
    ...originalContext,
    requestApprovalViaHITL: async (_actionType, payload) => payload,  // 直接放行
  };
  
  const tool = await createTool(toolName, config, bypassContext);
  if (!tool) throw new Error(`Tool ${toolName} not found or disabled`);
  
  return tool.invoke(params);
}
```

### 4.7 HITL 对批量模式的支持

批量工具的 HITL 请求需要相比单步多传递以下信息：

```typescript
// HITL payload 中新增字段
interface BatchHitlPayload extends Record<string, unknown> {
  _batchMode: true;
  _batchTotal: number;
  _batchItems: string[];  // 各子任务标签列表
  // 其余为公共参数（如 size、voice 等）
}
```

前端 `HitlConfirmBlock` 检测 `_batchMode` 时，渲染为批量确认卡片：

- 标题：「批量生成 N 张图片？」
- 列表：展示所有子任务标签
- 按钮：「全部执行」/「取消」
- ~~不再逐个确认~~

---

## 5. 前端设计

### 5.1 新增类型

```typescript
// src/types/types.ts 新增

/** 批量进度事件 */
export interface BatchProgress {
  batchId: string;
  toolName: string;
  current: number;
  total: number;
  currentSubTask?: {
    index: number;
    label?: string;
    status: 'pending' | 'running' | 'completed' | 'error';
    result?: unknown;
    error?: string;
  };
  completedResults?: Array<{
    index: number;
    label?: string;
    result: unknown;
  }>;
}

/** 消息上的批量操作状态 */
export interface BatchOperationState {
  batchId: string;
  toolName: string;
  total: number;
  current: number;
  subTasks: Array<{
    index: number;
    label?: string;
    status: 'pending' | 'running' | 'completed' | 'error';
    result?: unknown;
    error?: string;
  }>;
}
```

### 5.2 Message 类型扩展

```typescript
export interface Message {
  // ... 现有字段 ...

  /** 批量操作状态（替代 ttsProgress，统一所有批量场景） */
  batchOperation?: BatchOperationState;

  /** @deprecated 使用 batchOperation 替代 */
  ttsProgress?: { current: number; total: number };
}
```

### 5.3 BatchWrapper 组件设计

```
┌─────────────────────────────────────────────┐
│ ┌─ BatchWrapper ──────────────────────────┐ │
│ │                                          │ │
│ │  🖼️ 批量生成图片    3 / 10              │ │
│ │  ████████████░░░░░░░░░░░░  30%          │ │
│ │                                          │ │
│ │  ┌─ SubTaskCard (复用 ImageBlock) ─────┐ │ │
│ │  │ ✅ #1 小兔子_角色.png              │ │ │
│ │  │  [图片预览]                         │ │ │
│ │  └─────────────────────────────────────┘ │ │
│ │  ┌─ SubTaskCard (复用 ImageBlock) ─────┐ │ │
│ │  │ ✅ #2 小猫_角色.png               │ │ │
│ │  │  [图片预览]                         │ │ │
│ │  └─────────────────────────────────────┘ │ │
│ │  ┌─ SubTaskCard ───────────────────────┐ │ │
│ │  │ ⏳ #3 小熊_角色.png  执行中…       │ │ │
│ │  │  [加载动画]                         │ │ │
│ │  └─────────────────────────────────────┘ │ │
│ │  ┌─ SubTaskCard ───────────────────────┐ │ │
│ │  │ ○ #4 小鹿_角色.png  等待中         │ │ │
│ │  └─────────────────────────────────────┘ │ │
│ │  ... (折叠/展开)                        │ │
│ └──────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

```typescript
// src/app/components/BatchWrapper.tsx

interface BatchWrapperProps {
  operation: BatchOperationState;
}

export default function BatchWrapper({ operation }: BatchWrapperProps) {
  const { toolName, current, total, subTasks } = operation;
  const percent = total === 0 ? 0 : Math.round((current / total) * 100);
  const [expanded, setExpanded] = useState(true);

  // 工具名 → 中文标题映射
  const title = BATCH_TITLES[toolName] ?? `批量 ${toolName}`;

  return (
    <div className="rounded-xl border bg-card p-3">
      {/* 头部：标题 + 进度 */}
      <div className="flex items-center justify-between">
        <span className="font-medium">{title}</span>
        <span className="text-xs tabular-nums">{current}/{total} · {percent}%</span>
      </div>

      {/* 进度条 */}
      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* 子任务列表（可折叠） */}
      {expanded && (
        <div className="mt-3 space-y-2 max-h-[400px] overflow-auto">
          {subTasks.map((sub) => (
            <SubTaskCard key={sub.index} subTask={sub} toolName={toolName} />
          ))}
        </div>
      )}

      <button onClick={() => setExpanded(!expanded)} className="text-xs mt-2">
        {expanded ? '收起' : `展开 (${total} 项)`}
      </button>
    </div>
  );
}
```

### 5.4 SubTaskCard 组件（复用现有结果块）

```typescript
// src/app/components/SubTaskCard.tsx

function SubTaskCard({ subTask, toolName }: { subTask: SubTaskState; toolName: string }) {
  const { index, label, status, result, error } = subTask;

  return (
    <div className="rounded-lg border p-2 flex items-start gap-2">
      {/* 状态图标 */}
      {status === 'completed' && <CheckCircle2 className="text-emerald-500" />}
      {status === 'running' && <Loader2 className="animate-spin text-primary" />}
      {status === 'error' && <XCircle className="text-red-500" />}
      {status === 'pending' && <Clock3 className="text-muted-foreground" />}

      <div className="flex-1">
        <div className="text-sm font-medium">
          #{index} {label ?? ''}
        </div>

        {/* 根据工具类型复用现有结果组件 */}
        {status === 'completed' && result && (
          <ResultRenderer toolName={toolName} result={result} />
        )}
        {status === 'error' && (
          <div className="text-xs text-red-500 mt-1">{error}</div>
        )}
      </div>
    </div>
  );
}

/** 根据工具名复用现有的 ImageBlock / AudioBlock */
function ResultRenderer({ toolName, result }: { toolName: string; result: unknown }) {
  const data = result as Record<string, unknown>;

  if (toolName === 'generate_image' || toolName === 'edit_image') {
    const path = (data.imagePath ?? data.imageUri ?? '') as string;
    return <ImageBlock path={path} prompt={data.prompt as string} />;
  }

  if (toolName === 'generate_audio') {
    const path = (data.path ?? data.audioPath ?? '') as string;
    return <AudioBlock path={path} text={data.text as string} />;
  }

  return <pre className="text-xs">{JSON.stringify(result, null, 2)}</pre>;
}
```

### 5.5 HITL 批量确认卡片

在 `HitlConfirmBlock` 中增加批量模式渲染分支：

```typescript
// HitlConfirmBlock.tsx 中新增

if (payload._batchMode) {
  const total = payload._batchTotal as number;
  const items = payload._batchItems as string[];
  
  return (
    <div className="...">
      <div className="font-medium">
        {ACTION_TITLE[request.actionType] ?? '批量操作确认'}
        <span className="text-sm text-muted-foreground ml-2">共 {total} 项</span>
      </div>
      
      {/* 展示子任务列表（最多显示 5 个，超出折叠） */}
      <ul className="text-sm mt-2 space-y-1">
        {items.slice(0, 5).map((item, i) => (
          <li key={i}>• {item}</li>
        ))}
        {items.length > 5 && (
          <li className="text-muted-foreground">... 等 {items.length - 5} 项</li>
        )}
      </ul>
      
      {/* 公共参数编辑区（如尺寸、语音类型等） */}
      {/* ... 复用现有 editable 机制 ... */}
      
      <div className="flex gap-2 mt-3">
        <Button onClick={() => onContinue?.()}>全部执行</Button>
        <Button variant="outline" onClick={() => onCancel?.()}>取消</Button>
      </div>
    </div>
  );
}
```

### 5.6 ChatProvider 状态管理

```typescript
// ChatProvider.tsx 新增

// 监听统一批量进度事件
const handleBatchProgress = (data: {
  threadId: string;
  messageId?: string;
  toolCallId?: string;
  progress: BatchProgress;
}) => {
  if (data.threadId !== currentSessionId) return;

  setMessages((prev) => {
    // 找到关联的 assistant 消息
    const targetId = data.messageId ?? prev.filter(m => m.role === 'assistant').pop()?.id;
    if (!targetId) return prev;

    return prev.map((m) => {
      if (m.id !== targetId) return m;

      const existing = m.batchOperation;
      const { progress } = data;

      // 构建/更新 subTasks 列表
      const subTasks = existing?.subTasks
        ? [...existing.subTasks]
        : Array.from({ length: progress.total }, (_, i) => ({
            index: i + 1,
            status: 'pending' as const,
          }));

      if (progress.currentSubTask) {
        const idx = progress.currentSubTask.index - 1;
        if (idx >= 0 && idx < subTasks.length) {
          subTasks[idx] = {
            ...subTasks[idx],
            ...progress.currentSubTask,
          };
        }
      }

      return {
        ...m,
        batchOperation: {
          batchId: progress.batchId,
          toolName: progress.toolName,
          total: progress.total,
          current: progress.current,
          subTasks,
        },
      };
    });
  });
};

// 注册监听
window.electronAPI.agent.onBatchProgress(handleBatchProgress);
```

### 5.7 ChatMessage 渲染集成

```typescript
// ChatMessage.tsx 中新增渲染分支

{message.batchOperation && (
  <BatchWrapper operation={message.batchOperation} />
)}

// 同时保留旧的 ttsProgress 兼容（过渡期）
{!message.batchOperation && message.ttsProgress && message.ttsProgress.total > 0 && (
  <div className="mt-2 text-xs opacity-70">
    已生成 {message.ttsProgress.current} / {message.ttsProgress.total} 份文件
  </div>
)}
```

---

## 6. HITL 简化策略详解

### 6.1 当前问题

| 场景 | 当前行为 | 用户操作 |
|---|---|---|
| 百科：1 次 generate_image | 弹 1 次 HITL | 点 1 次 |
| 百科：1 次 `batch_tool_call(tool: "generate_audio")`（10 条台词） | 弹 1 次 HITL | 点 1 次 |
| 绘本：5 次 generate_image（角色图） | 弹 5 次 HITL | **点 5 次** ❌ |
| 绘本：10 次 edit_image（分镜图） | 弹 10 次 HITL | **点 10 次** ❌ |

### 6.2 改造后行为

| 场景 | 新行为 | 用户操作 |
|---|---|---|
| 百科：1 次 generate_image | 弹 1 次 HITL（不变） | 点 1 次 |
| 百科：1 次 `batch_tool_call(tool: "generate_audio")` | 弹 1 次 HITL（不变） | 点 1 次 |
| 绘本：1 次 generate_images（5 张角色图） | 弹 1 次批量 HITL | **点 1 次** ✅ |
| 绘本：1 次 edit_images（10 张分镜图） | 弹 1 次批量 HITL | **点 1 次** ✅ |

### 6.3 关键：Agent Prompt / SKILL.md 配合

不同案例根据工作流特点，该用单步就用单步，该用批量就用批量。以下是两个案例的具体改动方案。

#### 6.3.1 百科绘本（encyclopedia.yaml）— 最小改动

百科案例流程简单（1 张图 + 1 次台词批量合成），**现有工具调用方式天然适配**：

| 步骤 | 工具 | 模式 | 改动 |
|---|---|---|---|
| 生成图片 | `generate_image` | 单步（1 张） | **不变** |
| 合成语音 | `generate_audio` + `batch_tool_call` | 批量（N 条台词） | 通过通用批量工具逐条生成 |
| 其他工具 | `generate_script_from_image` 等 | 单步 | **不变** |

**encyclopedia.yaml system_prompt 改动**：需要改成 `batch_tool_call(tool: "generate_audio", items: [...])`，与当前通用批量工具保持一致。

```yaml
# encyclopedia.yaml — system_prompt 改为：
#   batch_tool_call(tool: "generate_audio", items: [...])
# 底层为 batch_tool_call → generate_audio × N
```

**encyclopedia.yaml tools 配置改动**：新增 `generate_audio`，并保留 `batch_tool_call` 作为批量执行器。

```yaml
# encyclopedia.yaml tools 配置
tools:
  finalize_workflow: {}
  annotate_image_with_numbers: {}
  delete_artifacts: {}
  generate_image:              # 单步，不变
    enable: true
    config_path: ./tools/t2i.yaml
  generate_audio:              # 新增：单步音频工具（供 batch_tool_call 调用）
    enable: true
    config_path: ./tools/tts.yaml
  batch_tool_call: {}
  generate_script_from_image:
    enable: true
    config_path: ./tools/vl_script.yaml
```

#### 6.3.2 绘本故事（story_book.yaml + SKILL.md）— 核心改动

绘本案例涉及多次生图和多次编辑图，需要改用批量工具：

| 步骤 | 工具 | 改动前 | 改动后 |
|---|---|---|---|
| 步骤 3：角色图片 | `generate_image` × N | Agent 循环 N 次单步 | **`generate_images`** 批量，一次传入 N 个角色 |
| 步骤 4：分镜图 | `edit_image` × N | Agent 循环 N 次单步 | **`edit_images`** 批量，一次传入 N 个分镜 |
| 步骤 5：台词+配音 | `generate_audio` + `batch_tool_call` | 批量 | 使用通用批量工具执行 |
| 其他 | 单步工具 | — | **不变** |

**SKILL.md allowedTools 改动**：

```yaml
# .claude/skills/picture-book-story/SKILL.md frontmatter
allowedTools:
  - generate_image          # 保留：单张生成仍有场景（如重新生成某个角色）
  - generate_images         # 新增：批量生成角色图
  - edit_image              # 保留：单张编辑仍有场景（如重做某个分镜）
  - edit_images             # 新增：批量生成分镜图
  - generate_audio
  - generate_script_from_image
  - annotate_image_with_numbers
  - finalize_workflow
  - write_todos
```

**SKILL.md 步骤 3 改动（角色图片）**：

```markdown
### 步骤 3：生成角色图片（改造后）
**工具调用**：
- 使用 **generate_images** 批量生成所有角色图片：
  ```
  generate_images(items: [
    { prompt: "角色1外貌描述...", imageName: "小兔子_角色.png", label: "小兔子" },
    { prompt: "角色2外貌描述...", imageName: "小猫_角色.png", label: "小猫" },
    ...
  ], size: "1280*960")
  ```
- 系统会弹出一次确认，列出所有角色，用户点「全部执行」即可
- 若只需**重新生成某个角色**，使用单步 generate_image
```

**SKILL.md 步骤 4 改动（分镜图）**：

```markdown
### 步骤 4：生成分镜图（改造后）
**工具调用**：
- 使用 **edit_images** 批量生成所有分镜图：
  ```
  edit_images(items: [
    { prompt: "第1页场景描述", imagePath: "images/小兔子_角色.png", imageName: "scene_01.png", label: "第1页" },
    { prompt: "第2页场景描述", imagePath: "images/小兔子_角色.png", imageName: "scene_02.png", label: "第2页" },
    ...
  ], size: "1280*960")
  ```
- 系统会弹出一次确认，列出所有分镜，用户点「全部执行」即可
- 若只需**重做某个分镜**，使用单步 edit_image
```

**SKILL.md 工具选择规则（新增段落）**：

```markdown
## 工具选择规则：单步 vs 批量

| 场景 | 使用工具 | 原因 |
|---|---|---|
| 一次生成多个角色图 | `generate_images` | 批量：HITL 只确认一次，有进度条 |
| 重新生成单个角色图 | `generate_image` | 单步：只改一张 |
| 一次生成所有分镜图 | `edit_images` | 批量 |
| 重新生成单个分镜图 | `edit_image` | 单步 |
| 合成所有台词语音 | `generate_audio` + `batch_tool_call` | 批量（逐条 item 传入） |
| 其他工具 | 各自单步调用 | 无批量需求 |

**核心原则**：首次执行流程时用批量工具，重做某个子项时用单步工具。
```

**story_book.yaml tools 配置改动**：

```yaml
# story_book.yaml tools 配置
tools:
  finalize_workflow: {}
  annotate_image_with_numbers: {}
  delete_artifacts: {}
  generate_image:                # 单步（重做单张用）
    enable: true
    config_path: ./tools/t2i.yaml
  generate_images:               # 新增：批量文生图
    enable: true
    config_path: ./tools/t2i.yaml
    batch: true
  edit_image:                    # 单步（重做单张用）
    enable: true
    config_path: ./tools/image_edit.yaml
  edit_images:                   # 新增：批量图编
    enable: true
    config_path: ./tools/image_edit.yaml
    batch: true
  generate_audio:                # 新增：单步音频（内部依赖）
    enable: true
    config_path: ./tools/tts.yaml
  batch_tool_call: {}
  generate_script_from_image:
    enable: true
    config_path: ./tools/vl_script.yaml
```

---

## 7. Preload 层扩展

```typescript
// electron/preload.ts 新增

onBatchProgress: (callback: (data: {
  threadId: string;
  messageId?: string;
  toolCallId?: string;
  progress: BatchProgress;
}) => void) => {
  ipcRenderer.on('agent:batchProgress', (_event, data) => callback(data));
},
```

---

## 8. IPC 层扩展

```typescript
// electron/ipc/agent.ts 回调新增

onBatchProgress: (
  threadId: string,
  messageId: string | undefined,
  progress: BatchProgress
) => {
  mainWindow.webContents.send('agent:batchProgress', {
    threadId,
    messageId,
    progress,
  });
},
```

---

## 9. 工具配置扩展

详细的案例工具配置变更已在 §6.3.1 和 §6.3.2 中给出。核心原则：

1. **批量工具复用单步工具的 `config_path`**：`generate_images` 与 `generate_image` 共享 `./tools/t2i.yaml`
2. **`generate_audio` 需要显式注册**：作为 `batch_tool_call` 在语音场景中的单步依赖
3. **`batch: true` 自动推断**（可选的简写方式）

```yaml
# 简写方式（推荐）：在单步工具上标 batch: true，自动注册同名复数形式的批量工具
tools:
  generate_image:
    enable: true
    config_path: ./tools/t2i.yaml
    batch: true  # → 自动注册 generate_images
  edit_image:
    enable: true
    config_path: ./tools/image_edit.yaml
    batch: true  # → 自动注册 edit_images
  generate_audio:
    enable: true
    config_path: ./tools/tts.yaml
  batch_tool_call: {}
```

> 展开形式见 §6.3.1（百科）和 §6.3.2（绘本）的完整配置。

---

## 10. 迁移策略

### Phase 1：基础框架（不破坏现有功能）

1. 新增 `BatchProgress` 类型定义
2. 新增 `agent:batchProgress` IPC 事件通道
3. RunContext 新增 `onBatchProgress` 回调
4. 新增 `BatchWrapper` / `SubTaskCard` 前端组件
5. ChatProvider 新增 `handleBatchProgress` 监听

### Phase 2：接入 generate_audio（方案 B 拆分）

1. 新建 `generate-audio.ts`，注册单条音频生成工具
2. 在 `multimodal-port-impl.ts` 中抽取 `synthesizeSpeechSingleItem` 方法
3. 接入 `batch_tool_call`：以 `tool: "generate_audio"` 承担批量语音生成
4. 更新 Agent prompt，统一改为 `batch_tool_call(tool: "generate_audio", items: [...])`
5. 验证百科案例表现正确（底层走 `batch_tool_call` → `generate_audio` × N）

### Phase 3：新增批量图片工具 + 修改案例 Prompt

1. 实现 `batch-tool-wrapper.ts`
2. 注册 `generate_images` 和 `edit_images`
3. 修改 `story_book.yaml` tools 配置（新增批量工具，保留单步工具供重做场景）
4. 修改 `.claude/skills/picture-book-story/SKILL.md`：
   - allowedTools 新增 `generate_images`、`edit_images`
   - 步骤 3 改为调用 `generate_images`
   - 步骤 4 改为调用 `edit_images`
   - 新增「工具选择规则」段落（首次批量，重做单步）
5. 修改 `encyclopedia.yaml` tools 配置（新增 `generate_audio` 依赖）
6. 验证两个案例：百科（单步图+批量语音）和绘本（批量图+批量语音）

### Phase 4：清理

1. 移除 `onTtsProgress` 回调（RunContext、invoke-agent-use-case、IPC、preload）
2. 移除 `agent:ttsProgress` IPC 事件
3. 移除 `ttsProgressLive` 前端状态
4. 移除 `message.ttsProgress` 字段
5. 移除旧的 `multimodal-port-impl.synthesizeSpeechImpl` 批量循环方法
6. 统一使用 `batchOperation`

---

## 11. 文件变更清单

| 文件 | 变更 | Phase |
|---|---|---|
| `backend/tools/types.ts` | 新增 `BatchProgress`、`BatchSubTask` 类型 | 1 |
| `backend/tools/batch-tool-wrapper.ts` | **新建**：通用批量工具壳层 | 2 |
| `backend/tools/generate-audio.ts` | **新建**：单条音频生成工具 | 2 |
| `backend/tools/synthesize-speech.ts` | **改造**：从手写循环改为 `registerBatchTool` 壳层 | 2 |
| `backend/infrastructure/inference/multimodal-port-impl.ts` | 抽取 `synthesizeSpeechSingleItem` 方法 | 2 |
| `backend/tools/generate-images.ts` | **新建**：批量文生图工具 | 3 |
| `backend/tools/edit-images.ts` | **新建**：批量图编工具 | 3 |
| `backend/tools/index.ts` | 导入新工具 | 2, 3 |
| `backend/application/agent/run-context.ts` | 扩展 `RunContext`（新增 `onBatchProgress`） | 1 |
| `backend/application/agent/invoke-agent-use-case.ts` | 扩展 callbacks（新增 `onBatchProgress`） | 1 |
| `electron/ipc/agent.ts` | 新增 `onBatchProgress` 回调 | 1 |
| `electron/preload.ts` | 新增 `onBatchProgress` 监听 | 1 |
| `src/types/types.ts` | 新增 `BatchProgress`、`BatchOperationState` | 1 |
| `src/app/components/BatchWrapper.tsx` | **新建** | 1 |
| `src/app/components/SubTaskCard.tsx` | **新建** | 1 |
| `src/app/components/ChatMessage.tsx` | 渲染 `batchOperation` | 1 |
| `src/app/components/HitlConfirmBlock.tsx` | 批量模式渲染逻辑 | 1 |
| `src/providers/ChatProvider.tsx` | `handleBatchProgress` | 1 |
| `backend/config/agent_cases/encyclopedia.yaml` | tools 新增 `generate_audio` | 3 |
| `backend/config/agent_cases/story_book.yaml` | tools 新增批量工具 + `generate_audio` | 3 |
| `.claude/skills/picture-book-story/SKILL.md` | allowedTools、步骤 3/4 改用批量工具、新增工具选择规则 | 3 |

---

## 12. 关键设计决策摘要

| 决策 | 选择 | 理由 |
|---|---|---|
| 批量工具实现方式 | 新增 `_batch` 壳层，内部调用单步 | 不修改现有单步工具，向后兼容 |
| HITL 策略 | 批量整体确认一次 | 大幅减少用户操作次数 |
| 进度推送 | 统一 `agent:batchProgress` 事件 | 替代 TTS 专用的 `agent:ttsProgress`，一套机制覆盖所有批量场景 |
| 前端组件 | `BatchWrapper` 包裹 + 复用 `ImageBlock`/`AudioBlock` | 避免重复建设，单步/批量共享 UI |
| 音频生成处理 | 方案 B：拆成 `generate_audio` + `batch_tool_call` | 与图片类工具一致的 single/batch 抽象，架构统一；`onTtsProgress` 可直接废弃 |
| 单步绕过 HITL | bypass context 注入 | 批量确认后子步骤不再弹窗 |
| 配置方式 | YAML 中 `batch: true` 自动派生 | 无需手动配置第二个工具名 |

---

## 13. 风险与注意事项

1. **Agent 兼容性**：Agent（LLM）需要在 prompt 中了解到 `generate_images` 工具的存在才会使用。需要在 SKILL.md 和 tools 描述中明确体现。
2. **子任务失败策略**：当前设计为「失败继续」（记录错误，继续剩余子任务）。若需「失败停止」，可在 `registerBatchTool` 中增加 `onError: 'continue' | 'abort'` 配置。
3. **批量数量上限**：建议对 `items` 数组设置最大长度限制（如 50），防止 Agent 一次传入过多项目。
4. **Rate Limiting**：批量工具需要在子任务间增加延时（类似 TTS 的 `rateLimitMs`），避免触发 API 限流。可在 `registerBatchTool` 中增加 `delayBetweenMs` 参数。
5. **单步/批量工具同时存在**：同一个 Agent 可能既有 `generate_image` 又有 `generate_images`。SKILL.md 中通过「工具选择规则」明确：首次执行用批量，重做单个子项用单步。百科案例因只需 1 张图，不注册 `generate_images`，无此问题。
6. **generate_audio 不应被误写成旧名**：Agent 在批量场景应通过 `batch_tool_call(tool: "generate_audio", items: [...])` 调用，单步重做时才直接使用 `generate_audio`。其 HITL actionType 可继续沿用现有 `ai.text2speech`。
