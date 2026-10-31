import {
  APPROVAL_SETTINGS_PATH,
  APPROVAL_SLOT_LABELS,
  APPROVAL_SLOT_ROLES,
  APPROVAL_SLOTS,
  approverRolesFor,
  formatAmount,
  hasPermission,
  inBranchScope,
  INTERNAL_ROLES,
  ROLE_LABELS,
  type ApprovalRoute,
  type ApprovalSlot,
  type ApproverOption,
  type Expense,
  type ExpenseApprovalRouting,
  type Role,
} from '@artinu/shared';
import { db, type StoredUser } from '@/database/db';
import { recordAudit } from '@/services/audit.service';
import { configuredBranches } from '@/services/branch.service';
import { notify } from '@/services/notification.service';
import { badRequest, forbidden, HttpError, notFound } from '@/utils/errors';
import { now } from '@/utils/ids';

/**
 * Who approves an expense.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * Approval used to be open to anyone holding `expenses.approve` who had not
 * recorded the expense. Nobody was named, nobody was told, and nothing listed
 * what was waiting for whom - so a CEO's expense sat at "Pending approval"
 * with a panel saying "someone else has to approve it" and no way to tell who.
 * It also meant any manager could approve the CEO's expenses, which nobody
 * had authorised.
 *
 * Now every submission is routed to one named person (the order is set out on
 * ExpenseApprovalRouting), and only that person - or the configured backup -
 * may decide it. The routing is configuration, never a hard-coded account:
 * people are chosen by role, permission, active status and the branch they
 * are set against.
 */

type Actor = Pick<StoredUser, 'id' | 'email' | 'role'>;

export interface Staff {
  user: StoredUser;
  name: string;
}

const roleLabel = (role: string) => ROLE_LABELS[role as Role] ?? role;

/** Every member of staff, with the name the Console shows for them. */
export async function staffDirectory(): Promise<Map<string, Staff>> {
  const users = await db.users.find({ where: { role: INTERNAL_ROLES as unknown as Role } });
  const profiles = users.length ? await db.profiles.find({ where: { userId: users.map((user) => user.id) as never } }) : [];
  const nameOf = new Map(profiles.map((profile) => [profile.userId, profile.displayName || profile.fullName]));
  return new Map(users.map((user) => [user.id, { user, name: nameOf.get(user.id) || user.email }]));
}

const isActive = (staff: Staff) => staff.user.status === 'verified';

/**
 * Whether this member of staff can open an expense of that branch: central
 * staff see every branch, anyone else only the one they work in. Routing an
 * expense to someone who cannot open it would leave it waiting for ever.
 */
export function seesBranch(candidate: Staff, branch: string | null | undefined, fallback: string): boolean {
  return inBranchScope(
    { all: hasPermission(candidate.user.role, 'branches.view_all'), branch: candidate.user.branch?.trim() || fallback, fallback },
    branch,
  );
}

/** Why this person cannot fill `slot`, or null when they can. */
export function slotProblem(staff: Staff | undefined, slot: ApprovalSlot): string | null {
  if (!staff) return 'That account does not exist, or is not a member of staff.';
  if (!isActive(staff)) return `${staff.name} is not an active account.`;
  if (!hasPermission(staff.user.role, 'expenses.approve')) {
    return `${staff.name} (${roleLabel(staff.user.role)}) does not hold the permission to approve expenses.`;
  }
  if (!APPROVAL_SLOT_ROLES[slot].includes(staff.user.role)) {
    const allowed = APPROVAL_SLOT_ROLES[slot].map(roleLabel).join(' or ');
    return `The ${APPROVAL_SLOT_LABELS[slot].toLowerCase()} has to be ${allowed}; ${staff.name} is ${roleLabel(staff.user.role)}.`;
  }
  return null;
}

/** Why this person cannot decide an expense recorded by `submitter`, or null when they can. */
function approverProblem(candidate: Staff | undefined, submitter: { id: string | null; role: string }): string | null {
  if (!candidate) return 'That account does not exist, or is not a member of staff.';
  if (candidate.user.id === submitter.id) return 'Nobody approves their own expense.';
  if (!isActive(candidate)) return `${candidate.name} is not an active account.`;
  if (!hasPermission(candidate.user.role, 'expenses.approve')) {
    return `${candidate.name} (${roleLabel(candidate.user.role)}) does not hold the permission to approve expenses.`;
  }
  if (!approverRolesFor(submitter.role).includes(candidate.user.role)) {
    const allowed = approverRolesFor(submitter.role).map(roleLabel).join(' or ');
    return `An expense recorded by ${roleLabel(submitter.role)} has to be approved by ${allowed}.`;
  }
  return null;
}

export type Routing = { approver: Staff; route: ApprovalRoute } | { problem: string };

function noApproverMessage(role: string, branch: string | null | undefined) {
  const whose =
    role === 'ceo'
      ? "the CEO's expenses"
      : role === 'manager'
        ? "managers' expenses"
        : role === 'accounts'
          ? "Accounts' expenses"
          : branch
            ? `expenses for the ${branch} branch`
            : 'expenses without a branch';
  return `No eligible approver is configured for ${whose}. Set one in Finance → Settings → Expense approval routing.`;
}

/**
 * Choose the approver for an expense, in the order on ExpenseApprovalRouting.
 * `exclude` is everyone who may not decide it: whoever recorded it, and
 * whoever is submitting it on their behalf.
 */
export function routeExpense(
  submitter: { id: string | null; role: string },
  branch: string | null | undefined,
  routing: ExpenseApprovalRouting,
  staff: Map<string, Staff>,
  exclude: (string | null | undefined)[] = [submitter.id],
  /** The first configured branch, where an expense or a person without one belongs. */
  fallbackBranch = '',
): Routing {
  const excluded = new Set(exclude.filter(Boolean));
  const fits = (id: string | null | undefined, slot: ApprovalSlot): Staff | null => {
    if (!id || excluded.has(id)) return null;
    const candidate = staff.get(id);
    return candidate && !slotProblem(candidate, slot) && seesBranch(candidate, branch, fallbackBranch) ? candidate : null;
  };
  // "The CEO" or "the manager" only when there is exactly one: with two, which
  // one is a decision for the routing settings, not for this function.
  const onlyActive = (role: Role): Staff | null => {
    const found = [...staff.values()].filter(
      (entry) =>
        entry.user.role === role &&
        isActive(entry) &&
        !excluded.has(entry.user.id) &&
        hasPermission(entry.user.role, 'expenses.approve') &&
        seesBranch(entry, branch, fallbackBranch),
    );
    return found.length === 1 ? found[0]! : null;
  };

  const steps: [() => Staff | null, ApprovalRoute][] =
    submitter.role === 'ceo'
      ? [[() => fits(routing.ceoExpensesApproverId, 'ceo_expenses'), 'ceo_expenses']]
      : submitter.role === 'manager'
        ? [
            [() => fits(routing.managerExpensesApproverId, 'manager_expenses'), 'manager_expenses'],
            [() => onlyActive('ceo'), 'sole_ceo'],
          ]
        : submitter.role === 'accounts'
          ? [
              [() => fits(routing.accountsExpensesApproverId, 'accounts_expenses'), 'accounts_expenses'],
              [() => onlyActive('ceo'), 'sole_ceo'],
            ]
          : [
              [() => fits(branch ? routing.branchApprovers[branch] : null, 'branch'), 'branch'],
              [() => fits(routing.defaultApproverId, 'default'), 'default'],
              [() => onlyActive('manager'), 'sole_manager'],
            ];
  steps.push([() => fits(routing.backupApproverId, 'backup'), 'backup']);

  for (const [pick, route] of steps) {
    const approver = pick();
    if (approver) return { approver, route };
  }
  return { problem: noApproverMessage(submitter.role, branch) };
}

/** The refusal a submission gets when routing finds nobody. Nothing has been written. */
export function noApproverError(problem: string) {
  return new HttpError(409, problem, 'no_eligible_approver');
}

/**
 * Tell the people who can fix routing that a submission was refused for want
 * of an approver - once an hour each, not once per attempt.
 */
export async function reportRoutingGap(problem: string, submittedBy: string) {
  const title = 'Expense approval routing needs attention';
  const since = Date.now() - 60 * 60 * 1000;
  const admins = [...(await staffDirectory()).values()].filter(
    (entry) => isActive(entry) && hasPermission(entry.user.role, 'expenses.configure_approvals'),
  );
  for (const admin of admins) {
    const recent = await db.notifications.find({
      where: { userId: admin.user.id },
      filter: (notification) => notification.title === title && Date.parse(notification.createdAt) > since,
    });
    if (recent.length > 0) continue;
    await notify({
      userId: admin.user.id,
      type: 'system',
      title,
      body: `${submittedBy} could not submit an expense. ${problem}`,
      link: APPROVAL_SETTINGS_PATH,
    });
  }
}

/** Tell an approver something is waiting for them. */
export async function tellApprover(expense: Expense, submittedBy: string) {
  if (expense.status !== 'pending_approval' || !expense.approverId) return;
  await notify({
    userId: expense.approverId,
    type: 'system',
    title: `Expense ${expense.number} needs your approval`,
    body: `${submittedBy} recorded ${formatAmount(expense.amount)} - ${expense.title}.`,
    link: `/console/expenses/approvals?expense=${expense.id}`,
  });
}

// ── Who may decide ───────────────────────────────────────────────────────────

export interface DecisionRight {
  ok: boolean;
  asBackup: boolean;
  /** 400 when the expense is not in a state to decide, 403 when the person may not. */
  status: 400 | 403;
  reason: string | null;
}

/**
 * The assigned approver, or the backup approver - never the person who
 * recorded it, and never someone whose role cannot approve that submitter.
 */
export function decisionRight(
  actor: Pick<StoredUser, 'id' | 'role'>,
  expense: Expense,
  routing: ExpenseApprovalRouting,
  staff: Map<string, Staff>,
): DecisionRight {
  const no = (reason: string, status: 400 | 403 = 403): DecisionRight => ({ ok: false, asBackup: false, status, reason });
  if (expense.status !== 'pending_approval') return no('Only an expense waiting for approval can be decided.', 400);
  if (expense.createdBy === actor.id) return no('You recorded this expense, so someone else has to approve it.');
  if (!hasPermission(actor.role, 'expenses.approve')) return no('Your role cannot approve expenses.');

  const submitterRole = staff.get(expense.createdBy ?? '')?.user.role ?? 'operations';
  const senior = approverRolesFor(submitterRole).includes(actor.role);

  if (expense.approverId === actor.id && senior) return { ok: true, asBackup: false, status: 403, reason: null };
  if (routing.backupApproverId === actor.id && senior && APPROVAL_SLOT_ROLES.backup.includes(actor.role)) {
    return { ok: true, asBackup: true, status: 403, reason: null };
  }

  const assigned = expense.approverId ? staff.get(expense.approverId) : null;
  return no(
    assigned
      ? `This expense is assigned to ${assigned.name}. Only they, or the backup approver, can decide it.`
      : 'No approver is assigned to this expense yet. An administrator has to assign one first.',
  );
}

/** Why the approver on a waiting expense cannot act, or null when the assignment is sound. */
export function assignmentProblem(expense: Expense, staff: Map<string, Staff>, fallbackBranch = ''): string | null {
  if (expense.status !== 'pending_approval') return null;
  if (!expense.approverId) return 'It was submitted without an approver being assigned.';
  const submitter = { id: expense.createdBy ?? null, role: staff.get(expense.createdBy ?? '')?.user.role ?? 'operations' };
  const approver = staff.get(expense.approverId);
  const problem =
    approverProblem(approver, submitter) ??
    (approver && !seesBranch(approver, expense.branch, fallbackBranch)
      ? `${approver.name} works in ${approver.user.branch?.trim() || fallbackBranch}, so they cannot open ${expense.branch?.trim() || fallbackBranch}'s expenses.`
      : null);
  return problem ? `The assigned approver cannot act: ${problem}` : null;
}

// ── Administration ───────────────────────────────────────────────────────────

function assertMayConfigure(actor: Actor) {
  if (!hasPermission(actor.role, 'expenses.configure_approvals')) {
    throw forbidden('Only someone who configures expense approvals - the CEO - can assign approvers.');
  }
}

/** Who could be handed this expense. */
export async function eligibleApprovers(actor: Actor, expenseId: string): Promise<ApproverOption[]> {
  assertMayConfigure(actor);
  const expense = await db.expenses.byId(expenseId);
  if (!expense) throw notFound('That expense');
  const staff = await staffDirectory();
  const submitter = { id: expense.createdBy ?? null, role: staff.get(expense.createdBy ?? '')?.user.role ?? 'operations' };
  return toOptions(staff).filter((option) => !approverProblem(staff.get(option.id), submitter));
}

/** Hand a waiting expense to a named approver, on the record. */
export async function reassignApprover(actor: Actor, expenseId: string, approverId: string, reason: string) {
  assertMayConfigure(actor);
  const expense = await db.expenses.byId(expenseId);
  if (!expense) throw notFound('That expense');
  if (expense.status !== 'pending_approval') throw badRequest('Only an expense waiting for approval can be reassigned.');

  const staff = await staffDirectory();
  const submitter = { id: expense.createdBy ?? null, role: staff.get(expense.createdBy ?? '')?.user.role ?? 'operations' };
  const candidate = staff.get(approverId);
  const problem = approverProblem(candidate, submitter);
  if (problem) throw badRequest(problem);
  if (expense.approverId === approverId) throw badRequest(`${candidate!.name} is already the approver.`);

  await db.expenses.update(expenseId, {
    approverId,
    approverEmail: candidate!.user.email,
    approvalRoute: 'manual',
    approverAssignedAt: now(),
    updatedAt: now(),
  } as never);
  await recordAudit({
    actor,
    action: 'expense.approver_reassigned',
    entity: 'expense',
    entityId: expenseId,
    meta: {
      number: expense.number,
      from: expense.approverId ?? null,
      fromEmail: expense.approverEmail ?? null,
      to: approverId,
      toEmail: candidate!.user.email,
      reason: reason.trim(),
    },
  });
  await tellApprover({ ...expense, approverId }, staff.get(expense.createdBy ?? '')?.name ?? 'A member of staff');
}

/**
 * Give every waiting expense that has no workable approver one from the
 * current routing.
 *
 * An expense whose assignment is sound is left exactly as it is. Nothing else
 * on any expense changes - the id, number, amount, category, dates, submitter,
 * receipt and payments are untouched; only the approver fields are written,
 * and each write is on the audit trail with what it replaced.
 */
export async function routeWaitingExpenses(actor: Actor, routing: ExpenseApprovalRouting) {
  assertMayConfigure(actor);
  const [expenses, staff, branches] = await Promise.all([
    db.expenses.find({ where: { status: 'pending_approval' } }),
    staffDirectory(),
    configuredBranches(),
  ]);
  const fallback = branches[0]!;

  const assigned: { id: string; number: string; approver: string }[] = [];
  const unresolved: { id: string; number: string; problem: string }[] = [];
  let unchanged = 0;

  for (const expense of expenses) {
    if (!assignmentProblem(expense, staff, fallback)) {
      unchanged += 1;
      continue;
    }
    const submitter = staff.get(expense.createdBy ?? '');
    const routed = routeExpense(
      { id: expense.createdBy ?? null, role: submitter?.user.role ?? 'operations' },
      expense.branch,
      routing,
      staff,
      [expense.createdBy],
      fallback,
    );
    if ('problem' in routed) {
      unresolved.push({ id: expense.id, number: expense.number, problem: routed.problem });
      continue;
    }

    await db.expenses.update(expense.id, {
      approverId: routed.approver.user.id,
      approverEmail: routed.approver.user.email,
      approvalRoute: routed.route,
      approverAssignedAt: now(),
      updatedAt: now(),
    } as never);
    await recordAudit({
      actor,
      action: 'expense.approver_assigned',
      entity: 'expense',
      entityId: expense.id,
      meta: {
        number: expense.number,
        previous: expense.approverId ?? null,
        previousEmail: expense.approverEmail ?? null,
        to: routed.approver.user.id,
        toEmail: routed.approver.user.email,
        route: routed.route,
        reason: 'Routed by "Route waiting expenses"',
      },
    });
    await tellApprover({ ...expense, approverId: routed.approver.user.id }, submitter?.name ?? 'A member of staff');
    assigned.push({ id: expense.id, number: expense.number, approver: routed.approver.name });
  }

  return { assigned, unchanged, unresolved };
}

// ── Settings ─────────────────────────────────────────────────────────────────

function toOptions(staff: Map<string, Staff>): ApproverOption[] {
  return [...staff.values()]
    .map((entry) => ({
      id: entry.user.id,
      name: entry.name,
      email: entry.user.email,
      role: entry.user.role,
      active: isActive(entry),
      canApprove: hasPermission(entry.user.role, 'expenses.approve'),
      slots: APPROVAL_SLOTS.filter((slot) => !slotProblem(entry, slot)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Staff the routing settings can choose from, each with the slots they fit. */
export async function approverOptions(): Promise<ApproverOption[]> {
  return toOptions(await staffDirectory());
}

const FIELDS: [keyof Omit<ExpenseApprovalRouting, 'branchApprovers'>, ApprovalSlot][] = [
  ['defaultApproverId', 'default'],
  ['backupApproverId', 'backup'],
  ['managerExpensesApproverId', 'manager_expenses'],
  ['accountsExpensesApproverId', 'accounts_expenses'],
  ['ceoExpensesApproverId', 'ceo_expenses'],
];

/** Routing in one canonical shape: empty slots null, removed branches gone. */
export function normalizeRouting(input: Partial<ExpenseApprovalRouting>, branches: string[]): ExpenseApprovalRouting {
  return {
    defaultApproverId: input.defaultApproverId || null,
    backupApproverId: input.backupApproverId || null,
    managerExpensesApproverId: input.managerExpensesApproverId || null,
    accountsExpensesApproverId: input.accountsExpensesApproverId || null,
    ceoExpensesApproverId: input.ceoExpensesApproverId || null,
    // A branch that has been removed takes its approver with it.
    branchApprovers: Object.fromEntries(
      Object.entries(input.branchApprovers ?? {})
        .filter(([branch, id]) => Boolean(id) && branches.includes(branch))
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}

export const sameRouting = (a: ExpenseApprovalRouting, b: ExpenseApprovalRouting) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Check routing before it is saved: everyone newly chosen active, permitted
 * and of a role the slot allows, and no one left as the only possible approver
 * of their own expenses. Slots that are unchanged are not re-judged - a person
 * suspended since does no harm there (routing passes over them) and must not
 * stop someone saving the branch list.
 */
export async function validateRouting(
  routing: ExpenseApprovalRouting,
  previous: ExpenseApprovalRouting,
): Promise<ExpenseApprovalRouting> {
  if (sameRouting(routing, previous)) return routing;
  const [staff, branches] = await Promise.all([staffDirectory(), configuredBranches()]);
  const fallback = branches[0]!;
  const problems: Record<string, string[]> = {};

  for (const [field, slot] of FIELDS) {
    const id = routing[field];
    const problem = id && id !== previous[field] ? slotProblem(staff.get(id), slot) : null;
    if (problem) problems[field] = [problem];
  }
  for (const [branch, id] of Object.entries(routing.branchApprovers)) {
    const candidate = staff.get(id);
    const problem =
      id !== previous.branchApprovers[branch]
        ? (slotProblem(candidate, 'branch') ??
          (candidate && !seesBranch(candidate, branch, fallback)
            ? `${candidate.name} works in ${candidate.user.branch?.trim() || fallback}, so they cannot approve ${branch}'s expenses. Choose someone in ${branch}, or a central approver.`
            : null))
        : null;
    if (problem) problems[`branchApprovers.${branch}`] = [problem];
  }
  if (Object.keys(problems).length > 0) {
    throw badRequest(Object.values(problems)[0]![0]!, problems);
  }

  /*
    Circular routing: someone who would be the ONLY approver of their own
    expenses - the CEO named as the approver for the CEO's expenses with no
    backup, say. Their expenses route back to themselves, which is refused,
    so they could never be approved. A gap that is merely unconfigured is not
    circular and is allowed; the submission reports it when it happens.
  */
  const designated = new Set<string>([
    ...FIELDS.map(([field]) => routing[field]).filter((id): id is string => Boolean(id)),
    ...Object.values(routing.branchApprovers),
  ]);
  for (const id of designated) {
    const person = staff.get(id);
    if (!person) continue;
    const submitter = { id, role: person.user.role };
    const withSelf = routeExpense(submitter, null, routing, staff, [], fallback);
    const withoutSelf = routeExpense(submitter, null, routing, staff, [submitter.id], fallback);
    if ('problem' in withoutSelf && !('problem' in withSelf) && withSelf.approver.user.id === id) {
      throw badRequest(
        `${person.name} would be the only approver of their own expenses, which nobody may approve themselves. Choose someone else, or add a backup approver who is not ${person.name}.`,
      );
    }
  }

  return routing;
}
