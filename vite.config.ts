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
          resolve: {
            alias: [
              // Electron 主进程构建使用独立的 Vite 配置；这里同样需要把 `#backend/**.js` 映射为无扩展名路径，便于解析到 .ts 源文件
              { find: /^#backend\/(.*)\.js$/, replacement: path.resolve(__dirname, './backend/$1') },
              { find: '#backend', replacement: path.resolve(__dirname, './backend') },
              { find: '@', replacement: path.resolve(__dirname, './src') },
              {
                find: 'deepagents/node_modules/@langchain/core/messages',
                replacement: '@langchain/core/messages',
              },
            ],
          },
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'electron-store', 'sharp'],
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
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      // Vite/Rollup 无法用 .js 扩展名直接解析到 .ts（尤其在 alias 路径上），这里统一把 `#backend/**.js` 映射为无扩展名路径。
      { find: /^#backend\/(.*)\.js$/, replacement: path.resolve(__dirname, './backend/$1') },
      { find: '#backend', replacement: path.resolve(__dirname, './backend') },
      // 将 deepagents 内部引用的子路径映射到顶层安装，消除 commonjs-resolver 警告
      { find: 'deepagents/node_modules/@langchain/core/messages', replacement: '@langchain/core/messages' },
    ],
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