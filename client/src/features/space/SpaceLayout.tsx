import {
  Bell,
  Building2,
  FileText,
  Heart,
  LayoutDashboard,
  MessageCircle,
  Images,
  RefreshCw,
  Frame,
  Truck,
  UserRound,
} from 'lucide-react';
import { DashboardFooter } from '@/components/layout/DashboardFooter';
import { DashboardShell, type DashboardNavGroup } from '@/components/layout/DashboardShell';

/** Space Experience — SDD Module 2. */
const groups: DashboardNavGroup[] = [
  {
    items: [
      { to: '/space', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/space/collections', label: 'Browse art', icon: Images },
      { to: '/space/wishlist', label: 'Wishlist', icon: Heart },
      { to: '/space/cart', label: 'Cart', icon: Frame },
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
      /*
        A life ring is the stock "support" glyph and says nothing about what
        happens: you send a message and a person answers. MessageCircle says
        that.
      */
      { to: '/space/support', label: 'Support', icon: MessageCircle },
    ],
  },
];

export default function SpaceLayout() {
  return (
    <DashboardShell
      area="Space"
      basePath="/space"
      groups={groups}
      footer={
        <DashboardFooter
          links={[
            { to: '/space/collections', label: 'Browse the collection' },
            { to: '/space/rotation', label: 'Your next rotation' },
            { to: '/space/orders', label: 'Your orders' },
            { to: '/space/support', label: 'Support' },
          ]}
        />
      }
    />
  );
}
