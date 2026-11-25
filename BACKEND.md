# Backend

## Foundation

The Express modular monolith exposes REST endpoints under `/api/v1`. `src/app.js` composes middleware and routes. `src/server.js` loads configuration and owns the HTTP and MongoDB lifecycles. Mongoose manages a single connection and monitors it for disconnects and reconnections. The server exposes liveness while MongoDB connects and exits on initial connection failure. On shutdown it gives HTTP connections up to five seconds to drain, closes remaining sockets, then closes MongoDB. Feature modules and schemas are scheduled for their respective phases.

## Environment

Copy the root `.env.example` to root `.env`. The backend finds that file relative to its source on every startup. Process environment variables take precedence, so root and workspace commands use the same configuration. Supply a MongoDB Atlas URI and allow the app host in Atlas network access. Use exact comma-separated HTTP(S) origins, including any non-default port. The example includes local port, logging and rate-limit defaults. Keep actual env files and credentials outside version control.

## API conventions

- `GET /api/v1/health` returns 200 when the application can serve HTTP. `GET /api/v1/ready` returns 200 when the MongoDB driver reports a connection and 503 with `DEPENDENCY_UNAVAILABLE` during database unavailability. Both responses use `Cache-Control: no-store`.
- Success uses `{ success: true, message, data, pagination? }`. Errors use `{ success: false, message, error: { code, details? } }`. Validation returns 400 with field paths and validation codes. Clients should branch on HTTP status and machine-readable error codes.
- For future list endpoints, use `page` (default 1) and `limit` (default 20, maximum 100). Where requested by the endpoint, use pagination metadata with `page`, `limit`, `total` and `totalPages`. Define an endpoint-specific page/window cap before calculating offsets.
- Plan endpoint-specific allowlists for filters and sort fields. Use `sort=field` for ascending and `sort=-field` for descending, with a unique tie-breaker. Validate query values before mapping them to database operators.
- Keep status codes and payloads consistent across web and mobile. A later auth phase can use secure browser cookies with CSRF protection as applicable and an authorization header for mobile. Reserve 401 for missing or invalid authentication and 403 for insufficient permission.

## Security and operations

Helmet applies security headers. CORS permits configured browser origins and accepts requests without an Origin for native and server clients. The API limits JSON bodies to 100 KiB and applies a per-IP, in-memory quota to versioned routes excluding probes. Before deploying behind a proxy or across replicas, review trusted proxy hops and shared rate-limit storage.

The server echoes a valid UUID supplied as `X-Request-Id` or generates one. Pino logs request IDs, method, status, completion and duration. Logs omit headers, bodies, URLs and raw database errors, with redaction for common sensitive fields. Internal errors receive generic responses. Build indexes through a controlled deployment step when feature schemas are introduced.

## Logical MongoDB architecture

Use ObjectId references internally and immutable, unique `publicId` values in the API. Give routable content lowercase hyphenated slugs with unique indexes per collection or parent scope. Preserve old URLs through explicit redirects when changing a published slug. Store timestamps as BSON dates in UTC and serialize as ISO 8601. Publish public content through explicit draft, scheduled, published and archived states. Apply public visibility at the query layer and store moderation state separately.

Proposed collections and indexes follow. Unique keys are marked explicitly.

| Entity                                   | Responsibility, references and proposed indexes                                                                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Users and sessions                       | User identity and roles. Unique normalized email and public ID. Sessions reference users, use hashed credentials with a unique digest, and index user plus a TTL on expiry. Enforce expiry and revocation on lookup.                                                     |
| Personalities and achievements           | Shared profiles for creators, cast, crew and guests. Unique public profile slug. Achievements reference personalities and index personality and achievement date.                                                                                                        |
| Films and credits                        | Cinema and Originals share films with independent or in-house ownership classification. Index ownership, publication state and publish date. Credits reference film and personality with a unique film/personality/role/credited-as key and a reverse personality index. |
| Podcast shows, episodes and participants | Episodes reference shows with unique show/episode slug. Index show, publication state and publish date. Participants reference episodes and personalities with a unique episode/personality/role key and a reverse personality index.                                    |
| Live events and organizers               | Events reference organizer records associated with a user or personality. Index publication state and start time, plus organizer references and start time. Track event status independently of publication.                                                             |
| Mainstream movies                        | Catalog metadata with unique provider and external ID pairs where present, plus title/release year and publication indexes.                                                                                                                                              |
| Reviews, ratings and interactions        | A shared target type and ObjectId identify either a movie or film. Index review target, moderation state and publish time. Ratings have a unique user/target type/target ID key. Interactions reference reviews with a unique user/review/interaction type key.          |
| Comments and moderation reports          | Comments reference their author and a supported thread target, with optional parent comment. Index target, visibility and creation time. Reports reference reporter and subject, and index status and creation time for the moderation queue.                            |
| Watchlists and progress                  | Store one watchlist and one progress entry per user/target type/target ID using separate unique compound indexes. Index user and update time for recent activity.                                                                                                        |
| Notifications                            | Reference recipients and optional typed subjects. Index recipient, read state and creation time. Apply TTL to explicitly expiring records.                                                                                                                               |
| Content submissions                      | Link submitter, proposed content, media and assigned reviewer. Index status and submission time for review, and submitter and submission time for user history.                                                                                                          |
| Media assets                             | Store provider, external asset ID, playback metadata and optional dimensions or duration. Use a unique provider/asset key. Keep video files with their media provider.                                                                                                   |
| Homepage configuration                   | Store ordered, typed content references by placement and revision. Use a unique placement/revision key and a partial unique key for one active revision per placement.                                                                                                   |
| Administrative audit logs                | Append actor, action, subject, request ID and timestamp. Index actor/time and subject/time. Exclude secrets and restrict write and read access.                                                                                                                          |

Check references and allowed target types in services. Use transactions where writes across collections must succeed together. Archive public content and keep attribution and moderation history when references must survive removal. Revoke user sessions on deletion, anonymize retained contributions according to policy, and clean up private user records. Unlink or clean up dependent records before permanent deletion. Use UTC timestamps, typed public IDs in payloads and consistent pagination so both clients can follow the same links and rules.
