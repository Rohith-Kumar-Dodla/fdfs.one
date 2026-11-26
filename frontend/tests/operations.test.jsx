import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  AnalyticsPreferences,
  routeCategory,
} from '../src/features/operations/Realtime.jsx';

afterEach(() => localStorage.removeItem('fdfs.analytics'));

it('keeps private route segments and admin navigation out of audience analytics', () => {
  expect(routeCategory('/support/tickets/private-ticket')).toEqual({
    module: 'support',
  });
  expect(routeCategory('/account/settings')).toEqual({ module: 'account' });
  expect(routeCategory('/admin/analytics')).toBeNull();
  expect(routeCategory('/live/published-event')).toEqual({
    module: 'live',
    content: 'published-event',
  });
  expect(routeCategory('/live/unknown/children')).toEqual({ module: 'live' });
  expect(routeCategory('/reviews')).toEqual({ module: 'reviews' });
});

it('defaults optional analytics to off and emits consent changes in both directions', () => {
  const handler = vi.fn();
  window.addEventListener('fdfs:consent', handler);
  try {
    render(<AnalyticsPreferences />);
    const checkbox = screen.getByRole('checkbox', {
      name: /optional first-party analytics/i,
    });
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(localStorage.getItem('fdfs.analytics')).toBe('allow');
    expect(handler.mock.lastCall[0].detail).toBe(true);
    fireEvent.click(checkbox);
    expect(localStorage.getItem('fdfs.analytics')).toBe('deny');
    expect(handler.mock.lastCall[0].detail).toBe(false);
  } finally {
    window.removeEventListener('fdfs:consent', handler);
  }
});
