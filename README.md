# ARTINU

Photography on rotation for real spaces. Cafés, restaurants, hotels and
workspaces get a curated collection of framed photographs — printed, installed
and refreshed every one to three months — and the photographers behind that work
get paid, credited and seen.

This repository is the complete product: the public website, the Space
Experience, the Artist Experience and the internal ARTINU Console, on a REST API.

---

## Getting started

```bash
npm install
npm run dev
```

- Web app → http://localhost:5173
- API → http://localhost:4000/api

That is the whole setup. No database to provision, no keys to obtain: the API
boots on a seeded in-process store with a local auth driver, writes uploads to
disk, and prints emails to the console. Every screen has real data behind it
from the first second.

To point it at real infrastructure, copy `.env.example` to `.env` at the repo
root and fill in what you have — see [Configuration](#configuration).

### Sign in

> **On a real database these accounts do not exist until you create them.**
> They come from the demo seed, which deliberately does not run against
> Supabase — nobody wants 31 fictional users in production. Until you run the
> command below, every login here fails with "That email and password do not
> match", because there is no such account.
>
> ```
> npm run create:staff -- --demo          # exactly the passwords in this table
> npm run create:staff                    # strong random ones, printed once
> ```
>
> Either way it creates **only** these five staff accounts — no demo users, no
> demo artworks, no spaces or orders. Add `--reset` to change the password on
> an account that already exists (needed if you lose one).
>
> **Before you launch, retire the passwords in this table.** They are published
> in this file, so anyone who reads the repository can sign in as the CEO and
> reach every Console module. Re-run `npm run create:staff -- --reset` without
> `--demo` to replace them with random ones, or change each from
> Account → Password.

| Email                         | Password           | Lands on                            |
| ----------------------------- | ------------------ | ----------------------------------- |
| `restaurant.demo@artinu.in`   | `ARTINU@Rest2026`  | Space Experience (`/space`)         |
| `photographer.demo@artinu.in` | `ARTINU@Photo2026` | Artist Experience (`/studio`)       |
| `ceo@artinu.in`               | `ARTINU@CEO2026`   | ARTINU Console — everything         |
| `manager@artinu.in`           | `ARTINU@Mgr2026`   | Console — operations & curation     |
| `accounts@artinu.in`          | `ARTINU@Acc2026`   | Console — finance only              |
| `fieldops@artinu.in`          | `ARTINU@Ops2026`   | Console — orders & production       |
| `it@artinu.in`                | `ARTINU@IT2026`    | Console — users, system & email log |

For live SMTP testing there are two accounts on real inboxes:

| Email                             | Password            | Role                  |
| --------------------------------- | ------------------- | --------------------- |
| `vibhukrishnas7@gmail.com`        | `ARTINU@Artist2026` | Artist — uploads work |
| `1853552.vibhukrishnas@gmail.com` | `ARTINU@Space2026`  | Space — buys it       |

Signing in as each internal role is the quickest way to see role-based access
working: the sidebar, the pages and the API all narrow to the same set.

### Walking the money path

The MVP payment provider is a dynamic UPI QR code with no gateway behind it, so
in development the payment screen shows a **Development** panel with _Simulate
successful payment_ / _Simulate failure_. Use it to walk
cart → checkout → QR → verification → order confirmed → invoice → tracking
end to end. A verified payment also notifies the artists whose work was chosen,
creates their payouts, and puts the order into the production queue in the
Console.

---

## Commands

| Command                                                   | What it does                                               |
| --------------------------------------------------------- | ---------------------------------------------------------- |
| `npm run dev`                                             | API and web app together                                   |
| `npm run dev:server` / `npm run dev:client`               | One side only                                              |
| `npm run typecheck`                                       | TypeScript across all three workspaces                     |
| `npm run build`                                           | Typecheck, then build the client to `client/dist`          |
| `npm start`                                               | Run the API alone                                          |
| `npm run seed`                                            | Reseed demo data (`npm run seed -- --fresh` to wipe first) |
| `npx tsx server/src/scripts/migrate-drive-to-firebase.ts` | One-time Drive→Firebase migration                          |

---

## How it is put together

```
shared/     the contract — domain types, Zod schemas, pricing, formatting
server/     Express REST API (routes → services → data layer)
client/     React 19 + Vite web app (features → services → API)
database/   PostgreSQL schema, for when you switch to Supabase
docs/       API contract and build conventions
```

**Three things are worth knowing before reading the code.**

**1 · `shared/` is a real contract, not a utility bin.** The Zod schema that
validates a form in the browser is the same object that validates the request on
the server. The pricing engine that previews a total at checkout is the same
function that charges for the order. They cannot drift apart because there is
only one of each.

**2 · Everything external sits behind a driver.** Data, auth, storage, email and
payments each have an interface and at least two implementations. `DATA_DRIVER`
switches the whole application between a seeded in-memory store and Supabase
PostgreSQL without a single line changing above `server/src/database/table.ts`.
The same idea covers payments — the tech stack calls for the QR implementation to
be replaceable without touching the rest of the app, so `PaymentProvider` has
`mock_qr` today and Razorpay or Stripe slots in beside it. If a driver's
credentials are missing the API falls back at boot and says so in the log, rather
than failing at the first request.

**3 · Money is never trusted from the client.** The cart lives in the browser,
but `POST /orders` re-reads every artwork, re-prices every line and recomputes
the total. Checkout calls `POST /orders/quote` so the figure on screen is the
server's, not the browser's.

### Request flow

```
Browser
  → TanStack Query (client/src/services/*.service.ts)
    → Express route          validate with a shared Zod schema
      → service              business logic, pricing, notifications
        → db.<table>         memory store or Supabase, same interface
```

### The four modules

| Module            | Routes                                                                  | For                                                                  |
| ----------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Public website    | `/`, `/spaces`, `/gallery`, `/artists`, `/about`, `/lets-talk`, `/join` | Anyone                                                               |
| Space Experience  | `/space/…`                                                              | Space owners: browse, configure frames, pay, track, rotate, invoices |
| Artist Experience | `/studio/…`                                                             | Artists: upload, submissions, portfolio, installations, earnings     |
| ARTINU Console    | `/console/…`                                                            | Internal staff, scoped by role                                       |

`docs/API-CONTRACT.md` lists every endpoint. `docs/CONVENTIONS.md` covers the
design language and the code rules — read it before adding a screen.

---

## Core Features

### Photo ID System (ARTINU Standard)

Every uploaded photograph receives a permanent **6-character Photo ID**: `XXX###`

- `XXX` = 3-letter Photographer Code (unique, derived from name, never reused)
- `###` = 3-digit sequential photo number per photographer (never reset, never reused)

```
KIR001 → KIR002 → KIR003
```

- Backend generates automatically on successful upload (atomic counter)
- Database UNIQUE constraint on `photo_id` + `photographer_code`
- Concurrency-safe via database transactions
- Deletion does not recycle numbers; editing metadata preserves ID

### Frame ID System (Physical Frames)

Physical ARTINU frames carry a permanent Frame ID: `AT-H-BUR-260807-1001`

- `AT` = ARTINU identifier
- `H` = frame type code (controlled)
- `BUR` = location/category code (controlled)
- `260807` = registration date (YYMMDD)
- `1001` = frame serial (auto-increment, never reused)

Frame ID stays with the physical frame forever — independent of Photo ID rotations.

### Follow System (Instagram-style)

- Users follow photographers (and photographer-to-photographer)
- `POST /users/follow`, `DELETE /users/follow/:id`
- `GET /users/followers/:id`, `GET /users/following/:id`
- Denormalized `followersCount` / `followingCount` on Profile (updated atomically)
- Optimistic UI on follow button (React Query `onMutate`)

### Collaboration Carousel (Artist Dashboard)

- Manager-controlled rotating carousel on `/studio` homepage
- Shows assigned collaboration slides (not photographer's own uploads)
- `CollaborationSlide` model: `photographerId` (nullable = global), `imageUrl`, `order`, `isActive`
- Real-time updates via Firestore `onSnapshot` listeners
- 5s crossfade rotation, SSE replaced with Firestore realtime

### Photographer Profile: Cover/Banner Photo

- `coverUrl` field on Profile (wide 3:1–4:1 aspect ratio)
- Upload UI in `/settings` with crop guidance
- Rendered on public `/artists/:slug` (16:6 banner) and `/studio` header

---

## Design

The interface should feel like walking into a well-lit gallery, not operating
business software. Photography carries the colour; the UI stays quiet.

- A warm paper palette — nothing is pure white or pure black.
- Playfair Display for headings, Inter for reading, JetBrains Mono only for the
  small letterspaced labels above sections.
- Motion communicates state and never decorates: 0.4–0.7s fades with a small
  rise, and `prefers-reduced-motion` turns all of it off.
- Every design value is a token in `client/src/styles/globals.css`. There are no
  raw hex values in components.

---

## Configuration

Everything in `.env.example` is optional. Set only what you have.

| Variable                                                                                                                                                                           | Default   | Effect                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------- |
| `DATA_DRIVER`                                                                                                                                                                      | `memory`  | `supabase` uses PostgreSQL — run `database/schema.sql` first                      |
| `AUTH_DRIVER`                                                                                                                                                                      | `local`   | Local bcrypt + JWT, or Supabase Auth                                              |
| `STORAGE_DRIVER`                                                                                                                                                                   | `local`   | Disk under `server/uploads`, or Supabase Storage / Cloudinary / S3 / **firebase** |
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` / `FIREBASE_STORAGE_BUCKET`                                                                               | unset     | Required for `STORAGE_DRIVER=firebase`                                            |
| `VITE_FIREBASE_API_KEY` / `VITE_FIREBASE_AUTH_DOMAIN` / `VITE_FIREBASE_PROJECT_ID` / `VITE_FIREBASE_STORAGE_BUCKET` / `VITE_FIREBASE_MESSAGING_SENDER_ID` / `VITE_FIREBASE_APP_ID` | unset     | Client-side Firestore realtime listeners                                          |
| `MAIL_PROVIDER`                                                                                                                                                                    | `auto`    | `auto` picks SendGrid, then SMTP, then console. Force with `sendgrid`/`smtp`/`console` |
| `SENDGRID_API_KEY`                                                                                                                                                                 | unset     | **Server-only secret.** Enables SendGrid delivery. Never expose to the browser    |
| `MAIL_FROM`                                                                                                                                                                        | `SMTP_FROM` | The From header. Must be a SendGrid-authenticated sender or domain               |
| `MAIL_REPLY_TO`                                                                                                                                                                    | unset     | Reply-To, when it differs from the sender                                         |
| `SMTP_*`                                                                                                                                                                           | unset     | The alternative transport. All unset prints emails to the console instead         |
| `JWT_SECRET`                                                                                                                                                                       | dev value | **Required in production.** Boot fails on a placeholder or under 32 chars         |
| `PAYMENT_PROVIDER`                                                                                                                                                                 | `mock_qr` | `razorpay` / `stripe` once keys exist                                             |
| `MEMORY_PERSIST`                                                                                                                                                                   | `true`    | Persists the dev store to `server/.data/db.json` across restarts                  |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`                                                                                                                                        | unset     | Google OAuth for photographer sign-in                                             |
| `GOOGLE_SERVICE_ACCOUNT_KEY` / `GOOGLE_DRIVE_ROOT_FOLDER_ID`                                                                                                                       | unset     | Google Drive mirror sync (deprecated, kept for migration)                         |

Requesting a driver without its credentials logs a warning and falls back, so
the app always starts. The Console's System Health page shows which drivers are
actually in use.

---

## Storage Layer: Firebase (Production-Ready)

- **Firebase Storage** for all file uploads (replaces Google Drive)
- **Folder structure**: `/photographers/{uid}/uploads/`, `/profile/{uid}/`, `/hero/`, `/featured/`, `/cafes/`, `/collaborations/`
- **Resumable uploads** for files ≥ 5 MB via Firebase Admin SDK
- **Security rules**: Photographers write own paths; Managers write hero/featured/cafes/collaborations; Public read for active assets
- **Lifecycle rules**: STANDARD → NEARLINE (90d) → COLDLINE (365d) → Delete (7y); keeps 3 non-current versions
- **Budget alerts**: 50%/80%/100% spend; storage size at 4TB/4.5TB; egress spike detection
- **Blaze (pay-as-you-go) plan required** — Spark free tier caps at 5 GB
- **Estimated at 5 TB**: ~$155–200/mo (with lifecycle + CDN: ~$95–120/mo)

### Migration (Drive → Firebase)

One-time script: `npx tsx server/src/scripts/migrate-drive-to-firebase.ts`

- Downloads from Drive via service account
- Uploads to Firebase with correct folder structure
- Updates DB records with new Firebase URLs
- Logs failures to JSON report for manual retry
- Batched with rate limiting (50 records/batch, 100ms Drive / 50ms Firebase delays)
- Does NOT delete from Drive until verified

---

## Real-Time Sync (Firestore)

Manager changes to hero slides, featured collections, cafes, collaboration slides
propagate instantly to connected clients via Firestore `onSnapshot` listeners.

- Lightweight "content pointers" in Firestore: `/contentPointers/{type}` → `{ ids: [], updatedAt }`
- Client hook `useContentSync` subscribes and invalidates React Query caches
- Replaces previous SSE implementation
- SQL DB remains source of truth; Firestore only holds ordered ID arrays

---

## What is deliberately not built

Being explicit is more useful than a feature list that overstates itself.

- **The upload validation pipeline is heuristic, not machine learning.** All five
  checks from the requirements run in order, but there is no model behind
  AI-generated or NSFW detection — those are honest, inspectable rules
  (`server/src/services/validation-pipeline.service.ts` says so at the top).
  Quality and duplicate checks are real: resolution, aspect ratio, compression
  and fingerprinting. Anything uncertain goes to a human in the moderation queue,
  which is where the decision actually gets made.
- **Recommendations are a transparent weighted heuristic**, not a model. Every
  point awarded can be explained in a sentence, which matters more at this stage
  than accuracy.
- **No image optimisation pipeline** — no Sharp, no thumbnail generation. This is
  a deliberate MVP decision from the tech stack; uploads stay asynchronous and
  simple, and a CDN or transform layer can be added later behind the same
  `storage.service` interface.
- **Social sign-in buttons are rendered but disabled.** There is no OAuth backend
  yet, and a button that pretends to sign you in is worse than one that says it
  is not ready.
- **Invoices are printable HTML, not PDFs.** No PDF toolchain in the MVP; the
  browser prints them perfectly well.
- **There is no scheduler.** Rotation cycles become due when someone reads them,
  rather than pretending a cron job exists.

---

## Verification

- `npm run typecheck` — clean across `shared`, `server` and `client`.
- `npm run build` — client builds and code-splits per route.
- The API was exercised end to end against a running server: gallery and facet
  filtering, sign-in for every role, RBAC refusals, minimum order quantity,
  server-side quoting with a coupon, QR generation, failed verification, retry,
  successful payment, invoice issue and download, idempotent re-verification,
  notification fan-out to owner and artists, console analytics, order transitions
  (including a rejected backwards move), moderation, payouts and the upload
  validation pipeline.
- All 50+ routes were loaded in headless Chrome as guest, space owner, artist and
  CEO: every one renders with its expected heading, no console errors, no page
  errors and no horizontal overflow.

---

## Key Files for New Features

| Feature                  | Key Files                                                                                                                                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Photo ID System          | `shared/src/types.ts`, `server/src/routes/artwork.routes.ts`, `server/src/services/storage.service.ts`                                                                                                |
| Frame ID System          | `shared/src/types.ts`, `server/src/routes/contentManager.routes.ts`                                                                                                                                   |
| Follow System            | `shared/src/types.ts`, `server/src/routes/user.routes.ts`, `client/src/services/catalog.service.ts`, `client/src/features/public/pages/ArtistProfilePage.tsx`                                         |
| Collaboration Carousel   | `server/src/services/firebase.ts`, `server/src/routes/contentManager.routes.ts`, `client/src/hooks/useContentSync.ts`, `client/src/features/artist/pages/ArtistWorkspacePage.tsx`                     |
| Cover Photo              | `shared/src/types.ts`, `client/src/features/shared/pages/ProfilePage.tsx`, `client/src/features/public/pages/ArtistProfilePage.tsx`, `client/src/features/artist/pages/ArtistWorkspacePage.tsx`       |
| Firebase Storage         | `server/src/services/firebase.ts`, `server/src/services/storage.service.ts`, `firebase.storage.rules`, `FIREBASE_LIFECYCLE_RULES.md`, `FIREBASE_BUDGET_ALERTS.md`, `FIREBASE_PRICING_CONFIRMATION.md` |
| Firestore Realtime       | `server/src/services/firebase.ts` (Admin), `client/src/hooks/useContentSync.ts` (Client)                                                                                                              |
| Drive→Firebase Migration | `server/src/scripts/migrate-drive-to-firebase.ts`                                                                                                                                                     |
#   A R T I N U - V 1  
 