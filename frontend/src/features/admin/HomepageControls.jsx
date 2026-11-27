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
import { control } from './common.jsx';

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
  return (
    <>
      <p className="text-sm">
        {titles[row.target.id] ?? row.target.id}
        {row.target.upcoming ? ' · Upcoming' : ''}
      </p>
      <ContentPicker
        label="Replace slide content"
        allowUpcoming
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
  const slides = draft.heroSlides ?? [];
  const configured = draft.genres ?? [];
  const available = Object.entries(genreLabels).filter(
    ([key]) => !configured.some((row) => row.genre === key),
  );
  function patchSlide(index, patch) {
    update({
      heroSlides: slides.map((row, i) =>
        i === index
          ? {
              ...row,
              ...patch,
              ...(patch.target && { target: normalize(patch.target) }),
            }
          : row,
      ),
    });
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
        {slides.map((row, i) => (
          <Card className="grid min-w-0 gap-3" key={row.id}>
            <Slide
              row={row}
              update={(patch) => patchSlide(i, patch)}
              titles={titles}
            />
            <OrderButtons
              index={i}
              total={slides.length}
              move={(index) =>
                update({ heroSlides: reordered(slides, i, index) })
              }
              remove={() =>
                update({
                  heroSlides: slides.filter((other) => other.id !== row.id),
                })
              }
            />
          </Card>
        ))}
        {slides.length < 8 && (
          <ContentPicker
            label="Add hero slide"
            allowUpcoming
            onSelect={(item) =>
              update({
                heroSlides: [
                  ...slides,
                  { id: crypto.randomUUID(), target: normalize(item) },
                ],
              })
            }
          />
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
