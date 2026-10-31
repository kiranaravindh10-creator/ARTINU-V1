/**
 * Granular permissions, layered on top of ROLE_MODULES.
 *
 * ROLE_MODULES answers "which sections of the Console can this role open".
 * That is too coarse for the actions inside a section: everyone who can open
 * Orders may create one, but only some may set their own price; everyone in
 * People & access may look a user up, but only some may sign in as them.
 *
 * The roles are the five that already exist. The business roles the console
 * upgrade talks about map onto them rather than adding conflicting ones:
 *
 *   Super Admin / IT Admin   it_team (and the CEO)
 *   Finance Manager          accounts
 *   Operations Manager       operations
 *   CEO / Business Owner     ceo
 *   Employee                 any staff role, limited to what that role holds
 *
 * One map, read by the API to authorise and by the Console to decide what to
 * show, so the two cannot drift apart - the same reason ROLE_MODULES exists.
 */
export const PERMISSIONS = [
  // ── People & access ──────────────────────────────────────────────────────
  'users.view',
  /** Invite a photographer or a member of staff, and resend an unused invitation. */
  'users.invite',
  'users.edit',
  'users.change_role',
  'users.suspend',
  'users.reset_password',
  /** Generate a single-use reset link and hand it over, rather than email it. */
  'users.reset_link',
  'users.revoke_sessions',
  'users.change_email',
  /** Open an audited, read-only support session as a customer or artist. */
  'users.assist',
  'audit.view',
  /**
   * See and act on every branch's orders, expenses and figures. Without it a
   * member of staff is held to the branch they are assigned to (see branches.ts).
   */
  'branches.view_all',
  /** Move a member of staff to another branch. */
  'branches.assign',

  // ── Money ────────────────────────────────────────────────────────────────
  /** Financial dashboard, transaction register, invoices, financial reports. */
  'finance.view',
  'finance.export',
  'finance.settings',
  /** See every expense. Without it, only your own and those on orders you can open. */
  'expenses.view_all',
  'expenses.create',
  'expenses.approve',
  'expenses.pay',
  'expenses.reverse',
  'expenses.manage_categories',
  /**
   * Decide who approves expenses: the approval routing, the auto-approval
   * limit, and reassigning an expense that is waiting. The CEO's alone by
   * default - whoever holds it could otherwise route their own expenses to
   * themselves, or raise the limit until nothing needs approving at all.
   */
  'expenses.configure_approvals',
  /** Record money received outside the gateway (cash, UPI to the account, bank transfer). */
  'payments.record_offline',

  // ── Orders & clients ─────────────────────────────────────────────────────
  'orders.create',
  /** Set a negotiated unit price, discount or extra charge instead of the tariff. */
  'orders.custom_price',
  /** Approve a price override above the configured threshold. */
  'orders.approve_price',
  /** Confirm an order for production before it is paid. */
  'orders.extend_credit',
  'clients.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS;

export const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  ceo: ALL,
  it_team: [
    'users.view',
    'users.invite',
    'users.edit',
    'users.change_role',
    'users.suspend',
    'users.reset_password',
    'users.reset_link',
    'users.revoke_sessions',
    'users.change_email',
    'users.assist',
    'audit.view',
    // IT administers every account, wherever its holder works.
    'branches.view_all',
    'branches.assign',
  ],
  accounts: [
    // Finance is run centrally: the books are one set across the branches.
    'branches.view_all',
    'finance.view',
    'finance.export',
    'finance.settings',
    'expenses.view_all',
    'expenses.create',
    'expenses.approve',
    'expenses.pay',
    'expenses.reverse',
    'expenses.manage_categories',
    'payments.record_offline',
    'orders.approve_price',
    'orders.extend_credit',
    'clients.manage',
  ],
  manager: [
    'expenses.view_all',
    'expenses.create',
    'expenses.approve',
    'payments.record_offline',
    'orders.create',
    'orders.custom_price',
    'clients.manage',
  ],
  operations: ['expenses.create', 'payments.record_offline', 'orders.create', 'clients.manage'],
};

export function hasPermission(role: string | null | undefined, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role ?? ''] ?? []).includes(permission);
}

/**
 * Who a support session may be opened for.
 *
 * Customers and artists only. Assisting a member of staff would let one admin
 * borrow another's privileges, which is exactly the escalation a support
 * session must never allow.
 */
export const ASSISTABLE_ROLES = ['space_owner', 'artist', 'guest'] as const;

/** How long a support session lasts before it ends on its own. */
export const SUPPORT_SESSION_MINUTES = 30;

/** Account types the People & access filters speak in. */
export const ACCOUNT_TYPES = ['customer', 'artist', 'administrator', 'employee', 'guest'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  customer: 'Customer',
  artist: 'Artist',
  administrator: 'Administrator',
  employee: 'Employee',
  guest: 'Guest',
};

export function accountTypeOf(role: string): AccountType {
  if (role === 'space_owner') return 'customer';
  if (role === 'artist') return 'artist';
  if (role === 'ceo' || role === 'it_team') return 'administrator';
  if (role === 'manager' || role === 'accounts' || role === 'operations') return 'employee';
  return 'guest';
}
