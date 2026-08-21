/**
 * Read-only integrity check against whatever database is configured.
 *
 *   npm run audit:production --workspace server
 *
 * Answers one question: is there anything in this database that should not be
 * there, and is everything that should be there still intact?
 *
 * Performs no writes of any kind. Every call below is a read.
 */
import { db } from '@/database/db';

/** Patterns used by the throwaway accounts created while testing. */
const TEST_EMAIL_PATTERNS = [
  /^verify\.test\./i,
  /^enforce\./i,
  /^qa\.(artist|visitor)\./i,
  /^probe\./i,
  /^lifecycle\./i,
  /^(fresh|stale|uploaded|dormant|active|recent|owner)\.\d{10,}@/i,
  /@example\.com$/i,
];

const isTestEmail = (email: string) =>
  TEST_EMAIL_PATTERNS.some((pattern) => pattern.test(email));

const line = (label: string, value: string | number) =>
  console.log(`  ${label.padEnd(42)} ${value}`);

async function main() {
  console.log('ARTINU — production integrity audit (read-only)\n');

  // ── What is actually in there ─────────────────────────────────────────────
  const [users, profiles, artworks, orders, spaces, cafes] = await Promise.all([
    db.users.find(),
    db.profiles.find(),
    db.artworks.find(),
    db.orders.find(),
    db.spaces.find(),
    db.cafes.find(),
  ]);

  console.log('Counts');
  line('users', users.length);
  line('profiles', profiles.length);
  line('artworks', artworks.length);
  line('orders', orders.length);
  line('spaces', spaces.length);
  line('collaborations', cafes.length);

  // ── Contamination ─────────────────────────────────────────────────────────
  console.log('\nTest data');
  const testUsers = users.filter((user) => isTestEmail(user.email));
  line('accounts matching a test pattern', testUsers.length);
  for (const user of testUsers) console.log(`      ! ${user.email}  (${user.role}, ${user.status})`);

  const testUserIds = new Set(testUsers.map((user) => user.id));
  const testArtworks = artworks.filter((artwork) => testUserIds.has(artwork.artistId));
  line('artworks belonging to test accounts', testArtworks.length);

  const qaTitles = artworks.filter((artwork) => /^(QA |Test piece$)/i.test(artwork.title));
  line('artworks with a QA/test title', qaTitles.length);
  for (const artwork of qaTitles) console.log(`      ! "${artwork.title}" (${artwork.id})`);

  // ── Real accounts, untouched? ─────────────────────────────────────────────
  console.log('\nReal accounts');
  const real = users.filter((user) => !isTestEmail(user.email));
  line('real accounts', real.length);
  line('  · artists', real.filter((u) => u.role === 'artist').length);
  line('  · space owners', real.filter((u) => u.role === 'space_owner').length);
  line('  · staff', real.filter((u) => !['artist', 'space_owner', 'guest'].includes(u.role)).length);

  const byStatus = real.reduce<Record<string, number>>((counts, user) => {
    counts[user.status] = (counts[user.status] ?? 0) + 1;
    return counts;
  }, {});
  for (const [status, count] of Object.entries(byStatus)) line(`  · status: ${status}`, count);

  // Nothing should have been suspended or banned by this work.
  const enforced = real.filter((user) => user.status === 'suspended' || user.status === 'banned');
  line('real accounts suspended or banned', enforced.length);
  for (const user of enforced) {
    console.log(`      ! ${user.email} — ${user.status}: ${user.statusReason ?? 'no reason recorded'}`);
  }

  const missingProfile = real.filter(
    (user) => !profiles.some((profile) => profile.userId === user.id),
  );
  line('real accounts with no profile row', missingProfile.length);
  for (const user of missingProfile) console.log(`      ! ${user.email}`);

  // ── Enforcement records ───────────────────────────────────────────────────
  console.log('\nEnforcement records');
  let warnings: { userId: string; reason: string }[] = [];
  let removals: { userId: string; kind: string; status: string }[] = [];
  try {
    warnings = await db.warnings.find();
    line('warnings on record', warnings.length);
    for (const warning of warnings) {
      const owner = users.find((user) => user.id === warning.userId);
      const tag = owner && isTestEmail(owner.email) ? '! TEST' : '  real';
      console.log(`      ${tag}  ${owner?.email ?? warning.userId}: ${warning.reason.slice(0, 60)}`);
    }
  } catch {
    line('warnings table', 'not created yet (migration 010 not applied)');
  }

  try {
    removals = await db.removalRequests.find();
    line('removal requests', removals.length);
  } catch {
    line('removal_requests table', 'not created yet (migration 010 not applied)');
  }

  // ── Artwork integrity ─────────────────────────────────────────────────────
  console.log('\nArtwork integrity');
  const realArtworks = artworks.filter((artwork) => !testUserIds.has(artwork.artistId));
  line('real artworks', realArtworks.length);

  const artworkStatus = realArtworks.reduce<Record<string, number>>((counts, artwork) => {
    counts[artwork.status] = (counts[artwork.status] ?? 0) + 1;
    return counts;
  }, {});
  for (const [status, count] of Object.entries(artworkStatus)) line(`  · ${status}`, count);

  const orphaned = realArtworks.filter(
    (artwork) => !users.some((user) => user.id === artwork.artistId),
  );
  line('artworks whose artist no longer exists', orphaned.length);

  const noImage = realArtworks.filter((artwork) => !artwork.imageUrl);
  line('artworks with no image URL', noImage.length);

  // ── Homepage content written by fix:content ───────────────────────────────
  console.log('\nHomepage content');
  const testimonials = await db.uiContent.byId('homepage_testimonials');
  const quotes = Array.isArray(testimonials?.data) ? testimonials.data : [];
  line('published testimonials', quotes.length);
  for (const quote of quotes as { name?: string }[]) {
    console.log(`      · ${quote.name ?? '(unnamed)'}`);
  }

  // ── Verdict ───────────────────────────────────────────────────────────────
  const problems =
    testUsers.length +
    testArtworks.length +
    qaTitles.length +
    enforced.length +
    missingProfile.length +
    orphaned.length +
    noImage.length;

  console.log('\n' + '─'.repeat(60));
  console.log(
    problems === 0
      ? 'CLEAN — no test data, no unexpected enforcement, no orphaned or broken records.'
      : `${problems} item(s) above need a look.`,
  );
  process.exitCode = problems === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error('Audit failed:', error);
  process.exitCode = 1;
});
