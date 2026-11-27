import { PersonalHomeSections } from '../features/personal/Dashboard.jsx';
import { usePersonal } from '../features/personal/api.js';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MoveUpRight } from 'lucide-react';
import { Link } from 'react-router';
import { apiClient } from '../api/client.js';
import { Button } from '../components/ui/Button.jsx';
import { Skeleton } from '../components/ui/states.jsx';
import { Card, Container, SectionHeading } from '../components/ui/surfaces.jsx';
import { useHomepageHero, useSiteSettings } from '../features/site/public.jsx';
import { modules } from '../routes/modules.js';
import { CampaignBanner } from '../features/discovery/Campaign.jsx';
import { ContentRail, HeroCarousel } from '../features/discovery/Carousel.jsx';

function Explore({ settings, heading }) {
  return (
    <section
      id="explore"
      tabIndex={-1}
      aria-labelledby="explore-title"
      className="scroll-mt-24"
    >
      <SectionHeading id="explore-title">
        {heading || 'Explore FDFS'}
      </SectionHeading>
      <ul className="mt-4 grid min-w-0 grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3">
        {modules
          .filter(({ path }) => !settings.hiddenModules.includes(path))
          .map(({ label, path, description, Icon }) => (
            <Card
              as="li"
              className="group relative isolate min-w-0 p-3! transition-colors hover:border-accent/60 sm:p-4!"
              key={path}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="grid size-9 place-items-center rounded-control bg-accent/10 text-accent">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <MoveUpRight
                  aria-hidden="true"
                  className="size-4 text-muted group-hover:text-accent"
                />
              </div>
              <h3 className="font-bold wrap-anywhere sm:text-lg">
                <Link
                  to={path}
                  className="after:absolute after:inset-0 after:rounded-panel focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-focus"
                >
                  {label}
                </Link>
              </h3>
              <p className="mt-1 text-sm text-muted wrap-anywhere">
                {description}
              </p>
            </Card>
          ))}
      </ul>
    </section>
  );
}
const editorial = (settings, hero) => ({
  id: 'editorial',
  title: hero?.title ?? 'For the love of the screen.',
  summary:
    hero?.description ??
    (settings.name === 'FDFS.ONE'
      ? 'Independent films, original stories, live events and the people behind them.'
      : settings.description),
  image: hero?.image ?? settings.brand,
  primary: { label: 'Explore FDFS', href: '#explore' },
  secondary: hero?.featured
    ? { label: hero.featured.title, href: hero.featured.path }
    : !settings.hiddenModules.includes('/cinema')
      ? { label: 'Visit Cinema', href: '/cinema' }
      : undefined,
});
function usable(slides, now) {
  return (slides ?? []).filter(
    (item) => !item.endAt || new Date(item.endAt) > now,
  );
}
export function HomepageDisplay({
  value,
  settings,
  legacy,
  preview = false,
  personal,
  previewSize,
  loading = false,
  serverOffset = 0,
}) {
  const [, setChecked] = useState(0);
  const now = Date.now() + serverOffset;
  useEffect(() => {
    let timer;
    function schedule() {
      clearTimeout(timer);
      if (!value?.nextChangeAt) return;
      const next = Date.parse(value.nextChangeAt) - serverOffset - Date.now();
      if (next >= 0)
        timer = setTimeout(() => setChecked((value) => value + 1), next + 100);
    }
    function refresh() {
      setChecked((value) => value + 1);
      schedule();
    }
    schedule();
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [value?.nextChangeAt, serverOffset]);
  const sections = value?.sections ?? [{ id: 'explore', type: 'explore' }];
  const fallback = editorial(settings, legacy);
  if (!sections.some((section) => section.type === 'explore'))
    fallback.primary = {
      label: 'Explore FDFS',
      href:
        modules.find((module) => !settings.hiddenModules.includes(module.path))
          ?.path ?? '/support',
    };
  return (
    <>
      <HeroCarousel
        slides={usable(value?.slides, now)}
        rotationSeconds={value?.rotationSeconds}
        fallback={fallback}
        preview={preview}
        previewSize={previewSize}
        loading={loading}
      />
      <Container className="grid min-w-0 gap-9 pt-5 pb-12 sm:gap-12 sm:pt-7">
        {(personal?.position === 'after-hero' ||
          (personal?.position === 'after-explore' &&
            !sections.some((row) => row.type === 'explore'))) && (
          <PersonalHomeSections data={personal} />
        )}
        {sections.map((section) => {
          const rail = usable(section.sponsored, now);
          const banners = usable(section.between, now);
          return (
            <div className="grid min-w-0 gap-6" key={section.id}>
              {section.type === 'explore' && (
                <>
                  <Explore settings={settings} heading={section.heading} />
                  {personal?.position === 'after-explore' &&
                    section ===
                      sections.find((row) => row.type === 'explore') && (
                      <PersonalHomeSections data={personal} />
                    )}
                </>
              )}
              {(section.items?.length > 0 || rail.length > 0) && (
                <ContentRail
                  section={{ ...section, sponsored: rail }}
                  preview={preview}
                  previewSize={previewSize}
                />
              )}
              {banners.map((item) => (
                <CampaignBanner
                  item={item}
                  preview={preview}
                  previewSize={previewSize}
                  key={item.id}
                />
              ))}
            </div>
          );
        })}
        {loading && (
          <div
            aria-hidden="true"
            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          >
            {[1, 2, 3, 4].map((item) => (
              <Skeleton
                key={item}
                className="aspect-[2/3] motion-reduce:animate-none"
              />
            ))}
          </div>
        )}
        {personal?.position === 'before-footer' && (
          <PersonalHomeSections data={personal} />
        )}
        {usable(value?.footer, now).map((item) => (
          <CampaignBanner
            item={item}
            preview={preview}
            previewSize={previewSize}
            key={item.id}
          />
        ))}
      </Container>
    </>
  );
}
export default function Home() {
  const personal = usePersonal('/homepage', {
    enabled: true,
    staleTime: 15000,
  });
  const settings = useSiteSettings();
  const query = useQuery({
    queryKey: ['homepage-discovery'],
    queryFn: ({ signal }) =>
      apiClient.get('/homepage', { signal }).then((result) => ({
        value: result.data,
        offset: Date.parse(result.data?.serverNow) - Date.now(),
      })),
    meta: { public: true },
    staleTime: 15000,
    refetchInterval: ({ state }) => {
      const next = Date.parse(state.data?.value?.nextChangeAt);
      if (!Number.isFinite(next)) return 30000;
      return Math.min(
        30000,
        Math.max(250, next - Date.now() - (state.data.offset || 0) + 100),
      );
    },
  });
  const value = Array.isArray(query.data?.value?.slides)
    ? query.data.value
    : undefined;
  const legacy = useHomepageHero(!value && !query.isPending);
  return (
    <>
      <HomepageDisplay
        value={value}
        personal={personal.data}
        loading={!value && query.isPending}
        settings={settings}
        legacy={legacy}
        serverOffset={query.data?.offset || 0}
      />
      {query.isPending && (
        <p role="status" className="sr-only">
          Loading homepage content
        </p>
      )}
      {query.isError && (
        <Container className="pb-6">
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry loading homepage content
          </Button>
        </Container>
      )}
    </>
  );
}
