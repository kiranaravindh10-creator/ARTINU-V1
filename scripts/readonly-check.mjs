/**
 * Read-only mode (READ_ONLY_MODE=true), checked at the API.
 *
 *   cd server && DATA_DRIVER=memory MEMORY_PERSIST=false SEED_DEMO_DATA=true READ_ONLY_MODE=true \
 *     STORAGE_DRIVER=local SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= PORT=4341 npx tsx src/index.ts
 *   node scripts/readonly-check.mjs 4341
 *
 * Runs only against the in-memory demo store. Proves: the server says it is
 * read-only; sign-in works and records nothing; reads work; every kind of
 * write is refused with read_only_mode and changes nothing; a GET with a side
 * effect (view counter, audited export) cannot write; no mail is added.
 */
const PORT = process.argv[2] ?? '4341';
const API = `http://localhost:${PORT}/api`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
};

const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* csv or empty */
  }
  return { status: res.status, json, text };
};

// ── The server says what it is ────────────────────────────────────────────
const health = (await call('GET', '/health')).json;
if (health?.drivers?.data !== 'memory') throw new Error('Refusing: this check only runs against the in-memory driver');
check('Health reports read-only mode', health?.drivers?.readOnly === true, JSON.stringify(health?.drivers));

// ── Signing in works, and records nothing ─────────────────────────────────
const signIn = (email, password) => call('POST', '/auth/sign-in', { body: { email, password } });
const first = await signIn('ceo@artinu.in', 'ARTINU@CEO2026');
check('CEO can sign in', first.status === 200 && first.json?.accessToken, `status ${first.status}`);
const CEO = first.json?.accessToken;
const ceoId = first.json?.user?.id;
const lastLoginBefore = (await call('GET', `/admin/people/users/${ceoId}`, { token: CEO })).json?.user?.lastLoginAt;
await new Promise((resolve) => setTimeout(resolve, 1100));
const again = await signIn('ceo@artinu.in', 'ARTINU@CEO2026');
const lastLoginAfter = (await call('GET', `/admin/people/users/${ceoId}`, { token: again.json?.accessToken })).json?.user?.lastLoginAt;
check('Signing in does not record a last-login time', lastLoginBefore === lastLoginAfter, `${lastLoginBefore} -> ${lastLoginAfter}`);
const wrong = await signIn('ceo@artinu.in', 'not-the-password');
check('A wrong password is still refused', wrong.status === 401, `status ${wrong.status}`);
const signOut = await call('POST', '/auth/sign-out', { token: CEO });
check('Signing out is allowed', signOut.status === 200, `status ${signOut.status}`);

const ACCOUNTS = (await signIn('accounts@artinu.in', 'ARTINU@Acc2026')).json?.accessToken;
const ARTIST = (await signIn('photographer.demo@artinu.in', 'ARTINU@Photo2026')).json?.accessToken;
const OWNER = (await signIn('restaurant.demo@artinu.in', 'ARTINU@Rest2026')).json?.accessToken;
check('Accounts, a photographer and a space owner can sign in', ACCOUNTS && ARTIST && OWNER);

// ── Reads work ────────────────────────────────────────────────────────────
const snapshot = async () => ({
  users: (await call('GET', '/admin/people/users?pageSize=1', { token: CEO })).json?.total,
  orders: (await call('GET', '/admin/orders?pageSize=1', { token: CEO })).json?.total,
  payments: (await call('GET', '/admin/payments?pageSize=1', { token: CEO })).json?.total,
  expenses: (await call('GET', '/admin/expenses', { token: CEO })).json?.length,
  audit: (await call('GET', '/admin/audit?pageSize=1', { token: CEO })).json?.total,
  notifications: (await call('GET', '/notifications?pageSize=1', { token: CEO })).json?.total,
  artworks: (await call('GET', '/artworks?pageSize=1')).json?.total,
  mailCaptured: (await call('GET', '/admin/mail', { token: CEO })).json?.captured,
  mailLastSent: (await call('GET', '/admin/mail', { token: CEO })).json?.lastSentAt ?? 'none',
});
const before = await snapshot();
check('Console lists read normally', Object.entries(before).every(([key, value]) => key === 'mailLastSent' || typeof value === 'number'), JSON.stringify(before));

const users = (await call('GET', '/admin/people/users?pageSize=50', { token: CEO })).json?.items ?? [];
const someArtist = users.find((user) => user.role === 'artist' && user.status === 'verified');
const someOrder = (await call('GET', '/admin/orders?pageSize=1', { token: CEO })).json?.items?.[0];
const somePayment = (await call('GET', '/admin/payments?pageSize=1', { token: CEO })).json?.items?.[0];
const someExpense = (await call('GET', '/admin/expenses', { token: CEO })).json?.[0] ?? { id: '00000000-0000-0000-0000-000000000000' };
const someArtwork = (await call('GET', '/artworks?pageSize=1')).json?.items?.[0];

// ── Every kind of write is refused ────────────────────────────────────────
const WRITES = [
  ['POST', '/auth/sign-up', null, { fullName: 'Read Only', email: 'ro-test@example.com', password: 'Password123!', phone: '9999999999' }],
  ['POST', '/auth/register/artist', null, { fullName: 'Read Only', email: 'ro-artist@example.com', password: 'Password123!' }],
  ['POST', '/auth/forgot-password', null, { email: 'ceo@artinu.in' }],
  ['POST', '/auth/sign-in/phone', null, { phone: '9875239877' }],
  ['POST', '/auth/change-password', CEO, { currentPassword: 'ARTINU@CEO2026', newPassword: 'Another123!' }],
  ['POST', `/admin/people/users/${someArtist?.id}/suspend`, CEO, { reason: 'read-only test' }],
  ['POST', `/admin/people/users/${someArtist?.id}/role`, CEO, { role: 'manager', reason: 'read-only test' }],
  ['POST', `/admin/people/users/${someArtist?.id}/password`, CEO, { mode: 'email' }],
  ['POST', `/admin/people/users/${someArtist?.id}/password`, CEO, { mode: 'link' }],
  ['POST', `/admin/people/users/${someArtist?.id}/revoke-sessions`, CEO, {}],
  ['PATCH', `/admin/people/users/${someArtist?.id}/profile`, CEO, { fullName: 'Changed' }],
  ['POST', '/admin/people/support-sessions', CEO, { userId: someArtist?.id, reason: 'read-only test reason' }],
  ['POST', '/admin/people/invitations', CEO, { email: 'new.photographer@example.com', fullName: 'New Photographer', role: 'artist' }],
  ['POST', '/admin/users', CEO, { email: 'new.staff@example.com', role: 'operations' }],
  ['DELETE', `/admin/users/${someArtist?.id}`, CEO, undefined],
  ['POST', '/ops/employees', CEO, { fullName: 'New Person', jobTitle: 'Installer', role: 'operations' }],
  ['POST', '/admin/orders/console', CEO, { clientMode: 'new', items: [] }],
  ['POST', `/admin/orders/${someOrder?.id}/status`, CEO, { status: 'cancelled' }],
  ['POST', `/admin/orders/${someOrder?.id}/payments`, CEO, { amount: 100, method: 'cash', idempotencyKey: 'ro-test-1' }],
  ['POST', `/admin/payments/${somePayment?.id}/verify`, CEO, {}],
  ['POST', `/admin/payments/${somePayment?.id}/refund`, CEO, { amount: 1, reason: 'read-only test' }],
  ['POST', '/admin/expenses', CEO, { title: 'Read-only test', categoryId: 'x', amount: 100, expenseDate: '2026-10-28' }],
  ['POST', `/admin/expenses/${someExpense?.id}/decision`, ACCOUNTS, { decision: 'approve' }],
  ['POST', `/admin/expenses/${someExpense?.id}/payments`, ACCOUNTS, { amount: 1, method: 'cash' }],
  ['PUT', '/admin/finance/settings', CEO, {}],
  ['POST', '/announcements', CEO, { audience: 'artist', title: 'Test', body: 'Read-only test' }],
  ['POST', '/notifications/read-all', CEO, {}],
  ['POST', '/content-manager/hero-slides', CEO, { title: 'x' }],
  ['PUT', '/ops/featured-artists', CEO, { entries: [] }],
  ['POST', '/artworks', ARTIST, { title: 'x' }],
  ['POST', `/artworks/${someArtwork?.id}/like`, OWNER, {}],
  ['POST', '/payments/webhook', null, { event: 'payment.captured' }],
  ['POST', '/cart/checkout', OWNER, {}],
  ['POST', '/applications', null, { fullName: 'Read Only', email: 'ro-apply@example.com', location: 'Bengaluru', journey: 'x'.repeat(50), genres: ['street'], portfolioUrls: [], acceptTerms: true }],
  ['POST', '/admin/applications/00000000-0000-0000-0000-000000000000/setup', CEO, {}],
];
for (const [method, path, token, body] of WRITES) {
  const response = await call(method, path, { token: token ?? undefined, body });
  check(
    `Refused: ${method} ${path.replace(/[0-9a-f-]{36}/g, ':id')}`,
    response.status === 403 && response.json?.code === 'read_only_mode',
    `${response.status} ${response.json?.code ?? ''} ${(response.json?.message ?? '').slice(0, 70)}`,
  );
}

// ── A GET with a side effect cannot write ─────────────────────────────────
if (someArtwork) {
  const viewsBefore = (await call('GET', `/artworks/${someArtwork.id}`)).json;
  const viewsAfter = (await call('GET', `/artworks/${someArtwork.id}`)).json;
  const views = (record) => record?.views ?? record?.artwork?.views;
  check('Opening a photograph still works and does not add a view', viewsAfter && views(viewsBefore) === views(viewsAfter), `${views(viewsBefore)} -> ${views(viewsAfter)}`);
}
const exported = await call('GET', '/admin/finance/exports/expense-register?format=csv', { token: ACCOUNTS });
check(
  'An export that must write an audit entry is refused, not done unaudited',
  exported.status === 403 && exported.json?.code === 'read_only_mode',
  `${exported.status} ${exported.json?.code ?? exported.text.slice(0, 40)}`,
);

// ── Nothing changed, nothing was sent ─────────────────────────────────────
const after = await snapshot();
check('Record counts unchanged after every refused write', JSON.stringify(before) === JSON.stringify(after), `${JSON.stringify(before)} vs ${JSON.stringify(after)}`);
const artistNow = (await call('GET', `/admin/people/users/${someArtist?.id}`, { token: CEO })).json;
check('The targeted photographer is untouched', artistNow?.user?.status === 'verified' && artistNow?.user?.role === 'artist' && !artistNow?.user?.sessionsRevokedAt);

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
