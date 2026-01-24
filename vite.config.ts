import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import electron from 'vite-plugin-electron';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'electron-store'],
              output: {
                format: 'es',
                entryFileNames: 'main.js',
              },
            },
          },
        },
      },
    ]),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // 将 deepagents 内部引用的子路径映射到顶层安装，消除 commonjs-resolver 警告
      'deepagents/node_modules/@langchain/core/messages': '@langchain/core/messages',
    },
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
  },
  optimizeDeps: {
    exclude: ['langchain', '@langchain/core', '@langchain/langgraph', '@langchain/openai', 'deepagents'],
  },
});