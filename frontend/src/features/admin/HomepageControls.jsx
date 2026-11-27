import { useQuery } from '@tanstack/react-query';
import {
  publicHeroLimit,
  publicHomeSections,
} from '../../../../shared/public-home.js';
import { useState } from 'react';
import { genres } from '../../../../shared/films.js';
import { reviewGenres } from '../../../../shared/reviews.js';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/surfaces.jsx';
import {
  ArtworkField,
  ContentPicker,
  Field,
  PromotionDates,
} from './SiteFields.jsx';
import { control, get } from './common.jsx';

const heroModules = ['independent', 'original', 'podcasts', 'live'];

const genreLabels = { ...genres, ...reviewGenres };
export function Choice({ label, value, onChange, options }) {
  return (
    <label className="grid gap-1 text-sm">
      {label}
      <select
        className={control}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([key, title]) => (
          <option key={key} value={key}>
            {title}
          </option>
        ))}
      </select>
    </label>
  );
}
export function OrderButtons({ index, total, move, remove }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        disabled={index === 0}
        onClick={() => move(index - 1)}
      >
        Move up
      </Button>
      <Button
        variant="outline"
        disabled={index === total - 1}
        onClick={() => move(index + 1)}
      >
        Move down
      </Button>
      <Button variant="outline" onClick={remove}>
        Remove
      </Button>
    </div>
  );
}
export const reordered = (rows, index, target) =>
  rows.map((row, i) =>
    i === index ? rows[target] : i === target ? rows[index] : row,
  );
export const focalOptions = ['center', 'top', 'bottom', 'left', 'right'].map(
  (value) => [value, value],
);
function Slide({ row, update, titles }) {
  const [images, setImages] = useState({});
  if (row.campaignId)
    return (
      <p className="text-sm">
        {titles[row.campaignId] ?? 'Campaign ' + row.campaignId}
      </p>
    );
  return (
    <>
      <p className="text-sm">
        {titles[row.target.id] ?? row.target.id}
        {row.target.upcoming ? ' · Upcoming' : ''}
      </p>
      <ContentPicker
        label="Replace slide content"
        allowUpcoming
        modules={heroModules}
        onSelect={(target) => update({ target })}
      />
      <Field
        label="Slide heading override"
        value={row.title ?? ''}
        maxLength={100}
        onChange={(event) => update({ title: event.target.value || undefined })}
      />
      <Field
        label="Slide description override"
        multiline
        value={row.description ?? ''}
        maxLength={280}
        onChange={(event) =>
          update({ description: event.target.value || undefined })
        }
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ['imageId', 'Desktop slide artwork'],
          ['mobileId', 'Mobile slide artwork'],
        ].map(([key, label]) => (
          <ArtworkField
            key={key}
            label={label}
            image={row[key] && (images[key] ?? { id: row[key] })}
            onChange={(asset) => {
              setImages({ ...images, [key]: asset });
              update({ [key]: asset?.id });
            }}
          />
        ))}
      </div>
      <Choice
        label="Artwork focal point"
        value={row.focal ?? 'center'}
        options={focalOptions}
        onChange={(focal) => update({ focal })}
      />
      <PromotionDates value={row} update={update} />
    </>
  );
}
export function HomepageControls({ draft, update, normalize, titles }) {
  const stored = draft.heroSlides ?? [];
  const slides = Array.from({ length: publicHeroLimit }, (_, index) =>
    stored.find((row, fallback) => (row.slot ?? fallback + 1) === index + 1),
  );
  const legacy = stored
    .slice(publicHeroLimit)
    .filter((row) => row.slot === undefined);
  const campaigns = useQuery({
    queryKey: ['/admin/site/homepage/hero-campaigns'],
    queryFn: ({ signal }) => get('/admin/site/homepage/hero-campaigns', signal),
  });
  const campaignOptions = (campaigns.data?.data ?? []).filter(
    ({ id }) => !stored.some((row) => row.campaignId === id),
  );
  const campaignTitles = Object.fromEntries(
    (campaigns.data?.data ?? []).map(({ id, name }) => [id, name]),
  );
  const saveSlides = (heroSlides) =>
    update({
      heroSlides: [
        ...heroSlides.flatMap((row, index) =>
          row ? [{ ...row, slot: index + 1 }] : [],
        ),
        ...legacy,
      ],
      managedHero: legacy.length === 0,
    });
  const configured = draft.genres ?? [];
  const available = Object.entries(genreLabels).filter(
    ([key]) => !configured.some((row) => row.genre === key),
  );
  function patchSlide(index, patch) {
    if (
      patch.target &&
      slides.some(
        (row, position) =>
          position !== index &&
          row?.target?.id === patch.target.id &&
          row.target.module === patch.target.module,
      )
    )
      return;
    saveSlides(
      slides.map((row, i) =>
        i === index
          ? {
              ...row,
              ...patch,
              ...(patch.target && {
                target: normalize(patch.target),
                campaignId: undefined,
              }),
            }
          : row,
      ),
    );
  }
  function patchGenre(index, patch) {
    update({
      genres: configured.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    });
  }
  return (
    <>
      <Card className="grid min-w-0 gap-4">
        <h2 className="text-lg font-semibold">Cinematic hero carousel</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Seconds between slides (0 disables rotation)"
            type="number"
            min="0"
            max="60"
            value={draft.rotationSeconds ?? 0}
            onChange={(event) =>
              update({ rotationSeconds: Number(event.target.value) })
            }
          />
          <Field
            label="Days counted as a new release"
            type="number"
            min="1"
            max="180"
            value={draft.releaseDays ?? 30}
            onChange={(event) =>
              update({ releaseDays: Number(event.target.value) })
            }
          />
        </div>
        {Array.from({ length: publicHeroLimit }, (_, index) => {
          const row = slides[index];
          const add = (target) => {
            if (
              slides.some(
                (slide) =>
                  slide?.target?.id === target.id &&
                  slide.target.module === target.module,
              )
            )
              return;
            saveSlides(
              slides.map((item, i) =>
                i === index
                  ? { id: crypto.randomUUID(), target: normalize(target) }
                  : item,
              ),
            );
          };
          return (
            <Card className="grid gap-3 p-3!" key={row?.id ?? index}>
              <h3 className="font-semibold">
                Slot {index + 1}
                {!row && ' · Empty'}
              </h3>
              {row && (
                <>
                  <Slide
                    row={row}
                    update={(patch) => patchSlide(index, patch)}
                    titles={{ ...campaignTitles, ...titles }}
                  />
                  {row.campaignId && (
                    <ContentPicker
                      label="Replace with content"
                      allowUpcoming
                      modules={heroModules}
                      onSelect={(target) => patchSlide(index, { target })}
                    />
                  )}
                  <OrderButtons
                    index={index}
                    total={publicHeroLimit}
                    move={(target) =>
                      saveSlides(reordered(slides, index, target))
                    }
                    remove={() =>
                      saveSlides(
                        slides.map((item, i) =>
                          i === index ? undefined : item,
                        ),
                      )
                    }
                  />
                </>
              )}
              {!row && (
                <ContentPicker
                  label="Choose slide content"
                  allowUpcoming
                  modules={heroModules}
                  onSelect={add}
                />
              )}
              {campaignOptions.length > 0 && (
                <Choice
                  label={
                    row
                      ? 'Replace with eligible campaign'
                      : 'Choose eligible campaign'
                  }
                  value=""
                  options={[
                    ['', 'Select campaign'],
                    ...campaignOptions.map(({ id, name }) => [id, name]),
                  ]}
                  onChange={(campaignId) => {
                    if (!campaignId) return;
                    const next = {
                      id: row?.id ?? crypto.randomUUID(),
                      campaignId,
                    };
                    saveSlides(
                      slides.map((item, i) => (i === index ? next : item)),
                    );
                  }}
                />
              )}
            </Card>
          );
        })}
        {legacy.length > 0 && (
          <details>
            <summary className="cursor-pointer">
              Additional legacy selections ({legacy.length})
            </summary>
            {legacy.map((row) => (
              <div className="flex flex-wrap items-center gap-2" key={row.id}>
                <span className="text-sm">
                  {titles[row.target?.id] ?? row.target?.id ?? row.campaignId}
                </span>
                <Button
                  variant="outline"
                  onClick={() =>
                    update({
                      heroSlides: stored.filter((other) => other.id !== row.id),
                      managedHero: false,
                    })
                  }
                >
                  Remove legacy selection
                </Button>
              </div>
            ))}
          </details>
        )}
      </Card>
      <Card className="grid min-w-0 gap-3">
        <h2 className="text-lg font-semibold">Featured genres</h2>
        {configured.map((row, i) => (
          <div key={row.genre} className="grid min-w-0 gap-2">
            <strong>{genreLabels[row.genre]}</strong>
            <ArtworkField
              label={genreLabels[row.genre] + ' artwork'}
              image={row.imageId && { id: row.imageId }}
              onChange={(asset) => patchGenre(i, { imageId: asset?.id })}
            />
            <OrderButtons
              index={i}
              total={configured.length}
              move={(index) =>
                update({ genres: reordered(configured, i, index) })
              }
              remove={() =>
                update({
                  genres: configured.filter(
                    (other) => other.genre !== row.genre,
                  ),
                })
              }
            />
          </div>
        ))}
        {configured.length < 16 && available.length > 0 && (
          <Choice
            label="Add a featured genre"
            value=""
            options={[['', 'Choose a genre'], ...available]}
            onChange={(genre) => {
              if (genre) update({ genres: [...configured, { genre }] });
            }}
          />
        )}
      </Card>
    </>
  );
}

export function FeaturedPicks({ draft, update, normalize, titles }) {
  return publicHomeSections.map(({ key, heading }) => {
    const configured = draft.featuredPicks?.[key];
    const legacy = draft.sections
      .filter((row) => row.type === 'featured')
      .flatMap((row) =>
        row.items.filter((item) => item.module === key && !item.upcoming),
      );
    const picks =
      configured ??
      [...new Map(legacy.map((item) => [item.id, item])).values()].slice(0, 12);
    const replace = (rows) =>
      update({ featuredPicks: { ...draft.featuredPicks, [key]: rows } });
    return (
      <Card key={key} className="grid gap-3">
        <h2 className="font-semibold">{heading}</h2>
        {picks.map((row, index) => (
          <div key={row.id} className="grid gap-2 text-sm">
            <span className="wrap-anywhere">{titles[row.id] ?? row.id}</span>
            <OrderButtons
              index={index}
              total={picks.length}
              move={(target) => replace(reordered(picks, index, target))}
              remove={() => replace(picks.filter((item) => item.id !== row.id))}
            />
          </div>
        ))}
        {picks.length < 12 && (
          <ContentPicker
            fixedModule={key}
            label={'Choose content for ' + heading}
            onSelect={(item) => {
              if (!picks.some((row) => row.id === item.id))
                replace([...picks, normalize(item)]);
            }}
          />
        )}
      </Card>
    );
  });
}
