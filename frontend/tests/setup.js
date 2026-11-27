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

// JSDOM has the dialog element but lacks the native modal methods.
if (!HTMLDialogElement.prototype.showModal) {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value() {
        this.setAttribute('open', '');
      },
    },
    close: {
      configurable: true,
      value() {
        this.removeAttribute('open');
      },
    },
  });
}

afterEach(() => {
  cleanup();
  useUiStore.setState(useUiStore.getInitialState());
  vi.restoreAllMocks();
});
