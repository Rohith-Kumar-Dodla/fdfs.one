import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { isYouTubeId, youtubeEmbed } from '../../../../shared/youtube.js';
import { Spinner } from '../../components/ui/states.jsx';

let api;
function loadPlayerApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (api) return api;
  api = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const previous = window.onYouTubeIframeAPIReady;
    const timeout = setTimeout(fail, 12000);
    function finish() {
      clearTimeout(timeout);
      if (window.onYouTubeIframeAPIReady === ready)
        window.onYouTubeIframeAPIReady = previous;
    }
    function fail() {
      finish();
      script.remove();
      reject(new Error('YouTube player could not load'));
    }
    function ready() {
      finish();
      resolve(window.YT);
      previous?.();
    }
    window.onYouTubeIframeAPIReady = ready;
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = fail;
    document.head.append(script);
  }).catch((error) => {
    api = undefined;
    throw error;
  });
  return api;
}

function Embed({
  id,
  title,
  onPlaybackState,
  onPosition,
  onReady,
  onUnavailable,
  startAt,
  ref,
}) {
  const host = useRef(null);
  const callbacks = useRef({});
  const control = useRef(null);
  const initialStart = useRef(startAt);
  const [state, setState] = useState('loading');
  useImperativeHandle(
    ref,
    () => ({
      seekTo(seconds) {
        if (!control.current || !Number.isFinite(seconds) || seconds < 0)
          return false;
        control.current.seekTo(seconds, true);
        callbacks.current.onPosition?.(seconds);
        return true;
      },
    }),
    [],
  );
  useEffect(() => {
    callbacks.current = {
      title,
      onPlaybackState,
      onPosition,
      onReady,
      onUnavailable,
    };
  }, [title, onPlaybackState, onPosition, onReady, onUnavailable]);

  useEffect(() => {
    const container = host.current;
    const frame = document.createElement('iframe');
    frame.title = callbacks.current.title;
    const src = new URL(youtubeEmbed(id, window.location.origin));
    if (Number.isInteger(initialStart.current) && initialStart.current > 0)
      src.searchParams.set('start', String(initialStart.current));
    frame.src = src.href;
    frame.allowFullscreen = true;
    frame.allow = 'encrypted-media; picture-in-picture';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.className = 'absolute inset-0 size-full border-0';
    container.append(frame);

    let disposed = false;
    let player;
    let ticker;
    function readPosition() {
      if (!callbacks.current.onPosition) return;
      const seconds = control.current?.getCurrentTime?.();
      if (Number.isFinite(seconds)) callbacks.current.onPosition(seconds);
    }
    const timeout = setTimeout(() => setStatus('error'), 20000);
    const setStatus = (status) => {
      clearTimeout(timeout);
      if (disposed) return;
      if (status === 'error') {
        clearInterval(ticker);
        control.current = null;
        callbacks.current.onUnavailable?.();
      }
      setState(status);
    };
    loadPlayerApi()
      .then((YT) => {
        if (disposed) return;
        player = new YT.Player(frame, {
          events: {
            onReady: ({ target } = {}) => {
              if (disposed) return;
              control.current = target ?? player;
              setStatus('ready');
              callbacks.current.onReady?.();
            },
            onError: () => setStatus('error'),
            onStateChange: ({ data }) => {
              if (disposed) return;
              callbacks.current.onPlaybackState?.(data);
              window.dispatchEvent(
                new CustomEvent('fdfs:playback', { detail: data }),
              );
              clearInterval(ticker);
              readPosition();
              if (data === 1 && callbacks.current.onPosition)
                ticker = setInterval(readPosition, 750);
            },
          },
        });
      })
      .catch(() => setStatus('error'));

    return () => {
      disposed = true;
      window.dispatchEvent(new CustomEvent('fdfs:playback', { detail: -1 }));
      clearTimeout(timeout);
      clearInterval(ticker);
      control.current = null;
      player?.destroy();
      frame.remove();
    };
  }, [id]);

  return (
    <>
      <div
        ref={host}
        hidden={state === 'error'}
        className="relative aspect-video min-h-[200px] w-full overflow-hidden rounded-panel bg-nav"
      />
      {state === 'loading' && <Spinner label="Loading video player" />}
      {state === 'error' && (
        <p role="alert" className="text-sm text-danger-text">
          This video could not play in the embedded player.
        </p>
      )}
      <a
        className="inline-flex min-h-11 items-center text-accent underline"
        href={'https://www.youtube.com/watch?v=' + id}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open on YouTube
      </a>
    </>
  );
}

export function YouTubePlayer({ video, title = 'YouTube video', ...controls }) {
  if (
    video?.provider !== 'youtube' ||
    !isYouTubeId(video.providerVideoId) ||
    video.availability === 'unavailable'
  ) {
    return <p role="status">Video unavailable.</p>;
  }
  return (
    <Embed
      key={video.providerVideoId}
      id={video.providerVideoId}
      title={title}
      {...controls}
    />
  );
}
