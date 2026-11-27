import { useMutation } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button.jsx';
import { protectedRequest } from '../auth/api.js';
import { parseYouTube } from '../../../../shared/youtube.js';

export function YouTubeDetails({ module, source, current, apply, values }) {
  const request = useMutation({
    mutationFn: () => {
      const url = source().trim();
      if (!parseYouTube(url))
        throw new Error('Enter a supported HTTPS YouTube URL.');
      return protectedRequest({
        url: '/admin/youtube-metadata',
        method: 'post',
        timeout: 10000,
        data: { source: url, module },
      });
    },
    onSuccess: ({ data }) => {
      if (parseYouTube(source().trim())?.providerVideoId === data.id)
        useDetails(data, false);
    },
  });
  const details = request.data?.data;
  function useDetails(details, replace) {
    const fields = Object.fromEntries(
      Object.entries(values(details)).filter(
        ([key, value]) =>
          value !== undefined &&
          value !== '' &&
          (replace || !String(current(key) ?? '').trim()),
      ),
    );
    apply(fields, details.thumbnails[0], replace);
  }
  const matching =
    details && parseYouTube(source().trim())?.providerVideoId === details.id;
  return (
    <div className="grid justify-items-start gap-2">
      <Button
        variant="outline"
        loading={request.isPending}
        onClick={() => request.mutate()}
      >
        Fetch Details
      </Button>
      {request.isError && (
        <p role="alert" className="text-sm text-danger-text">
          {request.error.message}
        </p>
      )}
      {matching && (
        <>
          <p className="text-sm wrap-anywhere">{details.title}</p>
          {details.thumbnails[0] && (
            <img
              src={details.thumbnails[0].url}
              alt="YouTube thumbnail preview"
              className="w-32 rounded-control"
            />
          )}
          {details.embeddable === false && (
            <p role="status" className="text-sm text-danger-text">
              YouTube reports that embedding is disabled for this video.
            </p>
          )}
          {details.broadcast === 'live' && (
            <p className="text-sm text-muted">
              YouTube reports a live broadcast. Confirm playback before starting
              the event.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => useDetails(details, false)}
            >
              Fill Empty Fields
            </Button>
            <Button variant="outline" onClick={() => useDetails(details, true)}>
              Replace Fields with YouTube Details
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
