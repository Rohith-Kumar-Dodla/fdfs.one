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

The shared layout provides desktop and mobile navigation, a skip link, route focus and scroll restoration. The landing page links to all six modules. Cinema, Originals, Podcasts, Live and Talent use their module paths plus `/:slug`. Reviews uses `/reviews` and `/movies/:slug`. Talent loads the public directory and profile views. The other modules lazy-load a shared unavailable state. The router handles loading, route errors and unknown URLs. Production hosting should serve `index.html` for direct public route requests.

## API and state

Vite loads environment files from the monorepo root. Use `VITE_API_BASE_URL` for the public API address, which defaults to `http://localhost:5000/api/v1`. All `VITE_` values are public. Run Vite at `http://localhost:5173` or add your frontend origin to the backend's `CORS_ORIGINS`.

`api/client.js` sets an eight-second Axios timeout, validates the success envelope and normalizes backend and network errors. API functions accept an AbortSignal. Use scoped query keys such as `['status', 'health']` and include parameters when they affect the result. Queries default to 30 seconds of freshness and retry a transient network or server failure once. Mutations are explicit and should invalidate their affected query keys after success. Zustand owns shared menu and toast state.

The development-only `/_dev/api` route exercises health and readiness. Authentication uses the same Axios client and a shared wrapper for authenticated requests. Use `withCredentials` and the CSRF header for login, refresh and logout. Zustand holds the session ID, access token and initialization status in memory. TanStack Query owns account and session data. A single in-flight refresh shares results across concurrent requests, and Web Locks serialize cookie operations across tabs when supported. A protected request retries at most once in the same session. Authentication changes clear private queries and mutation state. Explicitly public Talent reads can continue while a session is restored.

## Account routes

Guests can open `/login`, `/register`, `/verification-pending`, `/verify-email`, `/forgot-password` and `/reset-password`. Email links carry their one-time token in the fragment, which the form removes from the visible address after reading. Account-only pages are `/account` and `/account/settings` for profile changes, preferences, password changes and session revocation.

Use the account guard for protected pages and supply verification or role requirements when the corresponding features are added. Backend authorization remains authoritative. The existing public header shows guest links or an account menu based on the restored session.

## Responsive design

Design every page and component from the smallest viewport first. Use fluid layouts and existing Tailwind breakpoints, with representative ranges covering small mobile (320–374px), medium mobile (375–424px), large mobile (425–639px), small tablet (640–767px), tablet (768–1023px), laptop (1024–1279px), desktop (1280–1535px) and large desktop (1536px and above).

Ensure portrait and landscape layouts prevent unintended horizontal overflow. Scale typography, spacing and media with available width. Use touch-friendly controls, visible keyboard focus, responsive forms and scrollable modal dialogs. Give every essential action a keyboard and touch path. Include loading, empty and error states. Use record cards for administration lists below the laptop breakpoint and semantic tables where width permits.

Account Settings wraps unbroken session device names and uses shrinkable form and session columns. The session list and confirmation dialog fit narrow viewports during sign-out and revocation.

## Administration and media

Verified administrators can open `/admin`, `/admin/users`, `/admin/submissions`, `/admin/media` and `/admin/audit`. The shared shell includes a desktop sidebar and a mobile modal navigation drawer. The users and submissions routes include detail pages with confirmation dialogs for consequential changes. Verified account holders manage their own submissions at `/submissions`.

Account settings and the media library use the same file picker and responsive image component. Uploads use raw image bytes and bearer authentication. Previews use server-generated variants and image dimensions. The administration media library can preview a YouTube URL without saving a video record.

The reusable YouTube player builds privacy-enhanced iframe URLs from validated video identifiers. It uses IFrame Player API events for loading, playback state and failures, with a canonical YouTube link as a fallback. It preserves provider controls, supports fullscreen, starts paused and maintains the provider's 200px minimum player height. Host the app with a referrer policy that permits the embedding origin. The page CSP restricts frames to `https://www.youtube-nocookie.com`. Keep that host in any additional CSP frame allowlist and include `https://www.youtube.com` in any script allowlist for the player API and widget. [YouTube IFrame Player reference](https://developers.google.com/youtube/iframe_api_reference)

## Talent Profiles

`/talent` uses Axios and TanStack Query for paginated directory data. The URL holds debounced name search, profession, sort and page. The grid adapts from one to four columns, and the controls and profile header stack on narrow screens. Image components select API-provided size variants and display a neutral icon when a portrait is unavailable.

`/talent/:slug` renders the authorized fields the API returns. It sets a profile title, description and canonical URL in the browser. The linked filmography and podcast sections have empty states until those modules publish relationships.

Verified account holders can open a structured talent proposal from the directory or start a correction from an individual profile. Administrators manage profiles under `/admin/talent`, review proposals through the existing submissions section, and use confirmation dialogs for publication, archiving and account association. The editor reuses media library uploads, supports replacing portrait and cover images, and accepts IDs of existing library images.
