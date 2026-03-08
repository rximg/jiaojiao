# jiaojiao-gateway 统一部署

> 仅保留一个 compose 文件：`deploy/docker-compose.yml`。

## 服务说明

| 服务 | 说明 | 端口 |
|---|---|---|
| `jiaojiao-gateway` | 多模态 API 网关（默认启动） | 9021 |
| `z-image-turbo` | 本地 GPU 图像编辑推理服务 | 8998（内网） |
| `gateway-test` | 集成测试运行器（--profile test） | — |

`z-image-turbo` 生成的图片 URL 默认通过网关公开路径返回：`http://localhost:9021/z-image-turbo/images/...`，避免客户端解析 Docker 内网主机名失败。

## 快速启动

```bash
# 1. 准备环境变量
cp .env.example .env
# 编辑 .env，填写 DASHSCOPE_API_KEY
# 可选：T2I_BACKEND=z-image-turbo（默认）或 dashscope
# 可选：Z_IMAGE_PUBLIC_URL=http://localhost:9021/z-image-turbo

# 2. 仅启动网关（无 GPU 需求）
docker compose up -d

# 3. 启动网关 + Z-Image-Turbo（需要 NVIDIA GPU + 模型文件）
MODEL_PATH=/path/to/z-image-turbo docker compose --profile gpu up -d

# 4. 健康检查
curl http://localhost:9021/health
```

## 运行集成测试

```bash
# 确保 .env 中已配置 DASHSCOPE_API_KEY
docker compose --profile gpu --profile test up --build --abort-on-container-exit --exit-code-from gateway-test --menu=false gateway-test
```

> 运行测试前请先确认 `z-image-turbo` 已预热并进入 `healthy`，否则容易出现超时或 5xx。
