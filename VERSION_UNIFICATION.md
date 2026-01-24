# LangChain 版本统一

## 问题

多个 `@langchain/core` 版本并存导致的 `AIMessage` 类型冲突：
- 主项目：`@langchain/core@^0.3.0`
- deepagents 内部：`@langchain/core@^1.1.0`

这导致 `instanceof` 检查失败，进而导致中间件无法识别消息类型。

## 解决方案

### 1. **统一依赖版本** (package.json)
```json
{
  "dependencies": {
    "@langchain/core": "^1.1.0",
    "@langchain/langgraph": "^1.1.0",
    "@langchain/openai": "^1.1.0",
    "langchain": "^1.2.0"
  },
  "overrides": {
    "@langchain/core": "^1.1.0",
    "langchain": "^1.2.0",
    "@langchain/openai": "^1.1.0",
    "@langchain/langgraph": "^1.1.0"
  }
}
```

### 2. **简化模型包装** (backend/agent/factory.ts)
- ❌ 删除了复杂的 `wrapModel()` 函数和版本转换逻辑
- ✅ 直接使用原生 ChatOpenAI，因为版本已统一

### 3. **修复 electron-store 兼容性** (backend/agent/config.ts)
- 添加了 try-catch 处理 Node.js 环境
- 在测试环境中使用 mock store，在 Electron 环境中使用真实 store

### 4. **处理 deepagents 类型递归问题** (electron/ipc/agent.ts)
- 使用 `@ts-ignore` 注释跳过类型检查
- 使用 `as any` 强制类型转换

## 验证

✅ 所有 6 个测试通过（3 单元 + 3 集成）
✅ TypeScript 编译无错误
✅ T2I 和 TTS 实际 API 调用成功

## 关键优势

1. **版本一致**：只有一个 `@langchain/core` 副本在 node_modules 中
2. **代码简洁**：移除了 100+ 行的版本转换逻辑
3. **更好的维护性**：直接使用官方库，无自定义包装
4. **兼容性**：deepagents、LangChain、ChatOpenAI 都使用相同版本
