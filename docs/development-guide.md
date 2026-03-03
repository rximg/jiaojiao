# 开发指南

> 环境准备、构建命令、测试命令参考。

---

## 环境准备

```bash
# 1. 安装依赖
npm install

# 2. 配置 API Key（任选其一）
#    方式 A：通过应用内设置面板（推荐）
#    方式 B：项目根目录创建 .env
DASHSCOPE_API_KEY=sk-xxx
ZHIPU_API_KEY=xxx.xxx

# 3. 安装 FFmpeg（Zhipu TTS PCM 转 MP3 需要）
#    Windows: 将 ffmpeg.exe 放入 PATH
```

---

## 开发与构建命令

| 命令 | 说明 |
|---|---|
| `npm run electron:dev` | 启动开发服务器（热重载） |
| `npm run electron:build` | 构建生产安装包（输出到 `release/`） |
| `npm run lint` | ESLint 检查 |
| `npm run format` | Prettier 格式化 |
| `tsc --noEmit` | TypeScript 类型检查（不输出文件） |

---

## 测试命令

```bash
# 单元测试（watch 模式）
npm test

# 单次运行全部测试
npm run test:run

# 集成测试 — AI 推理（需要真实 API Key）
npm run test:inference                     # 当前配置的服务商
npm run test:inference:zhipu               # 仅智谱
npm run test:inference:dashscope           # 仅 DashScope

# 集成测试 — 工具层
npm run test:tools

# 完整智能体工作流测试
npm run test:agent
```

> **注意**：集成测试会真实调用 AI API 并产生费用，运行前确认 API Key 有余额。
> 超时设置为 120 秒（`vitest.config.ts`），AI 调用耗时较长属正常。

---

## 数据存储位置（勿误删）

| 路径 | 内容 |
|---|---|
| `{userData}/config.json`（Windows: `%APPDATA%\jiaojiao\config.json`） | 用户配置（API Key、偏好设置） |
| `./outputs/workspaces/{sessionId}/` | 每次会话的产物（图片、音频） |
| `./outputs/workspaces/{sessionId}/meta/session.json` | 会话消息、Todo 状态 |
| `./outputs/workspaces/{sessionId}/llm_logs/` | LLM 交互日志 |
| `./outputs/workspaces/{sessionId}/checkpoints/` | 工作流断点快照 |

---

## PR / 提交约定

- 提交信息格式：`<type>(<scope>): <描述>`，例如 `feat(agent): add retry on tool failure`
- type：`feat` | `fix` | `refactor` | `test` | `docs` | `chore`
- 提交前运行：`npm run lint` + `tsc --noEmit` + `npm run test:run`
- 不要将 `.env`、API Key、`release/`、`outputs/` 提交到版本库
