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

Gmail authenticated over STARTTLS and accepted both transaction emails with the configured sender. Both subjects were confirmed in the authorized recipient's inbox. The generated links used the configured frontend origin and the expected verification and recovery routes. The probe used `SMTP_HOST=smtp.gmail.com` as a process override. Save that hostname in the local environment for normal startup to use the verified configuration.

## Phase 2.2 verification

The phase adds tests for administrator guards, verified role enforcement, paginated user filtering, protection of administrator accounts, suspension, session revocation, owner-scoped submissions, moderation transitions, publisher authorization, audit access, image content validation and reference protection, and YouTube parsing and playback states. Use a disposable local MongoDB replica set and set `TEST_MONGODB_RS_URI` to its unauthenticated loopback URI to run transactional integration tests. The suite generates and drops its own database. Keep `TEST_MONGODB_URI` set independently for the original authentication suite.

Lint, formatting, the production build and all 85 automated tests passed on Node.js 24.22.1. The suites include 41 frontend and 44 backend tests. The production dependency audit reported zero vulnerabilities. The configured secrets scan found zero matches in Git candidates or the production bundle.

The live administrator media API uploaded a temporary image to Cloudinary, listed its persisted Atlas record, deleted the image and returned the deletion audit entry. The temporary asset and isolated database were cleaned up.

## Responsive verification

Check each page and component from 320px upward using fluid Tailwind layouts. Cover 320–374px, 375–424px, 425–639px, 640–767px, 768–1023px, 1024–1279px, 1280–1535px and 1536px and above. Exercise the public, account and administrator paths at 320, 375, 425, 640, 768, 1024, 1280, 1440 and 1920 pixels. Include portrait and landscape, keyboard focus and touch controls, horizontal overflow, responsive type and media, form and dialog fit, loading, empty and error states. Verify essential actions without hover. Report browser emulation and physical-device testing separately.

Headless Chrome exercised a production build with isolated API responses at all nine widths and at 568×320 and 844×320 in landscape. The run covered public routes, authentication forms, account settings and sessions, owner submissions, administrator pages, mobile record cards, desktop tables, dialogs and image controls. It checked the keyboard skip link, Escape and drawer focus return, and enabled touch emulation on narrow viewports. The final pass found zero horizontal overflow, including the repaired account session layout with a long unbroken device name. Physical-device coverage is pending.

Chrome rendered the authorized YouTube embed at 238×200px on the 320px viewport and at 890×501px on the 1280px viewport. The player initialized, but its video clock stayed at zero after interaction. Automated fixtures cover player loading, readiness and provider error handling. Live playback verification is pending.
