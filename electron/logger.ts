/**
 * 主进程简单文件日志（仅 Electron 层：启动、配置、打包调试用）。
 * 与 backend/log-manager 不同：后者负责业务审计/HITL/系统日志，可查询；本模块单文件追加，便于打包后排查。
 * 打包后日志在 exe 同目录下 logs/main.log，开发时在 userData/logs/main.log。
 */
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

let logFilePath: string | null = null;
let pathLogged = false;

function getLogFilePath(): string {
  if (logFilePath) return logFilePath;
  try {
    let dir: string;
    if (app.isPackaged) {
      dir = path.join(path.dirname(process.execPath), 'logs');
    } else {
      dir = path.join(app.getPath('userData'), 'logs');
    }
    fs.mkdirSync(dir, { recursive: true });
    logFilePath = path.join(dir, 'main.log');
    return logFilePath;
  } catch {
    return '';
  }
}

function formatMessage(level: string, ...args: unknown[]): string {
  const ts = new Date().toISOString();
  const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  return `${ts} [${level}] ${msg}\n`;
}

function write(level: string, ...args: unknown[]): void {
  const line = formatMessage(level, ...args);
  console.log(...args);
  try {
    const file = getLogFilePath();
    if (file) {
      if (!pathLogged) {
        fs.appendFileSync(file, formatMessage('INFO', 'Log file:', file));
        pathLogged = true;
        console.log('[Main] 主进程日志文件:', file);
      }
      fs.appendFileSync(file, line);
    }
  } catch {
    // 写文件失败不抛，避免影响主流程
  }
}

export const log = {
  info: (...args: unknown[]) => write('INFO', ...args),
  warn: (...args: unknown[]) => write('WARN', ...args),
  error: (...args: unknown[]) => write('ERROR', ...args),
};
