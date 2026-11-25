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

## Engineering constraints

Use JavaScript ES modules, an npm workspace with one root lockfile, and a modular monolith serving both clients through one `/api/v1` REST API and one central database. Implement features in their assigned phase. Keep credentials outside Git and use only real content in the application database.

Every frontend page and component follows mobile-first design from 320px through large desktop in portrait and landscape. Use fluid layouts, Tailwind's default breakpoints, responsive type, spacing, images and video, and forms and dialogs that fit their viewport. Prevent horizontal overflow, provide touch-friendly controls and visible keyboard focus, expose essential actions without hover, and cover loading, empty and error states. The [frontend standards](FRONTEND.md#responsive-design) and [viewport checks](TESTING.md#responsive-verification) apply to every phase.

Support small mobile (320–374px), medium mobile (375–424px), large mobile (425–639px), small tablet (640–767px), tablet (768–1023px), laptop (1024–1279px), desktop (1280–1535px) and large desktop (1536px and above).

## Roadmap

Phase 1 is PASS. Atlas selected `fdfs`, health and readiness returned HTTP 200, and graceful shutdown disconnected MongoDB.

Phase 2.1 passed isolated Atlas authentication and live Gmail inbox delivery using a temporary SMTP hostname override. Saving the verified Gmail hostname in the local environment is pending. Phase 2.2 implements the administrator dashboard, submissions, audit logging, Cloudinary images and YouTube embedding. Phase 2.2 and overall Phase 2 verification are PENDING. See [testing](TESTING.md) for the latest verification and open requirements.

- 1.1 Repository and backend foundation
- 1.2 Frontend foundation and design system
- 2.1 Authentication and authorization
- 2.2 Administration and media services
- 3.1 Talent Profiles full-stack
- 3.2 Cinema and Originals full-stack
- 4.1 404 Podcasts full-stack
- 4.2 FDFS Live full-stack
- 5.1 Movie catalog and review backend
- 5.2 Movie discovery and community frontend
- 6.1 Homepage and global discovery
- 6.2 Personalization and platform integration
- 7.1 Functional testing and security
- 7.2 Performance and release optimization
- 8.1 Production infrastructure
- 8.2 Real content onboarding and Web V1 release
- 9.1 Mobile foundation and streaming modules
- 9.2 Mobile community, profiles and user experience
- 10.1 Mobile testing and optimization
- 10.2 Mobile production release
