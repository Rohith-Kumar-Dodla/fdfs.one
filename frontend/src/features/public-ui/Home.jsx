import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  publicHeroLimit,
  publicHomeSections,
} from '../../../../shared/public-home.js';
import { homepageQuery } from './home-query.js';
import { Container } from '../../components/ui/surfaces.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { HeroCarousel } from '../discovery/Carousel.jsx';
import { CampaignBanner } from '../discovery/Campaign.jsx';
import { useSiteSettings } from '../site/public.jsx';
import { HomeShelf } from './ContentShelves.jsx';

export default function PublicHome() {
  const settings = useSiteSettings();
  const query = useQuery(homepageQuery);
  const data = query.data;
  const offset = data?.clockOffset ?? 0;
  const [, refresh] = useState(0);
  useEffect(() => {
    const expiry = Date.parse(data?.nextChangeAt);
    const remaining = expiry - Date.now() - offset;
    if (!Number.isFinite(remaining) || remaining < 0 || remaining > 2147483647)
      return;
    const timer = setTimeout(
      () => refresh((value) => value + 1),
      remaining + 110,
    );
    return () => clearTimeout(timer);
  }, [data?.nextChangeAt, offset]);
  const eligible = (items) =>
    (items ?? []).filter(
      (item) => !item.endAt || Date.parse(item.endAt) > Date.now() + offset,
    );
  return (
    <>
      <EntertainmentHome
        value={data}
        settings={settings}
        eligible={eligible}
        loading={query.isPending}
        error={query.isError}
      />
      {query.isError && (
        <Container className="pb-8">
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry homepage
          </Button>
        </Container>
      )}
    </>
  );
}

export function EntertainmentHome({
  value: data,
  settings,
  eligible = (items) => items ?? [],
  loading,
  error,
  preview,
  previewSize,
}) {
  const slides = Array.isArray(data?.slides)
    ? eligible(data.slides).slice(0, publicHeroLimit)
    : [];
  const fallback = {
    id: 'fdfs-home-empty',
    title: settings.name,
    image: settings.brand,
  };
  return (
    <>
      <HeroCarousel
        slides={slides}
        rotationSeconds={data?.rotationSeconds}
        fallback={fallback}
        loading={loading}
        preview={preview}
        previewSize={previewSize}
        editorial
      />
      <Container className="grid max-w-[112rem]! min-w-0 gap-10 pt-7 pb-12 sm:gap-12">
        {publicHomeSections.map((section) => {
          const row = data?.sections?.find(
            (value) => value.key === section.key,
          );
          return (
            <HomeShelf
              key={section.key}
              loading={loading}
              error={error}
              preview={preview}
              previewSize={previewSize}
              row={{
                ...section,
                ...row,
                items: row?.items ?? [],
                sponsored: eligible(row?.sponsored),
                above: eligible(row?.above),
                between: eligible(row?.between),
              }}
            />
          );
        })}
        {eligible(data?.footer).map((item) => (
          <CampaignBanner
            key={item.id}
            item={item}
            preview={preview}
            previewSize={previewSize}
          />
        ))}
      </Container>
    </>
  );
}
