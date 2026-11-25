import { create } from 'zustand';

export const useUiStore = create((set) => ({
  mobileMenuOpen: false,
  setMobileMenuOpen: (mobileMenuOpen) => set({ mobileMenuOpen }),
  toast: null,
  showToast: (message) => set({ toast: { message } }),
  dismissToast: (toast) =>
    set((state) => (state.toast === toast ? { toast: null } : state)),
}));
