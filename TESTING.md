# Testing

Run `npm run lint`, `npm run format:check`, `npm test`, and `npm run build` from the repository root. `npm test` runs both workspaces. Vitest and Supertest exercise Express. React Testing Library covers the public shell, module routes, mobile navigation and focus, not-found handling, button states, Zod-backed form validation, empty and error states, shared toast state and the Axios response contract. Fixtures run only in tests.

The suite covers liveness, disconnected readiness, the ready response contract with an injected state, 404 responses, pagination validation, request IDs, CORS, Helmet headers, rate limiting, JSON limits, asynchronous error handling and production error sanitization.

## Phase 1.1 results

On Node.js 24.22.3, a clean install from the root lockfile, lint, formatting checks, all 12 backend tests and the frontend production build passed. A runtime smoke check confirmed that Vite serves the shell and transformed React entry. The backend served liveness 200 and readiness 503 with a deliberately unreachable local database address, then shut down cleanly after its connection attempt failed. A separate startup check confirmed that a missing URI produces a clear configuration error.

The Phase 2.2 carry-forward run verified that the configured URI selects `fdfs` and that Atlas responds to a ping. The running server returned HTTP 200 for health and readiness, then closed HTTP and disconnected MongoDB on graceful shutdown. Authentication index inspection confirmed six user indexes and four session indexes, including their default IDs. Git ignores the actual `.env`. Phase 1 is PASS.

## Phase 1.2 results

Lint, formatting and the frontend production build passed on Node.js 24.22.3. All 27 frontend tests and 12 backend tests passed.

Chrome verified the public layout at widths of 320, 390, 768 and 1440 pixels, including mobile keyboard focus and in-page scrolling. Axios reached Express and reported readiness 503 with MongoDB unreachable, then reported the backend offline after shutdown. The Phase 1 carry-forward live readiness check returned 200.

## Phase 2.1 verification

Run the full test suite with `TEST_MONGODB_URI` pointing to a disposable, unauthenticated loopback MongoDB instance, such as `mongodb://127.0.0.1:27017`. Integration tests generate a separate database name and drop it at teardown. Without that variable, the database integration suite is skipped. The tests use Nodemailer's isolated JSON transport.

Coverage includes registration races, bcrypt hash storage, verification and reset expiry and replay, password changes, JWT validation, concurrent refresh rotation, revocation, multiple devices, live role enforcement, privilege escalation protection, CSRF, rate limits, protected frontend routes and session restoration.

On Node.js 24.22.3, lint, formatting, the production build and 35 frontend plus 28 backend tests passed. Chrome used the running Express entry point and isolated MongoDB for registration, login, profile updates, cookie rotation on reload, device listing, password-change revocation, mobile sign-out and clean shutdown. An additional Chrome run verified email links and password recovery through Express with Nodemailer's JSON test transport.

The production dependency audit reported zero known vulnerabilities. The production bundle excluded diagnostics and configured backend secrets.

An isolated Atlas database passed registration, email verification, login, refresh cookie rotation, password recovery and session invalidation. The probe dropped its isolated database afterward. The main `fdfs` database was used for readiness and index checks.

Gmail authenticated over STARTTLS and accepted both transaction emails with the configured sender. Both subjects were confirmed in the authorized recipient's inbox. The generated links used the configured frontend origin and the expected verification and recovery routes. The Phase 3.1 carry-forward probe authenticated using the saved `SMTP_HOST=smtp.gmail.com` setting. No delivery retry was required. Phase 2.1 is PASS.

## Phase 2.2 verification

The phase adds tests for administrator guards, verified role enforcement, paginated user filtering, protection of administrator accounts, suspension, session revocation, owner-scoped submissions, moderation transitions, publisher authorization, audit access, image content validation and reference protection, and YouTube parsing and playback states. Use a disposable local MongoDB replica set and set `TEST_MONGODB_RS_URI` to its unauthenticated loopback URI to run transactional integration tests. The suite generates and drops its own database. Keep `TEST_MONGODB_URI` set independently for the original authentication suite.

Lint, formatting, the production build and all 85 automated tests passed on Node.js 24.22.1. The suites include 41 frontend and 44 backend tests. The production dependency audit reported zero vulnerabilities. The configured secrets scan found zero matches in Git candidates or the production bundle.

The live administrator media API uploaded a temporary image to Cloudinary, listed its persisted Atlas record, deleted the image and returned the deletion audit entry. The temporary asset and isolated database were cleaned up.

## Responsive verification

Check each page and component from 320px upward using fluid Tailwind layouts. Cover 320–374px, 375–424px, 425–639px, 640–767px, 768–1023px, 1024–1279px, 1280–1535px and 1536px and above. Exercise the public, account and administrator paths at 320, 375, 425, 640, 768, 1024, 1280, 1440 and 1920 pixels. Include portrait and landscape, keyboard focus and touch controls, horizontal overflow, responsive type and media, form and dialog fit, loading, empty and error states. Verify essential actions without hover. Report browser emulation and physical-device testing separately.

Headless Chrome exercised a production build with isolated API responses at all nine widths and at 568×320 and 844×320 in landscape. The run covered public routes, authentication forms, account settings and sessions, owner submissions, administrator pages, mobile record cards, desktop tables, dialogs and image controls. It checked the keyboard skip link, Escape and drawer focus return, and enabled touch emulation on narrow viewports. The final pass found zero horizontal overflow, including the repaired account session layout with a long unbroken device name. Physical-device coverage is pending.

Chrome rendered the authorized YouTube embed at 238×200px on the 320px viewport and at 890×501px on the 1280px viewport. Phase 3.1 inspected the provider's ready iframe and found an accessible Play video control with a different selector than the earlier test expected. A trusted browser click on that control started playback and advanced the clock. The existing CSP and browser playback policies stayed in effect. Automated fixtures cover player loading, readiness and provider error handling.

## Phase 3.1 verification

All 97 automated tests passed on Node.js 24.22.1, with 46 frontend and 51 backend tests. The added coverage includes personality and URL validation, stable slug conflicts, published-only search and pagination, private-field protection, administrator access, proposal ownership and review, stale corrections, association, archival, media references, directory loading, session restoration during public reads and form validation. The transaction tests use disposable loopback replica-set databases. Lint, formatting and the production build passed. The production dependency audit reported zero vulnerabilities.

A Cloudinary probe uploaded a temporary image, attached it as a portrait and cover in an isolated database, fetched the published image over HTTPS, verified that attachment blocked deletion, then detached and deleted it. The probe used a disposable local replica set. Production personality data was left untouched.

Chrome emulation ran the production frontend against Express and an isolated MongoDB replica set at 320, 375, 425, 640, 768, 1024, 1280, 1440 and 1920 pixels, plus 568×320 and 844×320 in landscape. The directory, profile detail, owner correction, administrator listing and editor, and moderation view fit without horizontal overflow. The run checked the keyboard skip link, Escape and focus return in the archive dialog, touch-oriented layouts, search URL updates, and creating an administrator draft through the UI and reading it back from MongoDB. Physical-device coverage is pending.

GitHub `main` was checked at `f015093`. The Phase 2.2 runtime checks are complete. Checkpoint `3c0ef59` is local pending authorization for a fast-forward push to the default branch.

## Phase 3.2 verification

All 109 automated tests passed on Node.js 24.22.1, with 52 frontend and 57 backend tests. The added tests cover film schema and URL validation, Original classification, rights confirmation, slug conflicts, release filters and video embargo, shared moderation, account and media ownership, credits and filmography, archive behavior, lazy player initialization and release forms. Lint, formatting and the production build passed. The production dependency audit found zero vulnerabilities. The automated transaction suites use isolated loopback MongoDB replica sets.

Chrome ran the production frontend against Express and an isolated MongoDB replica set at 320, 375, 425, 640, 768, 1024, 1280, 1440 and 1920px, plus 568×320 and 844×320 in landscape. The catalogue, detail, creator, moderation and administrator views and archive dialogs had zero horizontal overflow. The trailer container fit at all nine widths, and the archive dialog returned focus on Escape. Physical-device coverage is pending.

The browser used a verified creator account to upload a temporary Cloudinary poster, add a published Talent credit, save a draft and submit it. A separate administrator approved and published it, then unpublished and archived it. Public film retrieval and filmography reflected those transitions. The scheduled Original fixture exposed its approved trailer while withholding the main video. The authorized trailer's playback clock advanced in Chrome after a viewer click. The temporary Cloudinary asset was deleted and the disposable MongoDB replica set was stopped.

The Phase 4.1 carry-forward check verified GitHub `main` at `061af97`, with the preceding Phase 2.2 and Phase 3.1 commits in its history.

Chrome played the authorized YouTube video through the published main-film action during an isolated Phase 4.1 carry-forward run. The film's video clock advanced. The scheduled film response withheld the main video identifier before release, and unpublication returned HTTP 404. Overall Phase 2 and Phase 3 are PASS.

## Phase 4.1 verification

All 121 automated tests passed on Node.js 24.22.1, with 58 frontend and 63 backend tests. Lint, formatting and the production build passed. The production dependency audit found zero vulnerabilities. The added tests cover published visibility, numbering, chapter validation and seeking, participant relationships, media references, account eligibility, comment ownership, duplicate reporting and administrator moderation.

Chrome used the production build with Express and a disposable MongoDB replica set at 320, 375, 425, 640, 768, 1024, 1280, 1440 and 1920px, plus 568×320 and 844×320 in landscape. The show, episode, chapter, comment, Talent and administrator views fit with zero horizontal overflow. The run also checked existing routes, dialog Escape and focus return, mobile layouts and responsive iframe sizing. Physical-device coverage is pending.

The isolated run configured and published a show, attached temporary Cloudinary artwork, saved an episode draft with host and guest references and authored chapters, and published the episode. Public retrieval and Talent appearances reflected those records. The scheduled episode exposed a distinct teaser and withheld its main video and chapters. Chrome played the authorized podcast video, clicked a chapter, and observed playback travel to 25 seconds with the chapter highlighted. A verified account posted a comment in the browser, an administrator hid it, and archival removed public episode access. The temporary Cloudinary artwork was deleted.

## Phase 4.2 verification

All 130 automated tests passed on Node.js 24.22.1, with 61 frontend and 69 backend tests. Lint, formatting and the production build passed. The production dependency audit found zero vulnerabilities.

The Phase 4.2 automated suites use disposable local MongoDB replica sets and mock email transports. They cover UTC and IANA timezone validation, submitted and corrected event review, public discovery and video visibility, organizer ownership, authorized state transitions, Socket.IO origin and session checks, room isolation, reconnect recovery, chat limits, moderation and mute expiry, and persistent reminder cancellation, scheduling and lease recovery.

The configured SMTP sender accepted one authorized test reminder. Gmail inbox search found one copy under its unique test subject. The worker stored the delivery as sent after one attempt. Only the disposable test database held the reminder subscription and fixture event.

Chrome ran the production frontend against Express and a disposable MongoDB replica set. A verified organizer uploaded temporary Cloudinary artwork, created and submitted a draft, and started the approved event. A separate administrator approved and published it. The public countdown and reminder subscription worked, and a referenced artwork deletion returned HTTP 409. Two independent Chrome profiles exchanged live chat. One session disconnected, missed a message and recovered it through persisted history. A moderation action removed the message in the other session. The administrator ended the event, published its replay and archived the event. The public route returned HTTP 404 after archival. Temporary Cloudinary assets and isolated databases were removed.

The discovery, event detail, video, live chat, organizer forms and administrator controls fit at 320, 375, 425, 640, 768, 1024, 1280, 1440 and 1920px, plus 568×320 and 844×390 in landscape. An existing-route smoke check covered home, Cinema, Originals, Podcasts, Talent, Reviews and account. Chrome also submitted chat using a keyboard-sized viewport. Physical-device checks remain pending.

The backend entry point returned HTTP 200 for health and readiness, accepted a Socket.IO client, and drained socket and database connections on graceful shutdown.

The supplied YouTube link initialized paused in the shared player. A viewer click started the video and advanced its clock in the published replay view. YouTube reported the content as originating from a live broadcast, with no active live indicator during the check. Active YouTube Live playback is PENDING an authorized and currently active broadcast.

## Phase 4A.1 verification

GitHub `main` was checked at `cea3a01`, completing Phase 4.2 synchronization. Phase 4.1 remains PASS. Overall Phase 4 remains PENDING active YouTube Live playback. An authorized active source was unavailable for the carry-forward check.

Lint, Prettier, the production build and all 137 tests passed on Node.js 24.22.1. This includes 63 frontend and 74 backend tests. The production dependency audit reported zero vulnerabilities. The configured-secret scan found zero matches in source and built assets.

The isolated suites cover legacy administrator access, one-time Super Administrator bootstrap, protected accounts, immediate session invalidation, module scopes, dashboard counts, all five direct publishing workflows, protected previews, schedule embargoes, stale edits, reference protection, homepage publication, public settings projections, maintenance, registration and community controls. The bootstrap was exercised against disposable accounts.

The isolated production-build Chrome workflow created and published Cinema, Originals, a podcast episode, a live event and a Talent Profile from the administrator forms. Each item appeared on its corresponding public route. The profile displayed the podcast appearance. The authorized Cinema and Originals recordings started after a viewer click and advanced. The live test verified scheduled player state, explicit start and end notifications over Socket.IO, and replay publication. Fresh Chrome sessions started and advanced the public podcast recording and the FDFS Live replay after a viewer action. Editing a published Cinema film updated the public title, and unpublication removed public route and homepage featured access. The Cloudinary probe uploaded, selected, fetched and protected a referenced asset, and removed the temporary image through cleanup.

Chrome also verified a saved homepage draft preview, publication of the homepage hero, website branding, navigation visibility, plain-text legal content, closed registration and maintenance administrator access. The public routes loaded again after maintenance was cleared. The administrator layout, forms, records tables, media picker, preview controls, publication dialogs and navigation fit at 320, 375, 425, 640, 768, 1024, 1280, 1440 and 1920px, plus 568×320 and 844×390 in landscape. Physical-device verification and approved production content and legal onboarding remain pending.

## Phase 4A.2 verification

Phase 4A.1 carry-forward was verified on GitHub `main` at `dade4b6`. The Phase 4A.2 regression suite includes the existing CMS and entertainment modules. Chrome verified shared FDFS Live chat, room changes and history, event presence totals, and revisioned Website Settings. Overall Phase 4 remains PENDING an authorized active YouTube Live broadcast. No active source was available.

Node.js 24.22.1 passed lint, formatting, the production build and 145 tests, with 65 frontend and 80 backend. The production dependency audit reported zero vulnerabilities. The configured-secret scan found zero matches in source and built assets.

Independent Chrome contexts and multiple tabs verified guest and authenticated deduplication, sign-in transitions, account session revocation, reconnect, stale expiry and authorized administrator updates. Automated MongoDB tests verified local-midnight boundaries, duplicate events, distinct-account reporting across days, raw expiry and missing-data handling. A production build sent an actual opt-in event to the isolated API and rendered a chart and its data table.

Browser and API checks verified ticket creation, support-only staff access, assignment, priority, public replies, private notes, audit history, case resolution and reopening. API checks rejected cross-user and cross-ticket reads. One-time guest verification created the ticket in a disposable database. Expired guest challenges and ticket access were rejected. A private screenshot uploaded, normalized and previewed using a protected response. Expired and unauthorized attachment requests were rejected. The recipient confirmed all three authorized Gmail test messages arrived. SMTP accepted guest verification, ticket acknowledgment and staff reply after one attempt each.

The isolated checks verified ownership and real-time updates for account notifications, public and creator announcement audiences, scheduling and expiry, and safe operational health responses. The real server entry point returned HTTP 200 for health and readiness and drained on shutdown. A temporary Cloudinary upload updated provider health and the test image was removed. Test databases used disposable MongoDB replica sets.

Chrome verified 16 routes at 320, 375, 425, 640, 768, 1024, 1280, 1440 and 1920px, plus 568×320 and 844×390 landscape. Checks included the analytics chart and open data table, support forms and conversations, notifications, admin workspaces, existing public routes, horizontal overflow and mobile drawer touch activation, keyboard focus and Escape dismissal. Physical-device verification and production onboarding remain later phases.

## Phase 5.1 verification

| Audit classification          | Evidence and follow-up                                                                                                                                                                                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Already implemented           | Authentication, verification, recovery, session revocation, staff permissions and direct publishing for Cinema, Originals, Podcasts, Live and Talent.                                                                                                                             |
| Already implemented           | Scheduled-release visibility, trailers and film extras, podcast notes, resource links, chapters and credits, Talent filmography and podcast appearances.                                                                                                                          |
| Already implemented           | Live scheduling, cancellation, rescheduling, reminders, replays and chat controls. Media references, private screenshots, ticket ownership, guest verification, and support availability during maintenance.                                                                      |
| Already implemented           | Website settings, registration restrictions, analytics retention and opt-out, announcement audience checks, notification ownership, operational health and worker reporting.                                                                                                      |
| Missing from an earlier phase | The bootstrap supported elevation only. Added hidden-password account creation, idempotency and explicit existing-account confirmation. Also corrected cross-tab consent display and suspended administrator route handling.                                                      |
| Missing from an earlier phase | The account model has a deleted state and supporting projections. No complete account erasure or anonymization workflow exists across dependent collections. A separately scoped retention workflow must cover ratings, reviews, support, media, analytics and audit obligations. |
| Intentionally scheduled later | Full public Reviews UI in Phase 5.2. Homepage and search in Phase 6.1, personalization in Phase 6.2, physical-device and full release testing in Phase 7, and production onboarding in Phase 8.                                                                                   |
| External verification pending | Active YouTube Live playback, permanent administrator provisioning and licensed TMDB import.                                                                                                                                                                                      |

GitHub `main` contained `65bb559`. A read-only connection verified the configured database is `fdfs`, with replica-set topology and sessions. The requested administrator address and bootstrap marker were absent. The owner can run the documented hidden-password command locally. An isolated replica set verified password hashing, normalized unique email, idempotency, existing-account conflicts, audit logging and real administrator login.

Node.js 24.22.1 passed lint, Prettier, the production build and 153 tests, including 65 frontend and 88 backend. The production dependency audit found zero known vulnerabilities.

The isolated integration suites cover catalogue permissions and revisions, draft visibility, media references, published Talent credits, catalogue filters, provider validation and duplicate protection, concurrent ratings and likes, distribution and ranking, author ownership, spoilers, report handling, trending, publication boundaries, opt-in analytics and notification ownership. Test fixtures used disposable databases and a local artwork provider fixture. No production catalogue or community records were created.

Production-build Chrome emulation exercised administrator login and return to the requested route, artwork upload, Talent search, movie draft and preview, publishing, published edits and review report moderation. Responsive checks covered 320, 375, 425, 640, 768, 1024, 1280, 1440 and 1920px, plus 568×320 and 844×390 in landscape. Chrome checked overflow, media picker Escape and focus restoration, and administrator drawer touch activation.

## Phase 5.2 verification

GitHub `main` was checked at `65bb559`. Phase 5.1 commit `a7ac502` remained local at the time of verification. A read-only check confirmed `admin@fdfs.one` was absent from the configured `fdfs` database. Isolated administrator login worked. Production owner provisioning was pending at that checkpoint. Phase 4 remains PENDING a currently active, authorized YouTube Live source.

Node.js 24.22.1 passed lint, formatting, the production build and all 159 tests, including 69 frontend and 90 backend. The production dependency audit found zero known vulnerabilities. The configured-secret scan found zero matches in source and build artifacts.

Production-build Chrome and disposable MongoDB fixtures verified movie creation and publication via the centralized CMS, catalogue search and filters, published metadata, and unpublication. The previously authorized trailer started after viewer interaction, advanced in YouTube's player and recorded a consented playback start. Separate accounts created, changed and removed half-star ratings, checked distribution, wrote and edited a marked-spoiler review, liked and commented, received an owned notification linking to the updated discussion, and viewed personal history. A report reached the moderator queue and hiding the review removed it from the public feed while keeping the independent rating. Released Cinema and Originals used the shared interactions. Talent displayed the linked published movie.

Chrome checked the catalogue, filters, movie detail, rating input, discussion and review editor, account history, report dialog and moderation layout at 320, 375, 425, 640, 768, 1024, 1280, 1440 and 1920px, plus 568×320 and 844×390 landscape. Touch selected a half star, a keyboard arrow selected the next increment, and Escape restored report-dialog focus. Physical-device verification remains Phase 7. Databases, artwork fixtures and browser profiles were disposable.

## Phase 6.1 verification

The previous bootstrap passed an undefined bcrypt cost from the general environment schema. The corrected CLI uses the shared authentication configuration. The production database `fdfs` returned an active, verified Super Administrator with its bootstrap audit entry. The owner confirmed that signing in opens `/admin`. The isolated suite also checks secrets-free terminal output, Windows-style carriage returns, password confirmation cancellation, login, refresh, logout and protected access.

The isolated MongoDB suite covers the six-module homepage and search, draft and published section order, scheduled-content eligibility, genre counts, media references, promotion scopes and lifecycle, placement priority, consent, deduplication, retention and measured metrics. The fixtures include unpublished and embargoed titles, spoiler-marked reviews, and unsafe destinations.

Headless Chrome opened `/admin` with a fresh isolated account. A Cinema title was published through the API. The browser then selected records from every module, configured the hero, reordered a section, previewed and published the homepage, and verified the public result. It created a sponsored external product campaign and an internal event campaign. The checks covered desktop and mobile previews, active placements, pause, scheduled visibility and expiry. The consent test recorded a visible hero impression and a click, verified 100% CTR for that data, and observed zero footer events after opt-out. Search suggestions, result grouping, keyboard focus, touch swipe, the Cinema rail and the Support Center worked in the isolated browser. The internal campaign’s schedule boundaries were advanced in the test database. Test databases and local media were cleaned up after verification.

The homepage, search and admin editors had no document-level horizontal overflow at 320, 375, 425, 640, 768, 1024, 1280, 1440 and 1920px, plus 568×320 and 844×390 landscape. The isolated 375px homepage measured 138 ms to DOMContentLoaded and 139 ms to load, with one hero artwork resource request in that run. The measurements reflect localhost and the headless environment. Physical-device verification remains scheduled for Phase 7.

Node.js 24.22.1 passed lint, Prettier, the production build and all 167 automated tests, including 69 frontend and 98 backend. The first full run hit the existing auth suite setup deadline under default parallelism. The full rerun passed with three Vitest workers and a disposable MongoDB replica set. The production dependency audit reported zero known vulnerabilities. The configured-secret scan found zero matches in Git candidates and build assets.

The production owner login and Phase 6.1 isolated checks are PASS. Phase 5 remains PASS in isolation. Overall Phase 4 remains PENDING an authorized active YouTube Live broadcast. GitHub `main` was at `65bb559` during verification. Phase 5 checkpoints `a7ac502` and `af5e1b2` and the Phase 6.1 checkpoint remain local pending push authorization.

## Phase 6.2 verification

The production `fdfs` database still showed an active, verified permanent Super Administrator in a read-only check. GitHub `main` contained `a7ac502`, `af5e1b2` and `f902574`. The visual reference screenshots were absent from the attachment folder, so direct comparison remains pending.

The Phase 6.1 failure occurred in the auth suite's existing setup deadline under unrestricted backend parallelism. The suites use separate database names, while replica-set connections and index setup share the local MongoDB instance. The backend default now limits Vitest to three workers. No test deadlines were raised. Run `npm test` in CI with `TEST_MONGODB_URI` and `TEST_MONGODB_RS_URI` pointing to disposable test instances to exercise the MongoDB suites.

Isolated checks cover concurrent saves, account isolation, restricted targets, old source and revision rejection, cross-session playback state, throttling, completion, opt-out, history deletion, following, notification deduplication, recommendation eligibility and preference isolation. Production-build Chrome used two separate test accounts and a guest profile, then restored the first account in an independent second profile. The authorized YouTube video played after a click, persisted progress at about 10 seconds, and resumed at that offset in the second profile. Seeking near the end with the official player API marked the title complete. The trailer created no full-video history. A fresh signed-in Chrome session with history off played the authorized video with zero resulting history rows. Chrome also checked watchlists, settings, related content, following, Notification Center reconnect, homepage rails, Promotions visibility, Support Center, and the administrator settings screen. The 11 viewport sizes covered 320 through 1920 pixels, plus 568 by 320 and 844 by 390 landscape. At 375 pixels, Chrome opened Watch history with Enter and switched to Watchlist with a touch gesture.

Lint, formatting and the production build passed. The default test command passed all 173 tests against a disposable MongoDB replica set, including 69 frontend and 104 backend tests. The production dependency audit found zero known vulnerabilities. The scan found no configured secrets or private files in Git candidates and no configured secrets in the build artifacts.

Phase 4 stays PENDING an authorized active broadcast. The tested video was on demand. Phase 7 retains physical-device verification, comprehensive performance testing, and cross-module account erasure.

## Phase 6 Public UI Refinement 1

The screenshot reference attachment contained the written brief only. Direct image comparison remains pending. Representative desktop and mobile screenshots were captured from isolated Chrome using disposable public content. The homepage, both short-film modules, Podcast, Live, Reviews and Talent were exercised at the nine standard widths and two landscape sizes, with representative detail pages, native modal filters and the review composer.

Automated coverage includes the five requested shelves, empty and capped carousel states, Show More destinations, filter apply and reset, mainstream review spoiler protection, multiple published Talent categories, measured rating filters and Live schedule eligibility. The refinement retains the existing three-worker backend test default. Physical-device verification remains in Phase 7. The active YouTube Live check still requires an authorized active broadcast.

Chrome verified homepage loading, empty and API error states, CMS publication, scheduled and active sponsored promotions, keyboard and touch navigation, podcast chapters, watchlist persistence and all three review submission paths at 3.5 stars. The authorized on-demand film advanced after a viewer click, saved progress and resumed at 10 seconds in an independent signed-in session. Fixtures used disposable databases.

Lint, Prettier and the production build passed. All 182 automated tests passed against a disposable MongoDB replica set, including 74 frontend and 108 backend tests. The production dependency audit found zero known vulnerabilities. The configured-secret scan found zero matches in Git candidates and build assets, and no private files in Git candidates.

## Phase 6 administration refinement verification

The isolated Chrome run verified all eight administration workspaces at 320, 375, 425, 640, 768, 1024, 1280, 1440 and 1920 pixels, plus 568 by 320 and 844 by 390 landscape. It checked desktop sidebar collapse, mobile Escape and focus restoration, six Content cards, and the 60 percent desktop hero. Desktop and mobile administration captures were saved outside Git. The attachment contained the written brief only, so reference screenshot comparison is pending.

Chrome created and published an explicitly categorized Talent Profile before its first credit, published Cinema through the simplified form after the missing-key fallback, displayed an Original and a podcast with supporting media and resources, and opened an upcoming Live event with chat disabled. The isolated API created the Original, podcast and event fixtures. The browser verified the missing-movie review in My Reviews, approved its catalogue association and read it on the public movie page. Homepage verification seeded five selections and a campaign through the isolated API and used the browser to preview and publish them. Chrome uploaded the artwork via Media Library and verified catalogue reuse with a test image provider and a disposable MongoDB replica set.

The test suite retains the three-worker replica-set configuration and covers staff scoping, YouTube metadata normalization and fallback, private pending reviews, duplicate detection, concurrent approval, rating totals, notification delivery, bidirectional credits, chat enforcement with existing reminder and replay coverage, explicit categories and homepage eligibility.

Node.js 24 passed lint, formatting and the production build. All 190 automated tests passed, including 76 frontend and 114 backend tests. The production dependency audit found zero vulnerabilities. The configured-secret scan found zero matches in source candidates and build assets, and zero private file candidates.

A configured YouTube Data API key is required for actual metadata retrieval verification. Authorized active YouTube Live playback, external movie metadata licensing and physical-device verification remain pending. Account erasure and retention remain mandatory Phase 7.1 work. Performance optimization remains Phase 7.2 and production onboarding remains Phase 8.

## Final Phase 6 onboarding corrections

Isolated Chrome inspected the exact fields on eight creation views at 320, 375, 425, 640, 768, 1024, 1280, 1440 and 1920 pixels, plus 568 by 320 and 844 by 390 landscape. Chrome created and published Cinema and Originals, created an episode and an upcoming Live event, and created a profile in each Talent category. It checked automatic metadata with controlled responses, missing-key fallback, preservation of manual edits and the existing homepage draft and publication workflow.

Chrome checked the three Media Library upload forms, saved multiple images under an independent title and reused its artwork for a movie. It submitted existing and missing movie reviews through the four-input composer, approved the missing title through administration and verified public visibility after approval. These checks used a disposable MongoDB replica set and a local image test provider.

Node.js 24 passed lint, formatting and the production build. All 192 automated tests passed, including 76 frontend and 116 backend tests. The production dependency audit found zero vulnerabilities, and the configured-secret scan found no matches in source candidates or build assets and no private file candidates.

Owner content onboarding readiness remains pending actual metadata retrieval with a configured server-side `YOUTUBE_DATA_API_KEY`. Controlled responses covered the integration behavior. Authorized active YouTube Live playback and physical-device verification remain pending.

## Pre-release deployment verification

Local verification passed 194 tests against a disposable MongoDB replica set, including 76 frontend and 118 backend cases. The added cases cover rate-limit behavior at a bounded proxy hop, the staging indexing header, disabled email and provider rejection or timeout. Lint, formatting and the production build passed. The production dependency audit found zero vulnerabilities. The configured-secret scan found no matches in Git candidates or built assets and no private files in Git candidates. The production bundles used the configured HTTPS API origin and contained no hardcoded localhost API destination.

Node.js 24.22.3 passed both clean install commands on Windows. The backend-only install loaded the runtime dependencies, and the Vercel configuration built the frontend to `frontend/dist`. The actual production backend entry point served liveness and index readiness on the injected port with SMTP disabled.

Compiled Chrome verification used two separate local HTTPS origins on the same site, a disposable staging owner and a mobile viewport. It covered login, secure host-only cookie rotation after a hard reload, protected and public deep links, direct authenticated WebSocket connectivity, and logout. The local frontend server exercised the Vercel rewrite pattern against the compiled static output.

For the free-domain deployment, the updated Chrome check used a same-origin HTTPS API proxy and a separate cross-site Socket.IO endpoint. It verified that refresh cookies stay on the frontend host, rotate on hard reload and clear on logout. It also checked CSRF rejection, private no-store headers, JSON API errors, authenticated realtime and deep links. All 195 tests passed against an isolated replica set. The hosted Render API accepted the canonical Vercel Origin. Repeat the browser checks after deploying to Vercel.

After the owner configures both hosts, verify both backend health paths return JSON and the readiness response reports MongoDB connected. Confirm an uninvited browser is gated on Vercel. For an invited tester, hard-refresh the six modules, `/admin` and an account route, and inspect both hosts for the configured noindex headers. Check that static files load with their expected content types.

Check credentialed login preflight and session rotation on the exact HTTPS frontend. Confirm sign-in persists after hard refresh, logout invalidates the session, a different Origin fails CSRF, and authorized Socket.IO connects directly to Render. Confirm the proxy boundary with a staging-only probe using two client networks and confirm that synthetic forwarded values cannot change which rate-limit bucket receives the request. Do not log authentication headers or cookies. Run the physical browser checks in MOBILE.md.

Use staging-only fixtures to test automatic YouTube metadata, artwork upload and reuse, and provider-backed mail with controlled recipients. Verify a live reminder while the Free service is awake, then check worker recovery after a restart. Free instance sleep can delay or miss time-sensitive reminders. Hosted results remain pending until these checks run on the configured services.

## Pre-Phase 7 refinement verification

The final refinement adds regression coverage for Gmail normalization and alias collisions, verified-session enforcement, protected video source responses and release rules, the once-per-account welcome claim, and mocked Brevo acceptance, timeout and rate limits. Hosted transactional delivery requires the Render Brevo configuration and a controlled Gmail inbox. Verify registration, resend, password recovery and the welcome email in that inbox.

## Phase 7.1 functional testing, security and privacy

The isolated test suite passed 203 tests, 77 frontend and 126 backend. It covers permissions, session rotation and revocation, private support records and attachments, scheduled publication and archival, controlled mail and media flows, consent, promotion eligibility and owner-scoped personal activity. The account deletion tests verify the origin and password checks, owner and staff protection, multi-device revocation, personal data removal, rating and review counters, independent Talent profiles, retained rights cases and shared media. The destructive tests use disposable loopback replica sets.

Production-build Chrome verified public discovery and navigation, responsive administration and forms, publication and removal across the six modules, guest playback restrictions and verified player initialization, reviews and removal notices, and the persisted WhatsApp welcome. Account settings and its password-confirmation dialog were checked from 320 through 1920 pixels and at 568 by 320 and 844 by 390 landscape, with a real touch event used to cancel. The same isolated account then tested incorrect password rejection, successful erasure and the authentication guard after reload.

Cloudinary accepted a synthetic avatar from an isolated account, served it over HTTPS and confirmed its deletion after the account was erased. Provider acceptance and inbox delivery are separate checks. Hosted Brevo delivery still needs an authorized Gmail inbox. Live YouTube metadata and playback need the configured Data API and an authorized active broadcast. Owner review is still required for approved operator and contact details, retention and backup expiry, and the published policy wording.

Isolated Chrome checked guest gates and source-free detail responses for Cinema, Originals, Podcasts, Live, replays and movie trailers. It verified Gmail sign-in, playback return and player initialization, WhatsApp link attributes and persisted dismissal. The welcome modal and administrator layout were checked at the nine standard widths and both landscape sizes. Player authorization and initialization used controlled media fixtures.

Isolated Chrome checked the administration shell and mobile drawer at 320, 375, 425, 640, 768, 1024, 1280, 1440 and 1920 pixels, plus 568 by 320 and 844 by 390 landscape. The run covered owner sign-in, public-route redirection, session restoration, logout, and normal account registration and homepage redirection with controlled verification mail.

The browser submitted reviews for known and missing titles, followed the existing movie-association workflow, and removed a published review after entering a reason. My Reviews, the private in-app notification and public rating totals reflected the removal. Chrome used named confirmations for Cinema, Originals, Podcast, Live, Movies and Talent, and the public endpoints rejected the archived records. Destructive checks used disposable fixtures. Check the deployed shell and sign-in flows on physical devices.
