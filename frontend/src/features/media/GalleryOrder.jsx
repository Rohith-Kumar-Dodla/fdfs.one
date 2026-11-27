import { Button } from '../../components/ui/Button.jsx';
import { MediaPicker } from '../admin/MediaPicker.jsx';

export function GalleryOrder({
  ids,
  change,
  library = false,
  limit = 8,
  images = [],
}) {
  function move(index, target) {
    const next = [...ids];
    next[index] = ids[target];
    next[target] = ids[index];
    change(next);
  }
  return (
    <>
      {ids.length > 0 && (
        <ul className="grid gap-2">
          {ids.map((id, index) => {
            const image = images.find((item) => item?.id === id);
            return (
              <li key={id} className="flex flex-wrap items-center gap-2">
                {image?.url && (
                  <img
                    src={image.url}
                    alt=""
                    className="h-11 w-16 rounded-control object-cover"
                  />
                )}
                <span className="text-sm text-muted">Image {index + 1}</span>
                <Button
                  variant="outline"
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                  aria-label={'Move image ' + (index + 1) + ' up'}
                >
                  Move up
                </Button>
                <Button
                  variant="outline"
                  disabled={index === ids.length - 1}
                  onClick={() => move(index, index + 1)}
                  aria-label={'Move image ' + (index + 1) + ' down'}
                >
                  Move down
                </Button>
                <Button
                  variant="outline"
                  onClick={() => change(ids.filter((item) => item !== id))}
                >
                  Remove image {index + 1}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {library && ids.length < limit && (
        <MediaPicker
          label="Add supporting image"
          upload
          onSelect={(image) => {
            if (!ids.includes(image.id)) change([...ids, image.id]);
          }}
        />
      )}
    </>
  );
}
