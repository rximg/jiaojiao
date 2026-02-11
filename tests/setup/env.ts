import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root (仅用于 RUN_INTEGRATION_TESTS 等非 API Key 变量)
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

// API Key 仅从用户目录配置读取，不使用环境变量；集成测试需在应用中配置 Key 并设置 RUN_INTEGRATION_TESTS=true
