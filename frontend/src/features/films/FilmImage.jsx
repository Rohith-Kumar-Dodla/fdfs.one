import { useState } from 'react';
import { Clapperboard } from 'lucide-react';

export function FilmImage({ image, landscape = false, eager = false, sizes }) {
  const [broken, setBroken] = useState(null);
  const shape = landscape ? 'aspect-video' : 'aspect-[2/3]';
  const style = 'w-full rounded-panel bg-nav object-cover ' + shape;
  if (!image?.url || image.url === broken) {
    return (
      <div
        className={
          style + ' grid place-items-center border border-line text-muted'
        }
      >
        <Clapperboard aria-hidden="true" className="size-8" />
      </div>
    );
  }
  return (
    <img
      src={image.url}
      alt=""
      width={image.width}
      height={image.height}
      className={style}
      loading={eager ? 'eager' : 'lazy'}
      onError={() => setBroken(image.url)}
      srcSet={image.variants
        ?.map(({ url, width }) => url + ' ' + width + 'w')
        .join(', ')}
      sizes={
        sizes ??
        (landscape
          ? '(min-width: 960px) 880px, 100vw'
          : '(min-width: 640px) 240px, 46vw')
      }
    />
  );
}
