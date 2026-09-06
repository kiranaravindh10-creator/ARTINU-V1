import { Bell, LayoutDashboard, MapPin, Megaphone, Plus, UserRound } from 'lucide-react';
import { DashboardFooter } from '@/components/layout/DashboardFooter';
import { DashboardShell, type DashboardNavGroup } from '@/components/layout/DashboardShell';

/**
 * Social Media — a fourth authenticated area, alongside Space, Studio and the
 * Console.
 *
 * It uses the same DashboardShell as the other three, so it inherits ARTINU's
 * navigation, header, account pill and responsive behaviour rather than
 * introducing a second look (requirements §11).
 *
 * `rail` rather than `sidebar`: the variant note on DashboardShell says the
 * labelled sidebar earns its width when a role has sixteen destinations across
 * six departments, and the icon rail is right when the nav is short and the
 * screens are photographic. This area has four destinations and is all posters.
 */
const groups: DashboardNavGroup[] = [
  {
    items: [
      { to: '/social-media', label: 'Today', icon: LayoutDashboard, end: true },
      { to: '/social-media/campaigns', label: 'Campaigns', icon: Megaphone },
      { to: '/social-media/new', label: 'Create Campaign', icon: Plus },
    ],
  },
  {
    title: 'Promote',
    items: [
      { to: '/social-media/artists', label: 'Artists', icon: UserRound },
      { to: '/social-media/spaces', label: 'Spaces', icon: MapPin },
    ],
  },
  {
    title: 'Account',
    items: [
      // The same notification list every other area uses — one inbox per
      // account, not a second notification system for this role.
      { to: '/social-media/notifications', label: 'Notifications', icon: Bell, badgeKey: 'notifications' },
    ],
  },
];

export default function SocialMediaLayout() {
  return (
    <DashboardShell
      area="Social"
      basePath="/social-media"
      groups={groups}
      footer={
        <DashboardFooter
          note="A campaign goes live the moment you switch it on, and comes down the moment you switch it off. If you are unsure how something will look to a visitor, use Preview before you start it."
          links={[
            { to: '/social-media/new', label: 'Create a campaign' },
            { to: '/social-media/artists', label: 'Artists you can promote' },
            { to: '/social-media/spaces', label: 'Spaces you can promote' },
            { to: '/', label: 'View the public site' },
          ]}
        />
      }
    />
  );
}
