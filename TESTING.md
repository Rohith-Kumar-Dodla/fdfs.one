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
