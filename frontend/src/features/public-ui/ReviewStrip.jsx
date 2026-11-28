import { Link } from 'react-router';
import { useRead } from '../reviews/client.js';

export function ReviewStrip({ type, heading }) {
  const query = useRead('/reviews/feed', {
    params: { type, sort: 'recent', limit: 4 },
  });
  const rows = Array.isArray(query.data?.data)
    ? query.data.data.filter((row) => row.target?.type === type)
    : [];
  if (!rows.length) return null;
  return (
    <section className="grid gap-3" aria-label={heading}>
      <h2 className="text-xl font-bold">{heading}</h2>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((row) => (
          <article
            key={row.id}
            className="grid min-w-0 content-start gap-2 rounded-panel bg-surface/55 p-4 wrap-anywhere"
          >
            <Link
              className="font-semibold text-accent hover:underline"
              to={'/reviews/' + row.id}
            >
              {row.target.title}
            </Link>
            <p className="text-sm text-muted">
              {[
                row.author?.name,
                Number.isFinite(row.rating) && row.rating + ' / 5',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <p className="line-clamp-2 text-sm">
              {row.spoiler ? 'Contains spoilers' : row.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
