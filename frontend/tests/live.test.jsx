import userEvent from '@testing-library/user-event';
import { act, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { apiClient } from '../src/api/client.js';
import { LiveChat } from '../src/features/live/Chat.jsx';
import { Countdown, LiveDirectory } from '../src/features/live/Public.jsx';

function renderLive(view) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>{view}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('FDFS Live', () => {
  it('shows the countdown and stops at the waiting state without implying playback', async () => {
    vi.useFakeTimers();
    try {
      render(
        <Countdown
          startAt="2026-11-26T14:00:02Z"
          serverNow="2026-11-26T14:00:00Z"
        />,
      );
      expect(screen.getByText(/0h 0m 2s/)).toBeVisible();
      await act(() => vi.advanceTimersByTimeAsync(3000));
      expect(screen.getByRole('status')).toHaveTextContent(
        'Waiting for the organizer to start the broadcast.',
      );
      expect(
        screen.queryByText(/Scheduled to start in/),
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders live events, category and date filters, and real empty sections', async () => {
    const api = vi
      .spyOn(apiClient, 'get')
      .mockImplementation((_url, { params }) =>
        Promise.resolve({
          data:
            params.availability === 'live'
              ? [
                  {
                    id: '123',
                    slug: 'feature-event',
                    title: 'Festival discussion',
                    organizer: 'Festival crew',
                    broadcast: 'live',
                    category: 'cultural',
                    startAt: '2026-11-26T14:00:00Z',
                    timeZone: 'Asia/Kolkata',
                  },
                ]
              : [],
          pagination: { totalPages: 1 },
        }),
      );
    try {
      renderLive(<LiveDirectory />);
      expect(
        await screen.findByRole('link', { name: 'Festival discussion' }),
      ).toHaveAttribute('href', '/live/feature-event');
      expect(screen.getByText('LIVE', { exact: true })).toBeVisible();
      expect(screen.queryByRole('region', { name: 'Replays' })).toBeNull();
      expect(screen.getByRole('link', { name: 'Replays' })).toHaveAttribute(
        'href',
        '/live?view=replays',
      );
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'Filters' }));
      expect(screen.getByLabelText('From date (UTC)')).toBeVisible();
      expect(screen.getByLabelText('Category')).toBeVisible();
      expect(
        await screen.findByText('No upcoming events are scheduled.'),
      ).toBeVisible();
    } finally {
      api.mockRestore();
    }
  });

  it('shows reconnect status, disables sending, and renders stored chat as plain text', async () => {
    const text = '<img src=x onerror=alert(1)>';
    const api = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: {
        messages: [
          {
            id: 'abc',
            name: 'Guest display',
            text,
            createdAt: '2026-11-26T14:00:00Z',
          },
        ],
      },
    });
    try {
      renderLive(
        <LiveChat
          event={{ slug: 'fixture', broadcast: 'live' }}
          account={{ status: 'active', emailVerified: true }}
          realtime={{
            connection: 'Disconnected. Reconnecting…',
            incoming: [],
            removed: [],
            send: vi.fn(),
            retry: vi.fn(),
          }}
        />,
      );
      expect(await screen.findByText(text)).toBeVisible();
      const chat = screen.getByRole('region', { name: 'Event chat' });
      expect(
        within(chat).getByText('Disconnected. Reconnecting…'),
      ).toBeVisible();
      expect(
        within(chat).getByRole('button', { name: 'Reconnect' }),
      ).toBeVisible();
      expect(within(chat).getByRole('button', { name: 'Send' })).toBeDisabled();
      expect(within(chat).queryByRole('img')).not.toBeInTheDocument();
    } finally {
      api.mockRestore();
    }
  });
});
