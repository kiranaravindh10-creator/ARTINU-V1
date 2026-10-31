import {
  DEFAULT_FINANCE_SETTINGS,
  FINANCE_SETTINGS_ID,
  hasPermission,
  inBranchScope,
  sameBranch,
  type BranchScope,
  type FinanceSettings,
} from '@artinu/shared';
import { db, type StoredUser } from '@/database/db';
import { badRequest, forbidden, notFound } from '@/utils/errors';

/**
 * Branch isolation on the server - the only place it is decided.
 *
 * Every route that returns or changes an order, a payment, an invoice, an
 * expense or a figure built from them asks `branchScopeOf(req.user)` and keeps
 * to it. The scope is read from the user's row on every request, so moving
 * someone to another branch takes effect at their next click, not at their
 * next sign-in. See shared/src/branches.ts for the model.
 */

type Person = Pick<StoredUser, 'role'> & { branch?: string | null };

/** The configured branches, the first being where branch-less records belong. */
export async function configuredBranches(): Promise<string[]> {
  const record = await db.uiContent.byId(FINANCE_SETTINGS_ID).catch(() => null);
  const stored = (record?.data ?? {}) as Partial<FinanceSettings>;
  return Array.isArray(stored.branches) && stored.branches.length ? stored.branches : DEFAULT_FINANCE_SETTINGS.branches;
}

export async function branchScopeOf(person: Person): Promise<BranchScope> {
  const fallback = (await configuredBranches())[0]!;
  return {
    all: hasPermission(person.role, 'branches.view_all'),
    // Kept as assigned even if the branch has since left the list: someone in a
    // closed branch must not quietly start seeing the first branch's records.
    branch: person.branch?.trim() || fallback,
    fallback,
  };
}

/**
 * A record outside the scope is answered exactly like one that does not
 * exist, so probing ids from another branch learns nothing.
 */
export function assertInScope(scope: BranchScope, branch: string | null | undefined, what: string): void {
  if (!inBranchScope(scope, branch)) throw notFound(what);
}

/**
 * The branch a new record is written to.
 *
 * Staff held to a branch record into their own; naming another is refused
 * rather than quietly corrected, so a tampered request fails visibly. Central
 * staff may choose any configured branch, and without a choice record into
 * their own.
 */
export async function branchForNewRecord(scope: BranchScope, requested?: string | null): Promise<string> {
  if (!requested?.trim()) return scope.branch;
  const branches = await configuredBranches();
  const match = branches.find((name) => sameBranch(name, requested));
  if (!match) throw badRequest(`Choose one of the configured branches: ${branches.join(', ')}.`);
  if (!scope.all && !sameBranch(match, scope.branch)) {
    throw forbidden(`You work in ${scope.branch}, so you can only record for ${scope.branch}.`);
  }
  return match;
}

/** A payment, invoice or cost is in scope when the order it belongs to is. */
export async function assertOrderInScope(person: Person, orderId: string | null | undefined, what: string): Promise<void> {
  const [scope, order] = await Promise.all([branchScopeOf(person), orderId ? db.orders.byId(orderId) : null]);
  assertInScope(scope, order?.branch, what);
}

/** Order ids in scope, for filtering payments, invoices and costs by their order. */
export async function orderIdsInScope(scope: BranchScope): Promise<Set<string> | null> {
  if (scope.all) return null;
  const orders = await db.orders.find();
  return new Set(orders.filter((order) => inBranchScope(scope, order.branch)).map((order) => order.id));
}
