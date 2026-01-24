import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root (app/)
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

// Helpful logs when keys are missing (once per run)
const missing: string[] = [];
if (!process.env.DASHSCOPE_API_KEY) missing.push('DASHSCOPE_API_KEY');
if (missing.length) {
  // eslint-disable-next-line no-console
  console.warn(`[tests] Missing env vars: ${missing.join(', ')}. Some tests will be skipped.`);
}
