# AGENTS.md

> 给 AI 编码智能体的项目指南 — 有声绘本智能体（jiaojiao）

---

## 项目概述

**有声绘本智能体**（内部代号 `jiaojiao`，v0.0.7）是一款基于 Electron 的桌面应用，通过多 AI 能力协同（LLM / T2I / TTS / VL）自动生成有声绘本。

- **桌面框架**：Electron 32 + Vite 5
- **前端**：React 18 + TypeScript 5.5 + Tailwind CSS + Radix UI
- **智能体框架**：deepagents 1.3 + LangChain 1.2 + LangGraph 1.1
- **AI 服务商**：DashScope（通义千问 / wan2.6-t2i / qwen-tts）、Zhipu（GLM-4 / glm-tts）
- **持久化**：electron-store（用户配置）+ 文件系统（会话产物）
- **测试**：Vitest 1.6（单元 + 集成）

---

## 目录结构要点

```
electron/           # Electron 主进程
  main.ts           # 应用入口
  preload.cjs       # contextBridge 安全桥接
  ipc/              # IPC 处理模块（agent / config / session / fs / hitl / storage / sync）
src/                # React 渲染进程
  app/components/   # 业务组件（ChatInterface、ArtifactViewer 等）
  components/ui/    # ShadCN 通用组件
  providers/        # React Context（ChatProvider、ConfigProvider）
backend/            # 后端服务
  agent/            # AgentFactory + ConfigLoader
  application/      # 用例（纯函数 + 依赖注入）
  domain/           # 领域模型 & 接口（零外部依赖）
  infrastructure/   # AI 推理适配器、仓储实现
  services/         # 运行时服务（RuntimeManager 等）
  tools/            # 内置 Agent 工具（generate-image、edit-image、synthesize-speech 等）
  config/           # YAML 智能体配置（agent_cases/、sub_agents/、tools/、ai_models.json）
outputs/workspaces/ # 每次会话生成的产物（图片、音频、日志）
```

---

## 文档索引

| 文档 | 内容 |
|---|---|
| [docs/development-guide.md](docs/development-guide.md) | 环境准备、安装、构建、测试命令、提交约定 |
| [docs/architecture/backend.md](docs/architecture/backend.md) | 后端完整架构（DDD 分层、推理层、工具、HITL、配置体系） |
| [docs/architecture/frontend.md](docs/architecture/frontend.md) | 前端组件结构、状态管理、IPC 调用方式 |
| [docs/architecture/ipc.md](docs/architecture/ipc.md) | IPC 通道完整列表与协议说明 |
| [docs/architecture/ddd-constraints.md](docs/architecture/ddd-constraints.md) | DDD 约束细则（分层规则、禁止行为、新功能清单） |
| [docs/third-party-api/dashscope-api.md](docs/third-party-api/dashscope-api.md) | DashScope API 参考（LLM / T2I / TTS / VL） |
| [docs/third-party-api/zhipu-api.md](docs/third-party-api/zhipu-api.md) | 智谱 API 参考（GLM / TTS / VL） |
| [docs/third-party-api/百炼万象2.6的图片编辑api.md](docs/third-party-api/百炼万象2.6的图片编辑api.md) | 百炼万象 2.6 图片编辑 API |

---

## 核心架构约束：后端 DDD 分层

> 完整约束见 [`docs/architecture/ddd-constraints.md`](docs/architecture/ddd-constraints.md)

### 依赖方向（不可违反）

```
domain ← application ← infrastructure ← services ← electron/ipc
```

- **`backend/domain/`**：纯 TypeScript 接口/类型，**零外部依赖**；`Session` 是唯一聚合根，`SessionMeta` 是值对象；仓储接口（`SessionRepository`、`ArtifactRepository`、`ConfigRepository`）和推理端口（`MultimodalPort`、`SyncInferencePort`、`AsyncInferencePort`）定义于此
- **`backend/application/`**：用例为**纯函数 + 显式依赖注入**（`deps` 参数），禁止在用例内 `new` 任何 infrastructure 实现类，禁止在用例内调用 `ipcMain`
- **`backend/infrastructure/`**：仓储实现类放 `persistence/`，AI 适配器放 `inference/adapters/`；所有单例通过 `repositories.ts` 工厂获取，禁止直接 `new`
- **`backend/services/`**：运行时服务（`RuntimeManager` 等），可依赖 infrastructure，不 import `electron/`

### AI 推理约束

- Tools（智能体工具）**只能依赖 `MultimodalPort` 接口**，禁止直接调用 DashScope / Zhipu SDK
- 新 AI 能力：先在 `domain/inference/types.ts` 定义参数/结果类型 → 再在 `infrastructure/inference/` 实现适配器

### 禁止行为

| 禁止 | 原因 |
|---|---|
| `domain/` import `infrastructure/`、`electron/` | 破坏单向依赖 |
| 用例内 `new SessionFsRepository()` | 绕过依赖注入，无法 mock |
| 值对象添加 `id` 或可变状态 | 违反值对象语义 |
| Tools 直接调用 SDK | 必须经过 `MultimodalPort` |
| `application/` 内调用 `ipcMain`/`ipcRenderer` | 应用层不得感知 Electron |

---

## 代码风格约定

- **TypeScript strict 模式**，禁止 `any`（必要时用 `unknown` + 类型守卫）
- 使用 **ES 模块**（`"type": "module"`），`import` 路径包含扩展名 `.js`（编译后）
- 后端遵循 **DDD 分层**：`domain` → `application` → `infrastructure` → `services`
- 前端组件放 `src/app/components/`，通用 UI 放 `src/components/ui/`
- IPC 通道命名约定：`namespace:action`，如 `agent:sendMessage`、`session:create`
- `backend/config/` 下的 YAML 配置修改后无需重新构建，运行时动态加载

---

## 安全须知

- 渲染进程**不可直接访问 Node.js API**，所有后端交互必须通过 `contextBridge`
- 文件系统操作由 `WorkspaceFilesystem` 做路径边界校验，防止路径穿越
- API Key 存储于 `electron-store`（操作系统加密的用户目录），禁止硬编码到代码或配置文件
- `preload.cjs` 中禁止暴露 `require` 或 `process` 等 Node 全局对象


