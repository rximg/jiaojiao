# 智谱（Zhipu）API 接口文档

本文档描述本项目中使用的智谱开放平台接口：地址、方法、请求/响应格式及错误码。  
基址：`https://open.bigmodel.cn/api/paas/v4`，认证方式：`Authorization: Bearer <api_key>`。

---

## 1. LLM 对话（Chat Completions）

### 接口基本信息

| 项目 | 说明 |
|------|------|
| 地址 | `{baseURL}/chat/completions`，如 `https://open.bigmodel.cn/api/paas/v4/chat/completions` |
| 方法 | POST |
| 类型 | OpenAI 兼容的对话补全接口 |

### 请求参数

| 参数 | 必填 | 类型 | 含义 |
|------|------|------|------|
| model | 是 | string | 模型 ID，如 `glm-4.7`、`glm-4.5` |
| messages | 是 | array | 对话消息列表，每项含 `role`、`content` |
| temperature | 否 | number | 采样温度，默认 0.1 |
| max_tokens | 否 | number | 最大生成 token 数，默认 20000 |

### 请求示例

```bash
curl -X POST 'https://open.bigmodel.cn/api/paas/v4/chat/completions' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -d '{
    "model": "glm-4.7",
    "messages": [{"role": "user", "content": "你好"}],
    "temperature": 0.1,
    "max_tokens": 20000
  }'
```

### 响应格式

- **成功**：HTTP 200，JSON 体含 `choices[0].message.content`。
- **失败**：HTTP 4xx/5xx，JSON 如 `{"error": {"code": "1211", "message": "..."}}`。

### 响应关键字段

| 字段 | 说明 |
|------|------|
| choices[0].message.content | 助手回复文本 |
| usage | 本次请求的 token 消耗（若有） |

### 核心错误码

| code | 含义 |
|------|------|
| 1211 | 模型不存在，请检查模型代码 |
| 401 | 未授权，API Key 无效或过期 |
| 429 | 请求过于频繁，需限流重试 |

---

## 2. 文生图（T2I）异步

### 接口基本信息

| 项目 | 说明 |
|------|------|
| 提交地址 | `{baseURL}/async/images/generations` |
| 轮询地址 | `{baseURL}/async-result/{task_id}` |
| 方法 | 提交 POST，轮询 GET |
| 类型 | 异步任务：先提交得 task id，再轮询取结果 |

### 请求参数（提交）

| 参数 | 必填 | 类型 | 含义 |
|------|------|------|------|
| model | 是 | string | 如 `glm-image` |
| prompt | 是 | string | 文本描述 |
| size | 否 | string | 尺寸，如 `1280x1280`，默认 `1280x1280` |
| quality | 否 | string | 如 `hd`，默认 `hd` |
| watermark_enabled | 否 | boolean | 是否启用水印，默认 true |

### 请求示例（提交）

```bash
curl -X POST 'https://open.bigmodel.cn/api/paas/v4/async/images/generations' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -d '{
    "model": "glm-image",
    "prompt": "一只可爱的猫咪",
    "size": "1280x1280",
    "quality": "hd",
    "watermark_enabled": true
  }'
```

### 轮询请求

```bash
curl -X GET 'https://open.bigmodel.cn/api/paas/v4/async-result/{task_id}' \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

### 响应格式

- **提交成功**：HTTP 200，`{"id": "任务ID"}`。
- **轮询成功**：`task_status === "SUCCESS"` 时，图片 URL 在 `image_result[0].url`。
- **轮询失败**：`task_status === "FAIL"`，错误信息在 `error.message`。

### 响应关键字段（轮询）

| 字段 | 说明 |
|------|------|
| task_status | SUCCESS / FAIL / 处理中 |
| image_result[0].url | 成功时的图片公网 URL |
| error.message | 失败时的错误说明 |

### 核心错误码

| 情况 | 含义 |
|------|------|
| 提交非 2xx | 请求参数或鉴权错误，见响应 body |
| task_status=FAIL | 任务执行失败，见 error.message |
| 超时 | 轮询次数用尽仍未 SUCCESS |

---

## 3. 语音合成（TTS）

### 接口基本信息

| 项目 | 说明 |
|------|------|
| 地址 | `{baseURL}/audio/speech`，如 `https://open.bigmodel.cn/api/paas/v4/audio/speech` |
| 方法 | POST |
| 类型 | 同步，直接返回音频二进制流 |

### 请求参数

| 参数 | 必填 | 类型 | 含义 |
|------|------|------|------|
| model | 是 | string | 如 `glm-tts` |
| input | 是 | string | 待合成文本 |
| voice | 否 | string | 音色，如 `tongtong`，默认 `tongtong` |
| response_format | 否 | string | 仅支持 `wav` 或 `pcm`，本实现使用 `pcm` |

### 请求示例

```bash
curl -X POST 'https://open.bigmodel.cn/api/paas/v4/audio/speech' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -d '{
    "model": "glm-tts",
    "input": "你好，今天天气怎么样。",
    "voice": "tongtong",
    "response_format": "pcm"
  }'
```

- 响应体：二进制 PCM（16-bit 单声道，24000 Hz）。本项目中 PCM 经 ffmpeg 转为 MP3 再落盘。

### 响应格式

- **成功**：HTTP 200，Content-Type 为音频二进制，无 JSON。
- **失败**：HTTP 4xx，JSON 如 `{"error": {"code": "1214", "message": "..."}}`。

### 核心错误码

| code | 含义 |
|------|------|
| 1214 | 参数错误，如不支持的 response_format 值（仅支持 wav/pcm） |
| 401 | 未授权 |

---

## 4. 视觉理解（VL，多模态对话）

### 接口基本信息

| 项目 | 说明 |
|------|------|
| 地址 | `{baseURL}/chat/completions`（与 LLM 同 host，多模态入参） |
| 方法 | POST |
| 类型 | 多模态 Chat Completions，content 中含图片与文本 |

### 请求参数

| 参数 | 必填 | 类型 | 含义 |
|------|------|------|------|
| model | 是 | string | 如 `glm-4.6v` |
| messages | 是 | array | 一条 user 消息，content 为数组 |
| messages[].content[] | 是 | object | 项为 `{ type: "image_url", image_url: { url: dataUrl } }` 或 `{ type: "text", text: "..." }` |

- 本地图片需转为 Data URL：`data:image/png;base64,<base64>` 传入 `image_url.url`。

### 请求示例

```json
{
  "model": "glm-4.6v",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "image_url", "image_url": { "url": "data:image/png;base64,iVBORw0KGgo..." } },
        { "type": "text", "text": "描述这张图的内容" }
      ]
    }
  ]
}
```

```bash
curl -X POST 'https://open.bigmodel.cn/api/paas/v4/chat/completions' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -d '{"model":"glm-4.6v","messages":[{"role":"user","content":[{"type":"image_url","image_url":{"url":"data:image/png;base64,..."}},{"type":"text","text":"描述这张图"}]}]}'
```

### 响应格式

- **成功**：HTTP 200，与 LLM 一致，`choices[0].message.content` 为助手回复文本。
- **失败**：HTTP 4xx，JSON 中含 error 信息。

### 响应关键字段

| 字段 | 说明 |
|------|------|
| choices[0].message.content | 视觉理解后的文本回复 |

### 核心错误码

| code | 含义 |
|------|------|
| 1214 | 参数错误，如 messages[0].content[0].type 类型错误（需为 image_url + image_url.url） |
| 401 | 未授权 |

---

## 附录：本项目中使用的默认模型

| 能力 | 默认模型 |
|------|----------|
| LLM | glm-4.7 |
| T2I | glm-image |
| TTS | glm-tts |
| VL | glm-4.6v |
