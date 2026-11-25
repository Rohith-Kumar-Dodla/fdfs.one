import { useEffect, useRef, useState } from 'react';
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

function Embed({ id, title, onPlaybackState }) {
  const host = useRef(null);
  const callbacks = useRef({});
  const [state, setState] = useState('loading');
  useEffect(() => {
    callbacks.current = { title, onPlaybackState };
  }, [title, onPlaybackState]);

  useEffect(() => {
    const container = host.current;
    const frame = document.createElement('iframe');
    frame.title = callbacks.current.title;
    frame.src = youtubeEmbed(id, window.location.origin);
    frame.allowFullscreen = true;
    frame.allow = 'encrypted-media; picture-in-picture';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.className = 'absolute inset-0 size-full border-0';
    container.append(frame);

    let disposed = false;
    let player;
    const timeout = setTimeout(() => setState('error'), 20000);
    const setStatus = (status) => {
      clearTimeout(timeout);
      if (!disposed) setState(status);
    };
    loadPlayerApi()
      .then((YT) => {
        if (disposed) return;
        player = new YT.Player(frame, {
          events: {
            onReady: () => setStatus('ready'),
            onError: () => setStatus('error'),
            onStateChange: ({ data }) => {
              if (!disposed) callbacks.current.onPlaybackState?.(data);
            },
          },
        });
      })
      .catch(() => setStatus('error'));
    return () => {
      disposed = true;
      clearTimeout(timeout);
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

export function YouTubePlayer({
  video,
  title = 'YouTube video',
  onPlaybackState,
}) {
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
      onPlaybackState={onPlaybackState}
    />
  );
}
