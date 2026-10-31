/**
 * ARTINU Console business-system checks: People & access, expenses and
 * accounting, client orders with custom pricing - and the seams between them.
 *
 *   cd server && DATA_DRIVER=memory MEMORY_PERSIST=false SEED_DEMO_DATA=true \
 *     STORAGE_DRIVER=local PORT=4200 npx tsx src/index.ts
 *   node scripts/console-check.mjs 4200
 *
 * Point it at a THROWAWAY instance with the demo seed: it signs in as the
 * seeded staff, creates clients, orders, payments and expenses, suspends and
 * restores an account and changes an email address. Against DATA_DRIVER=memory
 * with MEMORY_PERSIST=false none of it survives the process. It refuses to run
 * against anything that reports a Supabase data driver.
 *
 * Exits non-zero if any check fails.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

const BASE = `http://localhost:${process.argv[2] ?? 4200}/api`;
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function call(path, { method = 'GET', token, body, raw = false } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return { status: res.status, headers: res.headers, buffer: Buffer.from(await res.arrayBuffer()) };
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed, text };
}

// ── Safety: demo data only ───────────────────────────────────────────────────

const health = await call('/health');
if (health.body?.drivers?.data !== 'memory') {
  console.error(`Refusing to run: the API reports data driver "${health.body?.drivers?.data}". Use an in-memory instance.`);
  process.exit(2);
}

// The seeded demo logins, read from the seed rather than repeated here.
const seed = readFileSync(new URL('../server/src/database/seed.ts', import.meta.url), 'utf8');
const staff = Object.fromEntries(
  [...seed.matchAll(/\{ email: '([^']+)', plain: '([^']+)', role: '([a-z_]+)'/g)].map(([, email, plain, role]) => [
    role,
    { email, plain },
  ]),
);
const ownerMatch = /email: '([^']+)',\s*plain: 'SpaceOwner1'/.exec(seed);
const photographer = { email: 'photographer.demo@artinu.in', plain: /'photographer\.demo@artinu\.in': '([^']+)'/.exec(seed)?.[1] };

async function signIn(email, password) {
  const res = await call('/auth/sign-in', { method: 'POST', body: { email, password } });
  if (res.status !== 200) throw new Error(`sign-in failed for ${email}: ${res.status} ${res.text}`);
  return res.body;
}

const ceo = (await signIn(staff.ceo.email, staff.ceo.plain)).accessToken;
const it = (await signIn(staff.it_team.email, staff.it_team.plain)).accessToken;
const manager = (await signIn(staff.manager.email, staff.manager.plain)).accessToken;
let accounts = (await signIn(staff.accounts.email, staff.accounts.plain)).accessToken;
const ops = (await signIn(staff.operations.email, staff.operations.plain)).accessToken;
// Account ids, for the approval routing checks.
const who = {};
for (const role of ['ceo', 'manager', 'accounts', 'operations', 'it_team']) {
  who[role] = (await signIn(staff[role].email, staff[role].plain)).user.id;
}
const ownerSession = await signIn(ownerMatch[1], 'SpaceOwner1');
let owner = ownerSession.accessToken;
const ownerId = ownerSession.user.id;
const artist = (await signIn(photographer.email, photographer.plain)).accessToken;
const key = () => randomUUID();

console.log('\n── People & access ─────────────────────────────────────────');

const list = await call('/admin/people/users?pageSize=100', { token: it });
check('IT administrator can list users', list.status === 200 && list.body.items?.length > 0, `${list.body.items?.length} users`);
check('No password hash in the user list', !/passwordHash|\$2[aby]\$/.test(list.text));

const byEmail = await call(`/admin/people/users?q=${encodeURIComponent(ownerMatch[1])}`, { token: it });
check('Find a user by email', byEmail.body.items?.some((user) => user.id === ownerId));
const firstBusiness = list.body.items.find((user) => user.businesses?.length)?.businesses?.[0];
const byBusiness = await call(`/admin/people/users?q=${encodeURIComponent(firstBusiness ?? 'zz')}`, { token: it });
check('Find a user by their business', byBusiness.body.items?.length > 0, firstBusiness);
const byId = await call(`/admin/people/users?q=${ownerId}`, { token: it });
check('Find a user by id', byId.body.items?.length === 1);
const customersOnly = await call('/admin/people/users?type=customer&pageSize=100', { token: it });
check('Filter by account type', customersOnly.body.items?.every((user) => user.role === 'space_owner'));

check('Operations cannot open user administration', (await call('/admin/people/users', { token: ops })).status === 403);
check('Manager cannot open user administration', (await call('/admin/people/users', { token: manager })).status === 403);

const detail = await call(`/admin/people/users/${ownerId}`, { token: it });
check('User detail shows orders and spaces', detail.status === 200 && Array.isArray(detail.body.orders) && detail.body.spaces?.length > 0);
check('No password hash in user detail', !/passwordHash|\$2[aby]\$/.test(detail.text));

// Support sessions
const noReason = await call('/admin/people/support-sessions', { method: 'POST', token: it, body: { userId: ownerId, reason: 'x' } });
check('Support session needs a reason', noReason.status === 422, `HTTP ${noReason.status}`);
const managerId = list.body.items.find((user) => user.role === 'manager')?.id;
const assistStaff = await call('/admin/people/support-sessions', { method: 'POST', token: it, body: { userId: managerId, reason: 'Checking their console view' } });
check('Support sessions refused for staff accounts', assistStaff.status === 403, `HTTP ${assistStaff.status}`);
const assistByOps = await call('/admin/people/support-sessions', { method: 'POST', token: ops, body: { userId: ownerId, reason: 'Customer cannot see orders' } });
check('Unauthorised staff cannot start a support session', assistByOps.status === 403);

const grant = await call('/admin/people/support-sessions', {
  method: 'POST',
  token: it,
  body: { userId: ownerId, reason: 'Customer reports their order list is empty' },
});
check('Authorised administrator starts a support session', grant.status === 201 && Boolean(grant.body.token), `HTTP ${grant.status}`);
const support = grant.body.token;

const supportSession = await call('/auth/session', { token: support });
check(
  'Support session cannot be turned into a normal session',
  supportSession.status === 200 && supportSession.body.accessToken === support && supportSession.body.supportSession?.id === grant.body.session.id,
);
check('Support session sees as the customer', supportSession.body.user?.id === ownerId);
check('Reads allowed in a support session', (await call('/spaces', { token: support })).status === 200);
const blockedWrite = await call('/notifications/read-all', { method: 'POST', token: support });
check('Writes refused in a support session', blockedWrite.status === 403 && blockedWrite.body.code === 'support_session_read_only', `HTTP ${blockedWrite.status}`);
const blockedPassword = await call('/auth/change-password', { method: 'POST', token: support, body: { currentPassword: 'x', newPassword: 'Whatever123!' } });
check('Password change refused in a support session', blockedPassword.status === 403);
check('Staff area refused in a support session', (await call('/admin/orders', { token: support })).status === 403);

const audit1 = await call('/admin/audit?pageSize=100', { token: ceo });
const started = audit1.body.items?.find((entry) => entry.action === 'support_session.started' && entry.entityId === ownerId);
const blocked = audit1.body.items?.find((entry) => entry.action === 'support_session.blocked');
check('Support session start is audited with the reason', started?.meta?.reason?.includes('order list'));
check('Actions in a support session are audited under it', blocked?.meta?.supportSessionId === grant.body.session.id && blocked?.actorEmail === staff.it_team.email);

const ended = await call('/support-session/end', { method: 'POST', token: support });
check('Support session can be ended', ended.status === 200 && Boolean(ended.body.endedAt));
check('Ended support session no longer works', (await call('/auth/session', { token: support })).status === 401);
const history = await call(`/admin/people/support-sessions?userId=${ownerId}`, { token: it });
check('Support-session history is kept', history.body.some((session) => session.id === grant.body.session.id && session.endReason === 'exited'));

// Roles
const toCeo = await call(`/admin/people/users/${ownerId}/role`, { method: 'POST', token: it, body: { role: 'ceo' } });
check('IT cannot grant the CEO role', toCeo.status === 403);
const itId = list.body.items.find((user) => user.role === 'it_team')?.id;
check('Nobody changes their own role', (await call(`/admin/people/users/${itId}/role`, { method: 'POST', token: it, body: { role: 'ceo' } })).status === 403);
check('Role change needs the permission', (await call(`/admin/people/users/${ownerId}/role`, { method: 'POST', token: manager, body: { role: 'artist' } })).status === 403);

const tempEmail = `console.check.${Date.now()}@example.com`;
const created = await call('/admin/users', { method: 'POST', token: it, body: { email: tempEmail, role: 'space_owner', fullName: 'Console Check' } });
const roleChange = await call(`/admin/people/users/${created.body.id}/role`, { method: 'POST', token: it, body: { role: 'artist', reason: 'Registered as the wrong type' } });
check('Permitted role change works', roleChange.status === 200 && roleChange.body.role === 'artist');

// Suspension
const suspend = await call(`/admin/people/users/${ownerId}/suspend`, { method: 'POST', token: it, body: { reason: 'Console check suspension' } });
check('Account suspension works', suspend.status === 200 && suspend.body.status === 'suspended');
check('Suspended account is refused at once', (await call('/auth/session', { token: owner })).status === 401);
const reactivate = await call(`/admin/people/users/${ownerId}/reactivate`, { method: 'POST', token: it, body: { reason: 'Console check restore' } });
check('Account reactivation works', reactivate.status === 200 && reactivate.body.status === 'verified');

// Passwords
const resetEmail = await call(`/admin/people/users/${ownerId}/password`, { method: 'POST', token: it, body: { mode: 'email' } });
check('Password reset email can be sent', resetEmail.status === 200 && 'delivered' in resetEmail.body);
const resetLink = await call(`/admin/people/users/${ownerId}/password`, { method: 'POST', token: it, body: { mode: 'link' } });
check('Single-use reset link can be issued', resetLink.status === 200 && /reset-password\?token=/.test(resetLink.body.link));
check('No password in any reset response', !/password"\s*:|passwordHash|\$2[aby]\$/.test(resetEmail.text + resetLink.text));
check('Reset needs the permission', (await call(`/admin/people/users/${ownerId}/password`, { method: 'POST', token: manager, body: { mode: 'email' } })).status === 403);

// Sessions
const revoke = await call(`/admin/people/users/${ownerId}/revoke-sessions`, { method: 'POST', token: it });
check('Sessions can be revoked', revoke.status === 200);
check('A revoked session is refused', (await call('/auth/session', { token: owner })).status === 401);
await new Promise((resolve) => setTimeout(resolve, 1100));
owner = (await signIn(ownerMatch[1], 'SpaceOwner1')).accessToken;
check('Signing in again after revocation works', (await call('/auth/session', { token: owner })).status === 200);

// Email correction, through verification
const newAddress = `corrected.${Date.now()}@example.com`;
const emailChange = await call(`/admin/people/users/${created.body.id}/email`, { method: 'POST', token: it, body: { newEmail: newAddress, reason: 'Typo at registration' } });
check('Email correction starts verification', emailChange.status === 200 && emailChange.body.pendingEmail === newAddress);
const unchanged = await call(`/admin/people/users/${created.body.id}`, { token: it });
check('Address does not change until confirmed', unchanged.body.user.email === tempEmail);
const mailbox = await call(`/admin/mail?to=${encodeURIComponent(newAddress)}`, { token: it });
const message = mailbox.body.items?.[0];
const mail = message ? await call(`/admin/mail/${message.id}`, { token: it }) : null;
const confirmToken = /confirm-email-change\?token=([A-Za-z0-9_\-%]+)/.exec(mail?.body?.html ?? mail?.text ?? '')?.[1];
const confirmed = await call('/auth/confirm-email-change', { method: 'POST', body: { token: decodeURIComponent(confirmToken ?? '') } });
check('Confirming from the new inbox changes the address', confirmed.status === 200 && confirmed.body.email === newAddress, `HTTP ${confirmed.status}`);

const audit2 = await call('/admin/audit?pageSize=200', { token: ceo });
const actions = new Set(audit2.body.items?.map((entry) => entry.action));
for (const action of ['user.role_changed', 'user.suspended', 'user.restored', 'user.password_reset_sent', 'user.password_reset_link_issued', 'user.sessions_revoked', 'user.email_changed', 'support_session.ended']) {
  check(`Audited: ${action}`, actions.has(action));
}
check('Audit entries cannot be edited or deleted through the API', (await call('/admin/audit/x', { method: 'DELETE', token: ceo })).status === 404);

console.log('\n── Clients and orders ──────────────────────────────────────');

const gallery = await call('/artworks?pageSize=40');
const photos = gallery.body.items.map((artwork) => artwork.id);
const spaces = await call('/admin/spaces?pageSize=100', { token: ceo });
const space = spaces.body.items.find((entry) => entry.type !== 'home_decor' && entry.ownerId);

// Standard pricing: 3 A4 frames on the business tariff = 3 × ₹239.
const stdBody = {
  client: { kind: 'space', spaceId: space.id },
  pricingMode: 'standard',
  lines: [{ kind: 'frames', size: 'a4', color: 'brown', artworkIds: photos.slice(0, 3) }],
};
const stdQuote = await call('/admin/orders/quote', { method: 'POST', token: manager, body: stdBody });
check('Standard pricing follows the tariff', stdQuote.status === 200 && stdQuote.body.total === 717, `₹${stdQuote.body.total}`);
const stdOrder = await call('/admin/orders/console', {
  method: 'POST',
  token: manager,
  body: { ...stdBody, payment: { terms: 'collect_later' }, idempotencyKey: key() },
});
check('Existing client order created at the standard price', stdOrder.status === 201 && stdOrder.body.order.pricing.total === 717);
check('Order awaiting payment stays unpaid', stdOrder.body.order.status === 'pending_payment' && stdOrder.body.money.state === 'unpaid' && !stdOrder.body.order.invoiceId);
check('Existing client orders belong to the space owner', stdOrder.body.order.ownerId === space.ownerId);

// The brief's example: a new café, 6 A4 at ₹229, installation ₹300, delivery ₹100, discount ₹50.
const cafePhone = `+91 98${String(Date.now()).slice(-8)}`;
const abcBody = {
  client: {
    kind: 'new',
    client: { name: `ABC Cafe ${Date.now()}`, type: 'cafe', contactName: 'Asha', phone: cafePhone, email: '', addressLine1: '12 Church Street', city: 'Bengaluru' },
  },
  pricingMode: 'custom',
  lines: [
    { kind: 'frames', size: 'a4', color: 'brown', artworkIds: photos.slice(3, 9), unitPrice: 229 },
    { kind: 'installation', quantity: 1, unitPrice: 300 },
    { kind: 'delivery', quantity: 1, unitPrice: 100 },
  ],
  discount: 50,
  priceReason: 'Launch pricing agreed with the owner',
  commercialTerms: 'Monthly rotation, six frames',
};
const abcQuote = await call('/admin/orders/quote', { method: 'POST', token: manager, body: abcBody });
check('Custom quote: 6 × ₹229 + ₹300 + ₹100 − ₹50 = ₹1,724', abcQuote.body.total === 1724, `₹${abcQuote.body.total}`);
check('Standard price shown for reference', abcQuote.body.quote?.lines?.[0]?.standardUnitPrice === 211, `₹${abcQuote.body.quote?.lines?.[0]?.standardUnitPrice}`);

const clientsBefore = (await call('/admin/clients?q=', { token: manager })).body.length;
const abcKey = key();
const abc = await call('/admin/orders/console', {
  method: 'POST',
  token: manager,
  body: { ...abcBody, total: 1, payment: { terms: 'collect_later' }, idempotencyKey: abcKey },
});
check('Order for an unregistered client, no login needed', abc.status === 201 && abc.body.order.ownerId === null && Boolean(abc.body.order.clientId), `HTTP ${abc.status} ${abc.text?.slice(0, 140)}`);
check('The server recalculates the total (a sent total is ignored)', abc.body.order?.pricing?.total === 1724);
check('Line items are kept on the order', abc.body.order?.pricing?.lines?.length === 3 && abc.body.order.items.length === 6);
check('Discount and charges kept separately', abc.body.order?.pricing?.discount === 50 && abc.body.order.pricing.installation === 300 && abc.body.order.pricing.delivery === 100);
const replay = await call('/admin/orders/console', { method: 'POST', token: manager, body: { ...abcBody, payment: { terms: 'collect_later' }, idempotencyKey: abcKey } });
check('Retrying the same request does not create a second order', replay.status === 200 && replay.body.order.id === abc.body.order.id);
const clientsAfter = (await call('/admin/clients?q=', { token: manager })).body.length;
check('Exactly one client record was created', clientsAfter === clientsBefore + 1, `${clientsBefore} → ${clientsAfter}`);

const dupe = await call('/admin/orders/console', {
  method: 'POST',
  token: manager,
  body: { ...abcBody, client: { kind: 'new', client: { ...abcBody.client.client, name: 'ABC Cafe again' } }, payment: { terms: 'collect_later' }, idempotencyKey: key() },
});
check('A duplicate client is refused', dupe.status === 409, `HTTP ${dupe.status}`);

const existingClient = await call('/admin/orders/console', {
  method: 'POST',
  token: manager,
  body: {
    client: { kind: 'client', clientId: abc.body.order.clientId },
    pricingMode: 'custom',
    lines: [{ kind: 'other', description: 'Frame repair visit', quantity: 1, unitPrice: 250 }],
    priceReason: 'Service visit',
    payment: { terms: 'collect_later' },
    idempotencyKey: key(),
  },
});
check('Existing client reused, service-only order without photographs', existingClient.status === 201 && existingClient.body.order.clientId === abc.body.order.clientId && existingClient.body.order.items.length === 0);
check('No extra client created for an existing one', (await call('/admin/clients?q=', { token: manager })).body.length === clientsAfter);

const opsCustom = await call('/admin/orders/console', { method: 'POST', token: ops, body: { ...stdBody, pricingMode: 'custom', lines: [{ ...stdBody.lines[0], unitPrice: 1 }], priceReason: 'x', payment: { terms: 'collect_later' }, idempotencyKey: key() } });
check('Unauthorised custom price refused', opsCustom.status === 403, `HTTP ${opsCustom.status}`);
const negative = await call('/admin/orders/quote', { method: 'POST', token: manager, body: { ...abcBody, lines: [{ ...abcBody.lines[0], unitPrice: -5 }] } });
check('Negative price refused', negative.status === 422);
const noReasonOrder = await call('/admin/orders/console', { method: 'POST', token: manager, body: { ...abcBody, client: { kind: 'client', clientId: abc.body.order.clientId }, priceReason: '', payment: { terms: 'collect_later' }, idempotencyKey: key() } });
check('A custom price needs a reason', noReasonOrder.status === 400);

// Approval above the threshold (default 15% below standard).
const cheapBody = {
  client: { kind: 'space', spaceId: space.id },
  pricingMode: 'custom',
  lines: [{ kind: 'frames', size: 'a4', color: 'white', artworkIds: photos.slice(9, 12), unitPrice: 100 }],
  priceReason: 'Trial for a friend of the founder',
};
const cheapPaid = await call('/admin/orders/console', { method: 'POST', token: manager, body: { ...cheapBody, payment: { terms: 'paid_offline', amount: 300, receivedOn: '2026-10-26', method: 'upi' }, idempotencyKey: key() } });
check('Payment cannot be taken on an unapproved price', cheapPaid.status === 400);
const cheap = await call('/admin/orders/console', { method: 'POST', token: manager, body: { ...cheapBody, payment: { terms: 'collect_later' }, idempotencyKey: key() } });
check('A large discount waits for approval', cheap.body.order?.pricing?.approval?.status === 'pending', `${cheap.body.order?.pricing?.approval?.reductionPercent}% below`);
check('Price approvers are told a price is waiting', (await call('/notifications?pageSize=60', { token: accounts })).body.items.some((entry) => entry.title === `Price for ${cheap.body.order.reference} needs approval` && entry.link === `/console/orders/${cheap.body.order.id}`));
check('Whoever set the price is not asked to approve it', !(await call('/notifications?pageSize=60', { token: manager })).body.items.some((entry) => entry.title === `Price for ${cheap.body.order.reference} needs approval`));
const waitingPrices = await call('/admin/orders/price-approvals', { token: accounts });
check('Prices awaiting approval are listed for approvers', waitingPrices.status === 200 && waitingPrices.body.some((row) => row.id === cheap.body.order.id && row.mayDecide && row.reductionPercent > row.thresholdPercent));
check('...and not for roles that cannot approve prices', (await call('/admin/orders/price-approvals', { token: manager })).status === 403);
check('No offline payment while approval is pending', (await call(`/admin/orders/${cheap.body.order.id}/payments`, { method: 'POST', token: accounts, body: { amount: 100, receivedOn: '2026-10-26', method: 'cash', idempotencyKey: key() } })).status === 400);
check('Approval needs the permission', (await call(`/admin/orders/${cheap.body.order.id}/price-approval`, { method: 'POST', token: manager, body: { decision: 'approve' } })).status === 403);
const approved = await call(`/admin/orders/${cheap.body.order.id}/price-approval`, { method: 'POST', token: accounts, body: { decision: 'approve', note: 'One-off' } });
check('Finance approves the price', approved.status === 200 && approved.body.order.pricing.approval.status === 'approved');
const ceoCheap = await call('/admin/orders/console', { method: 'POST', token: ceo, body: { ...cheapBody, lines: [{ ...cheapBody.lines[0], artworkIds: photos.slice(12, 15) }], payment: { terms: 'collect_later' }, idempotencyKey: key() } });
check('A creator who holds approval is approved at once', ceoCheap.body.order?.pricing?.approval?.status === 'approved');

// Offline payments: part, then the rest.
const abcId = abc.body.order.id;
const partKey = key();
const part = await call(`/admin/orders/${abcId}/payments`, { method: 'POST', token: accounts, body: { amount: 724, receivedOn: '2026-10-26', method: 'upi', reference: 'UPI-123', idempotencyKey: partKey } });
check('Part payment recorded', part.status === 201 && part.body.money.outstanding === 1000 && part.body.money.state === 'partially_paid');
check('Part payment does not confirm the order', part.body.order.status === 'pending_payment');
const partAgain = await call(`/admin/orders/${abcId}/payments`, { method: 'POST', token: accounts, body: { amount: 724, receivedOn: '2026-10-26', method: 'upi', idempotencyKey: partKey } });
check('A retried payment is not recorded twice', partAgain.status === 200 && partAgain.body.money.outstanding === 1000);
check('Overpayment refused', (await call(`/admin/orders/${abcId}/payments`, { method: 'POST', token: accounts, body: { amount: 1000.01, receivedOn: '2026-10-26', method: 'cash', idempotencyKey: key() } })).status === 400);
const rest = await call(`/admin/orders/${abcId}/payments`, { method: 'POST', token: ops, body: { amount: 1000, receivedOn: '2026-10-26', method: 'cash', idempotencyKey: key() } });
check('Final payment confirms the order', rest.status === 201 && rest.body.order.status === 'confirmed' && rest.body.money.state === 'paid');
check('Invoice issued on full payment', Boolean(rest.body.order.invoiceId));
const printing = await call('/admin/printing', { token: ops });
check('Confirmed client order enters the print queue', printing.body.some((order) => order.id === abcId));
check('It moves through the existing workflow', (await call(`/admin/orders/${abcId}/status`, { method: 'PATCH', token: ops, body: { status: 'printing' } })).status === 200);

// Credit
check('Only finance or the CEO extend credit', (await call('/admin/orders/console', { method: 'POST', token: manager, body: { ...stdBody, lines: [{ ...stdBody.lines[0], artworkIds: photos.slice(15, 18) }], payment: { terms: 'credit' }, idempotencyKey: key() } })).status === 403);
const credit = await call('/admin/orders/console', { method: 'POST', token: ceo, body: { ...stdBody, lines: [{ ...stdBody.lines[0], artworkIds: photos.slice(15, 18) }], payment: { terms: 'credit', note: 'Net 15' }, idempotencyKey: key() } });
check('Credit order confirmed before payment', credit.body.order?.status === 'confirmed' && credit.body.money.outstanding === credit.body.order.pricing.total && Boolean(credit.body.order.invoiceId));

const references = [stdOrder, abc, existingClient, cheap, ceoCheap, credit].map((entry) => entry.body.order.reference);
check('Order references are unique', new Set(references).size === references.length, references.join(' '));

// Historical prices survive a settings change.
const accountsLimit = await call('/admin/finance/settings', { method: 'PUT', token: accounts, body: { autoApproveLimit: 100, requireSeparateApprover: true, priceOverrideApprovalPercent: 5, branches: ['Bengaluru', 'Mysuru'] } });
check('Accounts cannot change the auto-approval limit', accountsLimit.status === 403, `HTTP ${accountsLimit.status}`);
const accountsBranches = await call('/admin/finance/settings', { method: 'PUT', token: accounts, body: { autoApproveLimit: 0, requireSeparateApprover: true, priceOverrideApprovalPercent: 5, branches: ['Bengaluru', 'Mysuru'] } });
check('Accounts still sets branches and the price threshold', accountsBranches.status === 200 && accountsBranches.body.branches.includes('Mysuru') && accountsBranches.body.priceOverrideApprovalPercent === 5);
const ceoLimit = await call('/admin/finance/settings', { method: 'PUT', token: ceo, body: { autoApproveLimit: 100, requireSeparateApprover: true, priceOverrideApprovalPercent: 5, branches: ['Bengaluru', 'Mysuru'] } });
check('The CEO sets the auto-approval limit', ceoLimit.status === 200 && ceoLimit.body.autoApproveLimit === 100);
const reread = await call(`/admin/orders/${stdOrder.body.order.id}/finance`, { token: ceo });
check('Historical orders keep their agreed price', reread.body.money?.total === 717, `₹${reread.body.money?.total}`);

// Customer checkout still works, and asks only for what is owed.
const ownSpace = spaces.body.items.find((entry) => entry.ownerId === ownerId);
const ownOrder = await call('/orders', { method: 'POST', token: owner, body: { spaceId: ownSpace.id, items: photos.slice(18, 21).map((artworkId) => ({ artworkId, quantity: 1, frame: { size: 'a3', material: 'wood', color: 'brown', glass: 'normal', finish: 'matte' } })) } });
check('Existing customer checkout still creates orders', ownOrder.status === 201, `HTTP ${ownOrder.status}`);
await call(`/admin/orders/${ownOrder.body.id}/payments`, { method: 'POST', token: accounts, body: { amount: 100, receivedOn: '2026-10-26', method: 'cash', idempotencyKey: key() } });
const online = await call('/payments', { method: 'POST', token: owner, body: { orderId: ownOrder.body.id } });
check('Online payment asks only for the outstanding balance', online.status === 201 && online.body.amount === ownOrder.body.pricing.total - 100, `₹${online.body.amount} of ₹${ownOrder.body.pricing.total}`);
const legacy = await call('/admin/orders', { method: 'POST', token: manager, body: { spaceId: space.id, items: photos.slice(21, 24).map((artworkId) => ({ artworkId, quantity: 1, frame: { size: 'a4', material: 'wood', color: 'brown', glass: 'normal', finish: 'matte' } })), markPaid: true, paymentMethod: 'cash' } });
check('Existing staff order creation still works', legacy.status === 201 && legacy.body.status === 'confirmed');
check('Artist workflows unaffected', (await call('/artworks/mine', { token: artist })).status === 200);

console.log('\n── Expenses and accounting ─────────────────────────────────');

const categories = await call('/admin/expenses/categories', { token: ops });
const transport = categories.body.find((category) => category.slug === 'transport-fuel');
check('Default expense categories available', categories.status === 200 && Boolean(transport), `${categories.body.length} categories`);

const missing = await call('/admin/expenses', { method: 'POST', token: ops, body: { title: '', amount: 0 } });
check('Required fields are validated', missing.status === 422 && ['title', 'categoryId', 'amount', 'expenseDate', 'paymentArrangement'].every((field) => missing.body.details?.[field]));

const travel = await call('/admin/expenses', {
  method: 'POST',
  token: ops,
  body: { title: 'Installation travel', categoryId: transport.id, amount: 350, expenseDate: '2026-10-26', paymentArrangement: 'employee_reimbursable', orderId: abcId, paymentMethod: 'upi', paidBy: 'Rahul', branch: 'Bengaluru', notes: 'Travel for frame installation', submit: false },
});
check('An expense can be recorded against an order', travel.status === 201 && travel.body.orderReference === abc.body.order.reference && travel.body.status === 'draft');
check('An expense carries its branch', travel.body.branch === 'Bengaluru');
const noPayee = await call('/admin/expenses', { method: 'POST', token: ops, body: { title: 'Taxi', categoryId: transport.id, amount: 90, expenseDate: '2026-10-26', paymentArrangement: 'employee_reimbursable' } });
check('A reimbursement must say who paid', noPayee.status === 422 && Boolean(noPayee.body.details?.paidBy));
check('Recording the arrangement does not mark it paid', travel.body.paymentArrangement === 'employee_reimbursable' && travel.body.status === 'draft' && travel.body.paidAmount === 0);
check('Unknown branch refused', (await call('/admin/expenses', { method: 'POST', token: ops, body: { title: 'Fuel', categoryId: transport.id, amount: 100, expenseDate: '2026-10-26', paymentArrangement: 'unpaid', branch: 'Delhi' } })).status === 400);

const submitted = await call(`/admin/expenses/${travel.body.id}/submit`, { method: 'POST', token: ops });
check('Submitting sends it for approval', submitted.body.status === 'pending_approval');
check('Operations expense is routed to the branch manager', submitted.body.approver?.id === who.manager && submitted.body.approvalRoute === 'sole_manager', `${submitted.body.approver?.name} via ${submitted.body.approvalRoute}`);
check('The approver is told it is waiting', (await call('/notifications?pageSize=60', { token: manager })).body.items.some((entry) => entry.title === `Expense ${submitted.body.number} needs your approval`));
const managerInbox = await call('/admin/expenses/approvals', { token: manager });
check("It is in the manager's approval inbox", managerInbox.status === 200 && managerInbox.body.some((entry) => entry.id === travel.body.id && entry.mayDecide && !entry.decidesAsBackup));
check('It is not in the inbox of someone it is not assigned to', !(await call('/admin/expenses/approvals', { token: accounts })).body.some((entry) => entry.id === travel.body.id));
check('Operations has no approval inbox', (await call('/admin/expenses/approvals', { token: ops })).status === 403);
check('Operations cannot approve', (await call(`/admin/expenses/${travel.body.id}/decision`, { method: 'POST', token: ops, body: { decision: 'approve' } })).status === 403);
check('Someone who can approve, but is not assigned, cannot', (await call(`/admin/expenses/${travel.body.id}/decision`, { method: 'POST', token: accounts, body: { decision: 'approve' } })).status === 403);
const approvedExpense = await call(`/admin/expenses/${travel.body.id}/decision`, { method: 'POST', token: manager, body: { decision: 'approve' } });
check('Manager approves', approvedExpense.body.status === 'approved');
check('The submitter is told it was approved', (await call('/notifications?pageSize=60', { token: ops })).body.items.some((entry) => entry.title === `Expense ${travel.body.number} approved`));
check('Approval does not mark it paid', approvedExpense.body.paidAmount === 0 && approvedExpense.body.outstandingAmount === 350);
check('Manager cannot pay', (await call(`/admin/expenses/${travel.body.id}/payments`, { method: 'POST', token: manager, body: { amount: 350, paidOn: '2026-10-26', method: 'upi', idempotencyKey: key() } })).status === 403);

const payKey = key();
const paid1 = await call(`/admin/expenses/${travel.body.id}/payments`, { method: 'POST', token: accounts, body: { amount: 150, paidOn: '2026-10-26', method: 'upi', idempotencyKey: payKey } });
check('Partial expense payment', paid1.status === 201 && paid1.body.status === 'partially_paid' && paid1.body.outstandingAmount === 200);
const paidReplay = await call(`/admin/expenses/${travel.body.id}/payments`, { method: 'POST', token: accounts, body: { amount: 150, paidOn: '2026-10-26', method: 'upi', idempotencyKey: payKey } });
check('Duplicate expense payment prevented', paidReplay.body.payments?.length === 1 && paidReplay.body.paidAmount === 150);
check('Expense overpayment refused', (await call(`/admin/expenses/${travel.body.id}/payments`, { method: 'POST', token: accounts, body: { amount: 200.5, paidOn: '2026-10-26', method: 'upi', idempotencyKey: key() } })).status === 400);
const paid2 = await call(`/admin/expenses/${travel.body.id}/payments`, { method: 'POST', token: accounts, body: { amount: 200, paidOn: '2026-10-26', method: 'upi', idempotencyKey: key() } });
check('Fully paid', paid2.body.status === 'paid' && paid2.body.paidAmount === 350);
check('Paid expense cannot be edited', (await call(`/admin/expenses/${travel.body.id}`, { method: 'PUT', token: ops, body: { title: 'Changed', categoryId: transport.id, amount: 1, expenseDate: '2026-10-26', paymentArrangement: 'unpaid' } })).status === 400);

// Separation of duties
const own = await call('/admin/expenses', { method: 'POST', token: manager, body: { title: 'Team lunch', categoryId: categories.body.find((c) => c.slug === 'misc').id, amount: 1200, expenseDate: '2026-10-20', paymentArrangement: 'unpaid', submit: true } });
check('Manager expense is routed to a senior approver (the CEO)', own.body.approver?.id === who.ceo && own.body.approvalRoute === 'sole_ceo', `${own.body.approver?.name} via ${own.body.approvalRoute}`);
check('Nobody approves their own expense', (await call(`/admin/expenses/${own.body.id}/decision`, { method: 'POST', token: manager, body: { decision: 'approve' } })).status === 403);
check('A rejection needs a reason', (await call(`/admin/expenses/${own.body.id}/decision`, { method: 'POST', token: ceo, body: { decision: 'reject' } })).status === 400);
const rejected = await call(`/admin/expenses/${own.body.id}/decision`, { method: 'POST', token: ceo, body: { decision: 'reject', note: 'Not a business expense' } });
check('Rejection records the reason', rejected.body.status === 'rejected' && rejected.body.rejectionReason === 'Not a business expense');
check('The submitter is told it was returned', (await call('/notifications?pageSize=60', { token: manager })).body.items.some((entry) => entry.title === `Expense ${own.body.number} returned`));

// Auto-approval under the configured limit (₹100, set above).
const small = await call('/admin/expenses', { method: 'POST', token: ops, body: { title: 'Parking', categoryId: transport.id, amount: 40, expenseDate: '2026-10-25', paymentArrangement: 'company_paid', paymentMethod: 'cash', submit: true } });
check('Small expense auto-approved under the ₹100 limit', small.body.status === 'approved' && /Auto-approved/.test(small.body.approvedByEmail ?? ''));

// Receipts
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const withReceipt = await call(`/admin/expenses/${small.body.id}/receipt`, { method: 'POST', token: ops, body: { dataUrl: png, fileName: 'parking.png' } });
check('Receipt uploaded', withReceipt.status === 200 && withReceipt.body.hasReceipt);
const receipt = await call(`/admin/expenses/${small.body.id}/receipt`, { token: accounts, raw: true });
check('Receipt downloads for finance', receipt.status === 200 && receipt.buffer.length > 50 && receipt.headers.get('cache-control')?.includes('no-store'));
check('Receipt refused without a session', (await call(`/admin/expenses/${small.body.id}/receipt`, { raw: true })).status === 401);
check('Receipt refused for a non-staff account', (await call(`/admin/expenses/${small.body.id}/receipt`, { token: artist, raw: true })).status === 403);
check('Receipt has no public URL', !/uploads\/|https?:\/\//.test(JSON.stringify({ path: withReceipt.body.receiptPath })));

// Reversal keeps the trail
const reversed = await call(`/admin/expenses/${travel.body.id}/reverse`, { method: 'POST', token: accounts, body: { reason: 'Charged to the wrong order' } });
check('A paid expense can be reversed', reversed.body.status === 'cancelled' && reversed.body.payments.every((payment) => payment.reversedAt));
const register = await call('/admin/finance/transactions', { token: accounts });
const travelRows = register.body.filter((entry) => entry.source.expenseId === travel.body.id);
check('Reversal keeps the original payments and adds reversals', travelRows.filter((entry) => entry.type === 'expense_payment').length === 2 && travelRows.filter((entry) => entry.type === 'expense_reversal').length === 2);

// Categories
check('Operations cannot manage categories', (await call('/admin/expenses/categories', { method: 'POST', token: ops, body: { name: 'Snacks' } })).status === 403);
const newCategory = await call('/admin/expenses/categories', { method: 'POST', token: accounts, body: { name: `Courier ${Date.now()}` } });
check('Finance adds a category', newCategory.status === 201);

// A second linked cost, so contribution has something to show.
const frameCost = await call('/admin/expenses', { method: 'POST', token: ops, body: { title: 'Frames for ABC', categoryId: categories.body.find((c) => c.slug === 'frame-manufacturing').id, amount: 600, expenseDate: '2026-10-26', paymentArrangement: 'unpaid', orderId: abcId, submit: true } });
await call(`/admin/expenses/${frameCost.body.id}/decision`, { method: 'POST', token: manager, body: { decision: 'approve' } });

console.log('\n── Expense approval routing ────────────────────────────────');

const misc = categories.body.find((category) => category.slug === 'misc').id;
const baseSettings = { autoApproveLimit: 100, requireSeparateApprover: true, priceOverrideApprovalPercent: 5, branches: ['Bengaluru', 'Mysuru'] };
let routing = (await call('/admin/finance/settings', { token: ceo })).body.approvalRouting;
const route = (patch, token = ceo) => call('/admin/finance/settings', { method: 'PUT', token, body: { ...baseSettings, approvalRouting: { ...routing, ...patch } } });
const expense = (token, body) => call('/admin/expenses', { method: 'POST', token, body: { expenseDate: '2026-10-24', paymentArrangement: 'unpaid', submit: true, ...body } });
const decide = (id, token, decision = 'approve', note) => call(`/admin/expenses/${id}/decision`, { method: 'POST', token, body: { decision, note } });
const dashboardNow = async () => (await call('/admin/finance/dashboard', { token: ceo })).body;

const acctExpense = await expense(accounts, { title: 'Gateway charges', categoryId: misc, amount: 300, paymentArrangement: 'company_paid', paymentMethod: 'bank_transfer' });
check('Accounts expense is routed to a senior approver (the CEO)', acctExpense.status === 201 && acctExpense.body.approver?.id === who.ceo && acctExpense.body.approvalRoute === 'sole_ceo', `${acctExpense.body.approver?.name} via ${acctExpense.body.approvalRoute}`);

// The CEO, before anyone is designated for the CEO's expenses.
const ceoCountBefore = (await call('/admin/expenses?mine=true', { token: ceo })).body.length;
const ceoBlocked = await expense(ceo, { title: 'Client dinner', categoryId: misc, amount: 2400 });
check('No eligible approver: refused with a configuration error', ceoBlocked.status === 409 && ceoBlocked.body.code === 'no_eligible_approver' && /Expense approval routing/.test(ceoBlocked.body.message ?? ''), ceoBlocked.body.message);
check('Nothing is saved when a submission is refused', (await call('/admin/expenses?mine=true', { token: ceo })).body.length === ceoCountBefore);
check('Whoever configures routing is told, with a link to fix it', (await call('/notifications?pageSize=60', { token: ceo })).body.items.some((entry) => entry.title === 'Expense approval routing needs attention' && (entry.link ?? '').includes('settings=approvals')));

// Configuring routing: who may, and who may be chosen.
check('Accounts cannot designate who approves the CEO', (await route({ ceoExpensesApproverId: who.accounts }, accounts)).status === 403);
check('An operations account cannot be an approver', (await route({ managerExpensesApproverId: who.operations })).status === 400);
check('An account without the approval permission cannot be an approver', (await route({ defaultApproverId: who.it_team })).status === 400);
check("A manager cannot approve the CEO's expenses", (await route({ ceoExpensesApproverId: who.manager })).status === 400);
check('Circular routing refused: the CEO as approver of the CEO', (await route({ ceoExpensesApproverId: who.ceo })).status === 400);
const options = await call('/admin/finance/approvers', { token: accounts });
check('The approver list says who fits where', options.status === 200 && options.body.find((entry) => entry.id === who.accounts)?.slots.includes('ceo_expenses') && options.body.find((entry) => entry.id === who.operations)?.slots.length === 0);
// Branch isolation: an approver has to be able to open the branch's expenses.
check('A branch approver who works in another branch is refused', (await route({ branchApprovers: { Mysuru: who.manager } })).status === 400);
// For this scenario operations and the manager are the Mysuru team; they go back to Bengaluru after it.
const moveTo = (userId, branch) => call(`/admin/people/users/${userId}/branch`, { method: 'POST', token: ceo, body: { branch, reason: 'Regression test: Mysuru team' } });
check('The Mysuru team is assigned to Mysuru', (await moveTo(who.manager, 'Mysuru')).status === 200 && (await moveTo(who.operations, 'Mysuru')).status === 200);
const designated = await route({ ceoExpensesApproverId: who.accounts, branchApprovers: { Mysuru: who.manager } });
check("The CEO designates an Accounts approver for the CEO's expenses", designated.status === 200 && designated.body.approvalRouting.ceoExpensesApproverId === who.accounts, `HTTP ${designated.status} ${designated.body.message ?? ''}`);
routing = designated.body.approvalRouting;

const ceoExpense = await expense(ceo, { title: 'Client dinner', categoryId: misc, amount: 2400 });
check("CEO expense goes to the explicitly designated approver", ceoExpense.status === 201 && ceoExpense.body.approver?.id === who.accounts && ceoExpense.body.approvalRoute === 'ceo_expenses', `${ceoExpense.body.approver?.name} via ${ceoExpense.body.approvalRoute}`);
check('The CEO cannot approve their own expense', (await decide(ceoExpense.body.id, ceo)).status === 403);
// 403 - or 404 now that the manager works in Mysuru and cannot even open a Bengaluru expense.
check("A manager cannot approve the CEO's expense", [403, 404].includes((await decide(ceoExpense.body.id, manager)).status));
const ceoApproved = await decide(ceoExpense.body.id, accounts);
check('The designated approver approves it', ceoApproved.status === 200 && ceoApproved.body.status === 'approved' && ceoApproved.body.approvedBy === who.accounts);
check('Approval does not pay it', ceoApproved.body.paidAmount === 0 && ceoApproved.body.outstandingAmount === 2400);

const mysuru = await expense(ops, { title: 'Fuel to Mysuru', categoryId: transport.id, amount: 450, paymentArrangement: 'employee_reimbursable', paidBy: 'Rahul', branch: 'Mysuru' });
check("A branch expense goes to that branch's approver", mysuru.body.approver?.id === who.manager && mysuru.body.approvalRoute === 'branch', `${mysuru.body.approver?.name} via ${mysuru.body.approvalRoute}`);

routing = (await route({ managerExpensesApproverId: who.accounts })).body.approvalRouting;
const managerExpense = await expense(manager, { title: 'Courier to Mysuru', categoryId: misc, amount: 800 });
check("Manager expense goes to the explicitly authorised Accounts approver", managerExpense.body.approver?.id === who.accounts && managerExpense.body.approvalRoute === 'manager_expenses');

// Repair: the approver it was routed to becomes unavailable.
await call(`/admin/people/users/${who.accounts}/suspend`, { method: 'POST', token: ceo, body: { reason: 'Regression test: approver unavailable' } });
const stranded = await call(`/admin/expenses/${managerExpense.body.id}`, { token: ceo });
check('A waiting expense whose approver cannot act is flagged', Boolean(stranded.body.approvalProblem) && stranded.body.mayDecide === false, stranded.body.approvalProblem);
check('An inactive account cannot be chosen as an approver', (await route({ backupApproverId: who.accounts })).status === 400);
check('Routing waiting expenses needs the permission', (await call('/admin/expenses/route-pending', { method: 'POST', token: manager })).status === 403);
const repair = await call('/admin/expenses/route-pending', { method: 'POST', token: ceo });
const repaired = await call(`/admin/expenses/${managerExpense.body.id}`, { token: ceo });
check('Repair gives it an eligible approver', repair.status === 200 && repair.body.assigned.some((entry) => entry.id === managerExpense.body.id) && repaired.body.approver?.id === who.ceo && repaired.body.approvalRoute === 'sole_ceo', `${repaired.body.approver?.name} via ${repaired.body.approvalRoute}`);
check('Repair keeps the id, number, amount, category, dates and submitter', ['id', 'number', 'amount', 'categoryId', 'expenseDate', 'createdBy', 'createdAt', 'status', 'paymentArrangement'].every((field) => repaired.body[field] === managerExpense.body[field]));
check('Repair leaves sound assignments alone', repair.body.unchanged >= 2 && !repair.body.assigned.some((entry) => entry.id === mysuru.body.id || entry.id === acctExpense.body.id));
check('Each repair is on the audit trail', (await call('/admin/audit?action=expense.approver_assigned&pageSize=50', { token: ceo })).body.items.some((entry) => entry.entityId === managerExpense.body.id));

await call(`/admin/people/users/${who.accounts}/reactivate`, { method: 'POST', token: ceo, body: { reason: 'Back from leave' } });
await new Promise((resolve) => setTimeout(resolve, 1100));
accounts = (await signIn(staff.accounts.email, staff.accounts.plain)).accessToken;

const reassign = (token, approverId, reason = 'Back from leave') =>
  call(`/admin/expenses/${managerExpense.body.id}/approver`, { method: 'POST', token, body: { approverId, reason } });
check('Reassigning needs the permission', (await reassign(accounts, who.accounts)).status === 403);
check('Cannot hand it to someone who may not approve it', (await reassign(ceo, who.operations)).status === 400);
check('Cannot hand it to the person who recorded it', (await reassign(ceo, who.manager)).status === 400);
const handed = await reassign(ceo, who.accounts);
check('An administrator reassigns it, with a reason', handed.status === 200 && handed.body.approver?.id === who.accounts && handed.body.approvalRoute === 'manual');
check('The reassignment is audited', (await call('/admin/audit?action=expense.approver_reassigned&pageSize=50', { token: ceo })).body.items.some((entry) => entry.entityId === managerExpense.body.id && entry.meta?.reason === 'Back from leave'));
check('The previous approver can no longer decide it', (await decide(managerExpense.body.id, ceo)).status === 403);
check('The new approver decides it', (await decide(managerExpense.body.id, accounts)).body.status === 'approved');

// The backup approver may act on anything routed to someone else.
routing = (await route({ backupApproverId: who.ceo })).body.approvalRouting;
const asBackup = await call(`/admin/expenses/${mysuru.body.id}`, { token: ceo });
check('The backup approver may decide an expense routed to someone else', asBackup.body.mayDecide === true && asBackup.body.decidesAsBackup === true);
check("...and finds it in their inbox, marked as backup", (await call('/admin/expenses/approvals', { token: ceo })).body.some((entry) => entry.id === mysuru.body.id && entry.decidesAsBackup));
check('The assigned approver still decides it', (await decide(mysuru.body.id, manager)).body.status === 'approved');
check('...and the Mysuru team goes back to Bengaluru', (await moveTo(who.manager, 'Bengaluru')).status === 200 && (await moveTo(who.operations, 'Bengaluru')).status === 200);

// An expense the company has already paid, approved and then recorded as paid: counted once.
const beforeApproval = await dashboardNow();
const acctApproved = await decide(acctExpense.body.id, ceo);
const afterApproval = await dashboardNow();
check('Approving an already-paid expense counts the cost once, and not as paid', acctApproved.body.status === 'approved' && afterApproval.expenses.recognised - beforeApproval.expenses.recognised === 300 && afterApproval.expenses.paid === beforeApproval.expenses.paid);
const acctPayKey = key();
await call(`/admin/expenses/${acctExpense.body.id}/payments`, { method: 'POST', token: accounts, body: { amount: 300, paidOn: '2026-10-24', method: 'bank_transfer', idempotencyKey: acctPayKey } });
await call(`/admin/expenses/${acctExpense.body.id}/payments`, { method: 'POST', token: accounts, body: { amount: 300, paidOn: '2026-10-24', method: 'bank_transfer', idempotencyKey: acctPayKey } });
const afterPayment = await dashboardNow();
check('Recording its payment counts it as paid once, even when retried', afterPayment.expenses.paid - afterApproval.expenses.paid === 300 && afterPayment.expenses.recognised === afterApproval.expenses.recognised);
check('A second payment for it is refused', (await call(`/admin/expenses/${acctExpense.body.id}/payments`, { method: 'POST', token: accounts, body: { amount: 300, paidOn: '2026-10-24', method: 'bank_transfer', idempotencyKey: key() } })).status === 400);

check('Approvals are audited', (await call('/admin/audit?action=expense.approved&pageSize=50', { token: ceo })).body.items.some((entry) => entry.entityId === travel.body.id && entry.meta?.assignedApprover === who.manager));
check('Rejections are audited', (await call('/admin/audit?action=expense.rejected&pageSize=50', { token: ceo })).body.items.some((entry) => entry.entityId === own.body.id && entry.meta?.note === 'Not a business expense'));

console.log('\n── Reporting and integration ───────────────────────────────');

const orderFinance = await call(`/admin/orders/${abcId}/finance`, { token: ops });
check('Order costs visible on the order', orderFinance.status === 200 && orderFinance.body.expenses.some((expense) => expense.id === frameCost.body.id));
check('Order contribution = value − recorded costs', orderFinance.body.contribution?.contribution === 1724 - 600, `₹${orderFinance.body.contribution?.contribution}`);

const dashboard = await call('/admin/finance/dashboard', { token: accounts });
check('Finance dashboard opens for finance', dashboard.status === 200);
check('Operations cannot open the finance dashboard', (await call('/admin/finance/dashboard', { token: ops })).status === 403);
check('Approved expenses appear in reports', dashboard.body.expenses.recognised >= 640, `₹${dashboard.body.expenses.recognised}`);
// The travel expense's ₹350 was paid and then reversed; the only payment still standing is the ₹300 above.
check('Reversed expense not counted as paid', dashboard.body.expenses.paid === 300, `₹${dashboard.body.expenses.paid}`);

const collectedBefore = dashboard.body.revenue.netCollected;
const legacyPayment = (await call('/admin/payments?status=succeeded&pageSize=100', { token: ceo })).body.items.find((payment) => payment.orderId === legacy.body.id);
const refund = await call(`/admin/payments/${legacyPayment.id}/refund`, { method: 'POST', token: accounts, body: { amount: 100, reason: 'Frame arrived chipped' } });
check('Refund recorded with its amount', refund.status === 200 && refund.body.payment.refundedAmount === 100);
const afterRefund = await call('/admin/finance/dashboard', { token: accounts });
check('A refund reduces net collections by exactly its amount', Math.round((collectedBefore - afterRefund.body.revenue.netCollected) * 100) === 10000, `₹${collectedBefore} → ₹${afterRefund.body.revenue.netCollected}`);
const refundRows = (await call('/admin/finance/transactions', { token: accounts })).body.filter((entry) => entry.source.id === legacyPayment.id);
check('Register shows the payment once and the refund once', refundRows.length === 2 && refundRows.some((entry) => entry.type === 'refund' && entry.amount === 100));

const ids = new Set(register.body.map((entry) => entry.id));
check('Every register entry has a unique id', ids.size === register.body.length);

for (const report of ['income-expense', 'expense-register', 'collections', 'outstanding', 'expense-categories', 'branches', 'order-profitability', 'transactions']) {
  const csv = await call(`/admin/finance/exports/${report}?format=csv`, { token: accounts, raw: true });
  const xlsx = await call(`/admin/finance/exports/${report}?format=xlsx`, { token: accounts, raw: true });
  check(
    `Export ${report} (CSV and Excel)`,
    csv.status === 200 && csv.buffer.toString('utf8').startsWith('﻿') && xlsx.status === 200 && xlsx.buffer.subarray(0, 2).toString() === 'PK',
  );
}
check('Exports need the permission', (await call('/admin/finance/exports/collections?format=csv', { token: ops, raw: true })).status === 403);

const register2 = await call('/admin/finance/exports/expense-register?format=csv', { token: accounts, raw: true });
check('Expense register lists the recorded expenses', register2.buffer.toString('utf8').includes(travel.body.number));

const invoices = await call('/admin/finance/invoices', { token: accounts });
check('Invoices list includes client orders', invoices.body.some((invoice) => invoice.orderReference === abc.body.order.reference && invoice.customer.startsWith('ABC Cafe')));

console.log('\n── Wizard orders, order money and linked costs ─────────────');

// What the wizard sends: two frame styles at their own prices, charges, a discount, part paid offline.
const wizardBody = {
  client: { kind: 'new', client: { name: `Brew Lab ${Date.now()}`, type: 'cafe', contactName: 'Kiran', phone: `+91 97${String(Date.now()).slice(-8)}`, email: '', addressLine1: '7 Lavelle Road', city: 'Bengaluru' } },
  pricingMode: 'custom',
  lines: [
    { kind: 'frames', size: 'a4', color: 'brown', artworkIds: photos.slice(24, 26), unitPrice: 200 },
    { kind: 'frames', size: 'a3', color: 'white', artworkIds: photos.slice(26, 27), unitPrice: 350 },
    { kind: 'printing', quantity: 3, unitPrice: 50 },
    { kind: 'delivery', quantity: 1, unitPrice: 100 },
  ],
  discount: 50,
  priceReason: 'Opening offer, two frame sizes',
};
const wizardQuote = await call('/admin/orders/quote', { method: 'POST', token: manager, body: wizardBody });
check('Mixed frame sizes at their own prices: 2 × ₹200 + ₹350 + 3 × ₹50 + ₹100 − ₹50 = ₹950', wizardQuote.body.total === 950 && wizardQuote.body.quote.tax === 0, `₹${wizardQuote.body.total}`);
const wizardKey = key();
// The CEO holds price approval, so this 13% discount is approved as it is created and can be part paid at once.
const wizard = await call('/admin/orders/console', { method: 'POST', token: ceo, body: { ...wizardBody, payment: { terms: 'paid_offline', amount: 500, receivedOn: '2026-10-27', method: 'upi', reference: 'UPI-WIZ-1' }, idempotencyKey: wizardKey } });
check('Guest order created with part of it paid offline', wizard.status === 201 && wizard.body.order.pricing.approval?.status === 'approved' && wizard.body.order.ownerId === null && wizard.body.money.paid === 500 && wizard.body.money.outstanding === 450, `HTTP ${wizard.status} ${wizard.text?.slice(0, 120)}`);
check('Part paid is not confirmed', wizard.body.order.status === 'pending_payment' && !wizard.body.order.invoiceId);
check('Each frame keeps its own size and agreed price', wizard.body.order.items.length === 3 && wizard.body.order.items.filter((item) => item.frame.size === 'a3' && item.unitPrice === 350).length === 1 && wizard.body.order.items.filter((item) => item.frame.size === 'a4' && item.unitPrice === 200).length === 2);
const wizardAgain = await call('/admin/orders/console', { method: 'POST', token: ceo, body: { ...wizardBody, payment: { terms: 'paid_offline', amount: 500, receivedOn: '2026-10-27', method: 'upi', reference: 'UPI-WIZ-1' }, idempotencyKey: wizardKey } });
const wizardFinance = await call(`/admin/orders/${wizard.body.order.id}/finance`, { token: manager });
check('A resubmitted wizard creates no second order and no second payment', wizardAgain.status === 200 && wizardAgain.body.order.id === wizard.body.order.id && wizardFinance.body.payments.length === 1);
check('Order money comes from the payment rows', wizardFinance.body.money.total === 950 && wizardFinance.body.money.paid === 500 && wizardFinance.body.money.outstanding === 450 && wizardFinance.body.money.state === 'partially_paid');
check('A staff-recorded payment is marked as such', wizardFinance.body.payments[0].provider === 'manual' && wizardFinance.body.payments[0].recordedByEmail === staff.ceo.email && wizardFinance.body.payments[0].method === 'upi');
check('No overpayment on the order page either', (await call(`/admin/orders/${wizard.body.order.id}/payments`, { method: 'POST', token: accounts, body: { amount: 450.01, receivedOn: '2026-10-28', method: 'cash', idempotencyKey: key() } })).status === 400);
const wizardRest = await call(`/admin/orders/${wizard.body.order.id}/payments`, { method: 'POST', token: accounts, body: { amount: 450, receivedOn: '2026-10-28', method: 'bank_transfer', reference: 'UTR-77', idempotencyKey: key() } });
check('The balance, recorded by Accounts, confirms and invoices it', wizardRest.status === 201 && wizardRest.body.order.status === 'confirmed' && wizardRest.body.money.outstanding === 0 && Boolean(wizardRest.body.order.invoiceId));
const wizardHistory = (await call(`/admin/orders/${wizard.body.order.id}/finance`, { token: accounts })).body;
check('Payment history shows both payments, nothing twice', wizardHistory.payments.length === 2 && wizardHistory.payments.reduce((sum, payment) => sum + payment.amount, 0) === 950);

// A price rejected with a reason cancels the order and tells whoever set it.
const rejectBody = { client: { kind: 'space', spaceId: space.id }, pricingMode: 'custom', lines: [{ kind: 'frames', size: 'a4', color: 'white', artworkIds: photos.slice(27, 30), unitPrice: 50 }], priceReason: 'Test of a rejected price' };
const toReject = await call('/admin/orders/console', { method: 'POST', token: manager, body: { ...rejectBody, payment: { terms: 'collect_later' }, idempotencyKey: key() } });
check('A rejection needs a reason', (await call(`/admin/orders/${toReject.body.order.id}/price-approval`, { method: 'POST', token: accounts, body: { decision: 'reject' } })).status === 400);
const rejectedPrice = await call(`/admin/orders/${toReject.body.order.id}/price-approval`, { method: 'POST', token: accounts, body: { decision: 'reject', note: 'Too far below cost' } });
check('Rejected price cancels the order', rejectedPrice.status === 200 && rejectedPrice.body.order.status === 'cancelled' && rejectedPrice.body.order.pricing.approval.status === 'rejected');
check('Whoever set the price is told why', (await call('/notifications?pageSize=60', { token: manager })).body.items.some((entry) => entry.title === `Price rejected for ${toReject.body.order.reference}` && entry.body === 'Too far below cost'));
check('The price decision is audited', (await call('/admin/audit?action=order.price_rejected&pageSize=50', { token: ceo })).body.items.some((entry) => entry.entityId === toReject.body.order.id));
check('A cancelled order takes no payment', (await call(`/admin/orders/${toReject.body.order.id}/payments`, { method: 'POST', token: accounts, body: { amount: 10, receivedOn: '2026-10-28', method: 'cash', idempotencyKey: key() } })).status === 400);

// Linking an existing expense to an order.
const courier = await call('/admin/expenses', { method: 'POST', token: ops, body: { title: 'Courier for Brew Lab', categoryId: misc, amount: 120, expenseDate: '2026-10-27', paymentArrangement: 'unpaid', submit: true } });
await decide(courier.body.id, manager);
const recognisedBefore = (await dashboardNow()).expenses.recognised;
const linked = await call(`/admin/expenses/${courier.body.id}/order`, { method: 'POST', token: ops, body: { orderId: wizard.body.order.id } });
check('An existing expense can be linked to an order', linked.status === 200 && linked.body.orderId === wizard.body.order.id && linked.body.orderReference === wizard.body.order.reference && linked.body.status === 'approved');
const linkedFinance = (await call(`/admin/orders/${wizard.body.order.id}/finance`, { token: manager })).body;
check('It shows on the order, and contribution = order value − linked approved costs', linkedFinance.expenses.some((expense) => expense.id === courier.body.id) && linkedFinance.contribution.recordedCosts === 120 && linkedFinance.contribution.contribution === 830);
check('Linking changes no totals - nothing is counted twice', (await dashboardNow()).expenses.recognised === recognisedBefore);
check('The link is audited', (await call('/admin/audit?action=expense.order_linked&pageSize=50', { token: ceo })).body.items.some((entry) => entry.entityId === courier.body.id && entry.meta?.to === wizard.body.order.id));
const othersExpense = await call('/admin/expenses', { method: 'POST', token: manager, body: { title: 'Manager taxi', categoryId: misc, amount: 80, expenseDate: '2026-10-27', paymentArrangement: 'unpaid' } });
check("Operations cannot move someone else's expense", [403, 404].includes((await call(`/admin/expenses/${othersExpense.body.id}/order`, { method: 'POST', token: ops, body: { orderId: wizard.body.order.id } })).status));
check('Linking to an order that does not exist is refused', (await call(`/admin/expenses/${courier.body.id}/order`, { method: 'POST', token: ops, body: { orderId: '00000000-0000-0000-0000-000000000000' } })).status === 400);
await call(`/admin/expenses/${othersExpense.body.id}/cancel`, { method: 'POST', token: manager, body: { reason: 'Recorded by mistake' } });
check('A cancelled expense cannot be linked', (await call(`/admin/expenses/${othersExpense.body.id}/order`, { method: 'POST', token: manager, body: { orderId: wizard.body.order.id } })).status === 400);
const unlinked = await call(`/admin/expenses/${courier.body.id}/order`, { method: 'POST', token: ops, body: { orderId: null } });
check('An expense can be taken off an order again', unlinked.status === 200 && unlinked.body.orderId === null);
await call(`/admin/expenses/${courier.body.id}/order`, { method: 'POST', token: ops, body: { orderId: wizard.body.order.id } });

// Deliberately linking a client to the account the business registered.
const linkable = await call('/admin/clients', { method: 'POST', token: manager, body: { name: `Corner Bakery ${Date.now()}`, type: 'cafe', contactName: 'Joe', phone: `+91 96${String(Date.now()).slice(-8)}`, addressLine1: '3 Brigade Road', city: 'Bengaluru' } });
const linkableId = linkable.body.client?.id ?? linkable.body.id;
check('A client record can be created on its own', linkable.status === 201 && Boolean(linkableId));
check('Linking needs a reason', (await call(`/admin/clients/${linkableId}/link`, { method: 'POST', token: manager, body: { email: ownerMatch[1], reason: '' } })).status === 422);
check('Linking needs the exact account email', (await call(`/admin/clients/${linkableId}/link`, { method: 'POST', token: manager, body: { email: 'nobody@example.com', reason: 'Owner confirmed on the phone' } })).status === 404);
const linkedClient = await call(`/admin/clients/${linkableId}/link`, { method: 'POST', token: manager, body: { email: ownerMatch[1].toUpperCase(), reason: 'Owner confirmed on the phone' } });
check('A client is linked to a registered account by its sign-in email', linkedClient.status === 200 && linkedClient.body.client.linkedUserId === ownerId, `HTTP ${linkedClient.status} ${linkedClient.text?.slice(0, 120)}`);
check('A client cannot be linked twice', (await call(`/admin/clients/${linkableId}/link`, { method: 'POST', token: manager, body: { email: ownerMatch[1], reason: 'Again' } })).status === 409);

console.log('\n── GST disabled ────────────────────────────────────────────');
check('No GST on a guest order built like the wizard builds it', wizard.body.order.pricing.gst === 0 && wizard.body.order.pricing.total === 950);

const standardTotal = (pricing) => Math.round((pricing.subtotal - pricing.discount + pricing.delivery + pricing.installation + pricing.securityDeposit) * 100) / 100;
check('No GST on a customer checkout order, and its total adds up', ownOrder.body.pricing.gst === 0 && ownOrder.body.pricing.total === standardTotal(ownOrder.body.pricing), `₹${ownOrder.body.pricing.total}`);
check('No GST on a standard Console order', stdOrder.body.order.pricing.gst === 0 && stdOrder.body.order.pricing.total === 717);
check('No GST on a custom-priced order: 6 × ₹229 + ₹300 + ₹100 − ₹50 = ₹1,724', abc.body.order.pricing.gst === 0 && abc.body.order.pricing.total === 1724);
const injected = await call('/admin/orders/quote', { method: 'POST', token: manager, body: { ...abcBody, gstRegistered: true, gstRate: 0.18, tax: 500, gst: 500 } });
check('A request cannot add GST', injected.status === 200 && injected.body.quote.tax === 0 && injected.body.total === 1724, `tax ₹${injected.body.quote?.tax}, total ₹${injected.body.total}`);
const abcInvoice = await call(`/invoices/${rest.body.order.invoiceId}`, { token: ceo });
check('Invoice total is the agreed order price, with no GST', abcInvoice.status === 200 && abcInvoice.body.invoice.amount === 1724 && abcInvoice.body.invoice.gst === 0);
const invoiceHtml = (await call(`/invoices/${rest.body.order.invoiceId}/download`, { token: ceo, raw: true })).buffer.toString('utf8');
check('Invoice is not titled a tax invoice and has no GST line', invoiceHtml.includes('1,724') && !invoiceHtml.includes('Tax Invoice') && !/GST @/.test(invoiceHtml));
check('Existing payment records unchanged: the paid order was charged its total', legacyPayment.amount === legacy.body.pricing.total && legacy.body.pricing.gst === 0);
check('Expense amounts unaffected', (await call(`/admin/expenses/${ceoExpense.body.id}`, { token: ceo })).body.amount === 2400);
const reports = await call('/admin/reports', { token: ceo });
check('GST reports are empty while GST is off', reports.status === 200 && Array.isArray(reports.body.gst) && reports.body.gst.length === 0);

// ── Sign-in access: photographers and staff ──────────────────────────────────

console.log('\n── Sign-in access ──────────────────────────────────────────');
const stamp = Date.now();
const inviteBody = (email, role, fullName = 'Nila Varma') => ({ email, fullName, role });
const invite = (token, body) => call('/admin/people/invitations', { method: 'POST', token, body });
/** The setup link in the newest email to that address, as the recipient would get it. */
async function setupTokenFor(email) {
  const list = await call(`/admin/mail?to=${encodeURIComponent(email)}`, { token: ceo });
  const newest = list.body.items?.[0];
  const full = newest ? await call(`/admin/mail/${newest.id}`, { token: ceo }) : null;
  const match = /reset-password\?token=([^"&\s<]+)/.exec(full?.body?.html ?? '');
  return { subject: newest?.subject, token: match ? decodeURIComponent(match[1]) : null };
}
const setPassword = (token, password) =>
  call('/auth/reset-password', { method: 'POST', body: { token, password, confirmPassword: password } });

check('Manager cannot invite anyone', (await invite(manager, inviteBody(`m.${stamp}@example.com`, 'artist'))).status === 403);
check('Accounts cannot invite anyone', (await invite(accounts, inviteBody(`a.${stamp}@example.com`, 'artist'))).status === 403);
check('Operations cannot invite anyone', (await invite(ops, inviteBody(`o.${stamp}@example.com`, 'artist'))).status === 403);
check('IT cannot make someone CEO', (await invite(it, inviteBody(`c.${stamp}@example.com`, 'ceo'))).status === 403);
check(
  'Nor through the older account endpoint',
  (await call('/admin/users', { method: 'POST', token: it, body: { email: `c2.${stamp}@example.com`, role: 'ceo' } })).status === 403,
);

const nilaEmail = `nila.${stamp}@example.com`;
const nilaInvite = await invite(it, inviteBody(nilaEmail, 'artist'));
const nilaId = nilaInvite.body?.user?.id;
check('IT invites a photographer', nilaInvite.status === 201 && nilaInvite.body.user.role === 'artist', `HTTP ${nilaInvite.status} ${nilaInvite.text.slice(0, 120)}`);
check('The answer holds no password and no link', !/passwordHash|"password"|token=|reset-password/i.test(nilaInvite.text));
const nilaBefore = await call(`/admin/people/users/${nilaId}`, { token: ceo });
check(
  'People & access shows "invitation sent", never a sign-in that did not happen',
  nilaBefore.body.access.state === 'invited' && nilaBefore.body.access.lastSignInAt === null && !nilaBefore.body.user.lastLoginAt,
  JSON.stringify(nilaBefore.body.access),
);
check(
  'The photographer profile belongs to that sign-in, with a photographer code',
  nilaBefore.body.profile?.userId === nilaId && Boolean(nilaBefore.body.photographer?.photographerCode),
);
check(
  'The invitation is audited without the link',
  nilaBefore.body.activity.some((entry) => entry.action === 'user.invited') && !/token=|reset-password/.test(JSON.stringify(nilaBefore.body.activity)),
);
const nilaMail = await setupTokenFor(nilaEmail);
check('The photographer is emailed a single-use setup link', nilaMail.subject === 'Your ARTINU photographer account' && Boolean(nilaMail.token));

const again = await invite(it, inviteBody(nilaEmail.toUpperCase(), 'artist', 'Nila Again'));
check(
  'Inviting the same address again is refused, naming the account',
  again.status === 409 && again.body.code === 'account_exists' && again.body.details?.existingUserId?.[0] === nilaId,
);
const existingPhotographer = await invite(ceo, inviteBody(photographer.email, 'artist', 'Someone Else'));
check('An existing photographer is never given a second account', existingPhotographer.status === 409 && existingPhotographer.body.code === 'account_exists');
const sameAddress = await call(`/admin/people/users?q=${encodeURIComponent(photographer.email)}`, { token: ceo });
check('Still exactly one account on that address', sameAddress.body.total === 1);

check('The setup link sets their own password', (await setPassword(nilaMail.token, 'Photo#Nila2026')).status === 200);
check('The setup link works only once', (await setPassword(nilaMail.token, 'Photo#Again2026')).status >= 400);
// A person takes longer than this to get from the email to a signed-in session.
await new Promise((resolve) => setTimeout(resolve, 1200));
const nila = await call('/auth/sign-in', { method: 'POST', body: { email: nilaEmail, password: 'Photo#Nila2026' } });
check('The invited photographer signs in as a photographer', nila.status === 200 && nila.body.user.role === 'artist');
check('A photographer is refused by Console APIs', (await call('/admin/people/users', { token: nila.body.accessToken })).status === 403);
check('A photographer is refused finance as well', (await call('/admin/finance/dashboard', { token: nila.body.accessToken })).status === 403);
const nilaAfter = await call(`/admin/people/users/${nilaId}`, { token: ceo });
check('After signing in, the account shows as able to sign in', nilaAfter.body.access.state === 'active' && Boolean(nilaAfter.body.access.lastSignInAt));
check('No invitation to resend once they have signed in', (await call(`/admin/people/users/${nilaId}/invitation`, { method: 'POST', token: it })).status === 409);

const raviEmail = `ravi.${stamp}@example.com`;
const ravi = await invite(ceo, inviteBody(raviEmail, 'operations', 'Ravi Kumar'));
const raviId = ravi.body?.user?.id;
check('The CEO creates an Operations account', ravi.status === 201 && ravi.body.user.role === 'operations' && ravi.body.user.status === 'verified');
const raviFirst = await setupTokenFor(raviEmail);
const resent = await call(`/admin/people/users/${raviId}/invitation`, { method: 'POST', token: it });
const raviSecond = await setupTokenFor(raviEmail);
check('Resending an invitation sends a fresh link', resent.status === 200 && raviSecond.token && raviSecond.token !== raviFirst.token);
check('The earlier link stops working', (await setPassword(raviFirst.token, 'Ops#Ravi2026')).status >= 400);
check('The new link works', (await setPassword(raviSecond.token, 'Ops#Ravi2026')).status === 200);
const raviSession = await call('/auth/sign-in', { method: 'POST', body: { email: raviEmail, password: 'Ops#Ravi2026' } });
check('The new Operations user signs in', raviSession.status === 200 && raviSession.body.user.role === 'operations');
check('Operations is refused the finance dashboard', (await call('/admin/finance/dashboard', { token: raviSession.body.accessToken })).status === 403);
check('Operations is refused People & access', (await call('/admin/people/users', { token: raviSession.body.accessToken })).status === 403);

const iraEmail = `ira.${stamp}@example.com`;
const ira = await invite(it, inviteBody(iraEmail, 'it_team', 'Ira Shah'));
const iraId = ira.body?.user?.id;
check('IT access given by IT waits for the CEO', ira.status === 201 && ira.body.user.status === 'pending_ceo_approval');
check('...and shows as awaiting approval', (await call(`/admin/people/users/${iraId}`, { token: ceo })).body.access.state === 'awaiting_approval');
await setPassword((await setupTokenFor(iraEmail)).token, 'Desk#Ira2026');
const iraEarly = await call('/auth/sign-in', { method: 'POST', body: { email: iraEmail, password: 'Desk#Ira2026' } });
check('They cannot sign in before approval', iraEarly.status === 401, iraEarly.body?.message);
check('Only the CEO can approve it', (await call(`/admin/people/users/${iraId}/approve`, { method: 'POST', token: it })).status === 403);
const iraApproved = await call(`/admin/people/users/${iraId}/approve`, { method: 'POST', token: ceo });
check('The CEO approves IT access', iraApproved.status === 200 && iraApproved.body.status === 'verified');
check('Then they can sign in', (await call('/auth/sign-in', { method: 'POST', body: { email: iraEmail, password: 'Desk#Ira2026' } })).status === 200);

const employeeIt = await call('/ops/employees', { method: 'POST', token: it, body: { fullName: `Kavi Rao ${stamp}`, jobTitle: 'IT Support', role: 'it_team' } });
const employeeAccount = await call(`/admin/people/users?q=${encodeURIComponent(employeeIt.body?.companyEmail ?? '-')}`, { token: ceo });
check(
  'An IT employee added by IT also waits for the CEO',
  employeeIt.status === 201 && employeeAccount.body.items?.[0]?.status === 'pending_ceo_approval',
  employeeAccount.body.items?.[0]?.status,
);

const nilaToken = nila.body.accessToken;
check('IT suspends the photographer with a reason', (await call(`/admin/people/users/${nilaId}/suspend`, { method: 'POST', token: it, body: { reason: 'Shared their login with a friend' } })).status === 200);
check('Their open session stops working at once', (await call('/auth/session', { token: nilaToken })).status === 401);
const suspendedSignIn = await call('/auth/sign-in', { method: 'POST', body: { email: nilaEmail, password: 'Photo#Nila2026' } });
check('A suspended account cannot sign in, and is told why', suspendedSignIn.status === 401 && /suspended/i.test(suspendedSignIn.body?.message ?? ''), suspendedSignIn.body?.message);
check('Suspended accounts show as blocked', (await call(`/admin/people/users/${nilaId}`, { token: ceo })).body.access.state === 'blocked');
await call(`/admin/people/users/${nilaId}/reactivate`, { method: 'POST', token: it, body: { reason: 'Login secured again' } });
check('Reactivated, they sign in again', (await call('/auth/sign-in', { method: 'POST', body: { email: nilaEmail, password: 'Photo#Nila2026' } })).status === 200);

const everyone = await call('/admin/people/users?pageSize=100', { token: ceo });
const oneDetail = await call(`/admin/people/users/${nilaId}`, { token: it });
check('No password or hash in the user list or a user record', !/passwordHash|"password"/i.test(everyone.text) && !/passwordHash|"password"/i.test(oneDetail.text));
const staffOnly = await call('/admin/people/users?type=staff&pageSize=100', { token: ceo });
check(
  'The staff view lists Console roles only',
  staffOnly.status === 200 && staffOnly.body.items.length >= 5 && staffOnly.body.items.every((row) => ['ceo', 'manager', 'accounts', 'operations', 'it_team'].includes(row.role)),
);
const demo = await signIn(photographer.email, photographer.plain);
const demoDetail = await call(`/admin/people/users/${demo.user.id}`, { token: ceo });
check(
  'An existing photographer still signs in, linked to the same profile and photographs',
  demo.user.role === 'artist' && demoDetail.body.profile?.userId === demo.user.id && demoDetail.body.photographer.photographs > 0,
  `${demoDetail.body.photographer?.photographs} photographs`,
);

// ── Artist applications: no approval step ────────────────────────────────────

console.log('\n── Artist applications ─────────────────────────────────────');
const icons = ['android-chrome-192x192.png', 'android-chrome-512x512.png', 'apple-touch-icon-114x114.png', 'apple-touch-icon-120x120.png', 'apple-touch-icon-144x144.png', 'apple-touch-icon-152x152.png', 'apple-touch-icon-180x180.png'];
const photoData = icons.map((name) => `data:image/png;base64,${readFileSync(new URL(`../client/public/${name}`, import.meta.url)).toString('base64')}`);

/** A phone photograph: a real JPEG carrying the DateTimeOriginal a camera writes. */
async function phoneJpeg(dateTimeOriginal) {
  const plain = await sharp({ create: { width: 160, height: 120, channels: 3, background: '#335577' } }).jpeg().toBuffer();
  const value = Buffer.from(`${dateTimeOriginal}\0`, 'latin1');
  // TIFF header, IFD0 holding one pointer to the EXIF directory, which holds the date.
  const tiff = Buffer.alloc(44 + value.length);
  tiff.write('II', 0, 'latin1');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x8769, 10);
  tiff.writeUInt16LE(4, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt32LE(26, 18);
  tiff.writeUInt16LE(1, 26);
  tiff.writeUInt16LE(0x9003, 28);
  tiff.writeUInt16LE(2, 30);
  tiff.writeUInt32LE(value.length, 32);
  tiff.writeUInt32LE(44, 36);
  value.copy(tiff, 44);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const head = Buffer.from([0xff, 0xe1, 0, 0]);
  head.writeUInt16BE(payload.length + 2, 2);
  return `data:image/jpeg;base64,${Buffer.concat([plain.subarray(0, 2), head, payload, plain.subarray(2)]).toString('base64')}`;
}
const apply = (fullName, email, portfolioUrls = photoData.slice(0, 6), genres = ['street']) =>
  call('/applications', {
    method: 'POST',
    body: { fullName, email, location: 'Bengaluru, India', journey: 'I have been photographing the streets of my city for six years now.', genres, portfolioUrls, acceptTerms: true },
  });
const applicationFor = async (email) => (await call('/admin/applications?pageSize=100', { token: manager })).body.items.find((row) => row.email === email.toLowerCase());
const accountFor = async (email) => (await call(`/admin/people/users?q=${encodeURIComponent(email)}`, { token: ceo })).body.items.find((row) => row.email === email.toLowerCase());
const ownedBy = async (userId) => {
  const owned = [];
  for (let page = 1; page < 50; page += 1) {
    const list = (await call(`/admin/moderation?status=all&pageSize=100&page=${page}`, { token: manager })).body;
    owned.push(...(list.items ?? []).filter((artwork) => artwork.artistId === userId));
    if (!list.items?.length || page >= (list.totalPages ?? 1)) break;
  }
  return owned;
};
const mailTo = async (email) => (await call(`/admin/mail?to=${encodeURIComponent(email)}`, { token: ceo })).body.items ?? [];
const codesBefore = new Map(
  (await call('/admin/people/users?role=artist&pageSize=100', { token: ceo })).body.items.map((row) => [row.id, row.photographer?.photographerCode ?? null]),
);
const publicTotalBefore = (await call('/artworks?pageSize=1')).body.total;

const ashaEmail = `asha.rao.${stamp}@example.com`;
const ashaApply = await apply('Asha Rao', ashaEmail);
check('An application is accepted by the form with no approval step', ashaApply.status === 201 && ashaApply.body.received === true, `HTTP ${ashaApply.status} ${ashaApply.text.slice(0, 100)}`);
check('The answer says nothing about whether the address had an account', Object.keys(ashaApply.body).sort().join(',') === 'id,received');
const ashaRow = await applicationFor(ashaEmail);
const ashaAccount = await accountFor(ashaEmail);
check('The artist account exists at once', ashaAccount?.role === 'artist' && ashaRow?.setup.account?.userId === ashaAccount.id);
check('Its sign-in shows as password setup pending, not as signed in', ashaRow?.setup.account?.access.state === 'invited' && ashaAccount.access.lastSignInAt === null);
const ashaCode = ashaRow?.setup.account?.photographerCode;
check('A photographer code is allocated in the existing format', /^[A-Z]{3}$/.test(ashaCode ?? ''), ashaCode);
check('The profile is linked to the account, with that code', ashaAccount?.profile?.userId === ashaAccount?.id && ashaAccount?.photographer?.photographerCode === ashaCode);
const ashaArt = await ownedBy(ashaAccount.id);
check('All 6 submitted photographs are records owned by the account', ashaArt.length === 6 && ashaRow.setup.photographsLinked === 6 && ashaRow.setup.state === 'ready', `${ashaArt.length} records`);
check(
  'Each record keeps the submitted file and takes the next Photo ID',
  ashaArt.every((artwork) => ashaRow.portfolioUrls.includes(artwork.originalUrl)) &&
    [...ashaArt.map((artwork) => artwork.photoId)].sort().join(',') === [1, 2, 3, 4, 5, 6].map((n) => `${ashaCode}00${n}`).join(','),
);
check(
  'They are published the way an upload is: checked, then approved',
  ashaArt.every((artwork) => artwork.status === 'approved' && (artwork.validation ?? []).length > 0 && !(artwork.validation ?? []).some((entry) => entry.severity === 'fail')),
);
check('They are in the public gallery', (await call(`/artworks/${ashaArt[0].id}`)).status === 200 && (await call('/artworks?pageSize=1')).body.total === publicTotalBefore + 6);
const ashaPublic = (await call('/users/artists?q=Asha%20Rao&pageSize=60')).body.items?.find((artist) => artist.id === ashaAccount.id);
check('The artist is on the public Artists page', ashaPublic?.artworkCount === 6, `${ashaPublic?.artworkCount ?? 0} photographs`);
check('Their public profile resolves', (await call(`/users/artists/${ashaPublic?.slug}`)).body?.id === ashaAccount.id);
const ashaMail = await mailTo(ashaEmail);
check('Exactly one email: the invitation to choose a password', ashaMail.length === 1 && ashaMail[0].subject === 'Your ARTINU photographer account', ashaMail.map((mail) => mail.subject).join(' | '));
check('No "we will review your application" email', !ashaMail.some((mail) => /application/i.test(mail.subject)));

const ashaAgain = await apply('Asha Rao', ashaEmail.toUpperCase(), photoData.slice(1, 7));
const ashaAfter = await accountFor(ashaEmail);
const ashaArtAfter = await ownedBy(ashaAccount.id);
check('Applying again uses the same account', ashaAgain.status === 201 && (await call(`/admin/people/users?q=${encodeURIComponent(ashaEmail)}`, { token: ceo })).body.total === 1 && ashaAfter.id === ashaAccount.id);
check('...keeps the same code and adds the new photographs', ashaAfter.photographer.photographerCode === ashaCode && ashaArtAfter.length === 12);
check('...and sends no second invitation while the first is valid', (await mailTo(ashaEmail)).length === 1);
const retried = await call(`/admin/applications/${ashaRow.id}/setup`, { method: 'POST', token: manager });
check('Retrying setup changes nothing that is already in place', retried.status === 200 && retried.body.photographs.every((photo) => photo.outcome === 'already_linked') && (await ownedBy(ashaAccount.id)).length === 12);

// What a carried-over photograph is given - and what it is not.
const ashaWorks = await ownedBy(ashaAccount.id);
check(
  'Each carried-over photograph gets screen copies, as an upload does',
  ashaWorks.length === 12 && ashaWorks.every((art) => art.imageVariants && Object.keys(art.imageVariants).length > 0 && art.thumbnailUrl !== art.originalUrl && art.imageUrl !== art.originalUrl),
  ashaWorks.filter((art) => !art.imageVariants).length ? `${ashaWorks.filter((art) => !art.imageVariants).length} without` : '',
);
const ashaSubmitted = new Set(
  ((await call('/admin/applications?pageSize=100', { token: manager })).body.items ?? [])
    .filter((row) => row.email === ashaEmail.toLowerCase())
    .flatMap((row) => row.portfolioUrls ?? []),
);
check('...while the submitted file itself stays the original', ashaSubmitted.size === 12 && ashaWorks.every((art) => ashaSubmitted.has(art.originalUrl)), `${ashaSubmitted.size} submitted`);
check(
  'Nothing the application did not ask for is made up: placeholder title, no story, date or place',
  ashaWorks.every((art) => /^Untitled \d+$/.test(art.title) && !art.story && !art.description && !art.capturedAt && !art.location),
);
check('Each one is reported as still needing a title and a story', retried.body.photographs.every((photo) => (photo.needs ?? []).join() === 'title,story'));
// Each application row counts the photographs it brought in - Asha's two brought six each.
check('...and the Applications screen counts them, per application', (await applicationFor(ashaEmail)).setup.photographsNeedingDetails === 6, String((await applicationFor(ashaEmail)).setup.photographsNeedingDetails));

// A phone JPEG: the date its camera recorded is reported, unconfirmed, and never stored.
const phoneEmail = `isha.menon.${stamp}@example.com`;
const phoneApply = await apply('Isha Menon', phoneEmail, [await phoneJpeg('2024:03:09 23:45:10'), ...photoData.slice(0, 5)]);
const phoneAccount = await accountFor(phoneEmail);
const phoneWorks = phoneAccount ? await ownedBy(phoneAccount.id) : [];
const linkedEntries = (await call('/admin/audit?action=artwork.linked_from_application&pageSize=100', { token: ceo })).body.items ?? [];
const cameraDates = phoneWorks.map((art) => linkedEntries.find((entry) => entry.entityId === art.id)?.meta?.cameraDate ?? null);
check('An application with a phone JPEG is set up', phoneApply.status === 201 && phoneWorks.length === 6, `${phoneWorks.length} records`);
check("...its camera's day is reported for the photographer to confirm", cameraDates.filter(Boolean).join() === '2024-03-09', JSON.stringify(cameraDates));
check('...and not written to the photograph as if it were confirmed', phoneWorks.every((art) => !art.capturedAt));

check('The old accept decision is gone from the API', (await call(`/admin/applications/${ashaRow.id}`, { method: 'POST', token: manager, body: { decision: 'accept' } })).status === 410);
check('So is reject', (await call(`/admin/applications/${ashaRow.id}`, { method: 'POST', token: manager, body: { decision: 'reject', note: 'No' } })).status === 410);
check('...and the account is untouched by them', (await accountFor(ashaEmail)).status === 'verified' && (await applicationFor(ashaEmail)).status === 'accepted');

const demoBefore = (await ownedBy(demo.user.id)).length;
const demoCode = demoDetail.body.photographer.photographerCode;
await apply('Demo Photographer', photographer.email, photoData.slice(0, 6));
const demoAfter = await call(`/admin/people/users/${demo.user.id}`, { token: ceo });
check('An existing photographer applying keeps their account and code', demoAfter.body.user.role === 'artist' && demoAfter.body.photographer.photographerCode === demoCode);
check('...gets the photographs added, and no setup link', (await ownedBy(demo.user.id)).length === demoBefore + 6 && !(await mailTo(photographer.email)).some((mail) => mail.subject === 'Your ARTINU photographer account'));
check('...and is still able to sign in with their own password', (await call('/auth/sign-in', { method: 'POST', body: { email: photographer.email, password: photographer.plain } })).status === 200);

const ownerEmail = ownerMatch[1];
await apply('Restaurant Owner', ownerEmail);
const ownerRow = await applicationFor(ownerEmail);
check('An address that belongs to a space owner is not turned into an artist', ownerRow?.setup.state === 'not_created' && /Space Owner/.test(ownerRow.setup.problem ?? '') && (await accountFor(ownerEmail)).role === 'space_owner');

const someArtwork = (await call('/artworks?pageSize=1')).body.items[0];
const missingUrl = `http://localhost:${process.argv[2] ?? 4200}/uploads/artworks/missing-${stamp}.jpg`;
const meeraEmail = `meera.${stamp}@example.com`;
await apply('Meera Nair', meeraEmail, [...photoData.slice(0, 4), missingUrl, someArtwork.imageUrl]);
const meeraRow = await applicationFor(meeraEmail);
check('A file missing from storage is reported, and no record is invented for it', meeraRow.setup.state === 'needs_attention' && /no longer in storage/.test(meeraRow.setup.problem ?? '') && meeraRow.setup.photographsLinked === 4, meeraRow.setup.problem);
check('A file another artist already owns is left with them', /belongs to another account/.test(meeraRow.setup.problem ?? '') && (await call(`/artworks/${someArtwork.id}`)).body.artistId === someArtwork.artistId);

const legacyEmail = `legacy.${stamp}@example.com`;
await call('/admin/users', { method: 'POST', token: ceo, body: { email: legacyEmail, role: 'artist', fullName: 'Legacy Artist' } });
check('A pre-existing artist account without a code exists (the old way)', (await accountFor(legacyEmail)).photographer.photographerCode === null);
await apply('Legacy Artist', legacyEmail);
const legacyCode = (await accountFor(legacyEmail)).photographer.photographerCode;
check('Setup gives it a code, once', /^[A-Z]{3}$/.test(legacyCode ?? ''));
await call(`/admin/applications/${(await applicationFor(legacyEmail)).id}/setup`, { method: 'POST', token: manager });
check('...and a retry keeps that code', (await accountFor(legacyEmail)).photographer.photographerCode === legacyCode);

const racers = ['Sanjana Hebbar', 'Sanjay Hebbal', 'Sana Hebb', 'Sanya Hebbe'].map((name, index) => ({ name, email: `racer${index}.${stamp}@example.com` }));
await Promise.all(racers.map((racer) => apply(racer.name, racer.email)));
const racerCodes = await Promise.all(racers.map(async (racer) => (await accountFor(racer.email))?.photographer?.photographerCode));
check('Four artists applying at once get four different codes', racerCodes.every((code) => /^[A-Z]{3}$/.test(code ?? '')) && new Set(racerCodes).size === 4, racerCodes.join(', '));
const allArtists = (await call('/admin/people/users?role=artist&pageSize=100', { token: ceo })).body.items;
const allCodes = allArtists.map((row) => row.photographer?.photographerCode).filter(Boolean);
check('No two artists share a code', new Set(allCodes).size === allCodes.length);
check('Every code that existed before is unchanged', [...codesBefore].every(([id, code]) => !code || allArtists.find((row) => row.id === id)?.photographer?.photographerCode === code));
const stillWithout = allArtists.filter((row) => !row.photographer?.photographerCode);
check(
  'Every artist made by an application or invitation has a code; any still without one already lacked it (they are repaired deliberately, not silently)',
  stillWithout.every((row) => codesBefore.has(row.id) && codesBefore.get(row.id) === null),
  stillWithout.map((row) => row.email).join(', ') || 'none',
);

// ── Summary ──────────────────────────────────────────────────────────────────

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
  console.log('Failed:');
  for (const result of failed) console.log(`  - ${result.name}${result.detail ? ` (${result.detail})` : ''}`);
}
process.exit(failed.length ? 1 : 0);
