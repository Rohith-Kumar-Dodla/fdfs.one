import { Link } from 'react-router';
import { buttonClasses } from '../../components/ui/Button.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { Badge, Card, SectionHeading } from '../../components/ui/surfaces.jsx';
import { FilmImage } from '../films/FilmImage.jsx';
import { FilterDrawer } from '../public-ui/Catalogue.jsx';
import { QueryState, readable } from './common.jsx';

export function RecordFilters({ records, fields }) {
  const options = fields.map(([key, label, options, type, min, max]) => ({
    key,
    label,
    options,
    type,
    min,
    max,
  }));
  const keys = options.map(({ key }) => key);
  const values = Object.fromEntries(
    keys.flatMap((key) =>
      records.params[key] ? [[key, records.params[key]]] : [],
    ),
  );
  return (
    <FilterDrawer
      fields={options}
      values={values}
      apply={(next) => records.applyFilters(next, keys)}
    />
  );
}

export function ContentHeading({ title, create, action, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <SectionHeading as="h1">{title}</SectionHeading>
      <div className="flex flex-wrap gap-2">
        {children}
        {create && (
          <Link to={create} className={buttonClasses()}>
            {action}
          </Link>
        )}
      </div>
    </div>
  );
}

export function ContentGrid({ records, empty, entry }) {
  const { query, params, changePage } = records;
  return (
    <>
      <QueryState query={query} empty={empty}>
        {(rows) => (
          <ul className="grid gap-3 min-[425px]:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {rows.map((row) => {
              const {
                title,
                image,
                meta,
                edit,
                preview,
                status = row.status,
              } = entry(row);
              return (
                <Card
                  as="li"
                  key={row.id}
                  className="grid min-w-0 content-start gap-3 p-3!"
                >
                  <FilmImage image={image} landscape />
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="min-w-0 font-semibold wrap-anywhere">
                      {title}
                    </h2>
                    {status && (
                      <Badge
                        tone={status === 'published' ? 'success' : 'neutral'}
                      >
                        {readable(status)}
                      </Badge>
                    )}
                  </div>
                  {meta && (
                    <p className="text-sm text-muted wrap-anywhere">{meta}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Link
                      className={buttonClasses('outline')}
                      to={edit}
                      aria-label={'Edit ' + title}
                    >
                      Edit
                    </Link>
                    <Link
                      className={buttonClasses('ghost')}
                      to={preview}
                      aria-label={'Preview ' + title}
                    >
                      Preview
                    </Link>
                  </div>
                </Card>
              );
            })}
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
    </>
  );
}
