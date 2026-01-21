import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import baseManifest from './manifest.json';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const appName = env.VITE_APP_NAME || '智能助手';
  const appDesc =
    env.VITE_APP_DESC || `${appName} - 捕获网页内容，与 AI 对话获取洞察`;

  const manifest = {
    ...baseManifest,
    name: appName,
    description: appDesc,
    action: {
      ...(baseManifest as any).action,
      default_title: `打开 ${appName}`,
    },
    commands: {
      ...(baseManifest as any).commands,
      'open-edage': {
        ...(baseManifest as any).commands?.['open-edage'],
        description: `打开 ${appName}`,
      },
    },
  };

  return {
    base: './', // 使用相对路径，适配 Chrome 扩展环境
    plugins: [react(), crx({ manifest })],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          sidepanel: 'sidepanel.html',
        },
      },
    },
  };
});
