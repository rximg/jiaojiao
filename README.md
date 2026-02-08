# 有声绘本智能体

基于 Electron + React + deepagentsjs 的有声绘本智能生成应用。

## 技术栈

- **前端**: Electron + React + TypeScript + ShadCN UI
- **后端**: deepagentsjs (基于 LangChain/LangGraph)
- **AI 模型**: 阿里百炼（通义千问）
- **服务**: T2I (文生图) + TTS (语音合成)

## 项目结构

```
app/
├── electron/              # Electron 主进程
│   ├── main.ts           # 主进程入口
│   ├── preload.ts        # 预加载脚本
│   └── ipc/              # IPC 处理
├── src/                   # React 前端
│   ├── app/              # 应用组件
│   │   └── components/   # 页面组件
│   ├── components/        # 共享组件
│   │   └── ui/           # ShadCN UI 组件
│   ├── providers/        # Context Providers
│   ├── types/            # TypeScript 类型
│   └── lib/              # 工具函数
├── backend/              # 后端 Agent
│   ├── agent/            # Agent 核心
│   ├── mcp/              # MCP 服务
│   └── utils/            # 工具函数
└── package.json
```

## 快速开始

### 1. 安装依赖

```bash
cd app
npm install
```

如果遇到依赖冲突，可以使用：

```bash
npm install --legacy-peer-deps
```

### 2. 配置环境变量

创建 `.env` 文件（可选，也可以通过应用内配置界面设置）：

```env
DASHSCOPE_API_KEY=你的阿里百炼API Key
DASHSCOPE_MODEL=qwen-plus
# 仅当你希望在测试中真实调用外部API时设为 true
RUN_INTEGRATION_TESTS=false

# 可选：为文生图/语音单独配置模型与端点（你的账户权限为准）
# 文生图（T2I）
DASHSCOPE_T2I_MODEL=wan2.6-i2v
DASHSCOPE_T2I_ENDPOINT=https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
# 语音合成（TTS）
DASHSCOPE_TTS_MODEL=sambert-zhichu-v1
DASHSCOPE_TTS_ENDPOINT=https://dashscope.aliyuncs.com/api/v1/services/audio/tts
```

### 3. 开发模式运行

```bash
npm run electron:dev
```

这将同时启动 Vite 开发服务器和 Electron 应用。

### 4. 构建应用

```bash
npm run electron:build
```

### 5. 运行测试（含集成测试开关）

默认测试会从 `.env` 加载环境变量；为避免误触发外部 API，已默认跳过集成测试。若要启用：

```bash
# 在 .env 中设置并填写：
# DASHSCOPE_API_KEY=你的Key
# RUN_INTEGRATION_TESTS=true

# 运行全部测试（将调用真实接口）
npm run test:run

# 仅本地快速检查（保持 RUN_INTEGRATION_TESTS=false 会跳过外部API测试）
npm run test:run
```

测试覆盖：
- LLM：调用 DashScope 兼容端点，校验返回内容非空（`tests/llm.test.ts`）
- T2I：调用阿里百炼文生图生成图片，校验文件落盘（`tests/t2i.test.ts`）
- TTS：调用阿里百炼语音合成生成音频，校验文件落盘（`tests/tts.test.ts`）

## 功能特性

### 欢迎界面
- 配置栏：快速访问配置
- 历史记录：查看历史对话
- 案例列表：选择可用案例（当前支持"百科绘本"）

### 聊天界面
- 欢迎词：进入聊天时显示欢迎消息
- 对话消息：支持流式显示 AI 回复
- 快捷选项：预设常用操作
- 工具调用：显示 Agent 工具调用状态
- Todos：显示任务进度（deepagentsjs 内置）

### 配置界面
- API Key 配置（阿里百炼、T2I、TTS）
- Agent 参数配置（模型、温度、最大 Token）
- 存储路径配置

## 使用说明

1. **首次使用**：打开应用后，会提示配置 API Key
2. **选择案例**：在欢迎界面点击"百科绘本"案例
3. **开始对话**：
   - 直接输入需求（如"3岁森林主题绘本"）
   - 或点击快捷选项快速开始
4. **查看结果**：Agent 会自动生成图片、台词和语音

## 技术说明

### deepagentsjs 集成

本项目使用 [deepagentsjs](https://github.com/langchain-ai/deepagentsjs) 作为后端 Agent 框架：

- **核心功能**：规划工具、文件系统、子代理
- **工具定义**：使用 `tool` 从 `langchain` 创建结构化工具
- **子代理**：使用 `SubAgent` 类型定义专门的子代理
- **流式响应**：支持 LangGraph 的流式 API

### Agent 工作流程

1. **生成提示词**：直接将用户输入委派给 `prompt_generator` 子代理（通过 task 的 description 传入用户回答）
2. **生成图片**：调用 `generate_image` 工具
3. **生成台词**：调用 `generate_script_from_image` MCP（VL：根据图片生成台词与坐标）
4. **生成语音**：调用 `synthesize_speech` 工具
5. **整合结果**：返回完整绘本

## 开发说明

### 添加新工具

在 `backend/agent/factory.ts` 中使用 `tool` 函数创建新工具：

```typescript
const myTool = tool(
  async (params: { ... }) => {
    // 工具逻辑
  },
  {
    name: 'my_tool',
    description: '工具描述',
    schema: z.object({ ... }),
  }
);
```

### 添加新子代理

在 `backend/agent/factory.ts` 中添加 `SubAgent`：

```typescript
const subAgent: SubAgent = {
  name: 'my_subagent',
  description: '子代理描述',
  systemPrompt: '系统提示词',
  tools: [...], // 可选
};
```

### 扩展 MCP 服务

在 `backend/mcp/` 目录下添加新的 MCP 服务。

## 注意事项

- 确保已获取阿里百炼 API Key
- 首次使用需要配置 API Key
- 生成的内容保存在 `outputs/` 目录下
- 配置信息保存在 `~/.有声绘本智能体/config.json`
- deepagentsjs 需要 Node.js 18+ 和兼容的 LangChain 版本

## 故障排除

### 依赖安装失败

如果遇到依赖冲突，使用：

```bash
npm install --legacy-peer-deps
```

### API 调用失败

- 检查 API Key 是否正确配置
- 检查网络连接
- 查看控制台错误信息

### Agent 无法启动

- 检查 deepagentsjs 是否正确安装
- 检查 LangChain 版本是否兼容
- 查看 Electron 主进程日志

## 参考资源

- [deepagentsjs 文档](https://docs.langchain.com/oss/javascript/deepagents/overview)
- [deepagentsjs GitHub](https://github.com/langchain-ai/deepagentsjs)
- [LangChain 文档](https://js.langchain.com/)

## 许可证

MIT
