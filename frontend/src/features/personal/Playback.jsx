import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  progressInterval,
  resumeMinimum,
} from '../../../../shared/personal.js';
import { Button } from '../../components/ui/Button.jsx';
import { Spinner } from '../../components/ui/states.jsx';
import { YouTubePlayer } from '../media/YouTubePlayer.jsx';
import { useAuthStore } from '../auth/state.js';
import {
  personalRequest,
  referencePath,
  scopedKey,
  usePersonal,
} from './api.js';

export function playbackTime(seconds) {
  const count = Math.max(0, Math.floor(seconds));
  const values = [
    Math.floor(count / 3600),
    Math.floor(count / 60) % 60,
    count % 60,
  ];
  return (values[0] ? values : [...values.slice(1)])
    .map((n, index) => (index ? String(n).padStart(2, '0') : String(n)))
    .join(':');
}

function PlayerSession({
  path,
  initial,
  offset,
  restart,
  video,
  ref,
  onPosition,
  onReady,
  onUnavailable,
  title,
  generation,
}) {
  const client = useQueryClient();
  const current = useRef({
    revision: initial.revision,
    last: 0,
    started: false,
    flight: false,
    pending: null,
    dirty: false,
    closed: false,
    blocked: false,
    timer: null,
  });
  const [message, setMessage] = useState('');
  const [finished, setFinished] = useState(false);
  const active = useRef(null);
  function send(force = false) {
    const state = current.current;
    if (
      state.blocked ||
      state.flight ||
      !state.dirty ||
      !state.pending ||
      useAuthStore.getState().generation !== generation
    )
      return;
    if (!force && Date.now() - state.last < progressInterval) return;
    const sample = state.pending;
    state.dirty = false;
    state.flight = true;
    state.last = Date.now();
    const { position, duration, ended } = sample;
    personalRequest(path, {
      method: 'put',
      data: {
        source: initial.source,
        videoId: video.providerVideoId,
        epoch: initial.epoch,
        revision: state.revision,
        position,
        duration: duration || undefined,
        ended,
        restart: restart && !state.written,
      },
    })
      .then(
        (data) => {
          state.revision = data.revision;
          state.written = true;
          if (data.throttled) {
            if (state.pending === sample) state.dirty = true;
            return;
          }
          client.setQueryData(
            scopedKey(generation, path, undefined),
            (existing) =>
              existing && {
                ...existing,
                revision: data.revision,
                progress: data.progress,
              },
          );
          void client.invalidateQueries({
            queryKey: scopedKey(generation),
            predicate: (query) =>
              ['/homepage', '/dashboard', '/history', '/continue'].includes(
                query.queryKey[2],
              ),
          });
          if (!state.closed) {
            setMessage('');
            if (data.progress?.completed) setFinished(true);
          }
        },
        (error) => {
          if ([400, 403, 404, 409].includes(error.status)) {
            state.blocked = true;
            if (!state.closed) setMessage(error.message);
            if (error.status === 409)
              void client.invalidateQueries({
                queryKey: scopedKey(generation, path),
              });
            if (error.status === 403)
              void client.invalidateQueries({
                queryKey: scopedKey(generation, '/preferences'),
              });
            return;
          }
          state.dirty = true;
          if (!state.closed)
            setMessage(
              'Playback progress will retry when your connection returns.',
            );
        },
      )
      .finally(() => {
        state.flight = false;
        if (state.dirty && !state.closed && !state.blocked && !state.timer) {
          state.timer = setTimeout(() => {
            state.timer = null;
            active.current?.(true);
          }, 5000);
        }
      });
  }
  active.current = send;
  useEffect(() => {
    const state = current.current;
    state.closed = false;
    const flush = () => active.current?.(true);
    function visibility() {
      if (document.hidden) flush();
    }
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('online', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      state.closed = true;
      clearTimeout(state.timer);
      state.timer = null;
      flush();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('online', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, []);
  function sample(point) {
    const state = current.current;
    if (point.state === 1) state.started = true;
    if (!state.started || state.blocked || ![0, 1, 2].includes(point.state))
      return;
    if (
      point.position < resumeMinimum &&
      initial.progress == null &&
      point.state !== 0
    )
      return;
    const pending = {
      position: point.position,
      duration: point.duration,
      ended: point.state === 0,
    };
    if (
      state.pending?.position === pending.position &&
      state.pending.ended === pending.ended &&
      !state.dirty
    )
      return;
    state.pending = pending;
    state.dirty = true;
    send(point.state === 0 || point.state === 2);
  }
  return (
    <>
      <YouTubePlayer
        ref={ref}
        video={video}
        title={title}
        startAt={offset}
        onPosition={onPosition}
        onReady={onReady}
        onUnavailable={onUnavailable}
        onSample={sample}
      />
      {message && (
        <p role="status" className="text-sm text-muted">
          {message}
        </p>
      )}
      {finished && (
        <p role="status" className="text-sm text-success">
          Marked as watched.
        </p>
      )}
    </>
  );
}

export function ProgressPlayer({ item, ...controls }) {
  const authenticated = useAuthStore(
    (state) => state.status === 'authenticated',
  );
  return authenticated && item?.id ? (
    <TrackedPlayer item={item} {...controls} />
  ) : (
    <YouTubePlayer {...controls} />
  );
}

function TrackedPlayer({
  item,
  video,
  title,
  ref,
  startAt,
  onPosition,
  onReady,
  onUnavailable,
}) {
  const [params] = useSearchParams();
  const [choice, choose] = useState(null);
  const generation = useAuthStore((state) => state.generation);
  const status = useAuthStore((state) => state.status);
  const path = '/progress' + referencePath(item);
  const query = usePersonal(path, { enabled: Boolean(item.id && video) });
  if (status === 'authenticated' && query.isPending)
    return <Spinner label="Checking playback progress" />;
  const data = query.data;
  const saved = data?.progress;
  const available =
    saved && !saved.completed && saved.position >= resumeMinimum;
  const defaultResume = params.get('resume') === '1' && available;
  const offset =
    choice?.mode === 'resume' || (!choice && defaultResume)
      ? Math.floor(saved?.position ?? 0)
      : choice
        ? 0
        : startAt;
  return (
    <>
      {data?.enabled && available && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() =>
              choose({ mode: 'resume', key: (choice?.key ?? 0) + 1 })
            }
          >
            Resume at {playbackTime(saved.position)}
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              choose({ mode: 'restart', key: (choice?.key ?? 0) + 1 })
            }
          >
            Start from beginning
          </Button>
        </div>
      )}
      {data?.enabled ? (
        <PlayerSession
          key={
            generation +
            ':' +
            data.epoch +
            ':' +
            data.source +
            ':' +
            (choice?.key ?? 0)
          }
          initial={data}
          path={path}
          offset={offset}
          restart={
            choice?.mode === 'restart' || (!choice && params.has('start'))
          }
          video={video}
          title={title}
          ref={ref}
          generation={generation}
          onPosition={onPosition}
          onReady={onReady}
          onUnavailable={onUnavailable}
        />
      ) : (
        <YouTubePlayer
          video={video}
          title={title}
          startAt={offset}
          ref={ref}
          onPosition={onPosition}
          onReady={onReady}
          onUnavailable={onUnavailable}
        />
      )}
      {status === 'authenticated' && query.isError && (
        <p role="status" className="text-sm text-muted">
          Saved progress is unavailable for this playback.
        </p>
      )}
      {status === 'authenticated' && data && !data.enabled && (
        <p className="text-sm text-muted">
          Playback history is off.{' '}
          <Link
            to="/account/settings#personalization"
            className="text-accent underline"
          >
            Playback settings
          </Link>
        </p>
      )}
    </>
  );
}
