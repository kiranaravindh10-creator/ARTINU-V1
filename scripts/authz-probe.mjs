/**
 * ARTINU authorization probe — every role against every privileged endpoint.
 * Read-only except where noted. Run against the throwaway memory server.
 */
const API = process.env.PROBE_API ?? 'http://localhost:4000/api';

async function call(method, path, { token, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, raw: JSON.stringify(data ?? '') };
}
const signIn = (e, p) => call('POST', '/auth/sign-in', { body: { email: e, password: p } });

const ROLES = [
  ['ceo', 'ceo@artinu.in', 'ARTINU@CEO2026'],
  ['manager', 'manager@artinu.in', 'ARTINU@Mgr2026'],
  ['accounts', 'accounts@artinu.in', 'ARTINU@Acc2026'],
  ['operations', 'fieldops@artinu.in', 'ARTINU@Ops2026'],
  ['it_team', 'it@artinu.in', 'ARTINU@IT2026'],
  ['social', 'socialmedia@artinu.in', 'ARTINU@Social2026'],
];
const tok = {};
for (const [r, e, p] of ROLES) tok[r] = (await signIn(e, p)).data?.accessToken ?? (await signIn(e, p)).accessToken;
for (const [r, e, p] of ROLES) { const s = await fetch(API + '/auth/sign-in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: p }) }); const j = await s.json(); tok[r] = j.accessToken; }

const ceoUsers = await fetch(API + '/admin/users?role=artist&pageSize=5', { headers: { Authorization: 'Bearer ' + tok.ceo } }).then(r => r.json());
const artistEmail = ceoUsers.items?.[0]?.email;
const artistTok = (await (await fetch(API + '/auth/sign-in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: artistEmail, password: 'Artist123' }) })).json()).accessToken;
const ownerA = (await (await fetch(API + '/auth/sign-in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: '1853552.vibhukrishnas@gmail.com', password: 'ARTINU@Space2026' }) })).json()).accessToken;
const ownerB = (await (await fetch(API + '/auth/sign-in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'aditi@fattybao.in', password: 'SpaceOwner1' }) })).json()).accessToken;

const ENDPOINTS = [
  ['GET', '/admin/users', 'People & access (email, phone, DOB)'],
  ['GET', '/admin/system', 'System settings'],
  ['GET', '/admin/overview', 'Admin dashboard'],
  ['GET', '/admin/payments', 'Payment ledger'],
  ['GET', '/admin/orders', 'Orders'],
  ['GET', '/admin/artists', 'Artist curation'],
  ['GET', '/admin/applications', 'Artist applications'],
  ['GET', '/admin/audit', 'Audit trail'],
  ['GET', '/campaigns', 'Social campaigns'],
  ['GET', '/campaigns/promotable/spaces', 'Promotion pipeline'],
  ['GET', '/announcements/audiences', 'Broadcast'],
  ['GET', '/content-manager/hero-slides', 'Homepage editor'],
];

const actors = [...ROLES.map(([r]) => r), 'artist', 'customer', 'anonymous'];
const tokenFor = (a) => a === 'artist' ? artistTok : a === 'customer' ? ownerA : a === 'anonymous' ? undefined : tok[a];

console.log('\n═══ AUTHORIZATION MATRIX (200 = allowed, 401/403 = blocked) ═══\n');
const W = 34;
console.log('endpoint'.padEnd(W) + actors.map((a) => a.slice(0, 9).padStart(10)).join(''));
console.log('─'.repeat(W + actors.length * 10));
const findings = [];
for (const [m, p, label] of ENDPOINTS) {
  const row = [];
  for (const a of actors) {
    const r = await call(m, p, { token: tokenFor(a) });
    row.push(String(r.status).padStart(10));
    if (r.status === 200 && ['artist', 'customer', 'anonymous'].includes(a)) {
      findings.push(`${a} can reach ${p} (${label})`);
    }
  }
  console.log(label.slice(0, W - 1).padEnd(W) + row.join(''));
}

console.log('\n═══ IDOR — can one customer read another\'s money? ═══\n');
const ordersA = await (await fetch(API + '/orders?pageSize=5', { headers: { Authorization: 'Bearer ' + ownerA } })).json();
const orderA = ordersA.items?.[0];
if (orderA) {
  const asB = await call('GET', `/orders/${orderA.id}`, { token: ownerB });
  console.log(`  customer B reading customer A's order      : ${asB.status} ${asB.status >= 400 ? 'BLOCKED' : '*** LEAK ***'}`);
  const anon = await call('GET', `/orders/${orderA.id}`);
  console.log(`  anonymous reading that order              : ${anon.status} ${anon.status >= 400 ? 'BLOCKED' : '*** LEAK ***'}`);
  if (orderA.invoiceId) {
    const invB = await call('GET', `/invoices/${orderA.invoiceId}`, { token: ownerB });
    console.log(`  customer B reading A's invoice            : ${invB.status} ${invB.status >= 400 ? 'BLOCKED' : '*** LEAK ***'}`);
  }
  const payA = await (await fetch(API + `/orders/${orderA.id}`, { headers: { Authorization: 'Bearer ' + ownerA } })).json();
  console.log(`  customer A reading their own order        : ${payA?.id ? '200 OK (correct)' : 'failed'}`);
}

console.log('\n═══ PUBLIC SURFACE — private fields in anonymous responses ═══\n');
for (const [p, label] of [
  ['/artworks?pageSize=20', 'gallery'],
  ['/users/artists?page=1&pageSize=20', 'artists'],
  ['/homepage', 'homepage'],
  ['/campaigns/active', 'promo popup'],
]) {
  const r = await call('GET', p);
  const leaks = ['"phone"', '"dateOfBirth"', '"passwordHash"', '"email"', '"contactPhone"', '"contactEmail"']
    .filter((f) => r.raw.includes(f));
  console.log(`  ${label.padEnd(12)} ${String(r.status).padEnd(5)} ${leaks.length ? '*** ' + leaks.join(' ') + ' ***' : 'no private fields'}`);
}

console.log('\n═══ AUTH HARDENING ═══\n');
let blocked = 0;
for (let i = 0; i < 25; i += 1) {
  const r = await call('POST', '/auth/sign-in', { body: { email: 'ceo@artinu.in', password: 'wrong' + i } });
  if (r.status === 429) blocked += 1;
}
console.log(`  25 bad passwords -> ${blocked} rate-limited (429)  ${blocked > 0 ? 'throttled' : 'NOT throttled in dev (limiter skips development)'}`);
const noTok = await call('GET', '/admin/users');
console.log(`  no token on an admin route -> ${noTok.status}`);
const badTok = await call('GET', '/admin/users', { token: 'not-a-real-jwt' });
console.log(`  forged token on an admin route -> ${badTok.status}`);

console.log('\n═══ SUMMARY ═══');
console.log(findings.length ? findings.map((f) => '  *** ' + f).join('\n') : '  No unauthorized access found on the probed endpoints.');
