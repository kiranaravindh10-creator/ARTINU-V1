# Curate API contract

Base URL: `/api` (proxied to `http://localhost:4000/api` in development).

Every module below maps to one of the API modules in SDD §17.

## Conventions

- **Auth**: `Authorization: Bearer <token>`. The token is issued by `POST /auth/sign-in`
  and stored client-side by `tokenStore` (`client/src/lib/api.ts`).
- **Success**: the resource itself, unwrapped — `{ id, ... }` or `[...]`.
  Paginated endpoints return `{ items, page, pageSize, total, totalPages }`.
- **Failure**: `{ message, code?, details? }` with the right HTTP status.
  `details` is `Record<field, string[]>` and is produced by the Zod validation
  middleware, so forms can map errors straight onto fields.
- **Validation**: request bodies are validated with the schemas in
  `@curate/shared` — the same objects the client forms use.
- **Money**: plain rupees as numbers. Server-side pricing is authoritative;
  the client only previews it with the same `calculatePricing()`.
- **Dates**: ISO 8601 strings, UTC.

---

## `/auth`

| Method | Path | Auth | Body / Query | Returns |
| --- | --- | --- | --- | --- |
| POST | `/auth/sign-in` | — | `signInSchema` | `AuthSession` or `{ challengeId, method: 'otp' }` when a second factor is required |
| POST | `/auth/sign-in/phone` | — | `phoneSignInSchema` | `{ challengeId, method: 'otp', sentTo }` |
| POST | `/auth/verify-otp` | — | `otpVerifySchema` | `AuthSession` |
| POST | `/auth/resend-otp` | — | `{ challengeId }` | `{ challengeId, expiresAt }` |
| POST | `/auth/sign-up` | — | `signUpSchema` | `AuthSession` |
| POST | `/auth/register/artist` | — | `artistRegistrationSchema` | `AuthSession` |
| POST | `/auth/register/space-owner` | — | `spaceOwnerRegistrationSchema` | `AuthSession` |
| POST | `/auth/forgot-password` | — | `forgotPasswordSchema` | `{ sent: true }` (always, to avoid account enumeration) |
| POST | `/auth/reset-password` | — | `resetPasswordSchema` | `{ ok: true }` |
| POST | `/auth/verify-email` | — | `{ token }` | `AuthSession` |
| POST | `/auth/resend-verification` | user | — | `{ sent: true }` |
| GET | `/auth/session` | user | — | `AuthSession` |
| POST | `/auth/sign-out` | user | — | `{ ok: true }` |

> Dev affordance: when SMTP is not configured the OTP and verification links are
> logged by the server and returned as `devCode` / `devToken` so the flows are
> walkable end to end. Never emitted when `NODE_ENV=production`.

## `/users`

| Method | Path | Auth | Body | Returns |
| --- | --- | --- | --- | --- |
| GET | `/users/me` | user | — | `{ user, profile }` |
| PATCH | `/users/me` | user | `profileUpdateSchema` | `Profile` |
| POST | `/users/me/avatar` | user | `{ imageBase64 }` | `{ avatarUrl }` |
| GET | `/users/artists` | — | `?q&genre&featured&page&pageSize` | `Paginated<PublicArtist>` |
| GET | `/users/artists/:slug` | — | — | `PublicArtist` (with `achievements`, `collections`) |
| GET | `/users/artists/:slug/artworks` | — | `?category&page&pageSize` | `Paginated<ArtworkWithArtist>` |
| POST | `/users/artists/:id/follow` | user | — | `{ following: boolean, followers: number }` |

## `/spaces`

| Method | Path | Auth | Body | Returns |
| --- | --- | --- | --- | --- |
| GET | `/spaces` | space_owner | — | `Space[]` (own spaces) |
| POST | `/spaces` | space_owner | `spaceSchema` | `Space` |
| GET | `/spaces/:id` | owner or staff | — | `Space` |
| PATCH | `/spaces/:id` | owner or staff | partial `spaceSchema` | `Space` |
| GET | `/spaces/:id/recommendations` | owner | `?limit` | `ArtworkWithArtist[]` — theme/cuisine/wall-colour matched (requirements §17) |

## `/artworks`

| Method | Path | Auth | Body / Query | Returns |
| --- | --- | --- | --- | --- |
| GET | `/artworks` | — | `galleryQuerySchema` | `Paginated<ArtworkWithArtist>` — approved only |
| GET | `/artworks/facets` | — | — | `{ category, mood, colors, orientation, suitableFor }` counts |
| GET | `/artworks/:id` | — | — | `ArtworkWithArtist` (increments `views`) |
| GET | `/artworks/:id/related` | — | `?limit` | `ArtworkWithArtist[]` |
| GET | `/artworks/mine` | artist | `?status&page&pageSize` | `Paginated<Artwork>` |
| POST | `/artworks` | artist | `artworkUploadSchema` | `Artwork` — runs the validation pipeline, lands in `pending_review` |
| PATCH | `/artworks/:id` | artist (own) | partial | `Artwork` |
| DELETE | `/artworks/:id` | artist (own) | — | `{ ok: true }` |
| GET | `/artworks/wishlist` | user | — | `ArtworkWithArtist[]` |
| POST | `/artworks/:id/wishlist` | user | — | `{ wishlisted: boolean }` |

## `/orders`

| Method | Path | Auth | Body | Returns |
| --- | --- | --- | --- | --- |
| POST | `/orders/quote` | user | `createOrderSchema` (unsaved) | `PriceBreakdown` — live checkout preview |
| GET | `/orders` | space_owner | `?status&page&pageSize` | `Paginated<Order>` (own) |
| POST | `/orders` | space_owner | `createOrderSchema` | `Order` in `pending_payment` |
| GET | `/orders/:id` | owner or staff | — | `Order` |
| POST | `/orders/:id/cancel` | owner or staff | `{ reason? }` | `Order` |

## `/payments`

| Method | Path | Auth | Body | Returns |
| --- | --- | --- | --- | --- |
| POST | `/payments` | space_owner | `createPaymentSchema` | `Payment` with `qrImageDataUrl` + `expiresAt` |
| GET | `/payments/:id` | owner or staff | — | `Payment` — polled while the QR is open |
| POST | `/payments/:id/verify` | space_owner | `verifyPaymentSchema` | `{ payment, order }` — on success the order moves to `confirmed`, an invoice is issued and notifications fire |
| POST | `/payments/:id/retry` | space_owner | — | `Payment` (fresh QR, `attempts + 1`) |

## `/uploads`

| Method | Path | Auth | Body | Returns |
| --- | --- | --- | --- | --- |
| POST | `/uploads` | user | `{ imageBase64, folder: 'artworks'\|'profiles'\|'spaces'\|'documents', fileName? }` | `{ url, path }` |

Base64 in, public URL out (SDD §11). Max payload 12 MB.

## `/notifications`

| Method | Path | Auth | Returns |
| --- | --- | --- | --- |
| GET | `/notifications` | user | `?unread&page` → `Paginated<Notification>` |
| GET | `/notifications/unread-count` | user | `{ count }` |
| POST | `/notifications/:id/read` | user | `Notification` |
| POST | `/notifications/read-all` | user | `{ ok: true }` |
| POST | `/notifications/:id/archive` | user | `Notification` |

## `/rotation`

| Method | Path | Auth | Returns |
| --- | --- | --- | --- |
| GET | `/rotation` | space_owner | `RotationCycle[]` for own spaces |
| GET | `/rotation/:id` | owner or staff | `RotationCycle` with resolved artworks |
| POST | `/rotation/:id/approve` | space_owner | `RotationCycle` (`approved`) |
| POST | `/rotation/:id/request-changes` | space_owner | `{ note }` → `RotationCycle` |
| POST | `/rotation/:id/propose` | staff | `{ artworkIds }` → `RotationCycle` (`awaiting_approval`) |

## `/invoices`

| Method | Path | Auth | Returns |
| --- | --- | --- | --- |
| GET | `/invoices` | space_owner | `Invoice[]` |
| GET | `/invoices/:id` | owner or staff | `Invoice` + `order` |
| GET | `/invoices/:id/download` | owner or staff | `text/html` GST invoice, `Content-Disposition: attachment` |

## `/admin` (Curate Console)

All routes require an internal role; each is further restricted by
`ROLE_MODULES` in `@curate/shared`.

| Method | Path | Module | Returns |
| --- | --- | --- | --- |
| GET | `/admin/analytics` | overview | `ConsoleAnalytics` |
| GET | `/admin/orders` | orders | `Paginated<Order>` `?status&q&page` |
| PATCH | `/admin/orders/:id/status` | orders | `updateOrderStatusSchema` → `Order` (notifies owner + artists) |
| POST | `/admin/orders/:id/installation` | orders | `{ scheduledFor, installationWindow?, technician? }` → `Installation` |
| GET | `/admin/moderation` | moderation | `Paginated<Artwork>` `?status=pending_review` |
| POST | `/admin/moderation/:id` | moderation | `artworkReviewSchema` → `Artwork` |
| GET | `/admin/artists` | artists | `Paginated<PublicArtist>` |
| GET | `/admin/applications` | artists | `Paginated<ArtistApplication>` |
| POST | `/admin/applications/:id` | artists | `{ decision, note? }` → `ArtistApplication` |
| GET | `/admin/spaces` | spaces | `Paginated<Space>` |
| POST | `/admin/spaces/:id/verify` | spaces | `{ verified }` → `Space` |
| GET | `/admin/consultations` | spaces | `Paginated<ConsultationRequest>` |
| POST | `/admin/consultations/:id` | spaces | `{ status }` → `ConsultationRequest` |
| GET | `/admin/printing` | printing | `Order[]` in `confirmed \| printing \| framing` |
| GET | `/admin/payments` | payments | `Paginated<Payment>` |
| GET | `/admin/payouts` | accounts | `Paginated<Payout>` |
| POST | `/admin/payouts/:id/pay` | accounts | `Payout` |
| GET | `/admin/reports` | reports | `{ revenueTrend, ordersTrend, topSpaces, topArtists, popularArtworks, gst }` |
| GET | `/admin/users` | users | `Paginated<User & { profile }>` |
| PATCH | `/admin/users/:id` | users | `{ role?, status? }` → `User` |
| GET | `/admin/audit` | users | `Paginated<AuditLogEntry>` |
| GET | `/admin/system` | system | `{ uptime, memory, dataDriver, authDriver, storageDriver, requestCount, errorCount, recentErrors, routes }` |

## `/analytics`

| Method | Path | Auth | Returns |
| --- | --- | --- | --- |
| GET | `/analytics/me` | user | Role-shaped dashboard analytics: `SpaceOwnerAnalytics` for a space owner, `ArtistAnalytics` for an artist, `ConsoleAnalytics` for internal staff |

## Public forms (no auth)

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/consultations` | `consultationSchema` | `ConsultationRequest` |
| GET | `/consultations/slots` | `?date` | `{ date, slots: { time, available }[] }` |
| POST | `/applications` | `artistApplicationSchema` | `ArtistApplication` |
| POST | `/support` | `supportTicketSchema` (auth) | `SupportTicket` |
| GET | `/support` | auth | `SupportTicket[]` |
| GET | `/health` | — | `{ status, uptime, drivers }` |

---

## Seeded demo accounts

Password shown as-is; the local auth driver hashes on seed.

| Email | Password | Role |
| --- | --- | --- |
| `ceo@curate.ac.in` | `Curate@CEO2026` | CEO — full access |
| `manager@curate.ac.in` | `Curate@Mgr2026` | Manager — operations, moderation, reports |
| `accounts@curate.ac.in` | `Curate@Acc2026` | Accounts — finance only |
| `it@curate.ac.in` | `Curate@IT2026` | IT Team — users, system, email log |
| `fieldops@curate.ac.in` | `Curate@Ops2026` | Field Operations — orders, printing, spaces |
| `restaurant.demo@curate.ac.in` | `Curate@Rest2026` | Restaurant Owner (Space) |
| `photographer.demo@curate.ac.in` | `Curate@Photo2026` | Photographer (Artist) |