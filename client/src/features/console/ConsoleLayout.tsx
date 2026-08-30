import { ROLE_MODULES } from '@artinu/shared';
import {
  Banknote,
  Bell,
  Building2,
  ChartNoAxesColumn,
  Eye,
  Frame,
  LayoutDashboard,
  LayoutTemplate,
  Megaphone,
  Printer,
  ServerCog,
  SlidersHorizontal,
  Truck,
  UserRound,
  Users,
} from 'lucide-react';
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
  end?: boolean;
}

const GROUPS: { title?: string; items: ConsoleItem[] }[] = [
  {
    items: [
      { to: '/console', label: 'Overview', icon: LayoutDashboard, modules: ['overview'], end: true },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/console/orders', label: 'Orders', icon: Truck, modules: ['orders'] },
      { to: '/console/printing', label: 'Print & frame', icon: Printer, modules: ['printing'] },
      { to: '/console/frames', label: 'Frame inventory', icon: Frame, modules: ['printing'] },
      { to: '/console/spaces', label: 'Spaces', icon: Building2, modules: ['spaces'] },
    ],
  },
  {
    title: 'Curation',
    items: [
      { to: '/console/moderation', label: 'Photo review', icon: Eye, modules: ['moderation'] },
      { to: '/console/artists', label: 'Artists', icon: Users, modules: ['artists'] },
    ],
  },
  {
    title: 'Money',
    items: [
      { to: '/console/payments', label: 'Payments', icon: Banknote, modules: ['payments', 'accounts'] },
      { to: '/console/reports', label: 'Reports', icon: ChartNoAxesColumn, modules: ['reports'] },
    ],
  },
{
        title: 'Administration',
        items: [
          {
            to: '/console/notifications',
            label: 'Notifications',
            icon: Megaphone,
            modules: ['announcements'],
          },
          { to: '/console/users', label: 'People & access', icon: UserRound, modules: ['users'] },
          { to: '/console/users/employees', label: 'Employees', icon: Users, modules: ['users'] },
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
          { to: '/console/content/manager', label: 'Homepage', icon: LayoutTemplate, modules: ['content'] },
          { to: '/console/content', label: 'Curated lists', icon: SlidersHorizontal, modules: ['content'] },
          { to: '/console/system', label: 'System', icon: ServerCog, modules: ['system'] },
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
    { module: 'accounts', to: '/console/accounts' },
  ],
};

export default function ConsoleLayout() {
  const { user } = useAuth();
  const allowed = new Set(ROLE_MODULES[user?.role ?? ''] ?? []);

  const groups: DashboardNavGroup[] = GROUPS.map((group) => ({
    title: group.title,
    items: group.items
      .filter((item) => item.modules.some((module) => allowed.has(module)))
      .map(({ modules, ...item }) => {
        const options = SECTION_FALLBACK[item.to];
        const reachable = options?.find((option) => allowed.has(option.module));
        return reachable ? { ...item, to: reachable.to } : item;
      }),
  })).filter((group) => group.items.length > 0);

  groups.push({
    title: 'You',
    items: [
      { to: '/console/notifications', label: 'Notifications', icon: Bell, badgeKey: 'notifications' },
      { to: '/console/profile', label: 'Your account', icon: UserRound },
    ],
  });

  return <DashboardShell area="Console" basePath="/console" groups={groups} variant="sidebar" />;
}
