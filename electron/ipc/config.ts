import { app, ipcMain, shell, dialog, BrowserWindow } from 'electron';
import Store from 'electron-store';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { log } from '../logger.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 用户配置存放在操作系统用户目录（如 Windows %APPDATA%\jiaojiao、macOS ~/Library/Application Support/jiaojiao）
// 延迟到 app.ready 后初始化，保证 getPath('userData') 正确
let store: Store<Record<string, unknown>> | null = null;

/** 配置版本号使用 package.json 的 version，通过 app.getVersion() 获取 */
function getAppVersion(): string {
  return app.getVersion();
}

/** 未设置或旧版 ./outputs 时视为空，需用户在配置中设置音频输出路径 */
const LEGACY_DEFAULT_OUTPUT = './outputs';

/** 判断路径是否在应用目录（或 cwd）下，此类视为旧配置并清空，避免继续使用 app 目录下的 workspace */
function isPathUnderAppDir(dirPath: string): boolean {
  if (!dirPath || !dirPath.trim()) return true;
  const normalized = path.normalize(path.resolve(dirPath)).toLowerCase();
  const appPath = path.normalize(path.resolve(app.getAppPath())).toLowerCase();
  const cwd = path.normalize(path.resolve(process.cwd())).toLowerCase();
  const appPrefix = appPath.endsWith(path.sep) ? appPath : appPath + path.sep;
  const cwdPrefix = cwd.endsWith(path.sep) ? cwd : cwd + path.sep;
  return normalized === appPath || normalized.startsWith(appPrefix) || normalized === cwd || normalized.startsWith(cwdPrefix);
}

const DEFAULTS: Record<string, unknown> = {
  apiKeys: {
    dashscope: '',
    zhipu: '',
  },
  multimodalApiKeys: {
    dashscope: '',
    zhipu: '',
  },
  agent: {
    model: 'qwen-plus-2025-12-01',
    current: '',
    temperature: 0.1,
    maxTokens: 20000,
    provider: 'dashscope',
    multimodalProvider: 'dashscope',
  },
  storage: {
    outputPath: '',
    syncTargetPath: '',
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

function getFallbackAiModels(): Record<string, { default: string; models: Array<{ id: string; label: string }> }> {
  return {
    dashscope: {
      default: 'qwen-plus-2025-12-01',
      models: [
        { id: 'qwen-plus-2025-12-01', label: '通义 Qwen Plus' },
        { id: 'qwen-turbo', label: '通义 Qwen Turbo' },
      ],
    },
    zhipu: {
      default: 'glm-4.7',
      models: [
        { id: 'glm-4.5', label: '智谱 GLM-4.5' },
        { id: 'glm-4.5-flash', label: '智谱 GLM-4.5 Flash' },
        { id: 'glm-4.6', label: '智谱 GLM-4.6' },
        { id: 'glm-4.7', label: '智谱 GLM-4.7' },
      ],
    },
  };
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
    const storedOutput = (currentStore?.storage as any)?.outputPath;
    const storedSync = (currentStore?.storage as any)?.syncTargetPath;
    const outputPath =
      typeof storedOutput === 'string' &&
      storedOutput.trim() &&
      storedOutput !== LEGACY_DEFAULT_OUTPUT &&
      !isPathUnderAppDir(storedOutput)
        ? storedOutput.trim()
        : '';
    const syncTargetPath =
      typeof storedSync === 'string' && storedSync.trim() && !isPathUnderAppDir(storedSync)
        ? storedSync.trim()
        : outputPath || '';
    const config = {
      ...currentStore,
      configVersion: (currentStore.configVersion as string | undefined) ?? getAppVersion(),
      multimodalApiKeys: currentStore?.multimodalApiKeys ?? currentStore?.apiKeys ?? DEFAULTS.multimodalApiKeys,
      agent: {
        ...(currentStore?.agent as object),
        multimodalProvider: (currentStore?.agent as any)?.multimodalProvider ?? (currentStore?.agent as any)?.provider ?? 'dashscope',
      },
      storage: {
        ...(currentStore?.storage as object),
        outputPath,
        syncTargetPath,
      },
      ui: {
        ...currentStore.ui,
        ...latestUIConfig,
      },
    };
    log.info('[config] config:get ok, hasApiKey=', Boolean(currentStore?.apiKeys?.dashscope || currentStore?.apiKeys?.zhipu));
    return { config, isFirstRun };
  });

  /** 从 backend/config/ai_models.json 读取 LLM 模型列表，供配置弹窗下拉使用 */
  ipcMain.handle('config:getAiModels', async () => {
    try {
      const configDir = getBackendConfigDir();
      const filePath = path.join(configDir, 'ai_models.json');
      if (!fs.existsSync(filePath)) {
        log.warn('[config] ai_models.json not found:', filePath);
        return getFallbackAiModels();
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      const schema = JSON.parse(content) as Record<string, { llm?: { default?: string; models?: Array<{ id: string; label: string }> } }>;
      const result: Record<string, { default: string; models: Array<{ id: string; label: string }> }> = {};
      for (const provider of ['dashscope', 'zhipu'] as const) {
        const llm = schema[provider]?.llm;
        if (llm?.models?.length) {
          result[provider] = {
            default: llm.default ?? llm.models[0]?.id ?? '',
            models: llm.models,
          };
        } else {
          const fallback = getFallbackAiModels();
          result[provider] = fallback[provider];
        }
      }
      return result;
    } catch (e) {
      log.error('[config] getAiModels failed:', (e as Error).message);
      return getFallbackAiModels();
    }
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
        multimodalApiKeys: {
          dashscope: typeof config?.multimodalApiKeys?.dashscope === 'string' ? config.multimodalApiKeys.dashscope : '',
          zhipu: typeof config?.multimodalApiKeys?.zhipu === 'string' ? config.multimodalApiKeys.zhipu : '',
        },
        agent: {
          model: typeof config?.agent?.model === 'string' ? config.agent.model : (def.agent.model as string),
          current: typeof config?.agent?.current === 'string' ? config.agent.current : '',
          temperature: Number(config?.agent?.temperature) || (def.agent.temperature as number),
          maxTokens: Number(config?.agent?.maxTokens) || (def.agent.maxTokens as number),
          provider: config?.agent?.provider === 'zhipu' ? 'zhipu' : 'dashscope',
          multimodalProvider: config?.agent?.multimodalProvider === 'zhipu' ? 'zhipu' : 'dashscope',
        },
        storage: (() => {
          const raw = typeof config?.storage?.outputPath === 'string' ? config.storage.outputPath.trim() : '';
          const out =
            raw && raw !== LEGACY_DEFAULT_OUTPUT && !isPathUnderAppDir(raw) ? raw : '';
          const syncRaw = typeof config?.storage?.syncTargetPath === 'string' ? config.storage.syncTargetPath.trim() : '';
          const syncOut = syncRaw && !isPathUnderAppDir(syncRaw) ? syncRaw : '';
          return {
            outputPath: out,
            syncTargetPath: syncOut,
            ttsStartNumber: Number(config?.storage?.ttsStartNumber) || (def.storage.ttsStartNumber as number),
          };
        })(),
        ui: {
          theme: config?.ui?.theme === 'dark' ? 'dark' : 'light',
          language: config?.ui?.language === 'en' ? 'en' : 'zh',
        },
      };

      s.set('configVersion', normalized.configVersion);
      s.set('apiKeys', normalized.apiKeys);
      s.set('multimodalApiKeys', normalized.multimodalApiKeys);
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

  /** 返回工作目录路径（userData/workspace，固定不可配置） */
  ipcMain.handle('config:getWorkspaceDir', async () => path.join(app.getPath('userData'), 'workspace'));

  /** 打开用户配置所在文件夹（userData，内含 config.json） */
  ipcMain.handle('config:openConfigDir', async () => {
    const userDataDir = app.getPath('userData');
    await shell.openPath(userDataDir);
  });

  /** 弹出目录选择对话框，返回所选目录路径；取消则返回 null */
  ipcMain.handle('config:showOutputPathDialog', async (_event, defaultPath?: string) => {
    const win = BrowserWindow.getFocusedWindow();
    const opts: Electron.OpenDialogOptions = {
      properties: ['openDirectory'],
      title: '选择音频同步目标目录',
      defaultPath: defaultPath || app.getPath('documents'),
    };
    const { filePaths } = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts);
    return filePaths[0] ?? null;
  });

  /** 在文件管理器中打开指定路径（文件夹或文件） */
  ipcMain.handle('config:openFolder', async (_event, dirPath: string) => {
    if (!dirPath || typeof dirPath !== 'string') return;
    try {
      await shell.openPath(dirPath);
    } catch (e) {
      log.error('[config] openFolder failed:', e);
      throw e;
    }
  });
}
