# FDFS.ONE

## Pre-release testing deployment

Use the separate Vercel staging project and a single Render Web Service for owner onboarding and mobile-browser testing. The Vercel URL proxies HTTP API requests to Render and browsers connect to Render directly for Socket.IO. Use the isolated Atlas staging database and its separate owner credentials.

1. After the deployment commit is available on an authorized GitHub branch, configure the [Render service](BACKEND.md#pre-release-render-service) and add its outbound CIDRs in Atlas. Check both health endpoints.
2. Configure the [Vercel project](FRONTEND.md#pre-release-vercel-project) and use `https://fdfs-one-staging.vercel.app` as the canonical testing URL. Enable Vercel Authentication for all deployments in the staging project. Verify that an incognito browser cannot load the staging site without an invitation. Share the preview with named testers only.
3. Bootstrap the separate [staging owner account](BACKEND.md#staging-administrator), then use the [deployment and device checklist](TESTING.md#pre-release-deployment-verification) before adding content. Use test content that can be exposed if a public catalogue endpoint or artwork URL is shared. Vercel protection gates the frontend and the Render API remains publicly reachable with application authentication and authorization on protected operations. The pre-release noindex headers are an additional indexing control.

This environment is for Phase 7 testing before the Web V1 release. Staging remains excluded from indexing.

FDFS is an entertainment, streaming and cinema community platform. Web development comes first. A React Native app will use the same API and database.

| Locked module         | Scope                                                    |
| --------------------- | -------------------------------------------------------- |
| FDFS Live             | Live sports, meetups and community events                |
| FDFS Cinema           | Independent short-film streaming                         |
| 404 Reality Not Found | Podcast streaming                                        |
| FDFS Originals        | In-house short-film productions                          |
| FDFS Reviews          | Mainstream movie and short-film ratings and reviews      |
| FDFS Talent Profiles  | Unified filmmaker, cast, crew and podcast guest profiles |

## Setup

Use Node.js 24 LTS and npm. From the repository root, run `npm ci` and create `.env` from `.env.example` if needed. Select `fdfs` in the Atlas URI path, allow the application host in Atlas network access, and configure `JWT_ACCESS_SECRET`. Configure SMTP and an approved sender for verification and recovery. Cloudinary credentials are optional for startup and required for image writes. See [backend setup](BACKEND.md#environment) and [frontend setup](FRONTEND.md#api-and-state).

- `npm run dev` starts the frontend at http://localhost:5173 and the API at http://localhost:5000 by default.
- `npm run dev:frontend` starts the frontend independently.
- `npm run dev:backend` starts the backend independently.
- `npm run build`, `npm run lint`, `npm run format:check`, and `npm test` run the local checks.
- FDFS Live uses `/socket.io/` on the same HTTP server as the API. Forward HTTPS polling and WebSocket upgrades to a single running backend. The email reminder worker runs in that backend and uses the configured SMTP account.

## Engineering constraints

Use JavaScript ES modules, an npm workspace with one root lockfile, and a modular monolith serving both clients through one `/api/v1` REST API and one central database. Implement features in their assigned phase. Keep credentials outside Git and use only real content in the application database.

Every frontend page and component follows mobile-first design from 320px through large desktop in portrait and landscape. Use fluid layouts, Tailwind's default breakpoints, responsive type, spacing, images and video, and forms and dialogs that fit their viewport. Prevent horizontal overflow, provide touch-friendly controls and visible keyboard focus, expose essential actions without hover, and cover loading, empty and error states. The [frontend standards](FRONTEND.md#responsive-design) and [viewport checks](TESTING.md#responsive-verification) apply to every phase.

Support small mobile (320–374px), medium mobile (375–424px), large mobile (425–639px), small tablet (640–767px), tablet (768–1023px), laptop (1024–1279px), desktop (1280–1535px) and large desktop (1536px and above).

## Roadmap

Phase 1 is PASS. Atlas selected `fdfs`, health and readiness returned HTTP 200, and graceful shutdown disconnected MongoDB.

Phase 2 is PASS. Gmail authenticated using the saved hostname, both transactional messages reached the authorized inbox, and Cloudinary and YouTube runtime checks passed. GitHub `main` includes the Phase 2 and Phase 3 checkpoints through `061af97`.

Phase 3.1 passed automated checks and browser verification against the Express API and an isolated MongoDB replica set. It adds the published Talent directory and profile pages, an administrator Talent Profiles section, and talent proposals and corrections through the shared moderation workflow. Real profile onboarding requires authorized profile information and media. See [testing](TESTING.md) for verification results.

Overall Phase 3 is PASS. Phase 3.2 adds independent films in Cinema and FDFS productions in Originals, including creator proposals, administrator publishing, scheduled announcements and released credits on Talent Profiles. The carry-forward browser check confirmed released main-film playback, scheduled identifier protection and removal from public access after unpublication. Production onboarding requires a verified creator or an administrator, rights to publish the supplied media, and embeddable video URLs.

Phase 4.1 adds 404 Reality Not Found show and episode management, scheduled release, chapters, Talent appearances, and episode comments and reports. An administrator configures the actual show and supplies authorized artwork, video URLs, guest and host profiles, and any real chapter timestamps. See [testing](TESTING.md) for verification and remaining work.

Phase 4.2 adds FDFS Live discovery, organizer submissions and approvals, manual broadcast management, replays, chat moderation and email reminders. Authorized broadcasters configure their stream in YouTube Studio and OBS. A verified organizer or administrator starts the FDFS event after the YouTube stream is ready. Phase 4.1 is PASS. Phase 4.2 implementation and isolated checks are complete, and Phase 4.2 and overall Phase 4 are PENDING active YouTube Live playback verification. The supplied link played as a replay. GitHub `main` includes the Phase 4.2 checkpoint `cea3a01`. Physical-device testing and production content onboarding remain open. See [backend operations](BACKEND.md#fdfs-live) and [Phase 4.2 verification](TESTING.md#phase-42-verification).

Phase 4A adds centralized administration and platform management. Open `/admin` with a verified administrator account and select a module to create a draft, review the content and publish it. Use Website Settings for public configuration and Homepage Management for a saved preview, hero and section publication. Existing administrator accounts retain access. See the [Super Administrator bootstrap command](BACKEND.md#centralized-administration) for first-time staff-role management.

Phase 4A.1 is PASS. See the [isolated CMS verification results](TESTING.md#phase-4a1-verification).

Phase 4A.2 and overall Phase 4A are PASS. Phase 4A.2 implements analytics, live presence, support tickets and platform operations. Administrators use Overview, Analytics and Live activity for aggregate metrics, Announcements to publish scheduled banners, and System health to inspect observed service states. Verified Support Agents enter through `/admin/support` and can manage tickets. Users open and track tickets from the Support Center. Website Settings controls new tickets, available categories and historical analytics collection.

Production setup uses a named MongoDB replica-set database with transactions, index creation and TTL support, encrypted storage and backups, a trusted HTTPS frontend URL, a verified transactional SMTP sender, and one backend instance for presence. Review approved privacy and ticket-retention terms before onboarding. A production Super Administrator and approved content onboarding remain separate setup tasks.

Phase 5.1 implementation and isolated verification passed. Production account provisioning was pending at that checkpoint. This phase adds the administrator movie catalogue, the public catalogue API, and shared ratings, reviews, likes, comments and moderation. Open `/admin` to sign in. Use Movies to manage catalogue entries and Review moderation to act on reports. The Phase 4A.2 checkpoint `65bb559` is on GitHub `main`. [Phase 5.1 verification](TESTING.md#phase-51-verification)

Phase 5.2 and overall Phase 5 are PASS in the isolated environment. The public Reviews catalogue, movie details, ratings, discussions and account history complete the sixth entertainment module in the centralized CMS. Approved production content onboarding remains scheduled for Phase 8. Licensed provider access is required for external import. [Verification](TESTING.md#phase-52-verification)

The permanent Super Administrator uses `admin@fdfs.one`. Run the documented command in a local terminal and enter a fresh password at the hidden prompts. [Owner bootstrap](BACKEND.md#centralized-administration)

Phase 6.1 adds a unified cinematic homepage with ordered CMS sections, scheduled promotions, opt-in campaign reporting, and global search across all six modules. Use Homepage Management and Promotions in `/admin`. The production owner account is active and verified, and the owner confirmed that signing in opens `/admin`. [Phase 6.1 verification](TESTING.md#phase-61-verification)

Phase 6.2 completes the planned web feature work with a private dashboard, persistent watchlists, playback progress and history, followed talent, deterministic recommendations, related content, and personal homepage sections. Open `/dashboard` and use Account Settings to opt in to playback sync, recommendations, or followed-talent notices. Comprehensive testing and release optimization remain in Phase 7. Production onboarding and deployment remain in Phase 8.

Phase 6 Public UI Refinement 1 updates the public homepage, entertainment catalogues, streaming details, Reviews, Talent and shared navigation. The homepage uses a five-slide maximum and the five requested discovery shelves. Personal activity stays available through `/dashboard`. This is a Phase 6 checkpoint. The 22-subphase roadmap continues unchanged.

The roadmap has 11 main phases and 22 subphases.

- 1.1 Repository and backend foundation
- 1.2 Frontend foundation and design system
- 2.1 Authentication and authorization
- 2.2 Administration and media services
- 3.1 Talent Profiles full-stack
- 3.2 Cinema and Originals full-stack
- 4.1 404 Podcasts full-stack
- 4.2 FDFS Live full-stack
- 4A.1 Centralized Admin Dashboard, CMS and Website Management
- 4A.2 User Analytics, Live Presence, Support Tickets and Platform Operations
- 5.1 Movie catalog and review backend
- 5.2 Movie discovery and community frontend
- 6.1 Homepage and global discovery
- 6.2 Personalization and platform integration
- 7.1 Functional testing and security, including mandatory cross-module account erasure and retention
- 7.2 Performance and release optimization
- 8.1 Production infrastructure
- 8.2 Real content onboarding and Web V1 release
- 9.1 Mobile foundation and streaming modules
- 9.2 Mobile community, profiles and user experience
- 10.1 Mobile testing and optimization
- 10.2 Mobile production release

## Phase 6 administration refinement

Open `/admin` for the full-width administration workspace. Content contains Cinema, Originals, 404 Reality Not Found, Live, Movies & Reviews and Talent Profiles. Movie Requests in Movies & Reviews handles privately saved reviews awaiting a verified movie. Media Library organizes assets around the existing catalogue records and includes a Shared Assets area. Homepage Management edits the five hero slots, featured picks and campaign placements.

Set `YOUTUBE_DATA_API_KEY` on the server to enable YouTube metadata lookups. Editors can enter the same details manually. FDFS Live chat defaults off. Authorized active YouTube Live playback, external movie metadata licensing and any unverified live provider checks carry forward.

## Final Phase 6 onboarding corrections

The Phase 6 onboarding forms retrieve YouTube details automatically. Authorized staff can publish from the compact forms, create title-based image collections before cataloguing a title, and reuse those images across content. Viewers enter four inputs to review a catalogue title or submit a private missing-movie review.

## Phase 8.1 release checklist

1. Run the `Quality gates` workflow for the exact release commit. It installs the root lockfile, checks lint and formatting, runs tests with an isolated replica set, builds, audits dependencies and scans Git history and build output. For release promotion, confirm required GitHub and hosting checks in the dashboards. Render supports waiting for CI. Vercel supports blocking promotion on deployment checks where available. [Render CI checks](https://render.com/docs/deploys#integrating-with-ci) · [Vercel deployment checks](https://vercel.com/docs/deployment-checks)
2. Record the currently healthy commit and both deployment identifiers. Deploy additive backend changes before frontend dependents. Verify health and readiness directly and through Vercel, one public detail and one missing detail, protected no-store responses, cookie rotation and logout with an authorized test account, protected playback and direct Socket.IO. Check private runtime logs with request IDs.
3. If a frontend deployment fails, keep or restore the last healthy frontend while leaving a compatible backend running. If both need rollback, restore the compatible frontend first, then the backend. If the backend alone fails, restore the supported backend revision that matches the active frontend. Verify saved environment settings, database name, and schema and index compatibility before triggering either host rollback. Use a normal revert commit or the provider’s eligible deployment rollback. Repeat the smoke checks and verify automatic promotion settings afterward. [Vercel rollback](https://vercel.com/docs/instant-rollback) · [Render rollback](https://render.com/docs/rollbacks)
4. Confirm that backup storage, retention, restore permissions and alerts are approved and operated. Recover an archive only into a separate environment, using the procedure in BACKEND.md. Keep staging noindex and retain the current working URLs through approval.
5. At Phase 8.2 approval, confirm the domain and hosting eligibility, the production database and environment settings, approved privacy policy, terms, community guidelines and copyright policy, official contacts, backup retention, authorized content, Gmail inbox delivery, active live playback and indexing. Create the Web V1 release tag only after these approvals and the production smoke checks.

## Web V1 candidate release notes for v1.0.0

FDFS.ONE Web V1 brings together FDFS Live, FDFS Cinema, FDFS Originals, 404 Reality Not Found, FDFS Reviews and FDFS Talent Profiles. Verified accounts can manage a private watchlist, playback history, preferences and notifications. The community includes ratings, reviews, reporting and moderated support. Creators and staff use the existing submission, publishing and audit controls.

The React frontend runs on Vercel and uses a same-origin HTTP proxy to the Express API on Render. Socket.IO connects directly to Render. MongoDB Atlas stores application records, Cloudinary serves media, YouTube supplies embedded playback and Brevo handles transactional email. Protected player sources require a verified active session. Session cookies, account deletion and the public SEO routes retain their existing access and cache boundaries.

### Content onboarding

1. In the existing Super Administrator workspace, create or verify independent Talent profiles and link accurate credits. Collect publishing and artwork permissions for each item and keep supporting material private.
2. Add approved Cinema and Originals films, podcast episodes and Live events. Validate the YouTube link, thumbnail, supporting media, talent associations and release time zone. Confirm catalogue and player behavior from guest and authorized accounts before promoting content.
3. Add accurate movie catalogue entries for reviews and use moderation and private support to handle reports and copyright concerns. Test edit, reschedule, archive and public disappearance only with an authorized staging item or disposable fixture.
4. In Homepage Management, preview the carousel, eligible shelves and scheduled promotions. Check destinations, disclosure labels, image fallback and mobile layout before publishing approved changes.

### Mandatory release acceptance

- Approve the final domain, hosting eligibility and runtime configuration. Confirm scoped Atlas credentials, network allowlists, exact database names, required CI checks and an operational owner for deployment alerts and monitoring.
- Approve the four policy drafts and official contacts. Assign a backup operator and approve the schedule, storage, retention, expiry and account-deletion recovery process.
- Approve the real catalogue and confirm a published detail page shows the expected raw metadata, canonical and sharing text. Verify the production smoke checks before approving domain cutover and indexing.
- In one authorized disposable Gmail inbox, register on staging, confirm the initial verification code, request a resend when the card allows it and enter the newest code. Check for the welcome email, request a password reset and sign in with the new password. Record actual inbox delivery of all four message types. For YouTube, use an authorized active broadcast with embedding permitted and a verified staging viewer. Confirm that the player shows the active stream and that video advances during the broadcast.
- Record explicit approval before creating the final v1.0.0 tag. Until then, the deployed web application is a release candidate.

Follow-up optimization can refine lab LCP and measure real-user performance. Native application work begins in the mobile phases using the same API and access control model described in MOBILE.md.

## Web V1 policy drafts for owner review

Approve the operator’s legal name, contact details, effective date, applicable jurisdiction, rights-reporting contact and retention schedule before publishing these drafts. Text in brackets needs an owner decision. The existing public pages continue to use their current wording until approved copy is entered.

### Privacy Policy

FDFS.ONE is operated by [operator name]. You can contact us about privacy at [privacy contact]. When you register with Gmail, we use your address, account details and verification status to create and secure your account, provide support, and send service emails. We store a password hash. Verified sessions use a refresh cookie and short-lived access credentials.

Your watchlists, synchronized viewing history, follows and preferences are account features. You can change supported preferences in Account settings. Reviews, ratings and eligible comments are public, along with their public attribution. Independent Talent profiles and credits are public separately from your private account. Support tickets are visible to the requester and authorized staff.

The footer lets you choose whether to share optional first-party analytics. We also use session and realtime signals to operate the service, manage abuse and maintain reliable connections. YouTube supplies embedded playback and may receive connection or playback information when its player loads. Cloudinary stores and delivers media. Brevo sends transactional email. WhatsApp links take you to a separate service with its own policies.

Delete your account in Account settings. We verify the request, revoke sessions and remove account details, personal activity, contribution text, ratings and ordinary support records. Published work, independent Talent profiles and credits can remain. We may retain limited moderation, audit and rights records, including copyright cases. Backup copies may remain until approved expiry. [Owner to confirm retention periods, backup expiry and the process for other privacy requests.]

### Terms and Conditions

Use FDFS.ONE through your own account and protect your credentials. Public registration uses a Gmail address and verification is required for protected viewing and participation. Access to a video depends on the rights available to FDFS.ONE and YouTube’s availability and embedding controls. Movie catalogue and review entries provide information, discussion and eligible trailers.

Submit only material you are authorized to share, including video, artwork, text and credits. Submissions are subject to review. FDFS.ONE uses approved material to operate, display and promote the relevant publication within the approved permission scope. [Owner to confirm the exact permissions, duration and withdrawal terms.] We may restrict accounts or remove material for policy, rights or safety reasons. Use the Support Center to contact us about an account or publication decision. [Owner to confirm legal operator, contact, applicable terms and effective date.]

### Community Guidelines

Keep discussion relevant and respect the people and work you review. Disclose spoilers with the available controls. Avoid harassment, threats, impersonation, spam, private information and unauthorized media. Use available reporting controls or the Support Center for concerns. Moderators can remove material or restrict participation and may retain limited records to handle reports. Contact [community contact or approved support route] to ask about a moderation decision.

### Copyright Policy

Upload, embed and submit material only when you have the necessary rights. If you believe material on FDFS.ONE infringes your rights, open a private support ticket under Copyright concerns or use [approved copyright contact]. Include the affected FDFS.ONE URL, identify the work, explain your relationship to the rights holder and provide a way to reach you and any relevant supporting information.

We review reports and may restrict access while investigating or remove access after review. When appropriate, we use the private case to request more information or explain the outcome. Keep sensitive supporting material in the private report. [Owner to approve the required notice details, response, review or appeal procedure, official contact and retention of copyright records.]
