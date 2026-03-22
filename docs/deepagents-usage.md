# Deepagents 使用说明

## 目的

本文档说明本仓库如何使用 `deepagents`，以及 `backend/config/skills/` 目录下 `SKILL.md` 必须遵守的 frontmatter schema。

## 当前版本

- 项目依赖：`deepagents@^1.8.4`

## 在本项目中的使用位置

### 主接入点

- `backend/agent/AgentFactory.ts`

主 Agent 通过 `createDeepAgent(...)` 创建，并在启用 skill 中间件时，将当前 skill 目录作为 `skills` 参数传入：

```ts
const agent = createDeepAgent({
  model: llm,
  tools,
  systemPrompt: mainSystemPrompt,
  subagents: subAgents,
  ...(checkpointer ? { checkpointer } : {}),
  ...(skillSources ? { skills: skillSources } : {}),
});
```

### Skill Prompt 的加载方式

- `backend/agent/ConfigLoader.ts`

项目运行时会读取 `SKILL.md`，去掉 frontmatter，只把正文作为 system prompt 输入给 Agent。也就是说：

1. frontmatter 主要用于 deepagents 的 skill 元数据
2. 正文才是实际的技能提示词内容

## 本项目采用的 deepagents Skill Schema

### 必填字段

- `name`
- `description`

### 可选字段

- `license`
- `compatibility`
- `metadata`
- `allowed-tools`

### 不使用的字段

以下字段不属于本项目采用的 deepagents skill frontmatter 约定：

- `version`
- `allowedTools`
- VS Code / Copilot skill 专用字段，例如：
  - `argument-hint`
  - `disable-model-invocation`
  - `user-invocable`

## 名称规则

根据当前 `deepagents@1.8.4` 的校验逻辑，skill frontmatter 的 `name` 应满足：

1. 只使用小写字母、数字和连字符
2. 不能以连字符开头或结尾
3. 不能出现连续连字符
4. 应与 `SKILL.md` 所在目录名一致

因此，本项目在 `backend/config/skills/` 下统一使用连字符目录名，例如：

- `story-book`
- `behavior-correction`
- `encyclopedia`

## `allowed-tools` 约定

`deepagents@1.8.4` 解析器支持两种写法：

1. YAML 列表
2. 空格分隔字符串

本项目统一使用 YAML 列表，便于阅读和维护。

示例：

```md
---
name: story-book
description: 绘本故事生成系统
allowed-tools:
  - write_file
  - edit_file
  - write_todos
  - generate_image
  - split_grid_image
  - edit_image
  - generate_audio
  - batch_tool_call
  - finalize_workflow
---
```

## 最小合法示例

```md
---
name: encyclopedia
description: 有声绘本制作系统 - 百科类绘本
---

# 绘本百科助手
...
```

## 维护规则

修改或新增 `backend/config/skills/*/SKILL.md` 时，必须遵守：

1. frontmatter 只使用本文档列出的 deepagents schema
2. `name` 与目录名保持一致
3. tool 白名单使用 `allowed-tools`
4. 不再引入 `version` 或 `allowedTools`