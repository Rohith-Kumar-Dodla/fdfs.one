# Backend

## Foundation

The Express modular monolith exposes REST endpoints under `/api/v1`. `src/app.js` composes middleware and routes. `src/server.js` loads configuration and owns the HTTP and MongoDB lifecycles. Mongoose manages a single connection and monitors it for disconnects and reconnections. The server exposes liveness while MongoDB connects and exits on initial connection failure. On shutdown it gives HTTP connections up to five seconds to drain, closes remaining sockets, then closes MongoDB. Feature modules and schemas are scheduled for their respective phases.

## Environment

Create root `.env` from `.env.example` if needed. Process values take precedence over the root file. Supply the Atlas URI with `/fdfs` in its path and preserve its connection options. Allow the app host in Atlas network access and give the database user permissions to create application indexes and read and write application records. Startup requires a named database and `JWT_ACCESS_SECRET`. Readiness includes authentication, submission, media and audit index creation. Use a replica set for transactional operations. Keep actual environment files outside Git.

Set `APP_WEB_URL` to the exact frontend origin and include it in `CORS_ORIGINS`. Production requires HTTPS. Generate a signing key locally. This PowerShell command sets a development key for the current shell without displaying it. Use a persistent, securely managed random key for a shared environment.

```powershell
$env:JWT_ACCESS_SECRET = node -p "require('node:crypto').randomBytes(48).toString('hex')"
```

SMTP uses `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` and `EMAIL_FROM`. Configure both credentials if authentication is required. Transport uses implicit TLS when `SMTP_SECURE=true` and requires STARTTLS otherwise. With SMTP entirely unconfigured the API starts, accounts stay unverified until email verification succeeds, and email requests return a generic acceptance response. Partial SMTP configuration fails startup. Email sends run asynchronously without logging addresses, credentials or links.

Cloudinary uses server-only `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET`. The API starts without Cloudinary. Image writes return `MEDIA_UNAVAILABLE` when configuration is incomplete.

## API conventions

- `GET /api/v1/health` returns 200 when the application can serve HTTP. `GET /api/v1/ready` returns 200 when the MongoDB driver reports a connection and 503 with `DEPENDENCY_UNAVAILABLE` during database unavailability. Both responses use `Cache-Control: no-store`.
- Success uses `{ success: true, message, data, pagination? }`. Errors use `{ success: false, message, error: { code, details? } }`. Validation returns 400 with field paths and validation codes. Clients should branch on HTTP status and machine-readable error codes.
- For future list endpoints, use `page` (default 1) and `limit` (default 20, maximum 100). Where requested by the endpoint, use pagination metadata with `page`, `limit`, `total` and `totalPages`. Define an endpoint-specific page/window cap before calculating offsets.
- Plan endpoint-specific allowlists for filters and sort fields. Use `sort=field` for ascending and `sort=-field` for descending, with a unique tie-breaker. Validate query values before mapping them to database operators.
- Keep status codes and payloads consistent across clients. Use 401 for missing or invalid authentication and 403 for restricted accounts or insufficient permissions.

## Security and operations

Helmet applies security headers. CORS permits configured browser origins and accepts requests without an Origin for native and server clients. The API limits JSON bodies to 100 KiB and applies a per-IP, in-memory quota to versioned routes excluding probes. Before deploying behind a proxy or across replicas, review trusted proxy hops and shared rate-limit storage.

The server echoes a valid UUID supplied as `X-Request-Id` or generates one. Pino logs request IDs, method, status, completion and duration. Logs omit headers, bodies, URLs and raw database errors, with redaction for common sensitive fields. Internal errors receive generic responses. Build indexes through a controlled deployment step when feature schemas are introduced.

## Authentication and authorization

The private account model stores normalized email under a unique index, a bcrypt hash, viewer/creator/organizer/admin roles, verification and lifecycle status, profile metadata and preferences. Registration assigns viewer. Creator and organizer roles require administrator approval. Account updates accept full name, biography and email-update preference. Talent Profiles remain a separate model. A suspended or deleted account cannot participate. Unverified accounts can sign in, manage their own account and sessions, and request email verification. Future submissions, reviews and community routes must require verified email and the applicable current role or owner.

| Routes under `/api/v1`                                                                                     | Contract                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/register`, `/auth/resend-verification`, `/auth/forgot-password`                                | Generic 202 responses. Signup accepts `fullName`, `email` and `password`. Email requests accept `email`.                                                                                    |
| `POST /auth/login`, `/auth/refresh`, `/auth/logout`                                                        | Trusted browser origin and `X-FDFS-CSRF: 1`. Login accepts email and password. Login and refresh return `accessToken` and `sessionId`; the refresh credential stays in the HttpOnly cookie. |
| `POST /auth/verify-email`, `/auth/reset-password`                                                          | Accept `token` and `password`. Verification checks the existing password to prevent accepting a signup created by someone else. Reset sets the replacement password.                        |
| `GET /auth/me`, `GET/PATCH /users/me`                                                                      | Bearer-authenticated private account read and allowlisted updates.                                                                                                                          |
| `POST /auth/change-password`, `/auth/logout-all`, `GET /auth/sessions`, `DELETE /auth/sessions/:sessionId` | Bearer-authenticated password or session management. Password change takes `currentPassword` and `password`.                                                                                |

Access JWTs use HS256, a configured issuer and audience, and a 900-second default lifetime. Every protected request checks current account status, roles and session state. Refresh credentials contain a random secret. MongoDB stores its digest and atomically rotates the current digest into the used history. One concurrent request succeeds; overlap receives 409 without a cookie update. Known reuse after five seconds revokes the session. Sessions expire after 30 days by default, or sooner when revoked. TTL removes expired records. Password resets, password changes and logout-all invalidate earlier sessions through the account version. Passwords require at least 12 characters and at most 72 UTF-8 bytes for bcrypt. Auth rate limits are per IP and process, with a stored per-account resend cooldown.

The refresh cookie is host-only, HttpOnly, SameSite=Lax and scoped to `/api/v1/auth`, with Secure in production. Deploy the web app and API on the same site. Verification and recovery use one-time hashed tokens with 24-hour and 30-minute lifetimes. Links use the configured frontend origin and put tokens in the URL fragment.

Bootstrap the first administrator locally with an existing active, verified account. The confirmation must repeat the target email. The database enforces a one-time bootstrap and invalidates the promoted account's former sessions.

```bash
npm run auth:bootstrap-admin -w @fdfs/backend -- --email <email> --confirm <email>
```

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

## Administration and moderation

All `/api/v1/admin` routes require a bearer session and a currently active, verified administrator. The dashboard counts actual users, pending submissions, active image records and audit events.

| Routes under `/api/v1/admin`                                      | Contract                                                                                                          |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `GET /overview`                                                   | Database-backed counters.                                                                                         |
| `GET /users`, `GET /users/:id`                                    | Paginated listing and safe detail. Filters accept `q`, `role`, `verified` and `status`.                           |
| `PATCH /users/:id/role`                                           | Set `enabled` for a creator or organizer role. Grants require an active, verified target.                         |
| `PATCH /users/:id/status`, `POST /users/:id/revoke-sessions`      | Suspend, reactivate or invalidate sessions. Status changes invalidate prior sessions through the account version. |
| `GET /submissions`, `GET /submissions/:id`                        | Paginated review queue and submission details. Filter by `category` or `status`.                                  |
| `POST /submissions/:id/moderate`, `POST /submissions/:id/publish` | Apply an allowed review action or delegate approved content to a registered feature publisher.                    |
| `GET/POST /media`, `PUT/DELETE /media/:id`                        | Paginate, upload, replace and delete images.                                                                      |
| `GET /audit`                                                      | Paginated audit history with optional `action` filter.                                                            |

The bootstrap CLI remains the explicit administrator grant path. Dashboard mutations protect administrators, the caller's account and deleted accounts. Role changes, account status, session invalidation and their audit records commit together.

Verified active owners can list and create at `GET/POST /api/v1/submissions`, read and edit via `GET/PATCH /api/v1/submissions/:id`, and send drafts for review via `POST /api/v1/submissions/:id/submit`. Creators can submit independent films and podcasts, organizers can submit live events, viewers can propose talent profiles or corrections, and administrators can submit any supported category including Originals. Owners edit drafts and rejected records. The owner path advances draft or rejected to submitted. Administrators advance submitted to under review, then approve or reject with a reason. Administrators can archive approved, rejected and published workflow records. Archiving the workflow record leaves any feature-specific publication state to the owning module.

For publication, a category-specific handler must validate approved content and write the feature record inside the shared transaction. The workflow then records publication in the submission history and administrator audit. No feature publishers are enabled in this phase.

## Shared media

Image writes accept raw still JPEG, PNG or WebP up to 5 MiB. The server checks signatures, decodes the source with a pixel limit, rejects mismatched and animated inputs, strips metadata and re-encodes to WebP within a 2400px box. A per-IP upload quota applies after authentication and authorization. Cloudinary receives signed server uploads from those normalized bytes. [Cloudinary Node upload reference](https://cloudinary.com/documentation/node_image_and_video_upload)

`MediaAsset` tracks the public application ID, Cloudinary public and asset IDs, owner, purpose, dimensions, byte size, secure delivery URL, references and lifecycle status. Responses provide size-limited variants as well as the original normalized image. Verified active users can read and replace their own avatar via `GET/PUT /api/v1/users/me/image`. Library replacements create a new asset ID. Live references block deletion or replacement. Future content modules should use the reference helpers in the same transaction as their feature records. Run `npm run media:cleanup -w @fdfs/backend` to retry pending deletes and clean staged uploads older than one hour, in batches of 100 pending deletions.

The video source contract stores provider, provider video ID, canonical source URL, playback type, availability, and optional duration and thumbnail dimensions. YouTube supports on-demand, scheduled live, active live and replays through one adapter. Availability starts unknown unless established by the feature. The contract accepts validated YouTube watch, short-link, embed and live URLs.

## Audit retention

Audit entries store the actor, action, target, safe change summary, request ID, timestamp and success outcome for committed administrative mutations. The API exposes paginated reads to administrators. Application-level updates and deletes are unavailable. Keep indexes for time, target, actor and action. Set a production retention policy based on operational and privacy requirements before enabling automatic expiry.
