import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

function pad2(value) {
  return String(value).padStart(2, '0');
}

function getTimestampToMinute(date = new Date()) {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());
  return `${year}${month}${day}_${hour}${minute}`;
}

function parseArgs(argv) {
  const options = {
    sourceDir: undefined,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === '--source') {
      options.sourceDir = argv[i + 1];
      i += 1;
    }
  }

  return options;
}

function resolveDefaultSourceDir() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'jiaojiao');
}

async function ensureUniqueTarget(baseDir, namePrefix) {
  let attempt = 0;
  while (attempt < 100) {
    const suffix = attempt === 0 ? '' : `_${attempt}`;
    const candidate = path.join(baseDir, `${namePrefix}${suffix}`);
    try {
      await fs.access(candidate);
      attempt += 1;
    } catch {
      return candidate;
    }
  }
  throw new Error('无法生成唯一备份目录名，请稍后重试');
}

function openDirectory(dirPath) {
  if (process.platform === 'win32') {
    const child = spawn('explorer.exe', [dirPath], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return;
  }

  if (process.platform === 'darwin') {
    const child = spawn('open', [dirPath], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return;
  }

  const child = spawn('xdg-open', [dirPath], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

async function main() {
  const { sourceDir } = parseArgs(process.argv.slice(2));
  const source = sourceDir ? path.resolve(sourceDir) : resolveDefaultSourceDir();

  try {
    const stat = await fs.stat(source);
    if (!stat.isDirectory()) {
      throw new Error(`源路径不是目录: ${source}`);
    }
  } catch (error) {
    throw new Error(`未找到 jiaojiao 用户目录: ${source}`);
  }

  const parentDir = path.dirname(source);
  const timestamp = getTimestampToMinute(new Date());
  const backupNamePrefix = `jiaojiao_${timestamp}`;
  const backupDir = await ensureUniqueTarget(parentDir, backupNamePrefix);

  await fs.cp(source, backupDir, {
    recursive: true,
    force: false,
    errorOnExist: true,
    preserveTimestamps: true,
  });

  console.log(`已备份: ${source}`);
  console.log(`备份目录: ${backupDir}`);

  openDirectory(backupDir);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
