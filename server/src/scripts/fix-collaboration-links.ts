/**
 * Applies the homepage content corrections from the 20 Aug 2026 review video.
 *
 *   npm run fix:content --workspace server
 *
 * Two things, both of which live in the database rather than in the source: the
 * link on the Nib & Nosh collaboration, and the testimonials ARTINU has
 * received from the people in them.
 *
 * ── Why this is a script and not a code change ──────────────────────────────
 *
 * Collaborations are rows a manager creates in Console → Homepage, not seeded
 * data, so the only copy of them is the live database. Hardcoding one partner's
 * URL into the homepage component would put it in the source tree, where the
 * console could not correct it and the next partner would need a deploy.
 *
 * ── What it changes ─────────────────────────────────────────────────────────
 *
 *   websiteUrl → https://nibandnoshcafe.com, for any café whose name reads as
 *                "Nib & Nosh", and only when the field is empty or points at the
 *                wrong domain.
 *
 * That is the whole of it. `photoUrl`, `description`, name, order, isActive and
 * createdAt are all left exactly as the manager set them — the café's address
 * in particular stays, because it is the partner's address and it tells a
 * visitor where to go and see the work. No row is created and none is deleted;
 * if there is no Nib & Nosh café in the database the script says so and exits,
 * because inventing a collaboration is not a migration.
 *
 * Requires `cafes.website_url`, which arrives with
 * database/migrations/009_registration_and_collaborations.sql. Without it the
 * write fails cleanly and nothing on the row changes.
 *
 * Safe to run more than once: every write is conditional on the current value,
 * so a second run reports "already correct" and changes nothing.
 */
import { db } from '@/database/db';
import { now } from '@/utils/ids';

/** Confirmed by the client on 20 Aug 2026, against the café's live site. */
const WEBSITE_URL = 'https://nibandnoshcafe.com';

/**
 * The wrong domain, which reached the codebase as a comment and could plausibly
 * have been typed into the console from there.
 */
const WRONG_DOMAINS = ['nibbannosh.com', 'nibbannosh.in'];


/** Matches "Nib & Nosh", "Nib and Nosh", "Nib&Nosh Café" and so on. */
const NIB_AND_NOSH = /nib\s*(&|and)\s*nosh/i;


/**
 * The real testimonials, in the order they were given.
 *
 * `business` is absent on both. Neither speaks for a company — one is a father
 * standing beside his daughter's exhibited photograph, the other a photographer
 * standing beside his own. The homepage builds the attribution from whichever
 * of `role`/`business` exist, so omitting it says "there is none" rather than
 * leaving a gap to fill in later.
 */
const TESTIMONIALS = [
  {
    name: 'Sachin',
    role: "Siya's dad",
    quote:
      'This is a very innovative idea to inspire budding artists with this idea. It gives them a good platform to express and display their craft.',
    photo: '/image/testimonials/sachin-720.webp',
    photoAlt:
      "Sachin standing beside his daughter Siya Jawadekar's framed photograph on the wall at Nib & Nosh Café",
  },
  {
    name: 'Oum Mishra',
    role: 'Photographer',
    quote:
      'As a photographer, seeing my photograph on a screen is one thing, but seeing it beautifully framed and displayed in a real café was completely different. The moment I walked in and saw my photograph on the wall, it genuinely felt special. It was a small moment, but for me, it felt like my work had found a place beyond my camera and gallery. I’m really grateful to Artinu for giving my photograph a space to be seen and appreciated.',
    photo: '/image/testimonials/oummishra-720.webp',
    photoAlt:
      'Oum Mishra standing beside his framed photograph on the wall at Nib & Nosh Café',
  },
];

/**
 * Adds the testimonial if it is not already there, leaving any others alone.
 *
 * Matching is on the quote rather than the name so a second run cannot add a
 * duplicate, and so a manager who has since edited the wording in the console
 * keeps their version instead of having ours written back over it.
 */
async function seedTestimonials() {
  const ID = 'homepage_testimonials';
  const record = await db.uiContent.byId(ID);

  const existing = Array.isArray(record?.data) ? (record.data as Record<string, unknown>[]) : [];

  /** Same opening words = same quote, however it has since been edited. */
  const fingerprint = (quote: string) => quote.trim().slice(0, 40).toLowerCase();
  const present = new Set(
    existing
      .map((entry) => (typeof entry?.quote === 'string' ? fingerprint(entry.quote) : null))
      .filter(Boolean) as string[],
  );

  const missing = TESTIMONIALS.filter((entry) => !present.has(fingerprint(entry.quote)));

  if (missing.length === 0) {
    console.log(`  ✓ All ${TESTIMONIALS.length} testimonial(s) are already published.`);
    return 0;
  }

  const data = [...existing, ...missing];

  if (record) {
    await db.uiContent.update(ID, { data, updatedAt: now() } as never);
  } else {
    // Exactly the shape `PUT /content/:id` writes. `ui_content` has no
    // `created_at` column, and including one made the insert fail against the
    // real schema while passing against the in-memory store, which does not
    // care what you hand it.
    await db.uiContent.insert({ id: ID, data, updatedAt: now() } as never);
  }

  for (const entry of missing) console.log(`  → Published: ${entry.name}`);
  console.log(`    (${existing.length} existing quote(s) kept)`);
  return missing.length;
}

async function main() {
  const cafes = await db.cafes.find();
  const matches = cafes.filter((cafe) => NIB_AND_NOSH.test(cafe.name));

  console.log('Collaborations');

  if (matches.length === 0) {
    console.log(
      '  ! No "Nib & Nosh" collaboration found — nothing changed.\n' +
        '    If the café is listed under another name, update it in\n' +
        '    Console → Homepage → Collaborations.',
    );
  }

  let changed = 0;

  for (const cafe of matches) {
    const patch: Record<string, unknown> = {};

    const currentUrl = cafe.websiteUrl?.trim() ?? '';
    const pointsSomewhereWrong =
      !currentUrl || WRONG_DOMAINS.some((domain) => currentUrl.includes(domain));

    if (pointsSomewhereWrong && currentUrl !== WEBSITE_URL) {
      patch.websiteUrl = WEBSITE_URL;
    }

    /*
      `photoUrl` and `description` are left exactly as they are.

      An earlier version of this script rewrote both — it pointed the photo at a
      generated file and replaced the address with a sentence about the
      collaboration. Both were wrong. The card now cycles through the partner's
      photographs from the site's own assets, so the stored `photoUrl` is only a
      fallback and does not need replacing; and the address belongs to the café,
      not to ARTINU, so removing it took away the one line that tells a visitor
      where to go and see the work.

      The only thing missing from this row was somewhere to link to.
    */

    if (Object.keys(patch).length === 0) {
      console.log(`  ✓ ${cafe.name} — already correct, nothing to change.`);
      continue;
    }

    console.log(`  → ${cafe.name} updated:`);
    for (const [key, value] of Object.entries(patch)) {
      // Print what is being replaced as well as what replaces it — this is the
      // only record of the previous value once the write lands.
      const before = (cafe as unknown as Record<string, unknown>)[key];
      console.log(`      ${key}`);
      console.log(`        was: ${before ? String(before) : '(empty)'}`);
      console.log(`        now: ${String(value)}`);
    }

    try {
      await db.cafes.update(cafe.id, { ...patch, updatedAt: now() });
      changed += 1;
    } catch (error) {
      /*
        `cafes.website_url` may not exist yet.

        This threw and took the whole script with it, which meant the
        testimonial below — which needs no migration at all — never ran either.
        One missing column should cost the one thing that depends on it.
      */
      const message = error instanceof Error ? error.message : String(error);
      const missingColumn =
        /PGRST204|could not find|does not exist|schema cache/i.test(message) &&
        message.includes('website_url');

      if (!missingColumn) throw error;

      console.log(
        '  ! cafes.website_url does not exist in this database, so the link\n' +
          '    could not be saved. Apply this in the Supabase SQL editor:\n\n' +
          '      alter table cafes add column if not exists website_url text;\n\n' +
          '    then run this script again. Nothing else on the row was changed.',
      );
    }
  }

  console.log('\nTestimonials');
  const testimonialsAdded = await seedTestimonials();

  console.log(
    `\nDone — ${changed} collaboration(s) updated, ${testimonialsAdded} testimonial(s) added.`,
  );
}

/*
  No `process.exit(0)` on success — the same shape every other script in this
  folder uses, and for a reason that is easy to miss.

  The in-memory driver writes `.data/db.json` from a debounced `setTimeout`
  (see `persist` in database/db.ts). Exiting the moment `main()` resolves kills
  that timer before it fires, so against DATA_DRIVER=memory the script printed
  every change it had made and then saved none of them.

  Supabase was never affected — `SupabaseTable.update` awaits an HTTP write that
  is committed by the time the promise resolves — so this only ever bit anyone
  rehearsing the run locally. Letting the event loop drain covers both.
*/
main().catch((error) => {
  console.error('Content fix failed:', error);
  process.exitCode = 1;
});
