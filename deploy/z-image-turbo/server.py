"""
Z-Image-Turbo 本地推理服务器

实现与 DashScope T2I 兼容的异步任务 API：
  POST /api/v1/services/aigc/image-generation/generation   →  {output: {task_id}}
  GET  /api/v1/tasks/{task_id}                             →  {output: {task_status, choices|message}}
  GET  /images/{filename}                                  →  PNG 图片文件
  GET  /health                                             →  健康检查
"""

import os
import threading
import uuid
from pathlib import Path
from typing import Any

import torch
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ── 导入 Pipeline ────────────────────────────────────────────────────────────────
try:
    from modelscope import ZImagePipeline           # modelscope >= 1.22
    _PIPELINE_SOURCE = "modelscope"
except (ImportError, AttributeError):
    from diffusers import ZImagePipeline            # type: ignore[no-redef]
    _PIPELINE_SOURCE = "diffusers"

try:
    from diffusers import BitsAndBytesConfig as DiffBnBConfig
    from transformers import BitsAndBytesConfig as TrfBnBConfig
    _BNB_AVAILABLE = True
except ImportError:
    _BNB_AVAILABLE = False

# ── 配置 ─────────────────────────────────────────────────────────────────────────
MODEL_PATH       = os.environ.get("MODEL_PATH",       "/model")
SERVER_PUBLIC_URL = os.environ.get("SERVER_PUBLIC_URL","http://localhost:8998").rstrip("/")
OUTPUT_DIR        = Path(os.environ.get("OUTPUT_DIR",  "/tmp/z-image-outputs"))
SERVER_PORT       = int(os.environ.get("PORT", "8998"))

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ── FastAPI 应用 ──────────────────────────────────────────────────────────────────
app = FastAPI(title="Z-Image-Turbo API Server", version="1.0.0")
app.mount("/images", StaticFiles(directory=str(OUTPUT_DIR)), name="images")

# ── 任务存储 ─────────────────────────────────────────────────────────────────────
_tasks: dict[str, dict[str, Any]] = {}
_tasks_lock = threading.Lock()

# 全局 Pipeline（启动时加载一次）
_pipe: Any = None
# GPU 推理串行锁（同一时刻只允许一次推理）
_infer_lock = threading.Lock()


# ── 启动时加载模型 ────────────────────────────────────────────────────────────────
@app.on_event("startup")
def load_pipeline() -> None:
    global _pipe
    print(f"[Z-Image-Turbo] 从 {MODEL_PATH!r} 加载 Pipeline（来源：{_PIPELINE_SOURCE}）…")
    n_gpu = torch.cuda.device_count()
    total_vram_gb = sum(
        torch.cuda.get_device_properties(i).total_memory for i in range(n_gpu)
    ) / 1024 ** 3 if n_gpu > 0 else 0
    print(f"[Z-Image-Turbo] 检测到 {n_gpu} 张 GPU，合计显存 {total_vram_gb:.0f}GB")

    _pipe = ZImagePipeline.from_pretrained(
        MODEL_PATH,
        torch_dtype=torch.bfloat16,
        local_files_only=True,
    )

    if n_gpu > 0:
        # 尝试 INT8 量化：权重压缩至 ~6GB，可直接常驻 GPU，推理速度远快于 CPU offload
        # 回退到 sequential_cpu_offload（量化不可用或显存仍不足时）
        loaded_with_quant = False
        if _BNB_AVAILABLE:
            try:
                # transformers BnBConfig 支持 bnb_8bit_compute_dtype
                # diffusers BnBConfig 只支持 load_in_8bit / load_in_4bit
                bnb_cfg  = TrfBnBConfig(load_in_8bit=True, bnb_8bit_compute_dtype=torch.bfloat16)
                diff_cfg = DiffBnBConfig(load_in_8bit=True)
                _pipe_q = ZImagePipeline.from_pretrained(
                    MODEL_PATH,
                    torch_dtype=torch.bfloat16,
                    local_files_only=True,
                    transformer_quantization_config=diff_cfg,
                    text_encoder_quantization_config=bnb_cfg,
                    device_map="cuda",
                )
                _pipe = _pipe_q
                loaded_with_quant = True
                print(f"[Z-Image-Turbo] INT8 量化加载成功，直接运行于 GPU（{torch.cuda.get_device_name(0)}）")
            except Exception as e:
                print(f"[Z-Image-Turbo] INT8 量化不可用（{e}），回退到 sequential_cpu_offload")

        if not loaded_with_quant:
            # sequential_cpu_offload：逐层搬运，峰值显存 ~3-4GB
            _pipe.enable_sequential_cpu_offload(gpu_id=0)
            print(f"[Z-Image-Turbo] 启用 sequential_cpu_offload → GPU 0（{torch.cuda.get_device_name(0)}）")
    else:
        _pipe.enable_sequential_cpu_offload()
        print("[Z-Image-Turbo] 无 CUDA，使用 sequential CPU offload")
    print("[Z-Image-Turbo] 服务就绪。")


# ── 推理工作线程 ──────────────────────────────────────────────────────────────────
def _run_inference(task_id: str, prompt: str, size: str, num_images: int) -> None:
    try:
        # 解析尺寸（支持 "1024*1024" 和 "1024x1024" 两种格式）
        sep = "*" if "*" in size else "x"
        parts = size.lower().split(sep)
        width, height = int(parts[0]), int(parts[1]) if len(parts) > 1 else (1024, 1024)

        with _infer_lock:
            result = _pipe(
                prompt=prompt,
                height=height,
                width=width,
                num_inference_steps=9,       # Turbo 实际 8 步 DiT 前向
                guidance_scale=0.0,          # Turbo 必须为 0
                num_images_per_prompt=num_images,
            )

        content = []
        for i, img in enumerate(result.images):
            filename = f"{task_id}_{i}.png"
            img.save(str(OUTPUT_DIR / filename))
            content.append({
                "type": "image",
                "image": f"{SERVER_PUBLIC_URL}/images/{filename}",
            })

        with _tasks_lock:
            _tasks[task_id] = {
                "task_status": "SUCCEEDED",
                "choices": [{"message": {"content": content}}],
            }

    except Exception as exc:
        with _tasks_lock:
            _tasks[task_id] = {
                "task_status": "FAILED",
                "message": str(exc),
            }


# ── 请求 / 响应 Schema ────────────────────────────────────────────────────────────
class _TextContent(BaseModel):
    text: str

class _Message(BaseModel):
    role: str
    content: list[_TextContent]

class _Input(BaseModel):
    messages: list[_Message]

class GenerationRequest(BaseModel):
    model: str = ""
    input: _Input
    parameters: dict[str, Any] = {}


# ── 路由 ─────────────────────────────────────────────────────────────────────────
@app.post("/api/v1/services/aigc/image-generation/generation")
async def submit_task(body: GenerationRequest, request: Request):
    """提交文生图任务，返回 task_id。"""
    prompt = body.input.messages[0].content[0].text
    params = body.parameters
    size       = str(params.get("size", "1024*1024"))
    num_images = int(params.get("n", params.get("count", 1)))

    task_id = str(uuid.uuid4())
    with _tasks_lock:
        _tasks[task_id] = {"task_status": "PENDING"}

    t = threading.Thread(
        target=_run_inference,
        args=(task_id, prompt, size, num_images),
        daemon=True,
    )
    t.start()

    return JSONResponse({"output": {"task_id": task_id}})


@app.get("/api/v1/tasks/{task_id}")
async def get_task_status(task_id: str):
    """轮询任务状态，结构与 DashScope task 响应兼容。"""
    with _tasks_lock:
        task = _tasks.get(task_id)
    if task is None:
        return JSONResponse(status_code=404, content={"error": "task not found"})
    return JSONResponse({"output": task})


@app.get("/health")
async def health():
    return {"status": "ok", "pipeline_loaded": _pipe is not None}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=SERVER_PORT, workers=1)
