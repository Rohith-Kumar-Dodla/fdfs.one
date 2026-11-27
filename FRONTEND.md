# Frontend

The `frontend` workspace uses React and Vite. `main.jsx` mounts `App.jsx`, which provides the data router and query client. `layouts/` owns the public shell, `routes/` defines navigation and URL conventions, `pages/` contains route views, and `components/ui/` and `components/common/` contain primitives and shared application compositions.

## Approved stack

React + Vite, Tailwind CSS, React Router, Zustand, TanStack Query, Axios, React Hook Form, Zod and Lucide React are installed. YouTube IFrame Player API and Socket.IO Client are approved for their feature phases.

## Locked design tokens

| Token                 | Value     |
| --------------------- | --------- |
| Main background       | `#111827` |
| Navigation background | `#121212` |
| Surface               | `#1F2937` |
| Brand accent          | `#FACC15` |
| Accent hover          | `#EAB308` |
| Primary text          | `#FFFFFF` |
| Secondary text        | `#9CA3AF` |
| Border                | `#374151` |
| Live/error            | `#EF4444` |
| Typography            | Inter     |

Tailwind v4 and `styles/index.css` define the color, type, spacing and motion foundations. Inter is self-hosted with system fallbacks. Semantic success, warning, disabled, control and focus colors live alongside the locked palette. Containers cap at 76rem, with responsive gutters and Tailwind's default breakpoints. Controls use a 10px radius and panels use 16px. Transitions default to 160ms and respect reduced motion.

## Components and routes

Use native semantic controls with visible focus, a named icon button for icon-only actions and `FormField` for labels, hints and validation errors. `useValidatedForm(schema)` connects React Hook Form to Zod. Dialogs use the browser's modal behavior. Use the shared container, section heading, feedback states and pagination before creating local equivalents.

The shared layout provides desktop and mobile navigation, a skip link, route focus and scroll restoration. The landing page links to all six modules. Cinema, Originals, Podcasts, Live and Talent use their module paths plus `/:slug`. Reviews uses `/reviews` and `/movies/:slug`. Cinema, Originals, Podcasts, Live and Talent load their public views. Reviews lazy-loads the shared unavailable state. The router handles loading, route errors and unknown URLs. Production hosting should serve `index.html` for direct public route requests.

## API and state

Vite loads environment files from the monorepo root. Use `VITE_API_BASE_URL` for the public API address, which defaults to `http://localhost:5000/api/v1`. All `VITE_` values are public. Run Vite at `http://localhost:5173` or add your frontend origin to the backend's `CORS_ORIGINS`.

`api/client.js` sets an eight-second Axios timeout, validates the success envelope and normalizes backend and network errors. API functions accept an AbortSignal. Use scoped query keys such as `['status', 'health']` and include parameters when they affect the result. Queries default to 30 seconds of freshness and retry a transient network or server failure once. Mutations are explicit and should invalidate their affected query keys after success. Zustand owns shared menu and toast state.

The development-only `/_dev/api` route exercises health and readiness. Authentication uses the same Axios client and a shared wrapper for authenticated requests. Use `withCredentials` and the CSRF header for login, refresh and logout. Zustand holds the session ID, access token and initialization status in memory. TanStack Query owns account and session data. A single in-flight refresh shares results across concurrent requests, and Web Locks serialize cookie operations across tabs when supported. A protected request retries at most once in the same session. Authentication changes clear private queries and mutation state. Explicitly public Talent reads can continue while a session is restored.

## Account routes

Protected administrator URLs use the shared sign-in form with administration-specific guidance. Authentication returns the account to the validated internal destination. Staff scopes are checked after sign-in.

Guests can open `/login`, `/register`, `/verification-pending`, `/verify-email`, `/forgot-password` and `/reset-password`. Email links carry their one-time token in the fragment, which the form removes from the visible address after reading. Account-only pages are `/account` and `/account/settings` for profile changes, preferences, password changes and session revocation.

Use the account guard for protected pages and supply verification or role requirements when the corresponding features are added. Backend authorization remains authoritative. The existing public header shows guest links or an account menu based on the restored session.

## Responsive design

Design every page and component from the smallest viewport first. Use fluid layouts and existing Tailwind breakpoints, with representative ranges covering small mobile (320–374px), medium mobile (375–424px), large mobile (425–639px), small tablet (640–767px), tablet (768–1023px), laptop (1024–1279px), desktop (1280–1535px) and large desktop (1536px and above).

Ensure portrait and landscape layouts prevent unintended horizontal overflow. Scale typography, spacing and media with available width. Use touch-friendly controls, visible keyboard focus, responsive forms and scrollable modal dialogs. Give every essential action a keyboard and touch path. Include loading, empty and error states. Use record cards for administration lists below the laptop breakpoint and semantic tables where width permits.

Account Settings wraps unbroken session device names and uses shrinkable form and session columns. The session list and confirmation dialog fit narrow viewports during sign-out and revocation.

## Administration and media

Verified administrators can open `/admin`, `/admin/users`, `/admin/submissions`, `/admin/media` and `/admin/audit`. The shared shell includes a desktop sidebar and a mobile modal navigation drawer. The users and submissions routes include detail pages with confirmation dialogs for consequential changes. Verified account holders manage their own submissions at `/submissions`.

Account settings and the media library use the same file picker and responsive image component. Uploads use raw image bytes and bearer authentication. Previews use server-generated variants and image dimensions. The administration media library can preview a YouTube URL without saving a video record.

The reusable YouTube player builds privacy-enhanced iframe URLs from validated video identifiers. It uses IFrame Player API events for loading, playback state and failures, with a canonical YouTube link as a fallback. It preserves provider controls, supports fullscreen, starts paused and maintains the provider's 200px minimum player height. Host the app with a referrer policy that permits the embedding origin. The page CSP restricts frames to `https://www.youtube-nocookie.com`. Keep that host in any additional CSP frame allowlist and include `https://www.youtube.com` in any script allowlist for the player API and widget. [YouTube IFrame Player reference](https://developers.google.com/youtube/iframe_api_reference)

## Talent Profiles

`/talent` uses Axios and TanStack Query for paginated directory data. The URL holds debounced name search, profession, sort and page. The grid adapts from one to four columns, and the controls and profile header stack on narrow screens. Image components select API-provided size variants and display a neutral icon when a portrait is unavailable.

`/talent/:slug` renders the authorized fields the API returns. It sets a profile title, description and canonical URL in the browser. Filmography and podcast appearances link to released credits and episodes under their respective public routes.

Verified account holders can open a structured talent proposal from the directory or start a correction from an individual profile. Administrators manage profiles under `/admin/talent`, review proposals through the existing submissions section, and use confirmation dialogs for publication, archiving and account association. The editor reuses media library uploads, supports replacing portrait and cover images, and accepts IDs of existing library images.

## Cinema and Originals

`/cinema` and `/originals` share discovery, poster cards and detail views. Each route supplies its own classification to the API, and title search, filters, sorting and pagination read from the URL. The detail view renders a canonical URL, optional media and approved cast and crew. It shows a release time for announced films and refreshes their availability from the backend.

The shared image component uses 2:3 posters, 16:9 banners, Cloudinary variants, offscreen lazy loading and a neutral placeholder. The detail page mounts one YouTube iframe after a viewer selects the film, trailer or a behind-the-scenes video. It preserves provider controls and fullscreen. The player exposes the existing playback event interface for later progress tracking. [YouTube IFrame Player reference](https://developers.google.com/youtube/iframe_api_reference)

Verified creators manage independent films at `/creator/films`, draft proposals through the shared form and use submission detail for review status or rejection feedback. Search published Talent Profiles for credits, or open a talent proposal when a profile is missing. Verified administrators use `/admin/films` for Originals and published independent records, with the existing submissions section for independent review and release.

## 404 Reality Not Found

`/podcasts` shows the configured brand, hosts, latest released episode and a paginated directory. The URL carries title, topic, season, language, availability and sort filters. `/podcasts/:slug` shows a canonical title, artwork, show notes, Talent links and the server-provided release state.

Selecting Watch episode or Watch teaser mounts a single YouTube iframe. A chapter selected before initialization supplies its starting position to the player. Later selections use the player seek command, and the active chapter follows playback position. The shared player samples position while playing and releases its timer on pause, failure or unmount. [YouTube IFrame Player reference](https://developers.google.com/youtube/iframe_api_reference)

Released episodes show paginated plain-text comments. Verified accounts can post, edit or delete their own comments and report other comments. Admin routes under `/admin/podcasts` configure the show, edit episodes, verify playback and schedule publication, hide or restore comments, and resolve reports. The chapter editor accepts hours, minutes and seconds. Moving a chapter exchanges its time slot with its neighbor.

## FDFS Live

`/live` queries Live Now, Upcoming Events and Replays separately, with independent pagination and shared title, category and UTC day filters in the URL. `/live/:slug` displays event artwork, local time and IANA timezone, and a countdown initialized from server time. The waiting state lasts until a verified operator starts the event. During a live or replay session, the shared YouTube player uses the event's released provider ID and starts paused.

The shared application layout creates one Socket.IO connection on the configured API origin. Event detail reuses this connection for chat. Public visitors join one event room. Eligible signed-in viewers attach their current access token, and the client reconnects after refresh. Event notifications invalidate TanStack Query data. After reconnect, the detail and chat history refetch and combine persisted messages with bounded realtime updates. Chat history has explicit page controls and new messages leave the user's scroll position alone. Video and chat stack on mobile and sit side by side at the laptop breakpoint. The composer stays in the document flow so it can scroll above the keyboard.

Verified organizers use `/organizer/live` for their event list, draft form, scoped broadcast controls and chat moderation. Drafts and protected corrections use the shared submissions review, including rejection feedback and resubmission. Administrators use `/admin/live` to manage the full lifecycle and chat. Public reminder actions read the signed-in account's subscription, subscribe and cancel using REST.

## Reviews

`/reviews` displays published movie shelves, recent and trending community reviews, and released short films. `/reviews/movies` uses debounced title search and URL-persisted filters, sorting and pagination. The mobile filter dialog exposes the same controls. `/reviews/short-films` uses the existing released Film catalogue. `/reviews/community` filters the shared feed by target and rating. `/movies/:slug` displays published metadata and authorized trailers. `/reviews/:reviewId` displays the public discussion, and `/account/reviews` displays the signed-in account's activity.

Movie, Cinema and Originals detail pages share the half-star input, ten-bucket distribution, and review editor. Only released films expose community participation. Writes use authoritative API responses and query invalidation. Signed-in editors can remove their work with confirmation. The review form uses React Hook Form and Zod and warns before leaving an unsaved draft. Drafts stay in component state.

Feed excerpts omit spoiler titles and bodies. The detail page requests spoiler text after explicit reveal. Page metadata uses the target title and a generic description. Comments use collapsed same-page spoiler disclosure. Existing notification links lead to public discussion or the owner's review history. Trailer events use the shared YouTube lifecycle and existing opt-in analytics.

## Centralized CMS

Movies supports searching, filters, draft and published edits, preview, publication and archival. Artwork uses the shared library picker and upload controls. Credits select published Talent Profiles. Review moderation supports reasons, hiding, restoring and dismissing reports, and audited rating abuse decisions. The workspaces reuse the responsive drawer, dialogs and keyboard focus conventions. External import is unavailable. The review catalogue adds server-paginated status, target, spoiler and text filters, plus review, comment and audit detail.

The administration layout groups Overview, Content, Community, Platform and System routes. It uses the shared account session, permission-aware navigation, an accessible mobile drawer, a collapsible desktop sidebar and a breadcrumb. Listing pages reuse responsive records, pagination, filtered searches, confirmation dialogs and retry states. Quick actions open the five implemented module creation forms. Cinema and Originals have separate workspaces. The existing film detail and moderation routes remain compatible.

Use the shared media selector to choose a library asset while editing module artwork. The library can search by title or ID, filter by category and usage, and edit metadata. Preview and publication use each module's protected detail page. The independent and Original catalogues update from the production API after publication. Website Settings and Homepage Management warn before leaving unsaved changes.

The shared connection restores authentication, reconnects after changes to the session or network, pulses on route and visibility changes and refreshes credentials through the account session service. Visible pages with activity within five minutes and active live playback can contribute to presence. Presence payloads carry public route categories and eligible content slugs. Browser storage holds a rotating anonymous identifier. The footer checkbox controls optional historical events, with collection off until the visitor opts in.

Administrators can open Analytics for date-filtered historical trends, a chart and an accessible data table. Live activity shows aggregate Socket.IO updates and indicates stale or unavailable counts. Guest counts are estimates. Playback figures reflect events the web player observed. The mobile drawer, narrow layouts, touch controls and keyboard focus follow the existing design system.

The footer Support Center links to ticket creation and guest email access. Signed-in visitors can open their own tickets under `/support/tickets` and view owned notices under `/account/notifications`. Support Agents use `/admin/support` for assignment, replies, private notes, status, priority and audit history. Screenshots use authenticated fetches and local blob previews with cleanup on close. Public and authorized account announcements render as plain-text banners during their publication windows.

Public settings update the site brand, navigation, footer, legal pages, registration entry points and homepage metadata. Homepage Management previews the saved draft and publishes the active hero and ordered sections to the website. The public application renders legal and editorial fields as text.

## Cinematic homepage and discovery

The homepage loads dynamic hero slides and ordered rails through `/api/v1/homepage`. The active slide uses responsive desktop or mobile artwork, with priority on the initial image. Rails use native scroll snapping, arrow controls, responsive image ratios and lazy loading. The hero supports touch swipe, keyboard arrows, indicators and optional rotation. Focus, hover, document invisibility and reduced motion pause rotation. CTAs follow authoritative content availability and route into existing detail and reminder flows.

The sticky navigation opens a keyboard-accessible search dialog. Suggestions use a short debounce and cancel obsolete requests. `/search` provides grouped results, URL-based filters and pagination. Genre cards display calculated published counts and open the corresponding result filter.

Homepage Management configures the ordered hero and sections, featured titles, genre artwork, release windows and layout. Its saved preview uses the public homepage components with mobile or desktop artwork selection. Promotions includes campaign dashboards, artwork upload and selection, scoped content pickers, scheduling, previews, audit history and reporting. Sponsored campaigns display their disclosure in every placement. Preview excludes campaign event collection. The public footer continues to use Website Settings and provides the Support Center and analytics preference.

## Personal dashboard and playback

`/dashboard` links to Watchlist, Continue Watching, Watch history, Following and Reminders, plus the existing settings, ratings, notifications and support pages. Public eligible title cards and detail pages provide Save controls. Guests can sign in from the attempted action. Optimistic saves and follows roll back on failure. Related sections use published metadata and credits, with empty rails omitted.

Account settings keeps playback history, recommendations, and followed-talent notices independent from optional analytics and existing email preferences. Signed-in users can clear history across devices or remove individual entries after confirmation. Dismissing Continue Watching keeps history and other activity.

Only full videos pass playback samples to the synchronization layer. It uses the official player position, duration and state APIs, saves during playback at roughly 15-second intervals, and attempts a final save on pause, completion, navigation or document hiding. Unexpected browser termination can interrupt that final save. Resume starts the paused embed at the stored position after the viewer chooses Resume, and the viewer starts playback. [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)

The public homepage keeps its existing hero, editorial order and promotion placements. Signed-in personal sections load independently through user-scoped TanStack Query keys. Logout and identity changes clear those keys. The Notification Center supports categories, unread filtering, pagination and mark read actions, and refreshes its owned REST records after Socket.IO notifications and reconnection.

## Public UI refinement

The public homepage renders the hero, FDFS Cinema, FDFS Originals, 404 Reality Not Found, Reviews, Top Picked Profiles and the shared footer in that order. The five shelves keep their catalogue links when empty. The hero uses responsive artwork and up to five eligible slides, with keyboard arrows, swipe, indicators and reduced-motion handling. A branded hero appears when the feed is empty. Shared search remains available away from the homepage and on its dedicated route.

Cinema, Originals, Podcasts and Live use 16:9 cards. Movie and Talent catalogues use portrait artwork. Titles and compact metadata sit below the images with visible links and focus indicators. Filters open a native modal side panel or mobile sheet. Apply updates the URL and resets pagination. Reset clears the relevant filters. Escape closes the dialog and restores the trigger focus. Live shows Live Now and Upcoming Events, with a separate Replays view.

Streaming details put playback first and retain user-initiated embeds, chapters, watchlist actions, playback progress, released metadata, cast and related titles. Reviews opens with Find a Movie and Write Your Review. The composer finds published movie or released short-film records and reuses the owned rating, review, edit and delete flows. Cinema and Originals keep separate compact review areas. Spoiler text stays out of previews. Talent category navigation finds distinct profiles through published credits and guest appearances.

The footer provides the configured platform description, module links, published legal content, support and analytics consent. The public layout retains the existing FDFS type and color tokens. Public catalogues adapt from one-column landscape cards on the narrowest screens to multi-column desktop grids.
