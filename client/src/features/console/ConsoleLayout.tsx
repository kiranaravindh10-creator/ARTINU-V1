import { ROLE_MODULES } from '@artinu/shared';
import {
  Banknote,
  Bell,
  Building2,
  ChartNoAxesColumn,
  Eye,
  Frame,
  Landmark,
  LayoutDashboard,
  LayoutTemplate,
  Megaphone,
  Printer,
  ReceiptIndianRupee,
  ServerCog,
  SlidersHorizontal,
  Truck,
  UserRound,
  Users,
} from 'lucide-react';
import * as React from 'react';
import { DashboardShell, type DashboardNavGroup } from '@/components/layout/DashboardShell';
import { useAuth } from '@/contexts/AuthContext';

/**
 * ARTINU Console — SDD Module 4.
 *
 * The sidebar is assembled from ROLE_MODULES, the same map the API authorises
 * against, so a Manager never sees a link to a page the server would refuse.
 *
 * It lists SECTIONS, not pages. A CEO holds every module, and the earlier
 * one-row-per-page nav gave them sixteen destinations across six headings —
 * enough that finding anything meant reading the whole column. Pages that are
 * two views of one subject (spaces and their consultations, artists and their
 * applications, people and the audit trail of what they did) now share a
 * section and separate with a {@link SubNav} strip inside the page, where the
 * relationship between them is legible.
 */
interface ConsoleItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Any one of these modules is enough to see the section. */
  modules: string[];
  /**
   * The routes that select this row (see router.tsx). Written out rather than
   * inferred from `to`, because "everything under /console/users" would claim
   * Employees as well, and "everything under /console/content" would claim
   * Homepage and Announcements. The most specific match wins.
   */
  match: string[];
}

const GROUPS: { title?: string; items: ConsoleItem[] }[] = [
  {
    items: [
      { to: '/console', label: 'Overview', icon: LayoutDashboard, modules: ['overview'], match: ['/console'] },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/console/orders', label: 'Orders', icon: Truck, modules: ['orders'], match: ['/console/orders/*'] },
      { to: '/console/printing', label: 'Print & frame', icon: Printer, modules: ['printing'], match: ['/console/printing/*'] },
      { to: '/console/frames', label: 'Frame inventory', icon: Frame, modules: ['printing'], match: ['/console/frames/*'] },
      { to: '/console/spaces', label: 'Spaces', icon: Building2, modules: ['spaces'], match: ['/console/spaces/*'] },
    ],
  },
  {
    title: 'Curation',
    items: [
      { to: '/console/moderation', label: 'Photo review', icon: Eye, modules: ['moderation'], match: ['/console/moderation/*'] },
      { to: '/console/artists', label: 'Artists', icon: Users, modules: ['artists'], match: ['/console/artists/*'] },
    ],
  },
  {
    title: 'Money',
    items: [
      {
        to: '/console/payments',
        label: 'Payments',
        icon: Banknote,
        modules: ['payments', 'accounts'],
        match: ['/console/payments/*'],
      },
      {
        to: '/console/expenses',
        label: 'Expenses',
        icon: ReceiptIndianRupee,
        modules: ['expenses'],
        match: ['/console/expenses/*'],
      },
      {
        to: '/console/finance',
        label: 'Finance',
        icon: Landmark,
        modules: ['finance'],
        // /console/accounts was the GST page; it now forwards to Finance.
        match: ['/console/finance/*', '/console/accounts/*'],
      },
      { to: '/console/reports', label: 'Reports', icon: ChartNoAxesColumn, modules: ['reports'], match: ['/console/reports/*'] },
    ],
  },
  {
    title: 'Administration',
    items: [
      /*
        Sending a notification to an audience. It had the same address as the
        personal inbox under "You" - /console/notifications - so both rows lit
        together, and the inbox could not be opened at all: the router took
        the first of the two routes, so the bell showed the CEO, manager and IT
        this page, and showed everyone else "no access".
      */
      {
        to: '/console/send-notifications',
        label: 'Notifications',
        icon: Megaphone,
        modules: ['announcements'],
        match: ['/console/send-notifications'],
      },
      {
        to: '/console/users',
        label: 'People & access',
        icon: UserRound,
        modules: ['users'],
        match: ['/console/users', '/console/users/audit', '/console/users/:userId'],
      },
      {
        to: '/console/users/employees',
        label: 'Employees',
        icon: Users,
        modules: ['users'],
        match: ['/console/users/employees'],
      },
      /*
        One homepage, one link.

        There were two: "Content manager" and "Content dashboard", both
        under the `system` module, which no manager holds — so the person
        who maintains the homepage could not see either of them. The
        homepage editor is now the first entry and sits under `content`,
        which the manager, the IT team and the CEO all hold; the curated ID
        lists behind the second link are a separate, rarer job and are
        labelled as such.
      */
      {
        to: '/console/content/manager',
        label: 'Homepage',
        icon: LayoutTemplate,
        modules: ['content'],
        match: ['/console/content/manager'],
      },
      {
        to: '/console/content',
        label: 'Curated lists',
        icon: SlidersHorizontal,
        modules: ['content'],
        match: ['/console/content'],
      },
      /*
        Sending a notification to every artist or space owner.

        Filed under `content` on purpose rather than under `system` or
        `users`: it is the only module manager, IT and CEO all hold, and
        those are precisely the three roles meant to have this. Under
        `system` a manager could not reach it, which is the same mistake the
        homepage editor had before it was moved here.
      */
      {
        to: '/console/content/announcements',
        label: 'Announcements',
        icon: Megaphone,
        modules: ['content'],
        match: ['/console/content/announcements'],
      },
      { to: '/console/system', label: 'System', icon: ServerCog, modules: ['system'], match: ['/console/system/*'] },
    ],
  },
];

/**
 * A section that spans two modules links to whichever half the viewer can
 * actually open, so a role holding only one of them never lands on a page the
 * server will refuse.
 */
const SECTION_FALLBACK: Record<string, { module: string; to: string }[]> = {
  '/console/payments': [
    { module: 'payments', to: '/console/payments' },
    // Was the GST page, which is hidden while GST is off.
    { module: 'finance', to: '/console/finance' },
  ],
};

export default function ConsoleLayout() {
  const { user } = useAuth();
  const role = user?.role ?? '';

  // Built once per role, not on every render: the shell matches the address
  // against these rows, and a new array each time would redo that work.
  const groups = React.useMemo<DashboardNavGroup[]>(() => {
    const allowed = new Set(ROLE_MODULES[role] ?? []);
    const built: DashboardNavGroup[] = GROUPS.map((group) => ({
      title: group.title,
      items: group.items
        .filter((item) => item.modules.some((module) => allowed.has(module)))
        .map(({ modules, ...item }) => {
          const options = SECTION_FALLBACK[item.to];
          const reachable = options?.find((option) => allowed.has(option.module));
          return reachable && reachable.to !== item.to
            ? { ...item, to: reachable.to, match: [`${reachable.to}/*`] }
            : item;
        }),
    })).filter((group) => group.items.length > 0);

    built.push({
      title: 'You',
      items: [
        {
          to: '/console/notifications',
          label: 'Notifications',
          icon: Bell,
          badgeKey: 'notifications',
          match: ['/console/notifications'],
        },
        { to: '/console/profile', label: 'Your account', icon: UserRound, match: ['/console/profile'] },
      ],
    });
    return built;
  }, [role]);

  return <DashboardShell area="Console" basePath="/console" groups={groups} variant="sidebar" />;
}
