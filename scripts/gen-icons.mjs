/**
 * 从 assets/logo.jpg 生成 Electron 构建所需图标：
 *   build/icon.ico (Windows)
 *   build/icon.icns (macOS)
 *   build/icon.png (Linux，512x512)
 */
import { mkdir, cp, rm } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const logoPath = join(root, 'assets', 'logo.jpg');
const buildDir = join(root, 'build');
const pngSizesDir = join(buildDir, 'png-sizes');

// icon-gen 需要的多尺寸 PNG 文件名（见其文档）
const SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

async function main() {
  await mkdir(buildDir, { recursive: true });
  await mkdir(pngSizesDir, { recursive: true });

  const buffer = await sharp(logoPath)
    .resize(1024, 1024)
    .png()
    .toBuffer();

  const base = await sharp(buffer);

  for (const size of SIZES) {
    await base
      .clone()
      .resize(size, size)
      .toFile(join(pngSizesDir, `${size}.png`));
  }

  const require = createRequire(import.meta.url);
  const icongen = require('icon-gen');

  await icongen(pngSizesDir, buildDir, {
    report: true,
    ico: { name: 'icon', sizes: [16, 24, 32, 48, 64, 128, 256] },
    icns: { name: 'icon', sizes: [16, 32, 64, 128, 256, 512, 1024] },
  });

  await cp(join(pngSizesDir, '512.png'), join(buildDir, 'icon.png'));

  await rm(pngSizesDir, { recursive: true, force: true });

  const publicDir = join(root, 'public');
  await mkdir(publicDir, { recursive: true });
  await cp(join(buildDir, 'icon.ico'), join(publicDir, 'favicon.ico'));

  console.log('图标已生成: build/icon.ico, build/icon.icns, build/icon.png, public/favicon.ico');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
