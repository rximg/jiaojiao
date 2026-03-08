FROM python:3.13-slim

RUN pip install --no-cache-dir "pytest>=8.0.0" "httpx>=0.27.0"

WORKDIR /tests

CMD ["pytest", ".", "-v", "--tb=short", "-o", "cache_dir=/tmp/.pytest_cache"]
