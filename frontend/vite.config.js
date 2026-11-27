import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const envDir = fileURLToPath(new URL('../', import.meta.url));

function validateDeploymentUrls(env) {
  const apiBase = env.VITE_API_BASE_URL?.trim();
  if (apiBase && apiBase !== '/api/v1')
    throw new Error('Production VITE_API_BASE_URL must be /api/v1.');

  const socketOrigin = env.VITE_SOCKET_URL?.trim();
  if (!socketOrigin) {
    if (process.env.VERCEL === '1')
      throw new Error('Set VITE_SOCKET_URL to the Render HTTPS origin.');
    return;
  }

  const url = URL.parse(socketOrigin);
  if (
    url?.protocol !== 'https:' ||
    socketOrigin !== url.origin ||
    /(^|\.)localhost\.?$|^127\.|^0\.0\.0\.0$|^\[/.test(url.hostname)
  ) {
    throw new Error('VITE_SOCKET_URL must be a deployed HTTPS origin.');
  }
}

export default defineConfig(({ command, isPreview, mode }) => {
  if (command === 'build') validateDeploymentUrls(loadEnv(mode, envDir));
  return {
    plugins: [react(), tailwindcss()],
    envDir,
    define: {
      'import.meta.env.FDFS_DEV_SERVER': JSON.stringify(
        command === 'serve' && isPreview !== true,
      ),
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./tests/setup.js'],
      include: ['tests/**/*.test.{js,jsx}'],
    },
  };
});
