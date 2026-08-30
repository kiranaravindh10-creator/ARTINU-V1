import {
  Bell,
  ClipboardCheck,
  Images,
  LayoutDashboard,
  MapPin,
  Upload,
  UserRound,
} from 'lucide-react';
import { DashboardFooter } from '@/components/layout/DashboardFooter';
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
  return (
    <DashboardShell
      area="Studio"
      basePath="/studio"
      groups={groups}
      /*
        The Studio had no footer, and that matters more here than it looks.
        DashboardFooter is where the phone number, the WhatsApp link and the
        support address live, and the artist area has no support route at all -
        a photographer's only route to a human was a pane buried in their
        profile page.
      */
      footer={
        <DashboardFooter
          note="Stuck on an upload, unsure whether a photograph will work on a wall, or waiting on a decision? Message us - we would rather answer than have you guess."
          links={[
            { to: '/studio/upload', label: 'Upload photographs' },
            { to: '/studio/portfolio', label: 'Your portfolio' },
            { to: '/studio/installations', label: 'Where your work is hanging' },
            { to: '/gallery', label: 'Browse the gallery' },
          ]}
        />
      }
    />
  );
}
