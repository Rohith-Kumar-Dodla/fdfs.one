import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const envDir = fileURLToPath(new URL('../', import.meta.url));

function validateDeploymentUrls(env) {
  for (const [name, suffix] of [
    ['VITE_API_BASE_URL', '/api/v1'],
    ['VITE_SOCKET_URL', ''],
  ]) {
    const value = env[name]?.trim();
    if (!value || (suffix && value === suffix)) continue;
    const url = URL.parse(value);
    if (
      url?.protocol !== 'https:' ||
      value !== url.origin + suffix ||
      /(^|\.)localhost\.?$|^127\.|^0\.0\.0\.0$|^\[/.test(url.hostname)
    ) {
      throw new Error(name + ' must use a deployed HTTPS URL.');
    }
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
