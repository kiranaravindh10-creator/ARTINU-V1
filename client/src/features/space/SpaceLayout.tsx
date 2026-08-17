import {
  Bell,
  Building2,
  FileText,
  Heart,
  LayoutDashboard,
  LifeBuoy,
  Images,
  RefreshCw,
  ShoppingBag,
  Truck,
  UserRound,
} from 'lucide-react';
import { DashboardShell, type DashboardNavGroup } from '@/components/layout/DashboardShell';

/** Space Experience — SDD Module 2. */
const groups: DashboardNavGroup[] = [
  {
    items: [
      { to: '/space', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/space/collections', label: 'Browse art', icon: Images },
      { to: '/space/wishlist', label: 'Wishlist', icon: Heart },
      { to: '/space/cart', label: 'Cart', icon: ShoppingBag },
    ],
  },
  {
    title: 'Your walls',
    items: [
      { to: '/space/orders', label: 'Orders', icon: Truck },
      { to: '/space/rotation', label: 'Rotation', icon: RefreshCw },
      { to: '/space/invoices', label: 'Invoices', icon: FileText },
    ],
  },
  {
    title: 'Account',
    items: [
      { to: '/space/notifications', label: 'Notifications', icon: Bell, badgeKey: 'notifications' },
      { to: '/space/register-space', label: 'My Spaces', icon: Building2 },
      { to: '/space/profile', label: 'Account', icon: UserRound },
      { to: '/space/support', label: 'Support', icon: LifeBuoy },
    ],
  },
];

export default function SpaceLayout() {
  return <DashboardShell area="Space" basePath="/space" groups={groups} />;
}
