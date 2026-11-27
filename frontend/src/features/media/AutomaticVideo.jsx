import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { parseYouTube } from '../../../../shared/youtube.js';
import { protectedRequest } from '../auth/api.js';
import { Button } from '../../components/ui/Button.jsx';
import { control } from '../admin/common.jsx';

export function useDebouncedValue(value, delay = 400) {
  const [current, setCurrent] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setCurrent(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return current;
}

export function useAutomaticVideo(module, url) {
  const id = parseYouTube(url.trim())?.providerVideoId;
  const debounced = useDebouncedValue(id);
  const query = useQuery({
    queryKey: ['admin-video-metadata', module, debounced],
    enabled: Boolean(debounced && id === debounced),
    retry: false,
    staleTime: 10 * 60 * 1000,
    queryFn: ({ signal }) =>
      protectedRequest({
        url: '/admin/youtube-metadata',
        method: 'post',
        timeout: 10000,
        data: {
          module,
          source: 'https://www.youtube.com/watch?v=' + debounced,
        },
        signal,
      }).then(({ data }) => data),
  });
  const current = id && id === debounced;
  const metadata = current && query.data?.id === id ? query.data : undefined;
  return {
    metadata,
    artwork: metadata?.thumbnails?.[0],
    id,
    pending: Boolean(id && (!current || query.isPending)),
    error: current && query.error,
    retry: query.refetch,
  };
}

export function VideoPreview({ video, duration = false, label = true }) {
  const { metadata, artwork, pending, error, retry } = video;
  if (!video.id) return null;
  const seconds = metadata?.durationSeconds;
  return (
    <div
      aria-label="YouTube preview"
      className="grid gap-2 rounded-control border border-line p-3"
    >
      {pending && (
        <p role="status" className="text-sm text-muted">
          Looking up YouTube details…
        </p>
      )}
      {error && (
        <div className="flex flex-wrap items-center gap-2">
          <p role="status" className="text-sm text-muted">
            {error.message}
          </p>
          <Button variant="outline" onClick={() => void retry()}>
            Retry lookup
          </Button>
        </div>
      )}
      {metadata && (
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {artwork && (
            <img
              src={artwork.url}
              alt="YouTube thumbnail"
              className="w-36 rounded-control"
            />
          )}
          <div className="grid min-w-0 gap-1 text-sm wrap-anywhere">
            {label && <p className="font-semibold">{metadata.title}</p>}
            {duration && (
              <p>
                {seconds
                  ? Math.floor(seconds / 60) + ' min ' + (seconds % 60) + ' sec'
                  : 'Duration unavailable'}
              </p>
            )}
            {metadata.embeddable === false && (
              <p className="text-danger-text">
                YouTube reports that embedding is disabled.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function VideoURL({ value, change, label = 'YouTube video URL' }) {
  return (
    <label className="grid gap-1 text-sm">
      {label}
      <input
        className={control}
        type="url"
        value={value}
        onChange={(event) => change(event.target.value)}
        maxLength={2048}
        required
      />
    </label>
  );
}

function SupportingVideo({ module, item, change, remove }) {
  const video = useAutomaticVideo(module, item.url);
  useEffect(() => {
    change(
      item.id,
      video.metadata?.title,
      video.artwork?.key,
      undefined,
      video.pending,
    );
  }, [
    change,
    item.id,
    video.metadata?.title,
    video.artwork?.key,
    video.pending,
  ]);
  return (
    <div className="grid gap-2">
      <VideoURL
        label="Supporting YouTube URL"
        value={item.url}
        change={(url) => change(item.id, undefined, undefined, url)}
      />
      <VideoPreview video={video} />
      <Button variant="outline" className="w-fit" onClick={remove}>
        Remove video
      </Button>
    </div>
  );
}

export function SupportingVideos({ module, items, update }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="font-semibold">Supporting videos</legend>
      {items.map((item) => (
        <SupportingVideo
          key={item.id}
          module={module}
          item={item}
          change={update.change}
          remove={() => update.remove(item.id)}
        />
      ))}
      {items.length < 5 && (
        <Button variant="outline" className="w-fit" onClick={update.add}>
          Add video URL
        </Button>
      )}
    </fieldset>
  );
}
