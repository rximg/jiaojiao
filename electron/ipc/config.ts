import { app, ipcMain } from 'electron';
import Store from 'electron-store';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import { log } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 用户配置存放在操作系统用户目录（如 Windows %APPDATA%\jiaojiao、macOS ~/Library/Application Support/jiaojiao）
// 延迟到 app.ready 后初始化，保证 getPath('userData') 正确
let store: Store<Record<string, unknown>> | null = null;

/** 配置版本号使用 package.json 的 version，通过 app.getVersion() 获取 */
function getAppVersion(): string {
  return app.getVersion();
}

const DEFAULTS: Record<string, unknown> = {
  apiKeys: {
    dashscope: '',
    zhipu: '',
  },
  agent: {
    model: 'qwen-plus-2025-12-01',
    current: '',
    temperature: 0.1,
    maxTokens: 20000,
    provider: 'dashscope',
  },
  storage: {
    outputPath: './outputs',
    ttsStartNumber: 6000,
  },
  ui: {
    theme: 'light',
    language: 'zh',
  },
};

// 若 config.json 已存在但内容不是合法 JSON（损坏或首次/旧环境遗留），先移走再创建 Store，避免 conf 内部 JSON.parse 报错
function ensureValidConfigFile(userDataDir: string): void {
  const configPath = path.join(userDataDir, 'config.json');
  if (!fs.existsSync(configPath)) return;
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    if (raw.trim() === '') return;
    JSON.parse(raw);
  } catch {
    try {
      const backup = path.join(userDataDir, `config.json.bak.${Date.now()}`);
      fs.renameSync(configPath, backup);
      log.warn('[config] Invalid or corrupted config file backed up to:', backup);
    } catch {
      fs.unlinkSync(configPath);
    }
  }
}

function getStore(): Store<Record<string, unknown>> {
  if (store) return store;
  const userDataDir = app.getPath('userData');
  log.info('[config] userDataDir:', userDataDir, 'isPackaged:', app.isPackaged);
  fs.mkdirSync(userDataDir, { recursive: true });
  ensureValidConfigFile(userDataDir);
  store = new Store({
    name: 'config',
    cwd: userDataDir,
    defaults: { ...DEFAULTS, configVersion: getAppVersion() },
  }) as unknown as Store<Record<string, unknown>>;
  log.info('[config] store initialized, config.json path:', path.join(userDataDir, 'config.json'));
  return store;
}

/** 解析 backend/config/main_agent_config.yaml 的路径：打包后从 extraResources（resources/backend），开发时从项目 backend */
function resolveMainAgentConfigPath(): string {
  // 打包后：backend 通过 extraResources 复制到 resources/backend/
  if (app.isPackaged && process.resourcesPath) {
    const fromResources = path.join(process.resourcesPath, 'backend', 'config', 'main_agent_config.yaml');
    if (fs.existsSync(fromResources)) {
      log.info('[config] main_agent_config.yaml from extraResources:', fromResources);
      return fromResources;
    }
    log.info('[config] extraResources path not found:', fromResources);
  }
  const appRoot = app.getAppPath();
  const fromAppRoot = path.join(appRoot, 'backend', 'config', 'main_agent_config.yaml');
  if (fs.existsSync(fromAppRoot)) {
    log.info('[config] main_agent_config.yaml from appRoot:', fromAppRoot);
    return fromAppRoot;
  }
  // 开发：可能在 electron/ipc（源码）或 dist-electron/ipc（Vite 编译），先试一层再试两层
  const oneUp = path.resolve(__dirname, '..', 'backend', 'config', 'main_agent_config.yaml');
  if (fs.existsSync(oneUp)) {
    log.info('[config] main_agent_config.yaml from __dirname+1:', oneUp);
    return oneUp;
  }
  const twoUp = path.resolve(__dirname, '..', '..', 'backend', 'config', 'main_agent_config.yaml');
  log.info('[config] main_agent_config.yaml from __dirname+2:', twoUp);
  return twoUp;
}

/** 返回 backend/config 目录（供 AgentFactory 等使用，打包后指向 resources/backend/config） */
export function getBackendConfigDir(): string {
  return path.dirname(resolveMainAgentConfigPath());
}

// 加载 main_agent_config.yaml 中的 UI 配置（仅在此处调用，get 时合并到返回值）
function loadUIConfigFromYaml(): Record<string, unknown> {
  try {
    const configPath = resolveMainAgentConfigPath();
    if (!fs.existsSync(configPath)) {
      log.warn('[config] main_agent_config.yaml not found:', configPath);
      return {};
    }
    const fileContent = fs.readFileSync(configPath, 'utf-8');
    const config = yaml.load(fileContent) as any;
    const uiKeys = config?.ui ? Object.keys(config.ui) : [];
    log.info('[config] YAML UI loaded, keys:', uiKeys.length ? uiKeys.join(', ') : '(none)');
    return config.ui || {};
  } catch (error) {
    log.error('[config] loadUIConfigFromYaml failed:', error);
    return {};
  }
}

export function handleConfigIPC() {
  ipcMain.handle('config:get', async () => {
    const userDataDir = app.getPath('userData');
    const configPath = path.join(userDataDir, 'config.json');
    const isFirstRun = !fs.existsSync(configPath);
    log.info('[config] config:get userDataDir=', userDataDir, 'configPath=', configPath, 'isFirstRun=', isFirstRun);

    const s = getStore();
    const latestUIConfig = loadUIConfigFromYaml();
    const currentStore = s.store as any;
    const config = {
      ...currentStore,
      configVersion: (currentStore.configVersion as string | undefined) ?? getAppVersion(),
      ui: {
        ...currentStore.ui,
        ...latestUIConfig,
      },
    };
    log.info('[config] config:get ok, hasApiKey=', Boolean(currentStore?.apiKeys?.dashscope || currentStore?.apiKeys?.zhipu));
    return { config, isFirstRun };
  });

  ipcMain.handle('config:set', async (_event, config: any) => {
    log.info('[config] config:set called');
    try {
      const s = getStore();
      const userDataDir = app.getPath('userData');
      const writePath = path.join(userDataDir, 'config.json');
      log.info('[config] config:set writePath=', writePath, 'userDataWritable=', Boolean(userDataDir));

      const def = DEFAULTS as Record<string, Record<string, unknown>>;
      const normalized = {
        configVersion: getAppVersion(),
        apiKeys: {
          dashscope: typeof config?.apiKeys?.dashscope === 'string' ? config.apiKeys.dashscope : '',
          zhipu: typeof config?.apiKeys?.zhipu === 'string' ? config.apiKeys.zhipu : '',
        },
        agent: {
          model: typeof config?.agent?.model === 'string' ? config.agent.model : (def.agent.model as string),
          current: typeof config?.agent?.current === 'string' ? config.agent.current : '',
          temperature: Number(config?.agent?.temperature) || (def.agent.temperature as number),
          maxTokens: Number(config?.agent?.maxTokens) || (def.agent.maxTokens as number),
          provider: config?.agent?.provider === 'zhipu' ? 'zhipu' : 'dashscope',
        },
        storage: {
          outputPath: typeof config?.storage?.outputPath === 'string' ? config.storage.outputPath : (def.storage.outputPath as string),
          ttsStartNumber: Number(config?.storage?.ttsStartNumber) || (def.storage.ttsStartNumber as number),
        },
        ui: {
          theme: config?.ui?.theme === 'dark' ? 'dark' : 'light',
          language: config?.ui?.language === 'en' ? 'en' : 'zh',
        },
      };

      s.set('configVersion', normalized.configVersion);
      s.set('apiKeys', normalized.apiKeys);
      s.set('agent', normalized.agent);
      s.set('storage', normalized.storage);
      s.set('ui', normalized.ui);

      log.info('[config] config:set ok, path=', writePath);
      return s.store;
    } catch (error: any) {
      const msg = error?.message ?? String(error);
      const stack = error?.stack ?? '';
      log.error('[config] config:set failed:', msg, stack);
      throw error;
    }
  });
}
