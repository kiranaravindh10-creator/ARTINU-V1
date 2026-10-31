import type { Permission } from '@artinu/shared';
import { useQuery } from '@tanstack/react-query';
import { SubNav } from '@/features/console/components/SubNav';
import { usePermissions } from '@/lib/permissions';
import { qk } from '@/lib/query';
import { consoleOrdersService } from '@/services/console-orders.service';
import { financeService } from '@/services/finance.service';

/**
 * The views that make up Money: what came in, what went out, what is waiting
 * for your approval, the register of both, the invoices issued, and the
 * reports drawn from them. Each appears only for a role that can open it, so a
 * member of operations sees Expenses alone and finance sees the lot.
 *
 * There is no GST tab: GST is off in this version (GST_FEATURE_ENABLED on the
 * server), and a page of zeroes invites the question of why. The page is kept
 * in the code for when it is turned on.
 */
const ITEMS: { to: string; label: string; module: string; permission?: Permission; end?: boolean }[] = [
  { to: '/console/payments', label: 'Payments', module: 'payments' },
  { to: '/console/expenses', label: 'Expenses', module: 'expenses', end: true },
  { to: '/console/expenses/approvals', label: 'Awaiting my approval', module: 'expenses', permission: 'expenses.approve' },
  { to: '/console/finance/transactions', label: 'Accounts & transactions', module: 'finance' },
  { to: '/console/finance/invoices', label: 'Invoices', module: 'finance' },
  { to: '/console/finance', label: 'Financial reports', module: 'finance', end: true },
];

export function MoneyNav() {
  const { can, hasModule } = usePermissions();
  const approves = can('expenses.approve') && hasModule('expenses');

  // Only what is routed to them - backup cover is listed on the page, not counted here.
  const { data: waiting } = useQuery({
    queryKey: qk.admin.expenseApprovals,
    queryFn: () => financeService.approvals(),
    enabled: approves,
  });
  const { data: prices } = useQuery({
    queryKey: qk.admin.priceApprovals,
    queryFn: () => consoleOrdersService.priceApprovals(),
    enabled: approves && can('orders.approve_price'),
  });
  const mine =
    (waiting ?? []).filter((expense) => !expense.decidesAsBackup).length +
    (prices ?? []).filter((price) => price.mayDecide).length;

  return (
    <SubNav
      items={ITEMS.filter((item) => hasModule(item.module) && (!item.permission || can(item.permission))).map(
        ({ to, label, end }) => ({
          to,
          label,
          end,
          count: to === '/console/expenses/approvals' && waiting ? mine : undefined,
        }),
      )}
    />
  );
}
