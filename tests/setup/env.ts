import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root（非 API Key 变量）
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

// API Key 仅从用户目录配置读取；集成测试会调用真实接口，需在应用中配置 Key
