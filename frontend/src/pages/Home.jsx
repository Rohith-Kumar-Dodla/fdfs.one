import { ArrowDown, ArrowRight, MoveUpRight } from 'lucide-react';
import { Link } from 'react-router';
import projector from '../assets/projector.webp';
import { buttonClasses } from '../components/ui/Button.jsx';
import { Card, Container, SectionHeading } from '../components/ui/surfaces.jsx';
import { useHomepageHero, useSiteSettings } from '../features/site/public.jsx';
import { modules } from '../routes/modules.js';

export default function Home() {
  const settings = useSiteSettings();
  const hero = useHomepageHero();
  const image = hero?.image ?? settings.brand;
  return (
    <>
      <Container
        as="section"
        aria-labelledby="home-title"
        className="grid items-center gap-9 pt-10 pb-14 sm:pt-14 sm:pb-16 lg:grid-cols-[0.92fr_1.08fr] lg:gap-12 lg:pt-16 lg:pb-[4.5rem]"
      >
        <div>
          <p className="mb-5 flex items-center gap-3 text-xs font-bold tracking-[0.2em] text-accent uppercase">
            <span aria-hidden="true" className="h-px w-8 bg-accent" /> Film,
            culture &amp; community
          </p>
          <h1
            id="home-title"
            className="text-[clamp(2.75rem,13vw,3.5rem)] leading-[0.98] font-extrabold tracking-[-0.065em] lg:text-[clamp(3.5rem,5.5vw,4.75rem)]"
          >
            {hero?.title ? (
              <span className="wrap-anywhere">{hero.title}</span>
            ) : (
              <>
                <span className="block">For the love of</span>{' '}
                <span className="block text-accent">the screen.</span>
              </>
            )}
          </h1>
          <p className="mt-6 max-w-[40ch] text-base leading-relaxed text-muted sm:text-lg">
            {hero?.description ??
              (settings.name !== 'FDFS.ONE'
                ? settings.description
                : 'FDFS.ONE is a home for independent cinema, original films and the people who bring stories to life. Explore podcasts, live events and film reviews.')}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="#explore" className={buttonClasses('primary')}>
              Explore FDFS <ArrowDown aria-hidden="true" className="size-4" />
            </Link>
            {(hero?.featured ||
              !settings.hiddenModules.includes('/cinema')) && (
              <Link
                to={hero?.featured?.path ?? '/cinema'}
                className={buttonClasses('outline')}
              >
                {hero?.featured?.title ?? 'Visit Cinema'}{' '}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            )}
          </div>
        </div>
        <div className="hero-image relative isolate aspect-[1.4] overflow-hidden rounded-panel border border-line">
          <img
            src={image?.url ?? projector}
            alt={image?.alt ?? ''}
            srcSet={image?.variants
              ?.map(({ url, width }) => url + ' ' + width + 'w')
              .join(', ')}
            sizes="(min-width:1024px) 600px, 100vw"
            fetchPriority="high"
            className="absolute inset-0 size-full object-cover object-center"
          />
          <span
            aria-hidden="true"
            className="absolute inset-3 z-10 rounded-control border border-accent/30"
          />
        </div>
      </Container>
      <section
        id="explore"
        tabIndex={-1}
        aria-labelledby="explore-title"
        className="scroll-mt-5 border-t border-line bg-nav/30"
      >
        <Container className="py-11 sm:py-14">
          <SectionHeading id="explore-title">Explore FDFS</SectionHeading>
          <ul className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modules
              .filter(({ path }) => !settings.hiddenModules.includes(path))
              .map(({ label, path, description, Icon }) => (
                <Card
                  as="li"
                  className="group relative isolate transition-colors hover:border-accent/60"
                  key={path}
                >
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <span className="grid size-10 place-items-center rounded-control bg-accent/10 text-accent">
                      <Icon aria-hidden="true" className="size-5" />
                    </span>
                    <MoveUpRight
                      aria-hidden="true"
                      className="size-4 text-muted transition-colors group-hover:text-accent"
                    />
                  </div>
                  <h3 className="text-xl font-bold tracking-tight">
                    <Link
                      to={path}
                      className="after:absolute after:inset-0 after:rounded-panel focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-focus"
                    >
                      {label}
                    </Link>
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {description}
                  </p>
                </Card>
              ))}
          </ul>
        </Container>
      </section>
    </>
  );
}
