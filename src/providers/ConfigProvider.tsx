import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { AppConfig } from '../types/types';

interface ConfigContextType {
  config: AppConfig | null;
  updateConfig: (newConfig: Partial<AppConfig>) => Promise<void>;
  isLoading: boolean;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      if (!window.electronAPI?.config) {
        console.warn('electronAPI.config not available, using default config');
        setIsLoading(false);
        return;
      }
      const savedConfig = await window.electronAPI.config.get();
      setConfig(savedConfig);
    } catch (error) {
      console.error('Failed to load config:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateConfig = async (newConfig: Partial<AppConfig>) => {
    try {
      if (!window.electronAPI?.config) {
        throw new Error('electronAPI.config is not available');
      }
      const baseConfig: AppConfig = config || {
        apiKeys: { dashscope: '', t2i: '', tts: '' },
        agent: { model: 'qwen-plus-2025-12-01', temperature: 0.1, maxTokens: 20000 },
        storage: { outputPath: './outputs' },
        ui: { theme: 'light', language: 'zh' },
      };
      const updatedConfig = { ...baseConfig, ...newConfig } as AppConfig;
      await window.electronAPI.config.set(updatedConfig);
      setConfig(updatedConfig);
    } catch (error) {
      console.error('Failed to update config:', error);
      throw error;
    }
  };

  return (
    <ConfigContext.Provider value={{ config, updateConfig, isLoading }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
}
