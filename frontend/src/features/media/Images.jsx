import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button.jsx';
import { protectedRequest } from '../auth/api.js';

export function uploadImage(url, file, method = 'put') {
  return protectedRequest({
    url,
    method,
    data: file,
    timeout: 30000,
    headers: { 'Content-Type': file.type },
  });
}

export function ImagePreview({ image, alt, sizes = '240px' }) {
  return (
    <img
      className="aspect-square w-full max-w-60 rounded-control bg-nav object-contain"
      src={image.url}
      srcSet={image.variants
        ?.map(({ url, width }) => url + ' ' + width + 'w')
        .join(', ')}
      sizes={sizes}
      width={image.width}
      height={image.height}
      alt={alt}
      loading="lazy"
    />
  );
}

export function ImageUpload({ label, onUpload }) {
  const upload = useMutation({ mutationFn: (file) => onUpload(file) });
  return (
    <form
      className="grid min-w-0 gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const file = new FormData(form).get('image');
        if (file?.size) upload.mutate(file, { onSuccess: () => form.reset() });
      }}
    >
      <label className="grid min-w-0 gap-2 text-sm font-semibold">
        {label}
        <input
          type="file"
          name="image"
          accept="image/jpeg,image/png,image/webp"
          required
          className="min-h-11 w-full min-w-0 max-w-full rounded-control border border-line p-2 text-sm file:mr-2"
        />
      </label>
      <p className="text-sm text-muted">JPEG, PNG or WebP, up to 5 MiB.</p>
      <div>
        <Button type="submit" loading={upload.isPending}>
          Upload image
        </Button>
      </div>
      {upload.isError && (
        <p role="alert" className="text-sm text-danger-text">
          {upload.error.message}
        </p>
      )}
      {upload.isSuccess && (
        <p role="status" className="text-sm text-success">
          Image saved.
        </p>
      )}
    </form>
  );
}

export function ProfileImageSettings({ account }) {
  const [saved, setSaved] = useState(null);
  const url = '/users/me/image';
  const image = useQuery({
    queryKey: ['profile-image', account.id],
    enabled: account.emailVerified,
    queryFn: ({ signal }) =>
      protectedRequest({ url, signal }).then(({ data }) => data.image),
  });
  const current = saved ?? image.data;
  if (!account.emailVerified)
    return (
      <p className="text-sm text-muted">
        Verify your email to upload a profile image.
      </p>
    );
  return (
    <div className="grid gap-4">
      {image.isPending && <p role="status">Loading profile image…</p>}
      {image.isError && !saved && (
        <p role="alert">
          {image.error.message}{' '}
          <button
            type="button"
            className="min-h-11 text-accent underline"
            onClick={() => void image.refetch()}
          >
            Retry
          </button>
        </p>
      )}
      {current && <ImagePreview image={current} alt="Your profile image" />}
      <ImageUpload
        label={current ? 'Replace profile image' : 'Choose a profile image'}
        onUpload={async (file) => {
          const result = await uploadImage(url, file);
          setSaved(result.data.image);
          await image.refetch();
        }}
      />
    </div>
  );
}
