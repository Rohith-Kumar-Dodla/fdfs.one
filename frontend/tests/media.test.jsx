import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { YouTubePlayer } from '../src/features/media/YouTubePlayer.jsx';

const video = {
  provider: 'youtube',
  providerVideoId: 'AbCdEf123_-',
  availability: 'unknown',
};

afterEach(() => {
  delete window.YT;
});

it('loads a trusted privacy-enhanced embed and relays playback events', async () => {
  const onPlaybackState = vi.fn();
  window.YT = {
    Player: class {
      constructor(frame, options) {
        expect(frame).toHaveAttribute('allowfullscreen');
        options.events.onReady();
        options.events.onStateChange({ data: 1 });
      }
      destroy() {}
    },
  };
  render(
    <YouTubePlayer
      video={video}
      title="Fixture video"
      onPlaybackState={onPlaybackState}
    />,
  );
  expect(screen.getByRole('status')).toHaveTextContent('Loading video player');
  const frame = screen.getByTitle('Fixture video');
  const source = new URL(frame.src);
  expect(source.origin + source.pathname).toBe(
    'https://www.youtube-nocookie.com/embed/AbCdEf123_-',
  );
  expect(source.searchParams.has('autoplay')).toBe(false);
  await waitFor(() =>
    expect(screen.queryByRole('status')).not.toBeInTheDocument(),
  );
  expect(onPlaybackState).toHaveBeenCalledWith(1);
});

it('shows a fallback when YouTube prohibits embedding', async () => {
  window.YT = {
    Player: class {
      constructor(frame, options) {
        options.events.onError({ data: 101 });
      }
      destroy() {}
    },
  };
  render(<YouTubePlayer video={video} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('could not play');
  expect(screen.getByRole('link', { name: 'Open on YouTube' })).toHaveAttribute(
    'href',
    'https://www.youtube.com/watch?v=AbCdEf123_-',
  );
});

it('does not embed an unavailable or invalid video', () => {
  const { container } = render(
    <YouTubePlayer video={{ ...video, availability: 'unavailable' }} />,
  );
  expect(screen.getByRole('status')).toHaveTextContent('Video unavailable');
  expect(container.querySelector('iframe')).toBeNull();
});
