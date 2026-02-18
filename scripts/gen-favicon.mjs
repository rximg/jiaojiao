/**
 * 从 assets/logo.ico 同步到 public/favicon.ico
 * ICO 内可含多尺寸（如 256x256），浏览器与 Electron 会按需选用高分辨率
 */
import { mkdir, copyFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const logoIco = join(root, 'assets', 'logo.ico');
const publicDir = join(root, 'public');
const buildDir = join(root, 'build');

async function main() {
  await mkdir(publicDir, { recursive: true });
  await copyFile(logoIco, join(publicDir, 'favicon.ico'));
  await mkdir(buildDir, { recursive: true });
  await copyFile(logoIco, join(buildDir, 'icon.ico'));
  console.log('已同步: public/favicon.ico、build/icon.ico <- assets/logo.ico');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
