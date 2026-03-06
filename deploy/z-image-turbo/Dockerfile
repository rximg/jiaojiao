# 基于 ModelScope 官方镜像（内置 PyTorch 2.6 + CUDA 12.4 + ModelScope 1.29）
FROM modelscope-registry.cn-hangzhou.cr.aliyuncs.com/modelscope-repo/modelscope:ubuntu22.04-cuda12.4.0-py311-torch2.6.0-1.29.0-LLM

WORKDIR /app

# 仅安装/升级缺少的依赖（容器已内置 torch/transformers/fastapi/uvicorn 等）
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

# ── 环境变量 ──────────────────────────────────────────────────────────────────────
# MODEL_PATH       : 容器内模型目录（通过 volume 挂载）
# SERVER_PUBLIC_URL: 图片 URL 前缀，客户端用此地址下载图片
# OUTPUT_DIR       : 生成图片的临时存储目录
# PORT             : 监听端口
ENV MODEL_PATH=/model \
    SERVER_PUBLIC_URL=http://localhost:8998 \
    OUTPUT_DIR=/tmp/z-image-outputs \
    PORT=8998 \
    PYTHONUNBUFFERED=1 \
    PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True

EXPOSE 8998

CMD ["python", "server.py"]
