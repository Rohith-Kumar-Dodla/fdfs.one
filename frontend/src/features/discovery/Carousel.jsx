import { SaveAction } from '../personal/Actions.jsx';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Pause, Play } from 'lucide-react';
import { Link } from 'react-router';
import { sources } from '../../../../shared/homepage.js';
import projector from '../../assets/projector.webp';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { Container } from '../../components/ui/surfaces.jsx';
import { FilmImage } from '../films/FilmImage.jsx';
import {
  CampaignBanner,
  CinematicArtwork,
  Destination,
  useCampaign,
} from './Campaign.jsx';

function usePaused() {
  const [hidden, setHidden] = useState(() => document.hidden);
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const visibility = () => setHidden(document.hidden);
    const preference = () => setReduced(media.matches);
    document.addEventListener('visibilitychange', visibility);
    media.addEventListener('change', preference);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      media.removeEventListener('change', preference);
    };
  }, []);
  return hidden || reduced;
}
export function HeroCarousel({
  slides,
  rotationSeconds,
  fallback,
  preview = false,
  previewSize,
  loading = false,
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const inactive = usePaused();
  const pointer = useRef(null);
  const list = slides.length ? slides : [fallback];
  const current = index % list.length;
  const item = list[current];
  const track = useCampaign(item, !preview);
  function jump(step) {
    setIndex((value) => (value + step + list.length) % list.length);
  }
  useEffect(() => {
    if (
      preview ||
      list.length < 2 ||
      !rotationSeconds ||
      paused ||
      hover ||
      focus ||
      inactive
    )
      return;
    const timer = setInterval(
      () => setIndex((value) => (value + 1) % list.length),
      rotationSeconds * 1000,
    );
    return () => clearInterval(timer);
  }, [list.length, rotationSeconds, paused, hover, focus, inactive, preview]);
  const date =
    item.date &&
    (item.upcoming || item.live
      ? new Date(item.date).toLocaleString()
      : new Date(item.date).toLocaleDateString());
  return (
    <section
      ref={track.node}
      aria-label="Featured on FDFS"
      aria-roledescription="carousel"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocus(false);
      }}
      onKeyDown={(event) => {
        if (list.length < 2) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          jump(event.key === 'ArrowLeft' ? -1 : 1);
        }
      }}
      onTouchStart={(event) => {
        const point = event.touches[0];
        pointer.current = { x: point.clientX, y: point.clientY };
      }}
      onTouchEnd={(event) => {
        if (!pointer.current) return;
        const point = event.changedTouches[0];
        const dx = point.clientX - pointer.current.x;
        const dy = point.clientY - pointer.current.y;
        pointer.current = null;
        if (
          list.length > 1 &&
          Math.abs(dx) > 55 &&
          Math.abs(dx) > Math.abs(dy) * 1.4
        )
          jump(dx < 0 ? 1 : -1);
      }}
      className="relative isolate grid min-w-0 content-end overflow-hidden bg-nav"
    >
      <CinematicArtwork
        image={
          previewSize === 'mobile' ? (item.mobile ?? item.image) : item.image
        }
        mobile={previewSize ? undefined : item.mobile}
        fallback={loading ? undefined : projector}
        alt={item.alt ?? item.image?.alt ?? ''}
        position={item.focal}
        priority={current === 0}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-linear-to-t from-[#111827] via-[#111827]/75 to-[#111827]/10 sm:bg-linear-to-r sm:from-[#111827] sm:via-[#111827]/80 sm:to-[#111827]/10"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-[#111827] to-transparent"
      />
      <Container className="relative grid min-h-[26rem] content-end gap-6 pt-28 pb-8 sm:min-h-[32rem] sm:pt-36 sm:pb-10">
        <div
          role="group"
          aria-roledescription="slide"
          aria-label={current + 1 + ' of ' + list.length}
          className="grid max-w-[42rem] min-w-0 gap-3 wrap-anywhere"
        >
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-accent">
            {item.sponsor ? (
              <span>Sponsored by {item.sponsor}</span>
            ) : (
              sources[item.module]?.label && (
                <span>{sources[item.module].label}</span>
              )
            )}
            {item.live && (
              <span className="rounded-control bg-red-700 px-2 py-1 font-bold tracking-wide text-white">
                LIVE
              </span>
            )}
            {item.upcoming && <span>Upcoming</span>}
            {date && (
              <time dateTime={item.date} className="text-gray-300">
                {date}
              </time>
            )}
            {item.runtime && (
              <span className="text-gray-300">{item.runtime} min</span>
            )}
          </p>
          {preview ? (
            <h2 className="text-3xl font-extrabold sm:text-5xl">
              {item.title}
            </h2>
          ) : (
            <h1 className="text-[clamp(2.5rem,8vw,5rem)] leading-[1.02] font-extrabold tracking-[-.055em]">
              {item.title}
            </h1>
          )}
          {item.summary && (
            <p className="max-w-[58ch] text-base leading-relaxed text-gray-200 sm:text-lg">
              {item.summary}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Destination action={item.primary} click={track.click} />
            <Destination
              action={item.secondary}
              click={track.click}
              style="outline"
            />
          </div>
        </div>
        {list.length > 1 && (
          <div className="flex min-w-0 flex-wrap items-center gap-1 rounded-panel">
            <IconButton
              label="Previous slide"
              variant="outline"
              onClick={() => jump(-1)}
            >
              <ArrowLeft aria-hidden="true" className="size-5" />
            </IconButton>
            {list.map((slide, i) => (
              <Button
                variant="ghost"
                key={slide.id + '-' + i}
                aria-label={'Show slide ' + (i + 1)}
                aria-current={i === current ? 'true' : undefined}
                className="min-w-9 px-1!"
                onClick={() => setIndex(i)}
              >
                <span
                  className={
                    'h-1.5 rounded-full ' +
                    (i === current ? 'w-6 bg-accent' : 'w-3 bg-gray-400')
                  }
                />
              </Button>
            ))}
            <IconButton
              label="Next slide"
              variant="outline"
              onClick={() => jump(1)}
            >
              <ArrowRight aria-hidden="true" className="size-5" />
            </IconButton>
            {rotationSeconds > 0 && !preview && (
              <IconButton
                label={paused ? 'Resume slideshow' : 'Pause slideshow'}
                variant="outline"
                onClick={() => setPaused(!paused)}
              >
                {paused ? (
                  <Play aria-hidden="true" className="size-4" />
                ) : (
                  <Pause aria-hidden="true" className="size-4" />
                )}
              </IconButton>
            )}
            <span
              className="sr-only"
              aria-live={paused || focus || !rotationSeconds ? 'polite' : 'off'}
            >
              Slide {current + 1} of {list.length}
            </span>
          </div>
        )}
      </Container>
    </section>
  );
}
function RailItem({ item, layout, preview, previewSize }) {
  if (item.module === 'promotion')
    return (
      <CampaignBanner
        item={item}
        compact
        preview={preview}
        previewSize={previewSize}
      />
    );
  const landscape =
    layout === 'landscape' ||
    (layout === 'auto' && sources[item.module]?.shape === 'landscape');
  const square =
    item.group === 'genre' ||
    layout === 'portrait' ||
    sources[item.module]?.shape === 'portrait';
  return (
    <Link
      to={item.path}
      className="group grid h-full min-w-0 content-start gap-2 overflow-hidden rounded-panel border border-line bg-surface focus-visible:ring-2 focus-visible:ring-accent"
    >
      <FilmImage
        image={landscape ? (item.landscape ?? item.image) : item.image}
        landscape={landscape}
        square={square}
        sizes={
          landscape
            ? '(min-width: 960px) 280px, 68vw'
            : '(min-width: 960px) 200px, 45vw'
        }
      />
      <div className="grid min-w-0 gap-1 px-3 pb-3 wrap-anywhere">
        {item.live && (
          <span className="text-xs font-bold text-red-400">LIVE</span>
        )}
        {item.upcoming && (
          <span className="text-xs font-semibold text-accent">
            Upcoming
            {item.date ? ' · ' + new Date(item.date).toLocaleString() : ''}
          </span>
        )}
        <h3 className="font-semibold group-hover:text-accent">{item.title}</h3>
        {item.count !== undefined && (
          <p className="text-sm text-muted">
            {item.count} {item.count === 1 ? 'title' : 'titles'}
          </p>
        )}
        {!item.upcoming && item.date && (
          <p className="text-xs text-muted">
            {new Date(item.date).toLocaleDateString()}
          </p>
        )}
        {item.likes !== undefined && (
          <p className="text-xs text-muted">
            {item.likes} likes · {item.comments} comments
          </p>
        )}
      </div>
    </Link>
  );
}
export function ContentRail({ section, preview = false, previewSize }) {
  const rail = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const rows = [...section.items];
  if (section.sponsored?.length)
    rows.splice(Math.min(2, rows.length), 0, ...section.sponsored);
  const grid = section.layout === 'grid';
  useEffect(() => {
    const node = rail.current;
    if (!node || grid) return;
    const refresh = () =>
      setEdges({
        start: node.scrollLeft < 4,
        end: node.scrollLeft + node.clientWidth >= node.scrollWidth - 4,
      });
    const resize = new ResizeObserver(refresh);
    resize.observe(node);
    node.addEventListener('scroll', refresh, { passive: true });
    refresh();
    return () => {
      resize.disconnect();
      node.removeEventListener('scroll', refresh);
    };
  }, [rows.length, grid]);
  function step(direction) {
    const node = rail.current;
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    node.scrollBy({
      left: node.clientWidth * 0.8 * direction,
      behavior: reduced ? 'instant' : 'smooth',
    });
  }
  return (
    <section
      aria-labelledby={'row-' + section.id}
      className="grid min-w-0 gap-3"
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h2
          id={'row-' + section.id}
          className="min-w-0 text-xl font-bold wrap-anywhere sm:text-2xl"
        >
          {section.heading}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {section.more && (
            <Link
              to={section.more}
              className="inline-flex min-h-11 items-center px-1 text-sm font-semibold text-accent underline"
            >
              View all<span className="sr-only"> {section.heading}</span>
            </Link>
          )}
          {!grid && (
            <>
              <IconButton
                label={'Previous ' + section.heading}
                variant="outline"
                disabled={edges.start}
                onClick={() => step(-1)}
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
              </IconButton>
              <IconButton
                label={'Next ' + section.heading}
                variant="outline"
                disabled={edges.end}
                onClick={() => step(1)}
              >
                <ArrowRight aria-hidden="true" className="size-4" />
              </IconButton>
            </>
          )}
        </div>
      </div>
      {section.description && (
        <p className="text-sm text-muted">{section.description}</p>
      )}
      <ul
        ref={rail}
        tabIndex={grid ? undefined : 0}
        aria-label={section.heading}
        onKeyDown={(event) => {
          if (
            event.target === event.currentTarget &&
            (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
          ) {
            event.preventDefault();
            step(event.key === 'ArrowLeft' ? -1 : 1);
          }
        }}
        className={
          grid
            ? 'grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5'
            : 'flex min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-3'
        }
      >
        {rows.map((item) => (
          <li
            key={item.id + (item.placement ?? '')}
            className={
              grid
                ? 'min-w-0'
                : 'w-[46%] min-w-0 max-w-56 shrink-0 snap-start sm:w-[29%] ' +
                  (section.layout === 'landscape' ||
                  sources[item.module]?.shape === 'landscape'
                    ? 'lg:max-w-72'
                    : '')
            }
          >
            <RailItem
              item={item}
              layout={section.layout}
              preview={preview}
              previewSize={previewSize}
            />
            {!preview && (
              <div className="mt-1">
                <SaveAction item={item} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
