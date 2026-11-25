import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ command, isPreview }) => ({
  plugins: [react(), tailwindcss()],
  envDir: fileURLToPath(new URL('../', import.meta.url)),
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
}));
