import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { useUiStore } from '../src/stores/ui.js';

Object.defineProperties(window, {
  scrollTo: { value: vi.fn(), configurable: true },
  matchMedia: {
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
    configurable: true,
  },
});
Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  value: vi.fn(),
  configurable: true,
});

afterEach(() => {
  cleanup();
  useUiStore.setState(useUiStore.getInitialState());
  vi.restoreAllMocks();
});
