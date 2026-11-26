import { z } from 'zod';
import { AppError } from '../../utils/app-error.js';
import { idParams } from '../../utils/list.js';
import { getManagedMovie, writeMovie } from './movies.js';
import { Movie } from './models.js';
import { movieCreate, movieEdit, text } from './schemas.js';

const providerId = text(80).regex(/^[A-Za-z0-9_.-]+$/);
const sourceParams = z.object({ id: providerId });
export const metadataSearch = z.object({ query: z.object({ q: text(80, 2) }) });
export const metadataId = z.object({ params: sourceParams });
export const metadataImport = metadataId.extend({
  body: z.strictObject({ confirm: z.literal(true) }),
});
export const metadataRefresh = z.object({
  params: idParams,
  body: z.strictObject({
    confirm: z.literal(true),
    revision: z.number().int().nonnegative(),
  }),
});
const snapshot = z.object({
  id: providerId,
  fields: z.strictObject({
    title: text(140),
    originalTitle: text(140).optional(),
    synopsis: text(280).optional(),
    description: text(6000).optional(),
    releaseDate: z.iso.date().optional(),
    runtimeMinutes: z.number().int().positive().optional(),
    genres: z.array(z.string()).max(12).optional(),
    language: z.string().optional(),
    languages: z.array(z.string()).max(30).optional(),
    countries: z.array(z.string()).max(20).optional(),
    companies: z.array(z.string()).max(20).optional(),
    advisory: text(300).optional(),
    trailerUrl: text(2048).optional(),
  }),
  people: z
    .array(
      z.strictObject({
        sourceId: providerId,
        name: text(120),
        credit: text(80),
      }),
    )
    .max(80)
    .default([]),
  images: z
    .array(z.string().regex(/^\/[A-Za-z0-9_-]+\.(?:jpg|png|webp)$/))
    .max(20)
    .default([]),
  externalRating: z.number().nonnegative().optional(),
  scale: z.number().positive().optional(),
});
const searchResults = z
  .array(
    z.strictObject({
      id: providerId,
      title: text(140),
      year: z.number().int().optional(),
    }),
  )
  .max(20);
const offline = () =>
  new AppError(
    503,
    'MOVIE_METADATA_UNAVAILABLE',
    'External movie import is unavailable.',
  );
const bad = () =>
  new AppError(
    502,
    'MOVIE_METADATA_INVALID',
    'The provider returned an unsupported response.',
  );
const duplicate = () =>
  new AppError(
    409,
    'MOVIE_DUPLICATE',
    'This provider identity is already in use.',
  );

export function createMetadataService(adapter) {
  const cache = new Map();
  async function load(kind, key, shape) {
    if (!adapter) throw offline();
    const cacheKey = kind + ':' + key;
    const hit = cache.get(cacheKey);
    if (hit?.expiresAt > Date.now()) return hit.value;
    let value;
    try {
      value = await adapter[kind](key, { signal: AbortSignal.timeout(5000) });
    } catch {
      throw offline();
    }
    const parsed = shape.safeParse(value);
    if (!parsed.success) throw bad();
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(cacheKey, { value: parsed.data, expiresAt: Date.now() + 120000 });
    return parsed.data;
  }
  async function preview(id) {
    const source = await load('details', id, snapshot);
    if (source.id !== id) throw bad();
    const validated = movieCreate.safeParse({
      body: {
        ...source.fields,
        metadata: {
          provider: adapter.id,
          id,
          attribution: adapter.attribution,
          externalRating: source.externalRating,
          scale: source.scale,
        },
      },
    });
    if (!validated.success) throw bad();
    const existing = await Movie.findOne({
      'metadata.provider': adapter.id,
      'metadata.id': id,
    })
      .select('publicId')
      .lean();
    return {
      draft: validated.data.body,
      existingId: existing?.publicId,
      unmatched: source.people,
      images: source.images,
    };
  }
  const sourceRecord = (preview) => ({
    syncedAt: new Date(),
    unmatched: preview.unmatched,
    images: preview.images,
  });
  return {
    search: (q) => load('search', q, searchResults),
    preview,
    async import(id, audit) {
      const result = await preview(id);
      if (result.existingId) throw duplicate();
      return writeMovie(undefined, result.draft, audit, sourceRecord(result));
    },
    async refresh(id, revision, audit) {
      const saved = await getManagedMovie(id);
      if (!adapter || saved.metadata?.provider !== adapter.id) throw offline();
      const result = await preview(saved.metadata.id);
      const { poster, backdrop, gallery, credits, metadata } = saved;
      const editable = Object.fromEntries(
        Object.entries(result.draft).filter(
          ([key]) => saved[key] === undefined,
        ),
      );
      const fields = [
        'title',
        'originalTitle',
        'synopsis',
        'description',
        'releaseDate',
        'releaseYear',
        'runtimeMinutes',
        'genres',
        'language',
        'languages',
        'countries',
        'companies',
        'advisory',
        'awards',
        'links',
        'artworkAuthorized',
        'trailerAuthorized',
        'trailerUrl',
      ];
      const current = Object.fromEntries(
        fields
          .filter((key) => saved[key] !== undefined)
          .map((key) => [key, saved[key]]),
      );
      // A verified trailer needs a separate staff action. Existing rights attestations stay attached to existing media.
      delete editable.trailerUrl;
      const input = movieEdit.safeParse({
        params: { id },
        body: {
          ...editable,
          ...current,
          revision,
          posterId: poster?.id,
          backdropId: backdrop?.id,
          galleryIds: gallery.map((x) => x.id),
          credits: credits.map(
            ({ personalityId, role, character, department }) => ({
              personalityId,
              role,
              character,
              department,
            }),
          ),
          metadata: {
            ...result.draft.metadata,
            attribution: metadata.attribution,
          },
        },
      });
      if (!input.success) throw bad();
      return writeMovie(id, input.data.body, audit, sourceRecord(result));
    },
  };
}
