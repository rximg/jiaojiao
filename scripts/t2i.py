#!/usr/bin/env python3
"""
Text-to-Image generation script for DashScope API.
Supports wan2.6-image model only.
"""

import os
import sys
import json
import time
import argparse
from pathlib import Path
from typing import Optional, Dict, Any
import requests


class T2IGenerator:
    """Text-to-Image generator using DashScope API (wan2.6-image)"""
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        endpoint: Optional[str] = None,
        task_endpoint: Optional[str] = None,
    ):
        self.api_key = api_key or os.environ.get("DASHSCOPE_API_KEY", "sk-9856ea6b6fd94a40b9a11bc3c608f865")
        # self.model = "wan2.6-image"
        self.model = "wan2.6-t2i"
        
        # wan2.6-image uses image-generation endpoint
        self.endpoint = endpoint or os.environ.get(
            "DASHSCOPE_T2I_ENDPOINT",
            "https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation"
        )
        
        self.task_endpoint = task_endpoint or os.environ.get(
            "DASHSCOPE_T2I_TASK_ENDPOINT",
            "https://dashscope.aliyuncs.com/api/v1/tasks"
        )
        
        if not self.api_key:
            raise ValueError("API key is required. Set DASHSCOPE_API_KEY environment variable or pass api_key parameter.")
    
    def _submit_task(
        self,
        prompt: str,
        parameters: Dict[str, Any],
    ) -> str:
        """
        Submit an async task to wan2.6-image API.
        Returns the task_id.
        """
        # wan2.6-image request body
        request_body = {
            "model": self.model,
            "input": {
                "messages": [
                    {
                        "role": "user",
                        "content": [{"text": prompt}],
                    }
                ]
            },
            "parameters": parameters,
        }
        
        # Prepare headers
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
            "X-DashScope-Async": "enable",
        }
        
        print(f"[T2I] Async request endpoint: {self.endpoint}")
        print(f"[T2I] Async request model: {self.model}")
        print(f"[T2I] Async request prompt length: {len(prompt)}")
        
        # Send async request
        response = requests.post(self.endpoint, headers=headers, json=request_body)
        
        if not response.ok:
            raise Exception(
                f"T2I async request failed: {response.status_code} {response.reason} {response.text}"
            )
        
        response_data = response.json()
        task_id = response_data.get("output", {}).get("task_id")
        
        if not task_id:
            raise Exception("T2I async request did not return task_id")
        
        print(f"[T2I] Task ID: {task_id}")
        return task_id
    
    def _poll_task_result(
        self,
        task_id: str,
        max_attempts: int = 60,
        poll_interval: int = 2,
    ) -> str:
        """
        Poll task status until completion.
        Returns the image URL.
        """
        for attempt in range(max_attempts):
            time.sleep(poll_interval)
            
            poll_response = requests.get(
                f"{self.task_endpoint}/{task_id}",
                headers={"Authorization": f"Bearer {self.api_key}"}
            )
            
            if not poll_response.ok:
                raise Exception(f"T2I task polling failed: {poll_response.status_code}")
            
            task_data = poll_response.json()
            task_status = task_data.get("output", {}).get("task_status")
            
            print(f"T2I task status ({attempt + 1}/{max_attempts}): {task_status}")
            
            if task_status == "SUCCEEDED":
                # wan2.6-image format: choices array
                choices = task_data.get("output", {}).get("choices", [])
                if not choices:
                    print("[T2I] Task response structure:", json.dumps(task_data, indent=2))
                    raise Exception("T2I task succeeded but no choices returned")
                
                content = choices[0].get("message", {}).get("content", [])
                image_url = None
                for item in content:
                    if item.get("type") == "image" and item.get("image"):
                        image_url = item["image"]
                        break
                
                if not image_url:
                    print("[T2I] Task response structure:", json.dumps(task_data, indent=2))
                    raise Exception("T2I task succeeded but no image URL returned")
                
                return image_url
            
            if task_status == "FAILED":
                message = task_data.get("output", {}).get("message", "Unknown error")
                raise Exception(f"T2I task failed: {message}")
        
        raise Exception("T2I task timeout after 60 attempts")
    
    def _generate_image_async(
        self,
        prompt: str,
        parameters: Dict[str, Any],
    ) -> str:
        """
        Generate image using wan2.6-image async API.
        Returns the image URL.
        """
        task_id = self._submit_task(prompt, parameters)
        image_url = self._poll_task_result(task_id)
        return image_url
    
    def generate_image(
        self,
        prompt: Optional[str] = None,
        prompt_file: Optional[str] = None,
        size: str = "1024*1024",
        style: Optional[str] = None,
        count: int = 1,
        output_dir: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Generate image from text prompt.
        
        Args:
            prompt: Text prompt for image generation
            prompt_file: Path to file containing the prompt
            size: Image size (default: 1024*1024)
            style: Negative prompt
            count: Number of images to generate
            output_dir: Directory to save the generated image(s)
        
        Returns:
            Dictionary with imagePath, imageUrl, and other metadata
        """
        # Load prompt from file or use direct parameter
        if prompt_file:
            print(f"[T2I] Reading prompt from file: {prompt_file}")
            try:
                with open(prompt_file, 'r', encoding='utf-8') as f:
                    prompt = f.read()
                print(f"[T2I] Successfully read prompt file, length: {len(prompt)}")
            except Exception as e:
                raise Exception(f"Failed to read prompt file '{prompt_file}': {str(e)}")
        elif not prompt:
            raise ValueError("Either prompt or prompt_file must be provided")
        
        # Prepare parameters for wan2.6-image
        parameters: Dict[str, Any] = {
            "size": size,
            "max_images": count,
            "enable_interleave": True,
        }
        if style:
            parameters["negative_prompt"] = style
        
        # Save input parameters for debugging
        try:
            debug_dir = Path("outputs") / "t2idebug"
            debug_dir.mkdir(parents=True, exist_ok=True)
            
            timestamp = time.strftime("%Y-%m-%dT%H-%M-%S")
            debug_file = debug_dir / f"t2i_input_{timestamp}.json"
            
            debug_data = {
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "model": self.model,
                "endpoint": self.endpoint,
                "fullPromptLength": len(prompt),
                "fullPrompt": prompt,
                "parameters": {"size": size, "style": style, "count": count},
                "config": {
                    "promptFile": prompt_file,
                    "promptProvided": bool(prompt),
                },
            }
            
            with open(debug_file, 'w', encoding='utf-8') as f:
                json.dump(debug_data, f, indent=2, ensure_ascii=False)
            print(f"[T2I] Input parameters saved to: {debug_file}")
            print(f"[T2I] Full prompt length: {len(prompt)} characters")
        except Exception as e:
            print(f"[T2I] Failed to save input parameters: {e}")
        
        # Generate image using wan2.6-image async API
        image_url = self._generate_image_async(prompt, parameters)
        
        # Download and save image
        try:
            print(f"[T2I] Downloading image from: {image_url}")
            image_response = requests.get(image_url)
            
            if not image_response.ok:
                raise Exception(
                    f"Image download failed: {image_response.status_code} {image_response.reason}"
                )
            
            image_data = image_response.content
            
            # Determine output directory
            if output_dir:
                save_dir = Path(output_dir)
            else:
                save_dir = Path("outputs") / "images"
            
            save_dir.mkdir(parents=True, exist_ok=True)
            
            # Generate filename
            timestamp_ms = int(time.time() * 1000)
            random_suffix = os.urandom(4).hex()
            image_filename = f"image_{timestamp_ms}_{random_suffix}.png"
            image_path = save_dir / image_filename
            
            # Save image
            with open(image_path, 'wb') as f:
                f.write(image_data)
            
            print(f"[T2I] Image saved to: {image_path}")
            
            return {
                "imagePath": str(image_path.absolute()),
                "imageUrl": image_url,
                "model": self.model,
                "promptLength": len(prompt),
            }
        except Exception as e:
            raise Exception(f"Failed to download image: {str(e)}")


def main():
    parser = argparse.ArgumentParser(description="Generate images using DashScope API (wan2.6-image)")
    parser.add_argument("--prompt", type=str, help="Text prompt for image generation")
    parser.add_argument("--prompt-file", type=str, help="Path to file containing the prompt")
    parser.add_argument("--size", type=str, default="1024*1024", help="Image size (default: 1024*1024)")
    parser.add_argument("--style", type=str, help="Negative prompt")
    parser.add_argument("--count", type=int, default=1, help="Number of images to generate (default: 1)")
    parser.add_argument("--output-dir", type=str, help="Output directory for generated images")
    parser.add_argument("--api-key", type=str, help="DashScope API key (or set DASHSCOPE_API_KEY env var)")
    parser.add_argument("--endpoint", type=str, help="Custom API endpoint")
    
    args = parser.parse_args()
    
    if not args.prompt and not args.prompt_file:
        parser.error("Either --prompt or --prompt-file must be provided")
    
    try:
        generator = T2IGenerator(
            api_key=args.api_key,
            endpoint=args.endpoint,
        )
        
        result = generator.generate_image(
            prompt=args.prompt,
            prompt_file=args.prompt_file,
            size=args.size,
            style=args.style,
            count=args.count,
            output_dir=args.output_dir,
        )
        
        print("\n[SUCCESS] Image generation completed!")
        print(f"Image saved to: {result['imagePath']}")
        print(f"Image URL: {result['imageUrl']}")
        
    except Exception as e:
        print(f"\n[ERROR] {str(e)}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

