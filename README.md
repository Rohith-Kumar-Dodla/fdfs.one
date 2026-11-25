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

Use Node.js 24 LTS and npm. From the repository root, run `npm ci` and copy `.env.example` to `.env`. To run the full stack, set `MONGODB_URI` to a reachable MongoDB Atlas connection URI and allow your host in the Atlas network access list. Set `VITE_API_BASE_URL` if the API uses a different host or port. See [backend setup](BACKEND.md#environment) and [frontend setup](FRONTEND.md#api-and-state).

- `npm run dev` starts the frontend at http://localhost:5173 and the API at http://localhost:5000 by default.
- `npm run dev:frontend` starts the frontend independently.
- `npm run dev:backend` starts the backend independently.
- `npm run build`, `npm run lint`, `npm run format:check`, and `npm test` run the local checks.

## Engineering constraints

Use JavaScript ES modules, an npm workspace with one root lockfile, and a modular monolith serving both clients through one `/api/v1` REST API and one central database. Implement features in their assigned phase. Keep credentials outside Git and use only real content in the application database.

## Roadmap

Phase 1.1 implementation is complete and live Atlas verification is pending. Phase 1.2 implementation is complete. Overall Phase 1 remains pending until the live database and connected readiness checks pass. See [testing](TESTING.md) for results. Subsequent phases are planned.

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
