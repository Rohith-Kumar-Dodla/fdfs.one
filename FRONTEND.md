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

The shared layout provides desktop and mobile navigation, a skip link, route focus and scroll restoration. The landing page links to all six modules. Cinema, Originals, Podcasts, Live and Talent use their module paths plus `/:slug`. Reviews uses `/reviews` and `/movies/:slug`. Module routes lazy-load a shared unavailable state. The router handles loading, route errors and unknown URLs. Production hosting should serve `index.html` for direct public route requests.

## API and state

Vite loads environment files from the monorepo root. Use `VITE_API_BASE_URL` for the public API address, which defaults to `http://localhost:5000/api/v1`. All `VITE_` values are public. Run Vite at `http://localhost:5173` or add your frontend origin to the backend's `CORS_ORIGINS`.

`api/client.js` sets an eight-second Axios timeout, validates the success envelope and normalizes backend and network errors. API functions accept an AbortSignal. Use scoped query keys such as `['status', 'health']` and include parameters when they affect the result. Queries default to 30 seconds of freshness and retry a transient network or server failure once. Mutations are explicit and should invalidate their affected query keys after success. Zustand owns shared menu and toast state.

The development-only `/_dev/api` route exercises health and readiness. Authentication uses the same Axios client and a shared wrapper for authenticated requests. Use `withCredentials` and the CSRF header for login, refresh and logout. Zustand holds the session ID, access token and initialization status in memory. TanStack Query owns account and session data. A single in-flight refresh shares results across concurrent requests, and Web Locks serialize cookie operations across tabs when supported. A protected request retries at most once in the same session. Authentication changes clear query caches.

## Account routes

Guests can open `/login`, `/register`, `/verification-pending`, `/verify-email`, `/forgot-password` and `/reset-password`. Email links carry their one-time token in the fragment, which the form removes from the visible address after reading. Account-only pages are `/account` and `/account/settings` for profile changes, preferences, password changes and session revocation.

Use the account guard for protected pages and supply verification or role requirements when the corresponding features are added. Backend authorization remains authoritative. The existing public header shows guest links or an account menu based on the restored session.
