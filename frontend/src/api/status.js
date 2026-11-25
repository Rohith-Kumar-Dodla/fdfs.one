import { apiClient } from './client.js';

export const statusKeys = {
  health: ['status', 'health'],
  readiness: ['status', 'readiness'],
};

export function getHealth({ signal } = {}) {
  return apiClient.get('/health', { signal });
}

export function getReadiness({ signal } = {}) {
  return apiClient.get('/ready', { signal });
}
