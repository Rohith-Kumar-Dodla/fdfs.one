# Testing

Run `npm run lint`, `npm run format:check`, `npm test`, and `npm run build` from the repository root. `npm test` runs both workspaces. Vitest and Supertest exercise Express. React Testing Library covers the public shell, module routes, mobile navigation and focus, not-found handling, button states, Zod-backed form validation, empty and error states, shared toast state and the Axios response contract. Fixtures run only in tests.

The suite covers liveness, disconnected readiness, the ready response contract with an injected state, 404 responses, pagination validation, request IDs, CORS, Helmet headers, rate limiting, JSON limits, asynchronous error handling and production error sanitization.

## Phase 1.1 results

On Node.js 24.22.3, a clean install from the root lockfile, lint, formatting checks, all 12 backend tests and the frontend production build passed. A runtime smoke check confirmed that Vite serves the shell and transformed React entry. The backend served liveness 200 and readiness 503 with a deliberately unreachable local database address, then shut down cleanly after its connection attempt failed. A separate startup check confirmed that a missing URI produces a clear configuration error.

The Phase 1 checkpoint connected to live Atlas, passed a read-only ping, served health and readiness 200, and disconnected on graceful shutdown. The URI selected MongoDB's default `test` database. Confirmation of the intended named database remains pending. Git ignores the actual `.env`.

## Phase 1.2 results

Lint, formatting and the frontend production build passed on Node.js 24.22.3. All 27 frontend tests and 12 backend tests passed.

Chrome verified the public layout at widths of 320, 390, 768 and 1440 pixels, including mobile keyboard focus and in-page scrolling. Axios reached Express and reported readiness 503 with MongoDB unreachable, then reported the backend offline after shutdown. The Phase 1 carry-forward live readiness check returned 200.

## Phase 2.1 verification

Run the full test suite with `TEST_MONGODB_URI` pointing to a disposable, unauthenticated loopback MongoDB instance, such as `mongodb://127.0.0.1:27017`. Integration tests generate a separate database name and drop it at teardown. Without that variable, the database integration suite is skipped. The tests use Nodemailer's isolated JSON transport.

Coverage includes registration races, bcrypt hash storage, verification and reset expiry and replay, password changes, JWT validation, concurrent refresh rotation, revocation, multiple devices, live role enforcement, privilege escalation protection, CSRF, rate limits, protected frontend routes and session restoration.

On Node.js 24.22.3, lint, formatting, the production build and 35 frontend plus 28 backend tests passed. Chrome used the running Express entry point and isolated MongoDB for registration, login, profile updates, cookie rotation on reload, device listing, password-change revocation, mobile sign-out and clean shutdown. An additional Chrome run verified email links and password recovery through Express with Nodemailer's JSON test transport.

The production dependency audit reported zero known vulnerabilities. The production bundle excluded diagnostics and configured backend secrets. Live SMTP delivery and authentication against the intended Atlas database remain pending.
