import { can } from '../../../../shared/admin.js';
import { mediaCategories } from '../../../../shared/site.js';
import { useOutletContext } from 'react-router';
import { MediaFilters } from './MediaPicker.jsx';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { parseYouTube } from '../../../../shared/youtube.js';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { Card, SectionHeading } from '../../components/ui/surfaces.jsx';
import { ImagePreview, ImageUpload, uploadImage } from '../media/Images.jsx';
import { YouTubePlayer } from '../media/YouTubePlayer.jsx';
import {
  ConfirmAction,
  control,
  date,
  QueryState,
  Select,
  useChange,
  useRecords,
} from './common.jsx';

const url = '/admin/media';
function VideoPreview() {
  const [video, setVideo] = useState(null);
  const [error, setError] = useState(false);
  return (
    <Card as="section" className="grid gap-4">
      <h2 className="text-lg font-semibold">YouTube embed preview</h2>
      <form
        className="grid gap-2 sm:flex sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          const result = parseYouTube(
            new FormData(event.currentTarget).get('url').trim(),
          );
          setError(!result);
          setVideo(result);
        }}
      >
        <label className="grid min-w-0 flex-1 gap-1 text-sm">
          YouTube URL
          <input
            name="url"
            type="url"
            required
            maxLength={2048}
            className={control}
          />
        </label>
        <Button type="submit">Preview video</Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          Enter a supported YouTube video URL.
        </p>
      )}
      {video && <YouTubePlayer video={video} />}
    </Card>
  );
}

export function MediaPage() {
  const records = useRecords(url);
  const { query, params, changePage } = records;
  const account = useOutletContext();
  const manage = can(account, 'media_manage');
  const [metadata, setMetadata] = useState(null);
  const [replace, setReplace] = useState(null);
  const [remove, setRemove] = useState(null);
  const [notice, setNotice] = useState('');
  const client = useQueryClient();
  const keys = [url, '/admin/overview', '/admin/audit'];
  const change = useChange(keys, ({ data }) =>
    setNotice(
      data.deleted
        ? 'Image deleted.'
        : 'Image removed from the library. Provider cleanup is pending.',
    ),
  );
  const save = useChange(keys, () => {
    setMetadata(null);
    setNotice('Media details saved.');
  });
  async function upload(file, id) {
    await uploadImage(id ? url + '/' + id : url, file, id ? 'put' : 'post');
    await Promise.all(
      keys.map((key) => client.invalidateQueries({ queryKey: [key] })),
    );
    if (id) {
      setReplace(null);
      setNotice('Image replaced.');
    } else changePage(1);
  }
  return (
    <>
      <SectionHeading as="h1">Media library</SectionHeading>
      <Card>
        <ImageUpload label="Add image to library" onUpload={upload} />
      </Card>
      {notice && (
        <p role="status" className="text-sm text-success">
          {notice}
        </p>
      )}
      <MediaFilters records={records} />
      <Select
        label="Reference status"
        options={[
          ['used', 'Referenced'],
          ['unused', 'Unused'],
        ]}
        value={params.usage ?? ''}
        onChange={(value) => records.filter('usage', value)}
      />
      <QueryState query={query} empty="No uploaded images">
        {(images) => (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {images.map((image) => (
              <li key={image.id}>
                <Card className="grid gap-3">
                  <ImagePreview
                    image={image}
                    alt={image.alt || 'Uploaded image preview'}
                  />
                  <h2 className="font-semibold wrap-anywhere">
                    {image.title || 'Untitled image'}
                  </h2>
                  <div className="text-sm text-muted wrap-anywhere">
                    <p>
                      {image.width} × {image.height} ·{' '}
                      {Math.ceil(image.bytes / 1024)} KiB
                    </p>
                    <p>
                      {
                        {
                          profile: 'Account profile image',
                          talent: 'Talent proposal image',
                          film: 'Film proposal image',
                          library: 'Library image',
                        }[image.purpose]
                      }{' '}
                      · {date(image.createdAt)}
                    </p>
                    <p>
                      {image.references} active{' '}
                      {image.references === 1 ? 'reference' : 'references'}
                    </p>
                    <p>
                      {mediaCategories[image.category]} ?{' '}
                      {image.references ? 'Referenced' : 'Unused'}
                    </p>
                    {image.alt && <p>Alternative text ? {image.alt}</p>}
                    {image.uploadedBy && (
                      <p>Uploaded by ? {image.uploadedBy}</p>
                    )}
                    {image.usage?.length > 0 && (
                      <ul>
                        {image.usage.map(({ kind, targetId }) => (
                          <li key={kind + targetId}>
                            {kind} ? {targetId}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p>Media ID {image.id}</p>
                  </div>
                  {manage && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          save.reset();
                          setMetadata(image);
                        }}
                      >
                        Edit details
                      </Button>
                      <Button
                        variant="outline"
                        disabled={image.references > 0}
                        onClick={() => setReplace(image)}
                      >
                        Replace
                      </Button>
                      <Button
                        variant="outline"
                        disabled={image.references > 0}
                        onClick={() => {
                          change.reset();
                          setRemove({
                            title: 'Delete image?',
                            description:
                              'The image will be removed from the library.',
                            request: {
                              url: url + '/' + image.id,
                              method: 'delete',
                            },
                          });
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      {query.data && (
        <Pagination
          page={params.page}
          totalPages={query.data.pagination.totalPages}
          onPageChange={changePage}
        />
      )}
      {query.data && params.page > 1 && query.data.data.length === 0 && (
        <Button variant="outline" onClick={() => changePage(1)}>
          Return to first page
        </Button>
      )}
      <VideoPreview />
      <Dialog
        open={Boolean(replace)}
        onClose={() => setReplace(null)}
        title="Replace image"
      >
        {replace && (
          <ImageUpload
            key={replace.id}
            label="Choose the replacement image"
            onUpload={(file) => upload(file, replace.id)}
          />
        )}
      </Dialog>
      <Dialog
        open={Boolean(metadata)}
        onClose={() => setMetadata(null)}
        title="Edit media details"
      >
        {metadata && (
          <form
            key={metadata.id}
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate({
                url: url + '/' + metadata.id,
                method: 'patch',
                data: Object.fromEntries(new FormData(event.currentTarget)),
              });
            }}
          >
            <label className="grid gap-1 text-sm">
              Media title
              <input
                name="title"
                className={control}
                maxLength={100}
                defaultValue={metadata.title}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Alternative text
              <input
                name="alt"
                className={control}
                maxLength={200}
                defaultValue={metadata.alt}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Category
              <select
                name="category"
                className={control}
                defaultValue={metadata.category}
              >
                {Object.entries(mediaCategories).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <Button type="submit" loading={save.isPending}>
                Save details
              </Button>
            </div>
            {save.isError && <p role="alert">{save.error.message}</p>}
          </form>
        )}
      </Dialog>
      <ConfirmAction
        action={remove}
        onClose={() => setRemove(null)}
        change={change}
      />
    </>
  );
}
