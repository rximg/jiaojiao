from openai import OpenAI
import os
import base64
import json

#  编码函数： 将本地文件转换为 Base64 编码的字符串
def encode_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")
name = "image_1769914274189_627699c5"
path = f"scripts/outputs/images/{name}.png"
# 将xxxx/eagle.png替换为你本地图像的绝对路径
base64_image = encode_image(path)

prompt = """
你是一个有声绘本台词设计师，找出图片中的元素，给每个元素设计一个台词。返回一个列表，列表里是台词和对应元素坐标，坐标原点为图片左上角。 格式为：[{"text": "台词", "x": "x坐标", "y": "y坐标"}]
例如：
[
    {"text": "一只小鸟在天上飞", "x": 100, "y": 100},
    {"text": "一只小鸟在天上飞", "x": 200, "y": 200},
]
"""

client = OpenAI(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
    # 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
    api_key=os.getenv('DASHSCOPE_API_KEY'),
    # 以下为北京地域base_url，若使用弗吉尼亚地域模型，需要将base_url换成 https://dashscope-us.aliyuncs.com/compatible-mode/v1
    # 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/compatible-mode/v1
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
)
completion = client.chat.completions.create(
    model="qwen3-vl-plus", # 此处以qwen3-vl-plus为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/models
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    # 需要注意，传入Base64，图像格式（即image/{format}）需要与支持的图片列表中的Content Type保持一致。"f"是字符串格式化的方法。
                    # PNG图像：  f"data:image/png;base64,{base64_image}"
                    # JPEG图像： f"data:image/jpeg;base64,{base64_image}"
                    # WEBP图像： f"data:image/webp;base64,{base64_image}"
                    "image_url": {"url": f"data:image/png;base64,{base64_image}"}, 
                },
                {"type": "text", "text": prompt},
            ],
        }
    ],
)
# print(completion.choices[0].message.content)
lines = json.loads(completion.choices[0].message.content)
print(lines)
with open(f'scripts/outputs/lines/{name}.json', 'w') as f:
    json.dump(lines, f)