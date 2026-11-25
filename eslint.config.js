import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['**/dist/**', '**/coverage/**'] },
  js.configs.recommended,
  {
    files: ['*.js', 'backend/**/*.js', 'frontend/vite.config.js'],
    languageOptions: { globals: globals.node },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  {
    files: ['frontend/{src,tests}/**/*.{js,jsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: { ...js.configs.recommended.rules },
  },
];
