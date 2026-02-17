# 后端 DDD 架构划分规划

> 基于《DDD核心概念及桌面端后端迁移指南》与《后端软件架构》，对当前后端进行 DDD 视角的领域划分与重构规划。

---

## 一、领域愿景与战略划分

### 1.1 整体领域愿景

**有声绘本创作领域**：为用户提供基于 AI 的绘本生成能力，通过 Agent 规划、多模态模型调度、HITL 人工确认，实现从主题输入到图片与语音产物的端到端创作，支持会话级持久化与断点续传。

### 1.2 子领域划分

| 子领域 | 类型 | 愿景 | 对应现有模块 |
|--------|------|------|--------------|
| **绘本创作** | 核心 | 驱动 Agent 工作流，协调规划、工具调用、SubAgent 委派，完成绘本生成 | agent/、mcp/、workflow |
| **会话管理** | 核心 | 管理会话生命周期，支持 checkpoint 持久化与恢复 | session-routes、runtime-manager、persistence、workspace-checkpoint-saver |
| **工作空间** | 支撑 | 按 session 存储图片、音频等产物，提供路径安全与配额管理 | fs、workspace-service |
| **推理服务** | 支撑 | 通过端口与适配器统一 LLM 与多模态（VL/TTS/T2I），防腐层隔离外部 API | ai/ |
| **人机交互（HITL）** | 支撑 | 关键操作人工确认，支持编辑与拒绝 | hitl-service |
| **用户配置** | 通用 | 管理 API Key、provider、model、存储路径等 | app-config、config |
| **可观测性** | 通用 | 日志、审计、LangSmith 链路追踪 | log-manager、langsmith |

### 1.3 限界上下文

| 限界上下文 | 职责 | 核心概念 |
|------------|------|----------|
| **绘本创作上下文（PictureBookContext）** | 工作流编排、Agent 实例化、工具与 SubAgent 调度 | 创作任务、工作流步骤、Agent、Tool |
| **会话上下文（SessionContext）** | 会话 CRUD、Runtime 管理、Checkpoint 恢复 | Session、Runtime、Checkpoint |
| **工作空间上下文（WorkspaceContext）** | 产物存储、目录结构、路径校验、配额 | Workspace、Artifact、SessionDirectory |
| **推理上下文（InferenceContext）** | LLM 与多模态调用、端口与适配器 | 推理端口、适配器、AIConfig |
| **人机交互上下文（HITLContext）** | 操作确认、用户编辑合并 | HITLRequest、Approval、MergedPayload |
| **配置上下文（ConfigurationContext）** | 用户与应用配置持久化 | AppConfig、AgentConfig、ApiKeys |
| **可观测性上下文（ObservabilityContext）** | 日志、审计、追踪 | LogEntry、AuditEvent、TraceRun |

### 1.4 上下文映射

```
┌─────────────────────┐     ACL      ┌─────────────────────┐
│  PictureBookContext │◄─────────────│  InferenceContext   │  绘本创作通过防腐层调用推理
│  (绘本创作)         │              │  (推理)              │
└─────────┬───────────┘              └─────────────────────┘
          │
          │ 客户-供应商
          ▼
┌─────────────────────┐     ACL      ┌─────────────────────┐
│  SessionContext     │◄─────────────│  WorkspaceContext   │  会话通过防腐层访问工作空间
│  (会话)             │              │  (工作空间)          │
└─────────┬───────────┘              └─────────────────────┘
          │
          │ 客户-供应商
          ▼
┌─────────────────────┐     ACL      ┌─────────────────────┐
│  HITLContext        │◄─────────────│  (Electron 前端)    │  HITL 通过 IPC 与前端交互
│  (人机交互)          │              │                     │
└─────────────────────┘              └─────────────────────┘

┌─────────────────────┐
│  ConfigurationContext│  各上下文通过接口获取配置，不直接依赖存储实现
│  (配置)              │
└─────────────────────┘

┌─────────────────────┐
│  ObservabilityContext│  各上下文发布事件/调用接口，由基础设施实现日志与追踪
│  (可观测性)          │
└─────────────────────┘
```

---

## 二、战术设计：领域模型与分层

### 2.1 绘本创作上下文

| 战术元素 | 说明 | 迁移来源 |
|----------|------|----------|
| **聚合根** | `创作会话（CreationSession）`：关联 sessionId、工作流步骤、当前状态 | Agent 执行流程 |
| **实体** | `Agent`：name、type（main/sub）、关联 tools、systemPrompt | agent、sub_agents |
| **值对象** | `提示词（Prompt）`、`图片描述（ImageDescription）`、`台词行（ScriptLine）` | mcp 输入输出 |
| **领域服务** | `工作流编排服务`：按配置驱动步骤执行、委派 SubAgent、调用 Tool | AgentFactory 流程逻辑 |
| **工厂** | `AgentFactory`：根据案例配置创建 Agent、SubAgent、Tool 实例 | 现有 AgentFactory |
| **仓储接口** | `创作任务仓储`（可选，若需持久化任务状态） | — |

### 2.2 会话上下文

| 战术元素 | 说明 | 迁移来源 |
|----------|------|----------|
| **聚合根** | `会话（Session）`：sessionId、meta、关联 Runtime | session-routes、SessionMeta |
| **值对象** | `SessionMeta`：title、prompt、createdAt、updatedAt | meta/session.json |
| **领域服务** | `会话恢复服务`：加载 checkpoint、恢复 Agent 状态 | runtime-manager、persistence |
| **仓储接口** | `SessionRepository`：按 sessionId 查询、保存、删除 | fs + meta/session.json |
| **仓储接口** | `CheckpointRepository`：保存/加载 LangGraph checkpoint | WorkspaceCheckpointSaver |

### 2.3 工作空间上下文

| 战术元素 | 说明 | 迁移来源 |
|----------|------|----------|
| **聚合根** | `工作空间（Workspace）`：根路径、按 sessionId 划分子目录 | WorkspaceFilesystem |
| **值对象** | `ArtifactPath`：相对路径、类型（image/audio/script） | images/、audio/、lines/ |
| **领域服务** | `产物存储服务`：校验路径、写入、读取、删除 | fs、workspace-service |
| **仓储接口** | `ArtifactRepository`：按 sessionId + 相对路径操作文件 | WorkspaceFilesystem |

### 2.4 推理上下文

| 战术元素 | 说明 | 迁移来源 |
|----------|------|----------|
| **值对象** | `AIConfig`：provider、apiKey、model、endpoint 等 | ai/types、ai/config |
| **领域服务** | `推理服务`：根据能力（llm/vl/tts/t2i）获取配置并调用 | ai/llm、ai/vl、ai/tts、ai/t2i |
| **防腐层/适配器** | `推理适配器`：实现推理端口，将领域请求转换为各 provider 的 API 调用，隔离外部模型 | ai/dashscope、ai/zhipu |

#### 2.4.1 多模态推理调用模式

多模态 AI 能力（TTS、T2I、VL）的调用存在两类正交维度，需抽象为**端口**（Port），由各 provider 的**适配器**（Adapter）实现：

| 维度 | 类型 | 说明 | 当前示例 |
|------|------|------|----------|
| **调用行为** | **同步** | 一次请求，直接返回结果 | TTS 智谱（POST 直接返回 PCM）、VL（chat/completions 直接返回文本） |
| | **异步** | 先提交任务，轮询后从 URL 取结果 | TTS 通义（多模态接口返回 audio URL）、T2I 通义/智谱（submit → poll → 取图 URL） |
| **调用规模** | **单次** | 一次调用处理一个输入 | T2I（单张图）、VL（单图生成剧本） |
| | **批量** | 一次业务调用包含多条子请求 | TTS（多条台词串行/并行合成） |

#### 2.4.2 推理端口与适配器（端口与适配器模式）

采用**端口与适配器**（Ports and Adapters）与**防腐层**（ACL）模式，通过**依赖倒置**使应用层依赖抽象端口，外部 provider 通过适配器接入：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  应用层 / 领域服务（调用方，依赖端口）                                          │
│  synthesizeSpeech / generateImage / generateScriptFromImage                   │
│  - 统一参数封装（PromptInput/TextsInput）：直接内容 或 从文件加载               │
│  - 按 session、workspace 组织输入输出                                          │
│  - 批量时负责拆分、合并、line_numbers、产物路径                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │ 依赖倒置
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  端口（Ports，领域层定义）                                                      │
│  - SyncInferencePort<TInput, TOutput>  单次同步                                │
│  - AsyncInferencePort<TInput, TTaskId, TOutput>  submit + poll 异步             │
│  - BatchInferencePort<TInput, TOutput>  批量（内部可串行/并行调用单次）           │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │ 实现
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  适配器（Adapters，防腐层，基础设施层实现）                                      │
│  TTS: TtsDashScopeAdapter(Async) / TtsZhipuAdapter(Sync)                      │
│  T2I: T2iDashScopeAdapter(Async) / T2iZhipuAdapter(Async)                      │
│  VL:  VlDashScopeAdapter(Sync) / VlZhipuAdapter(Sync)                          │
│  - 将外部 API 请求/响应转换为领域模型，隔离 provider 差异                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **端口**：定义 `execute(input)` 或 `submit(input)` + `poll(taskId)` 的契约；适配器基类（`SyncInferenceBase` 等）封装重试、超时、速率限制等通用逻辑。
- **适配器（防腐层）**：按具体 provider API 实现请求体构造、响应解析、URL/二进制提取，将外部模型转换为领域可用的输入输出。
- **应用层**：依赖 `MultimodalPort` 等端口，按业务语义封装（如 TTS 从 scriptFile 读台词、写 audio、维护 line_numbers），不依赖具体 provider。

**三层结构**（Agent → Tools → Inference）：

| 层 | 模块 | 职责 |
|----|------|------|
| **Agent** | AgentFactory、createDeepAgent | 工具创建、HITL、SubAgent、工作流编排 |
| **Tools** | `backend/tools/` | 业务语义封装：session、workspace、参数解析、line_numbers、批量处理；调用 MultimodalPort（防腐层） |
| **Inference** | MultimodalPort、ai/* 实现 | 防腐层：端口定义 + 适配器实现，隔离外部 provider API |

#### 2.4.3 能力与模式对照

| 能力 | 调用模式 | 批量/单次 | 当前实现 |
|------|----------|-----------|----------|
| **TTS** | DashScope：异步（任务 → URL → 下载）；Zhipu：同步（一次请求返回 PCM） | 批量 | `doOneTtsDashScope` / `doOneTtsZhipu`，上层 `synthesizeSpeechSequential` 循环 |
| **T2I** | 通义、智谱均为异步（submit → poll → 取图 URL） | 单次 | `submitTask*` + `pollForImageUrl*` |
| **VL** | 通义、智谱均为同步（chat/completions 一次返回） | 单次 | `callVLDashScope` / `callVLZhipu` |

#### 2.4.4 Tools 参数封装（统一内容输入）

Tools 调用需通用化：对「直接传入」与「从文件加载」两类输入，封装为**统一参数**，由解析逻辑选择使用方式，避免各 Tool 重复实现分支逻辑。

| 模式 | 说明 | 示例 |
|------|------|------|
| **直接内容** | 参数为字符串，直接使用 | `prompt: "一只猫"` |
| **从文件加载** | 参数指向 session 内文件路径，加载后使用 | `prompt: { fromFile: "lines/prompt.txt" }` |

**统一类型**（值对象）：

```typescript
/** 可解析为字符串的输入：直接使用 或 从 session 内文件加载 */
type PromptInput = string | { fromFile: string };
```

**解析职责**：提供 `resolvePromptInput(input, sessionId, workspaceFs): Promise<string>`，封装「直接使用 vs 加载文件」的分支逻辑，供各 Tool 复用。

**适用场景**：

| Tool | 当前参数 | 统一后 |
|------|----------|--------|
| `generateImage` | `prompt` / `promptFile` 二选一 | `prompt: PromptInput`，解析后传入推理 |
| `synthesizeSpeech` | `texts` / `scriptFile` 二选一 | `content: TextsInput`（`string[]` \| `{ fromFile: string }`），解析后传入推理 |

**迁移步骤**：在 `domain/inference/value-objects` 中定义 `PromptInput`、`TextsInput`；在 `ai/utils` 或领域服务中实现 `resolvePromptInput`、`resolveTextsInput`；各 Tool 入口统一使用该参数与解析逻辑。

### 2.5 人机交互上下文（HITL）

| 战术元素 | 说明 | 迁移来源 |
|----------|------|----------|
| **实体** | `HITLRequest`：requestId、actionType、payload、status | hitl-service |
| **值对象** | `HITLResponse`：approved、reason、payload（用户编辑） | — |
| **领域服务** | `确认服务`：发起请求、等待响应、合并 payload | HITLService |

### 2.6 配置上下文

| 战术元素 | 说明 | 迁移来源 |
|----------|------|----------|
| **值对象** | `AppConfig`：apiKeys、agent、storage、ui | app-config |
| **值对象** | `AgentConfig`：主 Agent、MCP、SubAgent、workflow | ConfigLoader、main_agent_config |
| **仓储接口** | `ConfigRepository`：读取/写入用户配置 | electron-store |

### 2.7 可观测性上下文

| 战术元素 | 说明 | 迁移来源 |
|----------|------|----------|
| **领域事件** | `SessionCreated`、`AgentInvoked`、`HITLRequested` 等 | log-manager、audit |
| **领域服务** | `日志服务`：记录 audit、hitl、system、llm | LogManager |
| **防腐层** | `LangSmith 适配器`：将调用转为 trace 上报 | langsmith、langsmith-trace |

---

## 三、DDD 分层与目录规划

### 3.1 目标目录结构

```
backend/
├── domain/                          # 领域层
│   ├── picture-book/                # 绘本创作上下文
│   │   ├── entities/
│   │   ├── value-objects/
│   │   ├── services/
│   │   ├── factories/
│   │   └── repositories/            # 接口定义
│   ├── session/                     # 会话上下文
│   │   ├── entities/
│   │   ├── value-objects/
│   │   ├── services/
│   │   └── repositories/
│   ├── workspace/                   # 工作空间上下文
│   │   ├── value-objects/
│   │   ├── services/
│   │   └── repositories/
│   ├── inference/                   # 推理上下文（防腐层接口在此定义）
│   │   ├── value-objects/
│   │   ├── services/
│   │   └── ports/                   # 推理能力端口（Sync/Async/Batch 接口 + LLM/Multimodal）
│   ├── hitl/                        # 人机交互上下文
│   │   ├── entities/
│   │   ├── value-objects/
│   │   ├── services/
│   │   └── ports/                   # 前端确认端口
│   ├── configuration/              # 配置上下文
│   │   ├── value-objects/
│   │   └── repositories/
│   └── observability/               # 可观测性上下文
│       ├── events/
│       └── services/
│
├── application/                     # 应用层
│   ├── picture-book/                # 绘本创作用例
│   │   ├── create-picture-book.use-case.ts
│   │   ├── invoke-agent.use-case.ts
│   │   └── stream-agent.use-case.ts
│   ├── session/                     # 会话用例
│   │   ├── create-session.use-case.ts
│   │   ├── list-sessions.use-case.ts
│   │   ├── load-session.use-case.ts
│   │   └── delete-session.use-case.ts
│   └── bootstrap/                   # 应用启动
│       └── initialize-services.use-case.ts
│
├── interfaces/                      # 接口层
│   ├── http/                        # REST API（Express 路由）
│   │   ├── session-routes.ts
│   │   └── fs-routes.ts
│   ├── ipc/                         # Electron IPC 处理器（在 electron/ipc 中，此处可放适配器）
│   └── dto/                         # 请求/响应 DTO
│
└── infrastructure/                  # 基础设施层
    ├── persistence/                 # 仓储实现
    │   ├── session/
    │   │   ├── session-fs-repository.ts
    │   │   └── checkpoint-workspace-repository.ts
    │   ├── workspace/
    │   │   └── artifact-fs-repository.ts
    │   └── configuration/
    │       └── config-electron-store-repository.ts
    ├── inference/                   # 推理适配器（防腐层）实现
    │   ├── bases/                   # 适配器基类（封装重试、超时等通用逻辑）
    │   │   ├── sync-inference-base.ts
    │   │   ├── async-inference-base.ts
    │   │   └── batch-inference-base.ts
    │   ├── llm-dashscope-adapter.ts
    │   ├── llm-zhipu-adapter.ts
    │   ├── tts-dashscope-adapter.ts  # Async
    │   ├── tts-zhipu-adapter.ts      # Sync
    │   ├── t2i-dashscope-adapter.ts  # Async
    │   ├── t2i-zhipu-adapter.ts      # Async
    │   ├── vl-dashscope-adapter.ts   # Sync
    │   └── vl-zhipu-adapter.ts       # Sync
    ├── hitl/
    │   └── hitl-electron-ipc-adapter.ts
    ├── observability/
    │   ├── log-manager-impl.ts
    │   └── langsmith-trace-adapter.ts
    └── config/                      # 配置文件（YAML、JSON）
        ├── main_agent_config.yaml
        ├── ai_models.json
        └── mcp/
```

### 3.2 分层职责对照

| 层 | 职责 | 不包含 |
|----|------|--------|
| **领域层** | 业务规则、实体、值对象、领域服务、仓储接口、工厂 | 框架依赖、HTTP/IPC、具体存储实现 |
| **应用层** | 用例编排、调用领域服务与仓储、事务边界 | 业务规则判断、技术细节 |
| **接口层** | 接收请求、DTO 转换、调用应用层、返回响应 | 业务逻辑、持久化 |
| **基础设施层** | 仓储实现、外部 API 适配、日志实现、配置加载 | 业务规则 |

---

## 四、依赖倒置与端口设计

### 4.1 推理能力端口（依赖倒置）

当前 `ai/config`、`ai/llm`、`ai/vl`、`ai/tts`、`ai/t2i` 直接依赖具体 provider。规划通过**依赖倒置**：领域层定义端口，应用层依赖端口，由基础设施层提供适配器实现并注入：

```typescript
// domain/inference/ports/llm-port.ts
export interface LLMPort {
  createChatModel(config: LLMAIConfig, callbacks?: Callback[]): BaseChatModel;
}

// domain/inference/ports/multimodal-port.ts
// 业务端口：应用层（Tools）依赖此端口
export interface MultimodalPort {
  generateImage(params: GenerateImageParams): Promise<GenerateImageResult>;
  synthesizeSpeech(params: SynthesizeSpeechParams): Promise<SynthesizeSpeechResult>;
  generateScriptFromImage(params: GenerateScriptParams): Promise<GenerateScriptResult>;
}

// domain/inference/ports/inference-base.ts
// 推理端口（供适配器实现）
export interface SyncInferencePort<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
}
export interface AsyncInferencePort<TInput, TTaskId, TOutput> {
  submit(input: TInput): Promise<TTaskId>;
  poll(taskId: TTaskId): Promise<TOutput>;
}
export interface BatchInferencePort<TInput, TOutput> {
  executeBatch(inputs: TInput[]): Promise<TOutput[]>;
}
```

- **应用层（Tools）** 依赖 `MultimodalPort` 端口；
- **MultimodalPort 实现** 内部按 provider 选择 `SyncInferencePort` / `AsyncInferencePort` / `BatchInferencePort` 的适配器；
- 各 provider **适配器**实现对应端口，由基础设施层提供 dashscope/zhipu 的防腐层实现。

### 4.2 HITL 确认端口

```typescript
// domain/hitl/ports/approval-port.ts
export interface ApprovalPort {
  requestApproval(actionType: string, payload: Record<string, unknown>): Promise<Record<string, unknown> | null>;
}
```

`HitlElectronIpcAdapter` 实现该端口，通过 Electron IPC 与前端通信。

### 4.3 可观测性端口

```typescript
// domain/observability/ports/log-port.ts
export interface LogPort {
  logAudit(sessionId: string, entry: unknown): Promise<void>;
  logHITL(sessionId: string, request: unknown): Promise<void>;
  logSystem(level: string, message: string, meta?: unknown): Promise<void>;
}

// domain/observability/ports/trace-port.ts
export interface TracePort {
  traceAiRun<T>(name: string, runType: string, inputs: unknown, fn: () => Promise<T>, sanitizeOutput: (r: T) => unknown): Promise<T>;
}
```

---

## 五、迁移步骤与优先级

### 阶段一：战略对齐（不改变代码结构）

1. 在文档中固化限界上下文与上下文映射。
2. 为各上下文补充领域词汇表（Ubiquitous Language）。
3. 识别现有代码与上下文的对应关系，建立迁移映射表。

### 阶段二：基础设施层抽离

1. 定义 `SessionRepository`、`ArtifactRepository`、`CheckpointRepository`、`ConfigRepository` 接口于领域层。
2. 将 `WorkspaceFilesystem`、`WorkspaceCheckpointSaver`、`app-config` 等实现迁移至 `infrastructure/persistence`。
3. 应用层通过依赖注入使用仓储接口，逐步替换直接调用。

### 阶段三：推理层端口与适配器

1. 在领域层定义 `LLMPort`、`MultimodalPort` 及推理端口（`SyncInferencePort`、`AsyncInferencePort`、`BatchInferencePort`）。
2. 在 `infrastructure/inference/bases` 中实现适配器基类（`SyncInferenceBase`、`AsyncInferenceBase`、`BatchInferenceBase`），封装重试、超时、速率限制等通用逻辑。
3. 将 `ai/llm`、`ai/vl`、`ai/tts`、`ai/t2i` 各 provider 实现迁移为**防腐层适配器**（如 `TtsZhipuAdapter extends SyncInferenceBase`、`T2iDashScopeAdapter extends AsyncInferenceBase`）。
4. 应用层依赖 `MultimodalPort` 端口，由启动时注入适配器实现；应用层内部按批量/单次调用端口。
5. **Tools 参数封装**：定义 `PromptInput`、`TextsInput` 值对象及 `resolvePromptInput`、`resolveTextsInput` 解析逻辑；`generateImage`、`synthesizeSpeech` 等 Tool 统一使用该参数，由解析逻辑选择「直接使用」或「从文件加载」。

### 阶段四：应用层用例封装

1. 抽取 `CreateSessionUseCase`、`InvokeAgentUseCase`、`StreamAgentUseCase` 等。
2. 将 `session-routes`、`agent` IPC 改为调用用例，而非直接操作服务。
3. 用例内协调领域服务与仓储，保持接口层薄。

### 阶段五：领域层建模

1. 在 `domain/session` 中引入 `Session` 聚合根、`SessionMeta` 值对象。
2. 在 `domain/workspace` 中引入 `ArtifactPath` 等值对象。
3. 在 `domain/picture-book` 中提炼 `工作流编排服务`，将 AgentFactory 中的流程逻辑迁移至领域服务。
4. 按需引入领域事件（如 `SessionCreated`），由可观测性层订阅。

### 阶段六：接口层瘦身

1. REST 路由仅做参数校验、DTO 转换、调用用例。
2. IPC 处理器委托给应用层用例，避免业务逻辑渗入。

---

## 六、迁移注意事项

1. **增量迁移**：按上下文、按用例逐步迁移，保证每个阶段系统可运行。
2. **防腐层**：与外部系统（DashScope、智谱、Electron 前端）的交互一律经防腐层，避免外部模型侵入领域。
3. **配置与代码分离**：`main_agent_config.yaml`、`ai_models.json` 等保持为配置资产，由仓储或适配器读取，领域层不依赖文件路径。
4. **LangChain/DeepAgents 定位**：作为基础设施的技术选型，通过端口封装，领域层不直接依赖 `createDeepAgent`、`ChatOpenAI` 等具体类。
5. **多模态推理端口与适配器**：新增 provider 时，只需实现对应端口、继承适配器基类复用重试、超时逻辑；应用层依赖端口，保持稳定。
6. **测试策略**：仅保留三层集成测试（Inference、Tools、Agent），不编写单元测试。详见《[集成测试迁移规划](./集成测试迁移规划.md)》。

---

## 七、与现有架构的对应关系

| 现有路径 | DDD 目标归属 |
|----------|--------------|
| `backend/agent/AgentFactory.ts` | 领域层 `picture-book/factories` + 应用层用例 |
| `backend/agent/session-routes.ts` | 接口层 `http/session-routes` + 应用层 `session` 用例 |
| `backend/agent/fs-routes.ts` | 接口层 `http/fs-routes` + 应用层 |
| `backend/ai/*` | 领域层 `inference` 端口 + 基础设施层 `inference` 适配器（防腐层） |
| `backend/mcp/*` | 领域层 `picture-book` 工具逻辑 + 基础设施层（调用推理端口） |
| `backend/services/fs.ts` | 基础设施层 `persistence/workspace` |
| `backend/services/runtime-manager.ts` | 应用层/领域层 `session` 服务 |
| `backend/services/hitl-service.ts` | 领域层 `hitl` 服务 + 基础设施层 `hitl` 适配器 |
| `backend/services/log-manager.ts` | 基础设施层 `observability` |
| `backend/app-config.ts` | 基础设施层 `configuration` 仓储 |
