import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client.js';
import { Link } from 'react-router';
import { Card } from '../../components/ui/surfaces.jsx';
import { FilmImage } from '../films/FilmImage.jsx';
import { SaveAction } from './Actions.jsx';

export function Related({ module, id }) {
  const query = useQuery({
    queryKey: ['related', module, id],
    enabled: !!id,
    staleTime: 60000,
    meta: { public: true },
    queryFn: ({ signal }) =>
      apiClient
        .get('/related/' + module + '/' + id, { signal })
        .then(({ data }) => data),
  });
  if (!Array.isArray(query.data) || !query.data.length) return null;
  return (
    <section aria-label="Related content" className="grid min-w-0 gap-3">
      <h2 className="text-xl font-bold">Related content</h2>
      <ul className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
        {query.data.map((item) => (
          <Card
            as="li"
            key={item.id}
            className="grid min-w-0 gap-2 p-3! wrap-anywhere"
          >
            <FilmImage
              image={item.landscape ?? item.image}
              landscape
              sizes="240px"
            />
            <Link
              className="inline-flex min-h-11 items-center font-semibold text-accent underline"
              to={item.path}
            >
              {item.title}
            </Link>
            <SaveAction item={item} />
          </Card>
        ))}
      </ul>
    </section>
  );
}
