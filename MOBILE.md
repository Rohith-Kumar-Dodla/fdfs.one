# Mobile

Plan React Native with Expo in the reserved `mobile/` directory. The app will use the centralized `/api/v1` REST API and share the web client's response contracts, public identifiers, pagination rules and UTC timestamp format. Authentication and media capabilities will follow the shared API as they are implemented.

Mobile development begins in Phase 9.1. The `shared/` directory is reserved for later cross-client code.

Reuse bearer access tokens and the account and session response contracts. Keep access tokens in memory and store future native refresh credentials in Expo SecureStore. Native session issuance and refresh need a dedicated credential transport with an explicit server contract. The browser refresh endpoints require a cookie, trusted origin and CSRF header. Native support must preserve those protections.

The shared API now exposes verified account profile images and an owner-scoped submission workflow using bearer authentication. Native uploads should send raw JPEG, PNG or WebP bytes using the declared image MIME. Image reads return HTTPS variants and dimensions for responsive rendering. Use the shared video provider identifier, availability and playback type to select a supported YouTube embed in the future native client. Preserve player controls, provider restrictions and the required client-origin identification in any WebView integration.

Talent Profiles use `GET /api/v1/talent` for paginated published records and `GET /api/v1/talent/:slug` for details. Use the stable public ID to identify a personality and its slug for links. Display the API's HTTPS portrait and cover variants with a neutral placeholder when an image is unavailable. Filmography and podcast appearances will follow published relationship records from their owning modules. Verified proposal uploads use the shared image upload requirements and bearer authentication.

Cinema and Originals use the shared `/api/v1/films` directory and slug detail contract. Set the classification for the corresponding native section and follow server-provided release availability. Released videos use the YouTube provider identifier and official embeddable playback, with provider controls and a user-initiated start. Upcoming announcements may expose a trailer. The API provides responsive Cloudinary images, public talent identifiers and the correct classification for detail and filmography links.

The podcast API returns the published show, paginated episodes and a slug detail under `/api/v1/podcasts`. Use server release status to determine whether a teaser or full video is available. Chapters use ascending integer seconds, and the native YouTube embed should support a user-initiated seek and playback-position updates. Episode participants link to the same Talent IDs and slugs as film credits, and artwork includes shared HTTPS image variants. Episode comments use bearer credentials for verified-account writes and ownership controls. Guests can read released comments.

## FDFS Live

Use `GET /api/v1/live` and `GET /api/v1/live/:slug` for discovery and detail. Display UTC timestamps in the event's original IANA timezone and use `serverNow` for the countdown. Read the current broadcast state before showing playback. When the backend releases a live or replay provider ID, use a supported YouTube embed with provider controls and viewer-initiated playback.

Connect to the shared Socket.IO server with a current access token in `auth.token` for protected actions, or omit it for guest reads. Join by slug, pass a stable client UUID when retrying a chat message, and rejoin and reload REST state and paginated history after reconnecting. Replace the socket credential after access-token refresh.

The reminder endpoint exposes per-account subscription and delivery state, separate from the transport. This phase delivers reminders by email. Later platform integration can reuse event and subscription identifiers with Expo notification preferences and device delivery registration.

## Platform configuration

Future clients can read `/api/v1/site/settings` for the public brand, image variants, navigation visibility, contact and legal content, maintenance state and community flags. The active homepage hero is available at `/api/v1/site/homepage`. Its featured link identifies a currently public resource. The unified homepage is available through the discovery contract below.

Future native clients can use the same `/api/v1/support/config`, ticket list, detail, message and private attachment routes. Send the current account bearer token or a scoped `Guest` token as applicable. Display deadlines from server responses. Fetch private attachments on demand and keep cached copies out of shared media storage.

The shared Socket.IO presence protocol accepts an allowlisted route category, optional eligible event slug, coarse device category, visibility and playback state. Native clients can link pulses to foreground lifecycle and supported active playback. Use a rotating anonymous ID if permitted, and restart the session on credential changes. The analytics event API uses client UUIDs, with opt-in and server-assigned timestamps. The account notifications API supports listing, unread counts and owned read actions. Its socket signal triggers a REST refresh. Native push delivery and device registration remain later mobile work.

The shared `/api/v1/movies` API lists published movies and exposes slug detail and credits. Talent profiles include `movieAppearances`. `/api/v1/ratings/:type/:slug` returns FDFS totals and the signed-in `/mine` rating. `/api/v1/reviews/:type/:slug` supports reviews, likes, comments and reports. Target types are `movie`, `cinema` and `original`. Display external ratings separately, preserve spoiler flags and use the shared bearer session for writes. Native clients can reuse the summary feed at `/api/v1/reviews/feed`, the permalink API at `/api/v1/reviews/entry/:id`, and private `/api/v1/account/reviews` history. Request `reveal=true` on a review permalink only after a reader chooses to reveal spoilers. Use the owned likes batch and notification destinations. Render upcoming films without rating or review controls. Full account erasure and retention handling is mandatory Phase 7.1 work.

Existing entertainment routes keep the same stable IDs and slugs. Scheduled announcements and releases follow server UTC timestamps. Optional staff roles and module scopes can appear in the private account response. Clients can use them to hide ineligible controls, while the centralized API remains authoritative for every staff operation.

## Homepage and search contracts

Use `GET /api/v1/homepage` for the ordered hero, sections and pre-footer campaigns. Use stable section and content IDs, image variants, the `mobile` artwork when available, and `serverNow` for schedule calculations. Revalidate around `nextChangeAt` and on foreground. Render only eligible returned placements, provide a neutral media fallback, retain sponsored disclosure and route CTA actions to their canonical internal path or approved HTTPS destination. Load the detail route for video availability and preserve viewer-initiated playback.

Use `GET /api/v1/search/suggestions?q=...` for bounded suggestions and `GET /api/v1/search` for grouped results with `q`, optional `genre` or `module`, and pagination. Review entries use spoiler-safe projections. Use the returned stable ID, module and path for navigation.

A future native client may use `POST /api/v1/homepage/campaign-events` after explicit analytics opt-in. Send campaign UUID, stable placement key, a visit UUID and event kind. Apply the same continuous, one-second half-visible exposure definition and respect foreground state, deduplication and user opt-out.

## Personal library and cross-device playback

Use the same private `/api/v1/personal` contracts for dashboard, watchlist, history, following, reminders and recommendations. Send the current bearer token, use stable module names and UUIDs, and clear private data when identity changes. Use the public related-content endpoint independently of account state.

Playback starts with a GET of the current source digest, revision, history epoch and eligible progress. Only submit progress for released full videos and recorded replays with the matching public video ID. Send position and player duration in seconds, use approximately 15-second synchronization plus safe flush events, and stop stale writes after a 409 until the viewer reopens with fresh state. A history epoch change supersedes queued writes across devices. Respect the explicit history and recommendation preferences independently of analytics. Preserve user-initiated playback and display Continue Watching only for eligible synchronized records.

Notifications use existing owned REST pagination and the private Socket.IO notice signal. Re-fetch after reconnect. Native push delivery remains in the mobile phases.

## Public discovery layout reference

The web discovery order is cinematic hero, Cinema, Originals, 404 Reality Not Found, Reviews and Top Picked Profiles. Keep empty shelves and catalogue links in the native reference design. Reuse landscape artwork for short films, podcasts and live events, and portrait artwork for movies and people. Use the optional entertainment homepage projection and the public talent category filter. The review composer selects published records and keeps rating and review ownership on the existing API. Playback stays explicitly viewer-initiated.
