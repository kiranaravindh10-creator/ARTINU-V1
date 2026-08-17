# Curate — build conventions

Read this before adding code. It exists so twenty files written by different
hands still read like one product.

## Design language

The interface should feel like walking into a well-lit gallery, not operating
business software. Photography carries the colour; the UI stays quiet.

- **Photography over decoration** — no gradients-as-ornament, no glassmorphism,
  no coloured shadows, no emoji in the UI.
- **Typography over noise** — `font-display` (Playfair) for headings and
  numbers that matter; `font-sans` (Inter) for everything read; `font-mono`
  (JetBrains Mono) only for the small letterspaced uppercase labels.
- **Whitespace over density** — sections breathe (`py-20`+ on marketing pages).
- **Calm motion** — 0.4–0.7s, `ease-[var(--ease-out-soft)]`, fade + small rise.
  Nothing bounces, nothing spins except a real loading state.

### Tokens (Tailwind v4, defined in `client/src/styles/globals.css`)

| Purpose | Class |
| --- | --- |
| Page background | `bg-canvas` (`#f7f5f2`), `bg-canvas-soft` |
| Cards / fields | `bg-surface` |
| Recessed band | `bg-sand`, `bg-sand-soft`, `bg-sand-deep` |
| Dark block | `bg-ink text-canvas` |
| Body text | `text-ink`, secondary `text-muted`, tertiary `text-subtle` |
| Accent | `text-bronze` / `bg-bronze`, tint `bg-bronze-soft` |
| Hairlines | `border-line`, `border-line-strong` |
| Status | `text-success \| warning \| danger \| info` (+ `-soft` backgrounds) |

Never introduce a raw hex or a Tailwind default colour (`bg-gray-100`,
`text-blue-600`). If a shade is missing, use the nearest token.

### Recurring patterns

- **Eyebrow**: `<p className="eyebrow">FEATURES</p>` — mono, uppercase, bronze.
- **Section**: `<Section tone="sand"><Container>…</Container></Section>`.
- **Heading**: `<SectionHeading eyebrow title description rule />`.
- **Marketing CTA**: `<Button shape="pill">` (uppercase, letterspaced).
- **Product button**: `<Button>` (rounded, sentence case).
- **Scroll entrance**: wrap in `<Reveal>` / `<Stagger><StaggerItem>`.
- **Every photograph** goes through `<Photo>` (or `<FramedPhoto>`), never a raw
  `<img>`, so loading and failure look deliberate.

## Client conventions

- Path alias `@/` → `client/src`. Shared contracts import from `@curate/shared`.
- **Pages** are `export default function XPage()` at the path the router
  already references (`client/src/routes/router.tsx` is the source of truth —
  do not edit it to move a file; create the file where it is expected).
- **Data**: TanStack Query for reads and mutations; keys from `qk` in
  `@/lib/query`. Never call `api` directly inside a component — go through a
  service in `client/src/services/*.service.ts`.
- **Forms**: React Hook Form + `zodResolver` with the schema from
  `@curate/shared`. One `<Field>` per input. Submit errors → `toast.error(errorMessage(e))`.
- **Money / dates**: `formatCurrency`, `formatDate`, `formatDateTime`,
  `formatRelative` from `@curate/shared`. Never hand-roll `₹` or `toFixed`.
- **Loading**: `<Skeleton>` shaped like the content it replaces — not a spinner.
- **Empty**: `<EmptyState>` with a real next action.
- **Errors**: `errorMessage(error)` from `@/lib/api`, surfaced with `toast`.
- **A11y**: every icon-only control needs `aria-label`; every image needs a real
  `alt`; interactive elements are `<button>`/`<a>`, never a `div` with onClick.
- **Responsive**: design mobile-first; check 375 / 768 / 1440.

## Server conventions

- Path alias `@/` → `server/src`.
- A route file exports one named router: `export const orderRouter = Router()`.
- Handlers are wrapped in `asyncHandler`; validation is
  `validate(schemaFromShared)` and the parsed value is read from `req.valid`.
- Throw the helpers in `@/utils/errors` (`notFound('Order')`, `forbidden()`).
  Never `res.status(500).json(...)` by hand.
- Data access is `db.<table>` (`@/database/db`) only — no direct Supabase calls
  in a route, so the memory driver keeps working.
- Business logic belongs in `server/src/services/*.service.ts`; routes stay thin
  (validate → call service → respond).
- Anything money-related is recomputed server-side with `calculatePricing`.
  Never trust a total that arrived in a request body.
- Every state change that matters records an audit entry and, where a person
  should know about it, a notification.

## Definition of done for a screen

1. Matches the design language above and the reference screens.
2. Loading, empty, error and success states all exist.
3. Works at 375px wide.
4. Keyboard reachable, labelled for screen readers.
5. `npm run typecheck` passes with no new errors.
