# ARTINU

Photography on rotation for real spaces. Cafés, restaurants, hotels and
workspaces get a curated collection of framed photographs — printed, installed
and refreshed every one to three months — and the photographers behind that work
get paid, credited and seen.

This repository is the complete product: the public website, the Space
Experience, the Artist Experience, the Social Media Centre and the internal
ARTINU Console, on a REST API.

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
> Either way it creates **only** the staff accounts below — no demo users, no
> demo artworks, no spaces or orders. Add `--reset` to change the password on
> an account that already exists (needed if you lose one).
>
> **Before you launch, retire the passwords in this table.** They are published
> in this file, so anyone who reads the repository can sign in as the CEO and
> reach every Console module. Re-run `npm run create:staff -- --reset` without
> `--demo` to replace them with random ones, or change each from
> Account → Password.

| Email                         | Password      | Lands on                            |
| ----------------------------- | ------------- | ----------------------------------- |
| `restaurant.demo@artinu.in`   | _(see below)_ | Space Experience (`/space`)         |
| `photographer.demo@artinu.in` | _(see below)_ | Artist Experience (`/studio`)       |
| `ceo@artinu.in`               | _(see below)_ | ARTINU Console — everything         |
| `manager@artinu.in`           | _(see below)_ | Console — operations & curation     |
| `accounts@artinu.in`          | _(see below)_ | Console — finance only              |
| `fieldops@artinu.in`          | _(see below)_ | Console — orders & production       |
| `it@artinu.in`                | _(see below)_ | Console — users, system & email log |
| `socialmedia@artinu.in`       | _(see below)_ | Social Media Centre (`/social-media`) |

For live SMTP testing there are two accounts on real inboxes:

| Email                      | Password      | Role                  |
| -------------------------- | ------------- | --------------------- |
| `<your-test-inbox>`        | _(see below)_ | Artist — uploads work |
| `<your-second-test-inbox>` | _(see below)_ | Space — buys it       |

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

**A real UPI transfer is a claim, not a confirmation.** Money lands in a bank
account with no gateway to ask, so when a customer submits their UTR the payment
moves to `verifying` and stops: the order does not advance, no invoice is issued
and no artist is paid. Somebody checks it against the account and releases it
from **Console → Payments**. That one click runs `settlePayment()`, which is the
same function a gateway webhook would call — payment `succeeded`, order
`confirmed`, invoice issued, owner and artists notified, payouts accrued — so a
hand-verified payment is indistinguishable downstream from an automated one.

`issueInvoice()` is idempotent per order and a second Verify is refused, so a
double click cannot produce two bills or pay an artist twice.

Who may release it: **CEO, manager, operations and accounts**. Accounts was
missing from that list while holding the `payments` module that shows the page —
so the finance desk could see the Verify button and receive a 403 on pressing
it, and only the CEO could actually complete a verification. Note that manager
and operations hold the API permission but not the `payments` module, so they
cannot reach the screen yet.

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

## Before the next deploy: run migration 016

The social media control centre stores its promotional popups in a table a live
Supabase project will not have yet:

```
database/migrations/016_social_media_campaigns.sql
```

Paste it into Supabase → SQL Editor → Run. It creates one table, touches nothing
existing, and is safe to re-run.

Until it runs nothing breaks: `GET /campaigns/active` treats a missing table as
"no campaign" and answers `null`, so the public site is unaffected and the popup
is simply inert. The social media screens themselves will error until the table
exists.

Then create the account, which prints a random password once:

```
npm run create:staff --workspace server
```

---

## Before the next deploy: run migration 009

Registration now collects a date of birth alongside the phone number, and a
homepage collaboration can carry the partner's website address. Both need two
nullable columns that a live Supabase project will not have yet:

```
database/migrations/009_registration_and_collaborations.sql
```

Paste it into Supabase → SQL Editor → Run. It is additive and safe to re-run.

Until it runs, nothing breaks: registration still succeeds and the date of birth
is dropped with an error logged (see `createProfile` in
`server/src/services/auth.service.ts`), and saving a website address against a
collaboration fails with a message in the console. `npm run check:schema`
reports which columns are present.

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

### The five modules

| Module             | Routes                                                                  | For                                                                  |
| ------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Public website     | `/`, `/spaces`, `/gallery`, `/artists`, `/about`, `/lets-talk`, `/join` | Anyone                                                               |
| Space Experience   | `/space/…`                                                              | Space owners: browse, configure frames, pay, track, rotate, invoices |
| Artist Experience  | `/studio/…`                                                             | Artists: upload, submissions, portfolio, installations, earnings     |
| ARTINU Console     | `/console/…`                                                            | Internal staff, scoped by role                                       |
| Social Media       | `/social-media/…`                                                       | The `social_media` role only — campaigns and promotion               |

Social Media is deliberately **not** a branch of the Console. `INTERNAL_ROLES`
is not a description, it is a grant: `adminRouter.use(requireInternal)` gates the
whole admin API on membership, so adding `social_media` there would have handed
that role the users module, payments and system settings in one line. It stands
outside instead, gated on the role plus the `campaigns` and `promotions` modules.

`docs/API-CONTRACT.md` lists every endpoint. `docs/CONVENTIONS.md` covers the
design language and the code rules — read it before adding a screen.

---

## Core Features

### Social Media Control Centre (`/social-media`)

A fourth authenticated area for the `social_media` role, and for the CEO as
oversight. Four screens: **Today** (what is live, what was uploaded this week,
newest artists), **Campaigns**, **Create Campaign**, and read-only **Artists**
and **Spaces** to build a promotion from.

Every number on Today is counted from records the role can already read —
`/campaigns`, `/campaigns/promotable/artists` and the public gallery. There are
no impressions, reach or engagement figures, because ARTINU does not collect
any; a dashboard showing invented numbers is worse than one showing none.

Campaigns are the visitor-facing popup (`PromoPopup`, mounted once in
`PublicLayout`). A campaign is live only while it is switched on **and** inside
its date window — status is derived by `campaignStatus()`, never stored, so a
campaign that ended overnight stops appearing without a cron job. Frequency
(first visit / session / daily / every visit) is enforced per device in
`localStorage`.

The role cannot reach the users module, payments, orders, system settings,
announcements, or write the gallery's curated picks. It cannot see a mobile
number. Verified by probe: 41/41.

### Registered artists and their mobile numbers

**Console → Administration → Registered artists** (`/console/users/artists`)
shows what each photographer gave at sign-up: name, email, **mobile number**,
date of birth, city, registration date and status — searchable by name, email or
phone.

The number was never missing. Sign-up asks for it, the handler writes it to
`profiles.phone`, and `/admin/users` has always returned the profile; it simply
was not drawn. The place people looked — Console → Artists → **Applications** —
renders an *application*, and the application form has no phone field and the
`applications` table has no phone column. Two different records, only one of
which ever had a number.

Both screens sit in the `users` module, which `ROLE_MODULES` grants to the CEO
and the IT team and nobody else. `/admin/users` makes the same check with
`requireModule('users')`, so the number is never sent to another role rather
than merely hidden. Verified by probe: manager, accounts, operations, artists
→ 403; anonymous → 401; public artist endpoints carry no contact data.

### Gallery top picks, chosen by looking at the photographs

**Console → Curated lists** now shows the real photographs with search and
click-to-pick, replacing a textarea of comma-separated UUIDs that required
copying ids out of gallery URLs. Same `ui_content.gallery_top_20` record, same
array of ids, same gallery reading it — only the editing surface changed. The
previous selection is archived to `gallery_top_20_history` (another `ui_content`
row, no new table) so a change never destroys what was there.

`PUT /content/:id` was `requireInternal` — every staff role, including accounts
and operations who hold no `content` module and never see the screen. It is now
`requireModule('content')`, matching the navigation.

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

| Variable                                                                                                                                                                           | Default     | Effect                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------- |
| `DATA_DRIVER`                                                                                                                                                                      | `memory`    | `supabase` uses PostgreSQL — run `database/schema.sql` first                           |
| `AUTH_DRIVER`                                                                                                                                                                      | `local`     | Local bcrypt + JWT, or Supabase Auth                                                   |
| `STORAGE_DRIVER`                                                                                                                                                                   | `local`     | Disk under `server/uploads`, or Supabase Storage / Cloudinary / S3 / **firebase**      |
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` / `FIREBASE_STORAGE_BUCKET`                                                                               | unset       | Required for `STORAGE_DRIVER=firebase`                                                 |
| `VITE_FIREBASE_API_KEY` / `VITE_FIREBASE_AUTH_DOMAIN` / `VITE_FIREBASE_PROJECT_ID` / `VITE_FIREBASE_STORAGE_BUCKET` / `VITE_FIREBASE_MESSAGING_SENDER_ID` / `VITE_FIREBASE_APP_ID` | unset       | Client-side Firestore realtime listeners                                               |
| `MAIL_PROVIDER`                                                                                                                                                                    | `auto`      | `auto` picks SendGrid, then SMTP, then console. Force with `sendgrid`/`smtp`/`console` |
| `SENDGRID_API_KEY`                                                                                                                                                                 | unset       | **Server-only secret.** Enables SendGrid delivery. Never expose to the browser         |
| `MAIL_FROM`                                                                                                                                                                        | `SMTP_FROM` | The From header. Must be a SendGrid-authenticated sender or domain                     |
| `MAIL_REPLY_TO`                                                                                                                                                                    | unset       | Reply-To, when it differs from the sender                                              |
| `SMTP_*`                                                                                                                                                                           | unset       | The alternative transport. All unset prints emails to the console instead              |
| `JWT_SECRET`                                                                                                                                                                       | dev value   | **Required in production.** Boot fails on a placeholder or under 32 chars              |
| `PAYMENT_PROVIDER`                                                                                                                                                                 | `mock_qr`   | `razorpay` / `stripe` once keys exist                                                  |
| `MEMORY_PERSIST`                                                                                                                                                                   | `true`      | Persists the dev store to `server/.data/db.json` across restarts                       |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`                                                                                                                                        | unset       | Google OAuth for photographer sign-in                                                  |
| `GOOGLE_SERVICE_ACCOUNT_KEY` / `GOOGLE_DRIVE_ROOT_FOLDER_ID`                                                                                                                       | unset       | Google Drive mirror sync (deprecated, kept for migration)                              |

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

## Security posture

Authorisation is enforced server-side and mirrored in the UI from one table.
`ROLE_MODULES` in `shared/src/constants.ts` is read by the client's navigation
and route guards *and* by the server's `requireModule`, so a hidden button and a
refused request are two consequences of one fact rather than two rules that can
drift.

They have drifted before, and it is the bug class worth watching for here — all
three of these were real:

| Symptom                                          | Cause                                                           |
| ------------------------------------------------ | --------------------------------------------------------------- |
| Accounts pressed Verify and got 403               | Route gated on `payments` module; API named different roles     |
| Any staff role could rewrite the curated lists    | `PUT /content/:id` was `requireInternal`, not `requireModule`   |
| Manager and operations cannot open Payments       | Hold the API permission, not the module — still open            |

**When adding a privileged screen, check both ends.** A quick probe:

```
PROBE_API=http://localhost:4000/api node scripts/authz-probe.mjs
```

Last full probe: no unauthorised access on twelve privileged endpoints across
nine actor types; no IDOR (one customer cannot read another's order or invoice —
403/401); no private fields (`phone`, `dateOfBirth`, `email`, `passwordHash`) in
any anonymous response from the gallery, artists, homepage or popup endpoints;
forged and absent tokens both rejected with 401.

Other properties worth knowing:

- **Secrets** — `.env` is gitignored and has never been committed; no
  service-role key, SendGrid key or JWT secret appears in a tracked file. The
  Supabase service-role key is server-side only and never reaches the browser.
- **Passwords** — bcrypt, cost 10. `authRouter.use(authLimiter)` covers every
  auth route including sign-in: 20 attempts per 15 minutes. The limiter skips in
  development, so a local probe will not see 429s.
- **RLS** — every table has row level security on with no policies, which denies
  the anon key outright; the API reaches Postgres with the service-role key,
  which bypasses RLS. New tables must follow that pattern (see migration 008,
  and 016 for the most recent example).
- **Staff passwords** — `create:staff` generates a crypto-random password,
  prints it once and sets `mustChangePassword`. The `--demo` passwords are
  published in this repository and are refused when `NODE_ENV=production`.

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

#   A R T I N U - V 1 
 
 
#   A R T I N U _ W e b s i t e _ D e v e l o p m e n t  
 