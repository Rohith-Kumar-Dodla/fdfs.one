# FDFS.ONE

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
