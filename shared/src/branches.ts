/**
 * Branches: which part of the business a record belongs to, and who may see it.
 *
 * ARTINU runs its walls from more than one city. An order - and the payments,
 * invoices and costs that hang off it - and an expense belong to the branch
 * that handles them. Customers, clients, photographers and their work are
 * shared by every branch: a café with two outlets is one client, served by
 * whichever branch is nearer.
 *
 * Staff in a branch role (managers, operations) see and act on their own
 * branch's records only. The CEO and the central functions - accounts and IT,
 * who hold `branches.view_all` - see every branch, and the CEO's figures add
 * the branches up. The server decides this on every request; the Console only
 * follows, so changing an id in a URL reaches nothing new.
 *
 * The list of branches is the one in the finance settings, where it began, for
 * routing expense approvals. A record written before branches existed has none
 * and belongs to the first configured branch - the business only had the one.
 */

export interface BranchScope {
  /** Every branch: the CEO and the central functions. */
  all: boolean;
  /** The branch a branch-bound member of staff works in. */
  branch: string;
  /** Where a record without a branch belongs: the first configured branch. */
  fallback: string;
}

export function sameBranch(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}

/** The branch a record belongs to, reading "none" as the first branch. */
export function branchOfRecord(branch: string | null | undefined, fallback: string): string {
  return branch?.trim() || fallback;
}

/** Whether someone with this scope may see a record of that branch. */
export function inBranchScope(scope: BranchScope, branch: string | null | undefined): boolean {
  return scope.all || sameBranch(branchOfRecord(branch, scope.fallback), scope.branch);
}
