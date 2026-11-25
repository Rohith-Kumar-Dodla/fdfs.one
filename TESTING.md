# Testing

Run `npm run lint`, `npm run format:check`, `npm test`, and `npm run build` from the repository root. `npm test` runs both workspaces. Vitest and Supertest exercise Express. React Testing Library covers the public shell, module routes, mobile navigation and focus, not-found handling, button states, Zod-backed form validation, empty and error states, shared toast state and the Axios response contract. Fixtures run only in tests.

The suite covers liveness, disconnected readiness, the ready response contract with an injected state, 404 responses, pagination validation, request IDs, CORS, Helmet headers, rate limiting, JSON limits, asynchronous error handling and production error sanitization.

## Phase 1.1 results

On Node.js 24.22.3, a clean install from the root lockfile, lint, formatting checks, all 12 backend tests and the frontend production build passed. A runtime smoke check confirmed that Vite serves the shell and transformed React entry. The backend served liveness 200 and readiness 503 with a deliberately unreachable local database address, then shut down cleanly after its connection attempt failed. A separate startup check confirmed that a missing URI produces a clear configuration error.

Live Atlas verification is pending because a valid `MONGODB_URI` was unavailable. With the URI and permitted network access, verify startup, `GET /api/v1/ready` returning 200 with the live connection, and clean shutdown.

## Phase 1.2 results

Lint, formatting and the frontend production build passed on Node.js 24.22.3. All 27 frontend tests and 12 backend tests passed.

Chrome verified the public layout at widths of 320, 390, 768 and 1440 pixels. Checks included no horizontal overflow on the smaller viewports, mobile menu and dialog keyboard focus, in-page scrolling and a direct movie detail URL. The browser used Axios through the development diagnostic route to reach Express at an overridden `VITE_API_BASE_URL` with the default frontend CORS origin. It received liveness 200 and readiness 503 while MongoDB was unreachable. After the connection attempt failed, Express closed a pending HTTP connection at the drain deadline and completed shutdown. The browser retry then reported the backend offline. The connected response is covered by a frontend test fixture pending live Atlas verification.
