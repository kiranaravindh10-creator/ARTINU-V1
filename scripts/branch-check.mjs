/**
 * Branch isolation, checked at the API: someone held to one branch cannot see
 * or act on another branch's orders, payments, expenses, figures or staff -
 * not by list, not by id in a URL, not by naming the branch in a request.
 *
 *   cd server && DATA_DRIVER=memory MEMORY_PERSIST=false SEED_DEMO_DATA=true READ_ONLY_MODE=false \
 *     STORAGE_DRIVER=local MAIL_PROVIDER=console PAYMENT_PROVIDER=mock_qr PORT=4230 npx tsx src/index.ts
 *   node scripts/branch-check.mjs 4230
 *
 * Point it at a THROWAWAY instance with the demo seed. It refuses to run
 * against anything that is not the in-memory store. Exits non-zero on failure.
 *
 * The seeded manager is put in Bengaluru and the seeded operations user in
 * Mysuru - two branch-bound roles in two branches - while the CEO and
 * accounts are central.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const BASE = `http://localhost:${process.argv[2] ?? 4230}/api`;
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

const health = await call('/health');
if (health.body?.drivers?.data !== 'memory') {
  console.error(`Refusing to run: the API reports data driver "${health.body?.drivers?.data}". Use an in-memory instance.`);
  process.exit(2);
}

const seed = readFileSync(new URL('../server/src/database/seed.ts', import.meta.url), 'utf8');
const staff = Object.fromEntries(
  [...seed.matchAll(/\{ email: '([^']+)', plain: '([^']+)', role: '([a-z_]+)'/g)].map(([, email, plain, role]) => [role, { email, plain }]),
);
async function signIn(role) {
  const res = await call('/auth/sign-in', { method: 'POST', body: { email: staff[role].email, password: staff[role].plain } });
  if (res.status !== 200) throw new Error(`sign-in failed for ${role}: ${res.status}`);
  return { token: res.body.accessToken, id: res.body.user.id };
}
const ceo = await signIn('ceo');
const accounts = await signIn('accounts');
const it = await signIn('it_team');
const manager = await signIn('manager');
const ops = await signIn('operations');
const key = () => randomUUID();

console.log('\n── Setting up two branches ─────────────────────────────────');
const settings = (await call('/admin/finance/settings', { token: ceo.token })).body;
const saved = await call('/admin/finance/settings', {
  method: 'PUT',
  token: ceo.token,
  body: {
    autoApproveLimit: settings.autoApproveLimit,
    requireSeparateApprover: true,
    approvalRouting: settings.approvalRouting,
    priceOverrideApprovalPercent: settings.priceOverrideApprovalPercent,
    branches: ['Bengaluru', 'Mysuru'],
  },
});
check('The CEO configures two branches', saved.status === 200 && saved.body.branches.join() === 'Bengaluru,Mysuru', `HTTP ${saved.status}`);
// 403 (no permission) - or 404 once the target is in another branch, which the manager cannot even see.
const managerMove = (await call(`/admin/people/users/${ops.id}/branch`, { method: 'POST', token: manager.token, body: { branch: 'Mysuru' } })).status;
check('A branch-bound manager cannot move anyone between branches', managerMove === 403 || managerMove === 404, `HTTP ${managerMove}`);
const moveManager = await call(`/admin/people/users/${manager.id}/branch`, { method: 'POST', token: ceo.token, body: { branch: 'Bengaluru', reason: 'Bengaluru studio' } });
const moveOps = await call(`/admin/people/users/${ops.id}/branch`, { method: 'POST', token: it.token, body: { branch: 'Mysuru', reason: 'New Mysuru branch' } });
check('The CEO and IT assign staff to branches', moveManager.status === 200 && moveManager.body.branch === 'Bengaluru' && moveOps.status === 200 && moveOps.body.branch === 'Mysuru', `${moveManager.status}/${moveOps.status}`);
check('A branch that is not configured is refused', (await call(`/admin/people/users/${ops.id}/branch`, { method: 'POST', token: ceo.token, body: { branch: 'Atlantis' } })).status === 400);
const photographer = (await call('/admin/people/users?q=photographer.demo&pageSize=5', { token: ceo.token })).body.items?.[0];
check('Customers and photographers are not put in a branch', photographer && (await call(`/admin/people/users/${photographer.id}/branch`, { method: 'POST', token: ceo.token, body: { branch: 'Mysuru' } })).status === 400);
const branchInfo = (await call('/admin/people/branches', { token: ops.token })).body;
check('Operations is told it works in Mysuru only', branchInfo.scope?.all === false && branchInfo.scope?.branch === 'Mysuru', JSON.stringify(branchInfo.scope));
check('The CEO is told it sees every branch', (await call('/admin/people/branches', { token: ceo.token })).body.scope?.all === true);

console.log('\n── Orders ──────────────────────────────────────────────────');
const photos = (await call('/artworks?pageSize=40')).body.items.map((artwork) => artwork.id);
const space = (await call('/admin/spaces?pageSize=100', { token: ceo.token })).body.items.find((entry) => entry.type !== 'home_decor' && entry.ownerId);
// A standard collection starts at 3 photographs.
const body = (offset) => ({ client: { kind: 'space', spaceId: space.id }, pricingMode: 'standard', lines: [{ kind: 'frames', size: 'a4', color: 'brown', artworkIds: photos.slice(offset, offset + 3) }], payment: { terms: 'collect_later' }, idempotencyKey: key() });
const blr = await call('/admin/orders/console', { method: 'POST', token: manager.token, body: body(0) });
const mys = await call('/admin/orders/console', { method: 'POST', token: ops.token, body: body(3) });
check('The Bengaluru manager\'s order is Bengaluru\'s', blr.status === 201 && blr.body.order.branch === 'Bengaluru', `${blr.status} ${blr.body.order?.branch}`);
check('The Mysuru operations order is Mysuru\'s', mys.status === 201 && mys.body.order.branch === 'Mysuru', `${mys.status} ${mys.body.order?.branch}`);
const blrId = blr.body.order.id;
const mysId = mys.body.order.id;
check('Naming another branch in the request is refused, not quietly corrected', (await call('/admin/orders/console', { method: 'POST', token: ops.token, body: { ...body(6), branch: 'Bengaluru' } })).status === 403);
const ceoMysuru = await call('/admin/orders/console', { method: 'POST', token: ceo.token, body: { ...body(9), branch: 'Mysuru' } });
check('The CEO may create an order for any branch', ceoMysuru.status === 201 && ceoMysuru.body.order.branch === 'Mysuru');

const listed = async (who) => new Set(((await call('/admin/orders?pageSize=100', { token: who.token })).body.items ?? []).map((order) => order.id));
const opsList = await listed(ops);
const managerList = await listed(manager);
const ceoList = await listed(ceo);
check('Mysuru sees its orders and not Bengaluru\'s', opsList.has(mysId) && !opsList.has(blrId));
check('Bengaluru sees its orders and not Mysuru\'s', managerList.has(blrId) && !managerList.has(mysId));
check('The CEO sees both', ceoList.has(blrId) && ceoList.has(mysId));
const myOrders = new Set(((await call('/orders?pageSize=60', { token: ops.token })).body.items ?? []).map((order) => order.id));
check('...and the general order list keeps to the branch too', myOrders.has(mysId) && !myOrders.has(blrId));

check('Opening a Bengaluru order by id from Mysuru: 404', (await call(`/orders/${blrId}`, { token: ops.token })).status === 404);
check('...its money panel: 404', (await call(`/admin/orders/${blrId}/finance`, { token: ops.token })).status === 404);
check('...changing its status: 404', (await call(`/admin/orders/${blrId}/status`, { method: 'PATCH', token: ops.token, body: { status: 'cancelled', note: 'x' } })).status === 404);
check('...recording a payment against it: 404', (await call(`/admin/orders/${blrId}/payments`, { method: 'POST', token: ops.token, body: { amount: 100, receivedOn: '2026-10-30', method: 'cash', idempotencyKey: key() } })).status === 404);
check('...cancelling it: 404', (await call(`/orders/${blrId}/cancel`, { method: 'POST', token: ops.token, body: { reason: 'x' } })).status === 404);
check('Opening its own order works', (await call(`/orders/${mysId}`, { token: ops.token })).status === 200);
const paid = await call(`/admin/orders/${mysId}/payments`, { method: 'POST', token: ops.token, body: { amount: 200, receivedOn: '2026-10-30', method: 'upi', idempotencyKey: key() } });
check('Mysuru records a part payment on its own order', paid.status === 201 && paid.body.money.paid === 200, `HTTP ${paid.status}`);

console.log('\n── Expenses ────────────────────────────────────────────────');
const categories = (await call('/admin/expenses/categories', { token: ops.token })).body;
const transport = categories.find((category) => category.slug === 'transport-fuel');
const expense = (token, extra = {}) => call('/admin/expenses', { method: 'POST', token, body: { title: 'Courier', categoryId: transport.id, amount: 120, expenseDate: '2026-10-30', paymentArrangement: 'company_paid', paymentMethod: 'upi', submit: false, ...extra } });
const blrExpense = await expense(manager.token);
const mysExpense = await expense(ops.token);
check('A branch-bound person\'s expense is their branch\'s', blrExpense.body.branch === 'Bengaluru' && mysExpense.body.branch === 'Mysuru', `${blrExpense.body.branch}/${mysExpense.body.branch}`);
check('Recording an expense for another branch is refused', (await expense(ops.token, { branch: 'Bengaluru' })).status === 403);
check('Linking an expense to another branch\'s order is refused', (await expense(ops.token, { orderId: blrId })).status === 400);
const onOrder = await expense(ops.token, { orderId: mysId });
check('A cost on an order takes the order\'s branch', onOrder.status === 201 && onOrder.body.branch === 'Mysuru');
check('Opening a Bengaluru expense from Mysuru: 404', (await call(`/admin/expenses/${blrExpense.body.id}`, { token: ops.token })).status === 404);
const unrouted = await call(`/admin/expenses/${mysExpense.body.id}/submit`, { method: 'POST', token: ops.token });
check('Mysuru cannot be routed to the Bengaluru manager - it is refused until Mysuru has an approver', unrouted.status === 409 && /Mysuru/.test(unrouted.body.message ?? ''), unrouted.body.message);
const current = (await call('/admin/finance/settings', { token: ceo.token })).body;
const wrongApprover = await call('/admin/finance/settings', { method: 'PUT', token: ceo.token, body: { autoApproveLimit: current.autoApproveLimit, requireSeparateApprover: true, priceOverrideApprovalPercent: current.priceOverrideApprovalPercent, branches: current.branches, approvalRouting: { ...current.approvalRouting, branchApprovers: { Mysuru: manager.id } } } });
check("A Bengaluru manager cannot be made Mysuru's approver", wrongApprover.status === 400, wrongApprover.body.message);
const rightApprover = await call('/admin/finance/settings', { method: 'PUT', token: ceo.token, body: { autoApproveLimit: current.autoApproveLimit, requireSeparateApprover: true, priceOverrideApprovalPercent: current.priceOverrideApprovalPercent, branches: current.branches, approvalRouting: { ...current.approvalRouting, branchApprovers: { Mysuru: accounts.id } } } });
check('A central approver (accounts) can approve for Mysuru', rightApprover.status === 200, `HTTP ${rightApprover.status} ${rightApprover.body.message ?? ''}`);
const submitted = await call(`/admin/expenses/${mysExpense.body.id}/submit`, { method: 'POST', token: ops.token });
check('Mysuru submits its expense for approval', submitted.status === 200 && submitted.body.status === 'pending_approval', `HTTP ${submitted.status} ${submitted.body.message ?? ''}`);
check('The Bengaluru manager cannot approve a Mysuru expense: 404', (await call(`/admin/expenses/${mysExpense.body.id}/decision`, { method: 'POST', token: manager.token, body: { decision: 'approve' } })).status === 404);
const managerExpenses = new Set(((await call('/admin/expenses', { token: manager.token })).body ?? []).map((row) => row.id));
check('The Bengaluru expense list leaves Mysuru out', managerExpenses.has(blrExpense.body.id) && !managerExpenses.has(mysExpense.body.id));
const accountsExpenses = new Set(((await call('/admin/expenses', { token: accounts.token })).body ?? []).map((row) => row.id));
check('Accounts (central) sees both branches\' expenses', accountsExpenses.has(blrExpense.body.id) && accountsExpenses.has(mysExpense.body.id));

console.log('\n── Figures ─────────────────────────────────────────────────');
const dashboard = (await call('/admin/finance/dashboard', { token: accounts.token })).body;
const rows = Object.fromEntries((dashboard.branches ?? []).map((row) => [row.branch, row]));
check('The finance dashboard shows each branch for a central viewer', dashboard.scope?.all === true && rows.Bengaluru && rows.Mysuru, Object.keys(rows).join(', '));
check('Mysuru\'s collections are Mysuru\'s part payment', rows.Mysuru?.netCollected === 200 && rows.Bengaluru?.netCollected >= 0, `Mysuru ${rows.Mysuru?.netCollected}`);
const ledger = (await call('/admin/finance/transactions', { token: accounts.token })).body ?? [];
check('The register lists the Mysuru payment once', ledger.filter((entry) => entry.source?.orderId === mysId && entry.direction === 'in').length === 1);
const opsOverview = (await call('/admin/analytics', { token: ops.token })).body;
const ceoOverview = (await call('/admin/analytics', { token: ceo.token })).body;
check('The overview counts only the branch\'s orders for Mysuru', typeof opsOverview.totalOrders === 'number' ? opsOverview.totalOrders < ceoOverview.totalOrders : JSON.stringify(opsOverview).length < JSON.stringify(ceoOverview).length);

console.log('\n── Staff ───────────────────────────────────────────────────');
const audit = (await call('/admin/audit?pageSize=200', { token: ceo.token })).body.items ?? [];
check('Every branch move is on the audit trail', audit.filter((entry) => entry.action === 'user.branch_changed').length >= 2);
const employee = await call('/ops/employees', { method: 'POST', token: it.token, body: { fullName: `Branch Check ${Date.now()}`, jobTitle: 'Installer', role: 'operations', branch: 'Mysuru' } });
const employeeUser = employee.status === 201 ? (await call(`/admin/people/users/${employee.body.userId}`, { token: ceo.token })).body.user : null;
check('A new employee can be created into a branch', employee.status === 201 && employeeUser?.branch === 'Mysuru', `HTTP ${employee.status} ${employeeUser?.branch}`);
check('An unknown branch is refused when creating an employee', (await call('/ops/employees', { method: 'POST', token: it.token, body: { fullName: `Nowhere ${Date.now()}`, jobTitle: 'Installer', role: 'operations', branch: 'Atlantis' } })).status === 400);

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
