import { create } from 'zustand';

export const useAuthStore = create(() => ({
  accessToken: null,
  sessionId: null,
  status: 'checking',
  generation: 0,
  welcomePending: false,
}));
