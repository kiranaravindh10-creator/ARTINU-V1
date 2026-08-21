import { Bell, ChevronLeft, LogOut, Menu, Settings, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import * as React from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/dialog';
import { Avatar } from '@/components/ui/display';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import { useAuth } from '@/contexts/AuthContext';
import { useUnreadNotifications } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

export interface DashboardNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** Renders a count chip on the right of the row. */
  badgeKey?: 'notifications';
}

export interface DashboardNavGroup {
  title?: string;
  items: DashboardNavItem[];
}

/**
 * Two shapes, chosen by what the area is for.
 *
 * `rail` — icons only. Right for Space and Studio, where the nav is short, the
 * screens are photographic, and the sidebar should get out of the way.
 *
 * `sidebar` — labelled and grouped. Right for the Console, which is a working
 * tool: a CEO sees sixteen destinations across six departments, and sixteen
 * unlabelled icons in one column is not navigation, it is a memory test.
 */
export type ShellVariant = 'rail' | 'sidebar';

/**
 * One shell for all three authenticated areas.
 *
 * The rail is icons only, because the labels were carrying no weight the icons
 * and the page title did not already carry — and a 16rem sidebar of text was
 * competing with the photography for the eye. The wordmark stacks over the area
 * name, the current section is a filled bronze chip, and the account controls
 * float over the content rather than sitting in a full-width bar, so a hero
 * photograph can run all the way to the top edge.
 */
export function DashboardShell({
  area,
  basePath,
  groups,
  variant = 'rail',
}: {
  area: string;
  basePath: string;
  groups: DashboardNavGroup[];
  variant?: ShellVariant;
}) {
  const [open, setOpen] = React.useState(false);
  const location = useLocation();

  React.useEffect(() => setOpen(false), [location.pathname]);

  const items = groups.flatMap((group) => group.items);

  if (variant === 'sidebar') {
    return (
      <div className="flex min-h-dvh bg-canvas">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-canvas-soft lg:flex">
          <Link to={basePath} className="flex items-baseline gap-2.5 px-6 py-7 leading-none">
            <span className="font-display text-xl tracking-[-0.02em] text-ink">ARTINU</span>
            <span className="font-label text-[0.5625rem] uppercase tracking-[0.2em] text-subtle">
              {area}
            </span>
          </Link>

          <div className="flex-1 overflow-y-auto px-3 pb-6">
            <SidebarNav groups={groups} />
          </div>

          <Link
            to="/"
            className="flex items-center gap-2 border-t border-line px-6 py-4 text-[0.8125rem] text-muted transition-colors hover:text-ink"
          >
            <ChevronLeft className="size-4" />
            Back to the site
          </Link>
        </aside>

        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="absolute right-4 top-4 z-30 flex items-center gap-2 rounded-full bg-canvas/85 py-1.5 pl-3.5 pr-1.5 shadow-subtle backdrop-blur-md sm:right-6 sm:top-5">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Open navigation"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 bg-canvas p-0">
                <div className="flex h-16 items-center gap-2.5 px-6">
                  <span className="font-display text-xl tracking-[-0.02em] text-ink">ARTINU</span>
                  <span className="font-label text-[0.5625rem] uppercase tracking-[0.2em] text-subtle">
                    {area}
                  </span>
                </div>
                <DrawerNav groups={groups} />
              </SheetContent>
            </Sheet>

            <NotificationBell basePath={basePath} />
            <AccountMenu basePath={basePath} />
          </div>

          <main className="dash-panel flex-1">
            <Outlet />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh bg-canvas">
      {/* ── Icon rail ────────────────────────────────────────────────────── */}
      <aside className="sticky top-0 hidden h-dvh w-20 shrink-0 flex-col items-center border-r border-line-soft bg-canvas py-6 lg:flex">
        <Link
          to={basePath}
          className="flex flex-col items-center gap-1 leading-none transition-opacity hover:opacity-60"
        >
          <span className="font-display text-base tracking-[-0.02em] text-ink">ARTINU</span>
          <span className="font-label text-[0.4375rem] uppercase tracking-[0.2em] text-subtle">
            {area}
          </span>
        </Link>

        <nav className="mt-10 flex flex-1 flex-col items-center gap-1.5" aria-label="Dashboard">
          {items.map((item) => (
            <RailLink key={item.to} item={item} />
          ))}
        </nav>

        <Link
          to="/"
          aria-label="Back to the ARTINU site"
          title="Back to the site"
          className="font-display text-lg text-bronze transition-opacity hover:opacity-60"
        >
          A
        </Link>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* ── Floating account controls ──────────────────────────────────── */}
        <div className="absolute right-4 top-4 z-30 flex items-center gap-2 rounded-full bg-canvas/85 py-1.5 pl-3.5 pr-1.5 shadow-subtle backdrop-blur-md sm:right-6 sm:top-5">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="bg-canvas/80 backdrop-blur-sm lg:hidden"
                aria-label="Open navigation"
              >
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-canvas p-0">
              <div className="flex h-16 items-center gap-2.5 px-6">
                <span className="font-display text-xl tracking-[-0.02em] text-ink">ARTINU</span>
                <span className="font-label text-[0.5625rem] uppercase tracking-[0.2em] text-subtle">
                  {area}
                </span>
              </div>
              <DrawerNav groups={groups} />
            </SheetContent>
          </Sheet>

          <NotificationBell basePath={basePath} />
          <AccountMenu basePath={basePath} />
        </div>

        <main className="dash-panel flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Labelled, grouped navigation — the Console's shape. */
function SidebarNav({ groups }: { groups: DashboardNavGroup[] }) {
  const { count } = useUnreadNotifications();

  return (
    <nav className="flex flex-col gap-7" aria-label="Console">
      {groups.map((group, index) => (
        <div key={group.title ?? index}>
          {group.title && (
            <p className="px-3 pb-2.5 font-label text-[0.5625rem] uppercase tracking-[0.18em] text-subtle">
              {group.title}
            </p>
          )}
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-3 rounded-md px-3 py-2 text-[0.8125rem] transition-colors',
                    isActive
                      ? 'bg-bronze-soft font-medium text-ink'
                      : 'text-muted hover:bg-sand hover:text-ink',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon
                      className={cn(
                        'size-4 shrink-0 stroke-[1.5]',
                        isActive ? 'text-bronze' : 'text-subtle group-hover:text-ink',
                      )}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badgeKey === 'notifications' && count > 0 && (
                      <span className="flex min-w-5 items-center justify-center rounded-full bg-bronze px-1.5 font-label tabular-nums text-[0.5625rem] text-white">
                        {count > 99 ? '99+' : count}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

/** One icon in the rail. The label survives as the accessible name and tooltip. */
function RailLink({ item }: { item: DashboardNavItem }) {
  const { count } = useUnreadNotifications();
  const badge = item.badgeKey === 'notifications' ? count : 0;

  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={item.label}
      aria-label={item.label}
      className={({ isActive }) =>
        cn(
          'relative flex size-10 items-center justify-center rounded-[0.625rem] transition-colors duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze/40',
          isActive ? 'bg-bronze-soft text-bronze' : 'text-subtle hover:bg-sand-soft hover:text-ink',
        )
      }
    >
      <item.icon className="size-[1.125rem] stroke-[1.5]" />
      {badge > 0 && (
        <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-bronze" aria-hidden />
      )}
    </NavLink>
  );
}

/** Mobile drawer keeps the labels — there is room for them there. */
function DrawerNav({ groups }: { groups: DashboardNavGroup[] }) {
  const { count } = useUnreadNotifications();

  return (
    <nav className="flex flex-col gap-6 overflow-y-auto px-3 pb-8" aria-label="Dashboard">
      {groups.map((group, index) => (
        <div key={group.title ?? index} className="flex flex-col gap-0.5">
          {group.title && (
            <p className="px-3 pb-2 font-label text-[0.5625rem] uppercase tracking-[0.18em] text-subtle">
              {group.title}
            </p>
          )}
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-md px-3 py-2 text-[0.8125rem] transition-colors',
                  isActive
                    ? 'bg-bronze-soft font-medium text-ink'
                    : 'text-muted hover:bg-sand-soft hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className={cn(
                      'size-[1.0625rem] shrink-0 stroke-[1.5]',
                      isActive ? 'text-bronze' : 'text-subtle group-hover:text-ink',
                    )}
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badgeKey === 'notifications' && count > 0 && (
                    <span className="flex min-w-5 items-center justify-center rounded-full bg-bronze px-1.5 font-label tabular-nums text-[0.5625rem] text-white">
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      ))}

      <Link
        to="/"
        className="flex items-center gap-2 rounded-md px-3 py-2 text-[0.8125rem] text-muted transition-colors hover:bg-sand-soft hover:text-ink"
      >
        <ChevronLeft className="size-4" />
        Back to site
      </Link>
    </nav>
  );
}

function NotificationBell({ basePath }: { basePath: string }) {
  const { count } = useUnreadNotifications();

  return (
    <Link
      to={`${basePath}/notifications`}
      aria-label={`Notifications, ${count} unread`}
      className="flex items-center gap-2 rounded-full text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze/40"
    >
      <Bell className="size-[1.125rem] stroke-[1.5]" />
      {count > 0 && (
        <span className="flex size-6 items-center justify-center rounded-full bg-bronze-soft font-label tabular-nums text-[0.625rem] text-bronze-deep">
          {count > 99 ? '99' : count}
        </span>
      )}
    </Link>
  );
}

function AccountMenu({ basePath }: { basePath: string }) {
  const { user, profile, signOut } = useAuth();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="ml-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze/40"
          aria-label="Account menu"
        >
          <Avatar
            name={profile?.fullName ?? user?.email}
            src={profile?.avatarUrl}
            className="size-8 ring-1 ring-line"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate">{profile?.fullName ?? 'Your account'}</span>
          <span className="truncate text-xs font-normal text-subtle">{user?.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={`${basePath}/profile`}>
            <User /> Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to={`${basePath}/profile`}>
            <Settings /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={() => void signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The head of a dashboard screen: title in the display serif, one line of plain
 * explanation, a short bronze rule, and the actions that belong to the screen.
 */
export function PanelHeader({
  title,
  description,
  actions,
  eyebrow,
  icon: Icon,
  rule = true,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  icon?: LucideIcon;
  /** The bronze underline. Off for screens that open straight into a table. */
  rule?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mb-9 flex flex-wrap items-start justify-between gap-x-6 gap-y-4',
        // The account pill floats over this corner, so screen actions have to
        // sit clear of it rather than underneath.
        actions && 'pr-[9.5rem]',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <h1 className="flex items-center gap-2.5 font-display text-[2rem] leading-none text-ink sm:text-[2.25rem]">
          {Icon && <Icon className="size-5 shrink-0 stroke-[1.4] text-bronze" aria-hidden />}
          {title}
        </h1>
        {description && <p className="mt-2.5 max-w-2xl text-sm text-muted">{description}</p>}
        {rule && <span className="rule mt-5" />}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

/** Kept for the console, which is a working tool and wants a plainer head. */
export const PageHeader = PanelHeader;

/**
 * A labelled sub-section: mono label, hairline, content, optional right link.
 * Used inside a screen, under the {@link PanelHeader}.
 */
export function Block({
  label,
  hint,
  aside,
  children,
  className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('min-w-0', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-2.5">
        <h2 className="eyebrow eyebrow-muted">{label}</h2>
        {hint && <p className="text-xs text-subtle">{hint}</p>}
        {aside}
      </div>
      <div className="pt-5">{children}</div>
    </section>
  );
}
