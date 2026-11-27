import { useRef, useState } from 'react';
import { timestamp } from '../../../../shared/podcasts.js';
import { Button } from '../../components/ui/Button.jsx';
import { ProgressPlayer } from '../personal/Playback.jsx';

export function EpisodePlayer({ episode, openMain = false }) {
  const [selection, choose] = useState(() =>
    openMain && episode.mainVideo
      ? { kind: 'main', start: 0, attempt: 1 }
      : null,
  );
  const [position, setPosition] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const pending = useRef(null);
  const player = useRef(null);
  const main =
    episode.mainVideo?.availability !== 'unavailable'
      ? episode.mainVideo
      : null;
  const chapters = episode.chapters ?? [];
  const chapter = chapters.findLast(({ start }) => start <= position);
  const selectedVideo = selection?.kind === 'main' ? main : episode.teaser;

  function select(kind, start = 0) {
    pending.current = null;
    setUnavailable(false);
    setPosition(start);
    choose((previous) => ({
      kind,
      start,
      attempt: (previous?.attempt ?? 0) + 1,
    }));
  }
  function seek(seconds) {
    if (selection?.kind !== 'main') {
      select('main', seconds);
      return;
    }
    if (!player.current?.seekTo(seconds)) pending.current = seconds;
    setPosition(seconds);
  }
  if (!main && !episode.teaser)
    return episode.mainVideo ? (
      <p role="status">Episode video unavailable.</p>
    ) : null;
  return (
    <section
      id="playback"
      tabIndex={-1}
      className="grid min-w-0 scroll-mt-24 gap-4"
      aria-label="Episode playback"
    >
      <div className="flex flex-wrap gap-2">
        {main && (
          <Button
            variant={selection?.kind === 'main' ? 'primary' : 'outline'}
            aria-pressed={selection?.kind === 'main'}
            onClick={() => {
              if (selection?.kind !== 'main' || unavailable) select('main');
            }}
          >
            Watch episode
          </Button>
        )}
        {episode.teaser && (
          <Button
            variant={selection?.kind === 'teaser' ? 'primary' : 'outline'}
            aria-pressed={selection?.kind === 'teaser'}
            onClick={() => {
              if (selection?.kind !== 'teaser' || unavailable) select('teaser');
            }}
          >
            Watch teaser
          </Button>
        )}
      </div>
      {selection && (
        <ProgressPlayer
          item={
            selection.kind === 'main'
              ? { id: episode.id, module: 'podcasts' }
              : undefined
          }
          key={selection.attempt}
          ref={player}
          video={selectedVideo}
          title={episode.title + (selection.kind === 'teaser' ? ' teaser' : '')}
          startAt={selection.start}
          onPosition={selection.kind === 'main' ? setPosition : undefined}
          onReady={() => {
            setUnavailable(false);
            if (
              pending.current !== null &&
              player.current?.seekTo(pending.current)
            )
              pending.current = null;
          }}
          onUnavailable={() => setUnavailable(true)}
        />
      )}
      {main && chapters.length > 0 && (
        <section className="grid gap-3" aria-label="Episode chapters">
          <h2 className="text-xl font-semibold">Chapters</h2>
          <ol className="divide-y divide-line">
            {chapters.map((entry) => (
              <li key={entry.start} className="py-2">
                <Button
                  variant={
                    selection?.kind === 'main' && chapter?.start === entry.start
                      ? 'primary'
                      : 'outline'
                  }
                  aria-current={
                    selection?.kind === 'main' && chapter?.start === entry.start
                      ? 'true'
                      : undefined
                  }
                  className="max-w-full whitespace-normal wrap-anywhere"
                  disabled={unavailable && selection?.kind === 'main'}
                  onClick={() => seek(entry.start)}
                >
                  {timestamp(entry.start)} · {entry.title}
                </Button>
                {entry.description && (
                  <p className="mt-2 text-sm text-muted wrap-anywhere">
                    {entry.description}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </section>
  );
}
