import {
  Bell,
  ClipboardCheck,
  Images,
  LayoutDashboard,
  MapPin,
  Upload,
  UserRound,
} from 'lucide-react';
import { DashboardShell, type DashboardNavGroup } from '@/components/layout/DashboardShell';

/** Artist Experience — SDD Module 3. */
const groups: DashboardNavGroup[] = [
  {
    items: [
      { to: '/studio', label: 'Workspace', icon: LayoutDashboard, end: true },
      { to: '/studio/upload', label: 'Upload Work', icon: Upload },
      { to: '/studio/submissions', label: 'Uploaded Works', icon: ClipboardCheck },
      { to: '/studio/portfolio', label: 'Portfolio', icon: Images },
    ],
  },
  {
    title: 'Your work out there',
    items: [
      { to: '/studio/installations', label: 'Installations', icon: MapPin },
    ],
  },
  {
    title: 'Account',
    items: [
      { to: '/studio/notifications', label: 'Notifications', icon: Bell, badgeKey: 'notifications' },
      { to: '/studio/profile', label: 'Profile', icon: UserRound },
    ],
  },
];

export default function ArtistLayout() {
  return <DashboardShell area="Studio" basePath="/studio" groups={groups} />;
}
