# Wiring up the real services

Out of the box Curate runs on a seeded in-process store, local disk and a
console mailer, so `npm run dev` works with no accounts and no keys. This
document is how you move each piece onto real infrastructure.

**Everything below is independent.** You can put the database on Supabase and
leave email on the console, or turn on SMTP and keep the memory store. Each
switch is one environment variable.

Create a `.env` at the **repo root** (not inside `server/`) — both workspaces
read from there. Start from `.env.example`.

Current state at a glance:

| Service | Setting | Status |
| --- | --- | --- |
| Database | `DATA_DRIVER=supabase` | **Implemented and verified** against a live project. |
| File storage | `STORAGE_DRIVER=supabase` | **Implemented and verified.** Needs six buckets. |
| Email | `SMTP_*` | **Implemented** via nodemailer. |
| Payments — UPI QR | `PAYMENT_PROVIDER=mock_qr` | **Implemented**, no gateway behind it. |
| Payments — Razorpay / Stripe | `PAYMENT_PROVIDER=razorpay\|stripe` | **Not implemented.** Interface and registry exist; the methods throw `501`. |
| Social sign-in (OAuth) | `VITE_SUPABASE_*` | **Implemented.** Needs provider apps — see §5. |
| Password auth | — | **Implemented.** bcrypt + JWT, owned by Curate. |
| `AUTH_DRIVER=supabase` | — | **Not implemented** and not needed: OAuth works without replacing the session model. |

---

## 1 · Supabase — database

**What you get:** every table persists in PostgreSQL instead of process memory,
so restarts and multiple server instances share state.

1. Create a project at [supabase.com](https://supabase.com). Region close to
   your users — `ap-south-1` (Mumbai) for an Indian launch.

2. **Project settings → API** gives you three values:

   ```
   SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   SUPABASE_ANON_KEY=eyJhbGci...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
   ```

   The service-role key bypasses row-level security. It belongs on the server
   only — never in `client/`, never in a `VITE_` variable, never committed.

3. Run the schema. Either paste `database/schema.sql` into the Supabase SQL
   editor and run it, or from a terminal:

   ```bash
   psql "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres" \
     -f database/schema.sql
   ```

4. Set `DATA_DRIVER=supabase` in `.env` and restart.

On first boot the server sees an empty `users` table and seeds the demo dataset
into Postgres automatically — same 29 users, 140 photographs and 26 orders. To
start from nothing instead, comment out the `ensureSeeded()` call in
`server/src/index.ts`.

**Two things worth knowing.**

The TypeScript types are camelCase and the SQL is snake_case;
`SupabaseTable` converts between them at the *top level only*, which is why
`jsonb` payloads (an order's `items`, an artwork's `validation`) keep their
original casing inside. Don't rename those nested keys in SQL.

RLS is enabled on every table with **no permissive policies**. That is
deliberate: the API authorises requests itself using the service-role key, so
nothing is readable with the anon key even if it leaks. Only add policies if you
later let the browser query Supabase directly.

This path has been run end to end against a live project: schema applied, demo
data seeded into Postgres, all 46 API checks and all 50 screens passing. Two
bugs surfaced doing it and are fixed — `window` is a reserved SQL keyword (the
column is now `installation_window`), and the seeder had to clear tables
children-first because foreign keys restrict deletes.

---

## 2 · Supabase — file storage

**What you get:** uploads go to Supabase Storage and are served from its CDN,
instead of `server/uploads` on one machine's disk.

1. In **Storage**, create six buckets, all **public**. The names must match
   exactly — they map one-to-one to `StorageFolder` in
   `server/src/services/storage.service.ts`:

   ```
   artworks    profiles    spaces
   documents   invoices    thumbnails
   ```

2. Set `STORAGE_DRIVER=supabase` and restart.

The upload path itself does not change: the client still base64-encodes and
`POST`s, the server still decodes, validates type and size (12 MB cap), and
returns a public URL. Only the destination moves.

Seeded imagery points at remote URLs and `storeImage()` passes those through
untouched, so seeding never uploads anything.

If you want private artwork originals with signed URLs — the watermarking
requirement — make the `artworks` bucket private and swap `getPublicUrl` for
`createSignedUrl` in `uploadToSupabase`. That is the only place it is called.

---

## 3 · Email (SMTP)

**What you get:** real delivery instead of messages only being captured.

### Nothing is lost while you wait

Every message is recorded either way. **Console → System → Email Log**
(`/console/system/mail`, CEO or IT) lists everything Curate has sent, and opens
the **fully rendered body** so you can read it exactly as the recipient would.
Once SMTP is live it keeps working as a delivery log — `Sent` versus `Captured`.

There is a **Send a test** button on that page. Use it before running a real
flow; it tells you in one click whether your provider is actually working.

### Gmail

Gmail needs an **App Password** — your normal password will be rejected.

1. Turn on 2-Step Verification: [myaccount.google.com/security](https://myaccount.google.com/security).
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords),
   create one named "Curate", and copy the 16 characters.
3. Put it in `.env` at the repo root:

   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=vibhukrishnas7@gmail.com
   SMTP_PASS=abcdefghijklmnop        # the app password, spaces removed
   SMTP_FROM="Curate <vibhukrishnas7@gmail.com>"
   ```

4. Restart the server and use **Send a test**.

`SMTP_FROM` should match `SMTP_USER` on Gmail — a mismatched from-address gets
rewritten or rejected. Gmail also caps free accounts at roughly 500 messages a
day, which is plenty for testing and not enough for production.

### Better for production

Gmail is fine for verifying flows, not for real volume. Resend, Postmark and SES
all authenticate your own domain, so mail is far less likely to land in spam:

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=<api key>
SMTP_FROM="Curate <hello@curate.space>"
```

Setting `SMTP_HOST` and `SMTP_USER` is all it takes — there is no driver flag.

### Once it is live

Delivery failures are logged and swallowed on purpose: an email provider having
a bad afternoon must never roll back a paid order. Check the Email Log if
something seems missing — a message marked `Captured` rather than `Sent` means
the provider refused it, and the server log has the reason.

Note that the development conveniences disappear outside development: the OTP
`devCode` and the password-reset `devToken` are only returned when
`NODE_ENV` is not `production`, so codes have to arrive by email.

---

## 3a · Who gets emailed, and when

The complete chain, verified end to end:

| Trigger | Space owner | Artist | Staff |
| --- | --- | --- | --- |
| Registration | Confirm your email address | Confirm your email address | — |
| Sign-in second factor | 6-digit code | 6-digit code | 6-digit code |
| Password reset | Reset link | Reset link | Reset link |
| Consultation booked | Request received | — | in-app |
| Artist application | — | Application received | in-app |
| **Photograph uploaded** | — | **We have your photograph** | in-app |
| **Curation decision** | — | **Live on Curate** / **About "…"** | — |
| Payment verified | **Payment received** + **Order received** | **"…" is going up at …** | in-app |
| Payment failed | in-app + retry link | — | — |
| **Installation booked** | **Installation scheduled** | **Your work is going up** | — |
| Order marked complete | Installation update | — | — |
| **Payout released** | — | **Your payout is on its way** | — |
| Support request | Receipt of your request | — | in-app |

Rows in bold were added or fixed after end-to-end testing. Everything else is
also an in-app notification, because the brief is explicit that no important
event may live in email alone.

## 4 · Payments

### Today — UPI QR (`mock_qr`)

Fully working, no account needed. It builds a real UPI intent string and renders
a scannable QR:

```
PAYMENT_UPI_VPA=yourbusiness@upi
PAYMENT_PAYEE_NAME=Curate
```

Point it at a real VPA and the QR takes real money. What is missing is
**automatic confirmation** — there is no gateway callback, so the space owner
taps "I've paid" and enters the UTR, and someone reconciles it. That is why the
dev panel has *Simulate successful payment*.

### Next — Razorpay

The interface is already there. `RazorpayProvider` in
`server/src/services/payment.service.ts` has the two methods to fill in:

```ts
createCharge({ orderId, amount, reference })  // → { qrPayload?, qrImageDataUrl?, expiresAt }
verifyCharge(payment, { reference, simulate }) // → { status, failureReason? }
```

To finish it:

1. `npm i razorpay -w server`
2. Implement `createCharge` with `orders.create({ amount: amount * 100, currency: 'INR' })`
   — Razorpay works in paise, the rest of this codebase works in rupees.
3. Implement `verifyCharge` by validating the signature with
   `RAZORPAY_KEY_SECRET`.
4. Add a webhook route so payments confirm themselves instead of the customer
   asserting it. Point it at the same success path
   `POST /payments/:id/verify` already runs.
5. Set `PAYMENT_PROVIDER=razorpay`.

Nothing above the provider changes — not the checkout, not the order flow, not
the UI. That was the point of the abstraction.

---

## 5 · Auth and social sign-in (OAuth)

### How it fits together

Supabase brokers the handshake with Google, Apple or Facebook. Curate still owns
the account: the provider proves who someone is, then our API creates or finds a
row in our own `users` table and issues our own JWT.

```
Browser  ──▶ Google  ──▶ Supabase  ──▶ /auth/callback
                                          │  provider token
                                          ▼
                                   POST /auth/oauth
                                   verify with Supabase, find-or-create user
                                          │  Curate JWT
                                          ▼
                                   normal Curate session
```

That keeps one authorisation model rather than two. Roles, RBAC, the Console
modules and every existing endpoint are untouched, and someone who signed up
with a password can later use Google without ending up with a second account —
they are matched on email.

Password sign-in itself remains local: bcrypt hashes, JWTs signed with
`JWT_SECRET`, and one-time codes in the `otp_challenges` and `tokens` tables.
`AUTH_DRIVER=supabase` is still not implemented and the server pins it to
`local` rather than accepting the setting and ignoring it.

### What the code already does

Wired and typechecked:

| Piece | File |
| --- | --- |
| Browser Supabase client + redirect | `client/src/lib/supabase.ts` |
| The three provider buttons | `client/src/features/auth/components/AuthBits.tsx` |
| Redirect landing page | `client/src/features/auth/pages/OAuthCallbackPage.tsx` |
| Token verification | `server/src/services/oauth.service.ts` |
| Find-or-create the account | `findOrCreateOAuthUser` in `server/src/services/auth.service.ts` |
| Endpoint | `POST /auth/oauth` |

The buttons stay disabled with a tooltip until `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` are set, so nothing pretends to work.

### Step 1 — environment

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

**Only the anon key.** `VITE_` variables are compiled into the JavaScript your
visitors download. The service-role key bypasses row-level security and must
never appear in one.

### Step 2 — Supabase redirect URLs

**Authentication → URL Configuration**:

- Site URL: `http://localhost:5173`
- Additional redirect URLs: `http://localhost:5173/auth/callback`

Add your production origin and its `/auth/callback` before you deploy. A URL
that is not on this list is rejected by Supabase, which is the single most
common reason a social login "does nothing".

### Step 3 — the providers

Each provider is its own account and its own approval process. Do Google first;
it is by far the easiest and covers most users.

**Google** — about ten minutes.

1. [Google Cloud Console](https://console.cloud.google.com) → create or pick a
   project.
2. **APIs & Services → OAuth consent screen**: External, fill in app name,
   support email, developer email. While it is in *Testing* only accounts you
   list as test users can sign in — add your own.
3. **Credentials → Create credentials → OAuth client ID → Web application**.
   Authorised redirect URI — this points at Supabase, not at your app:

   ```
   https://<ref>.supabase.co/auth/v1/callback
   ```

4. Copy the Client ID and Client Secret into Supabase →
   **Authentication → Providers → Google** → enable.

**Apple** — needs a paid Apple Developer Program membership (₹8,900 / $99 a
year). You create an App ID, a Services ID, and a Sign in with Apple key (.p8),
then give Supabase the Services ID, Team ID, Key ID and key contents. Budget an
hour, and note Apple can return a private relay address rather than a real one.

**Facebook** — create an app at
[developers.facebook.com](https://developers.facebook.com), add Facebook Login,
set the same Supabase callback URL, and copy the App ID and secret into Supabase.
It works immediately for app admins; taking it live for the public requires Meta
app review, which takes days.

If you only enable Google, hide the other two buttons rather than leaving them
to fail — `providers` in `SocialButtons` is a single array.

### Step 4 — try it

Restart the dev server so the new `VITE_` variables are compiled in, then open
`/signin?as=artist` and click Google. You should land back on `/auth/callback`
and then in the studio.

If the account is new it is created **verified** (the provider already proved the
address), given the role implied by the page you started from — `?as=artist`
becomes an artist, otherwise a space owner — and gets a welcome notification.
Every OAuth sign-in is written to the audit log with the provider name.

> Honest caveat: I could not test the full round trip from here, because it
> needs your Google project and a real browser redirect. What is verified is
> that the endpoint rejects a forged token, that the buttons degrade correctly
> when unconfigured, that the callback route renders, and that the whole thing
> typechecks and builds.

### Common failures

| Symptom | Cause |
| --- | --- |
| Nothing happens on click | `VITE_` variables missing, or the dev server was not restarted after adding them |
| `redirect_to is not allowed` | The callback URL is not in Supabase's redirect list |
| `redirect_uri_mismatch` from Google | Google's authorised URI must be the **Supabase** callback, not your app's |
| Signs in, bounces back to sign-in | `POST /auth/oauth` failed — check the server log |
| "That provider did not share an email address" | Apple relay or a Facebook app without the email permission |

## 6 · Before you put this in front of real customers

Independent of any service, these are the things I would not skip:

- **Set `JWT_SECRET`.** The default is a development placeholder.
- **Set `NODE_ENV=production`.** This is what stops `devCode` and `devToken`
  being returned, hides internal error messages, and enables rate limiting —
  the limiters currently skip in development so they don't get in your way.
- **Set `CLIENT_URL`** to your real origin; CORS is wide open in development and
  locks to that origin in production.
- **Serve `client/dist` behind HTTPS** (`npm run build`), with the API on the
  same domain or an explicit `VITE_API_URL`.
- **Rotate the seeded demo accounts.** Every password is written in this repo's
  documentation. Delete them or change all seven before launch.
- **Back up Postgres.** Supabase does daily backups on paid plans; on free it
  does not.
