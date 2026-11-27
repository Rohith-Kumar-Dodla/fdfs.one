import { useId, useRef } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Clapperboard,
  Film,
  Mic,
  Star,
  Users,
} from 'lucide-react';
import { Link } from 'react-router';
import { genres } from '../../../../shared/films.js';
import { professions } from '../../../../shared/talent.js';
import { timestamp } from '../../../../shared/podcasts.js';
import { IconButton } from '../../components/ui/Button.jsx';
import { Skeleton } from '../../components/ui/states.jsx';
import { CatalogueCard, PublicEmpty } from './Catalogue.jsx';
import { CampaignBanner } from '../discovery/Campaign.jsx';

const kinds = {
  independent: Film,
  original: Clapperboard,
  podcasts: Mic,
  reviews: Star,
  talent: Users,
};
export function HomeShelf({ row, loading, error }) {
  const id = useId();
  const rail = useRef(null);
  const portrait = ['reviews', 'talent'].includes(row.key);
  const cards = [...(row.items ?? [])];
  if (row.sponsored?.length)
    cards.splice(Math.min(cards.length, 2), 0, ...row.sponsored);
  function move(direction) {
    rail.current?.scrollBy({
      left: direction * rail.current.clientWidth * 0.82,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  }
  return (
    <section aria-labelledby={id} className="grid min-w-0 gap-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h2
          id={id}
          className="text-xl font-extrabold tracking-tight sm:text-3xl"
        >
          {row.heading}
        </h2>
        <div className="flex flex-wrap items-center gap-1">
          <Link
            className="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-accent hover:underline"
            to={row.more}
            aria-label={'Show More ' + row.heading}
          >
            Show More <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
          {cards.length > 1 && (
            <div className="hidden items-center gap-1 sm:flex">
              <IconButton
                label={'Previous ' + row.heading}
                onClick={() => move(-1)}
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
              </IconButton>
              <IconButton label={'Next ' + row.heading} onClick={() => move(1)}>
                <ArrowRight className="size-4" aria-hidden="true" />
              </IconButton>
            </div>
          )}
        </div>
      </div>
      {loading ? (
        <div
          className="grid grid-cols-2 gap-4 sm:grid-cols-4"
          aria-label={'Loading ' + row.heading}
          role="status"
        >
          {[0, 1, 2, 3].map((tile) => (
            <Skeleton
              key={tile}
              className={portrait ? 'aspect-[2/3]' : 'aspect-video'}
            />
          ))}
        </div>
      ) : !cards.length ? (
        <PublicEmpty
          Icon={kinds[row.key]}
          message={
            error || row.unavailable
              ? 'This section could not load. Please try again shortly.'
              : row.empty
          }
        />
      ) : (
        <ul
          ref={rail}
          aria-label={row.heading}
          tabIndex={0}
          className="flex min-w-0 snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-4"
          onKeyDown={(event) => {
            if (
              event.target !== event.currentTarget ||
              !['ArrowLeft', 'ArrowRight'].includes(event.key)
            )
              return;
            event.preventDefault();
            move(event.key === 'ArrowLeft' ? -1 : 1);
          }}
        >
          {cards.map((item) => (
            <li
              className={
                (portrait
                  ? 'w-36 sm:w-44 xl:w-52'
                  : 'w-[68%] sm:w-[43%] lg:w-[30%] xl:w-[24%]') +
                ' shrink-0 snap-start'
              }
              key={item.id + ':' + (item.placement ?? '')}
            >
              {item.module === 'promotion' ? (
                <CampaignBanner item={item} compact />
              ) : (
                <CatalogueCard
                  title={item.title}
                  path={item.path}
                  image={portrait ? item.image : (item.landscape ?? item.image)}
                  landscape={!portrait}
                  rating={item.rating}
                  description={item.excerpt}
                  status={item.spoiler ? 'Spoiler review' : undefined}
                  metadata={[
                    item.author,
                    item.number != null && 'Episode ' + item.number,
                    item.duration > 0 && timestamp(item.duration),
                    item.runtime > 0 && item.runtime + ' min',
                    (item.genres ?? [])
                      .map((value) => genres[value])
                      .filter(Boolean)
                      .join(', '),
                    (item.professions ?? [])
                      .map((value) => professions[value])
                      .filter(Boolean)
                      .slice(0, 2)
                      .join(', '),
                    (item.guests ?? []).join(', '),
                  ]}
                  save={item}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {row.between?.map((item) => (
        <CampaignBanner key={item.id} item={item} />
      ))}
    </section>
  );
}
