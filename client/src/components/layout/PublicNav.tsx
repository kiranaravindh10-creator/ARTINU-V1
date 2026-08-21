import { ArrowUpRight, Bell, LayoutGrid, LogOut, Menu, Search, ShoppingBag, User } from 'lucide-react';
import * as React from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from '@/components/layout/Logo';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetTrigger } from '@/components/ui/dialog';
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
import { useCart } from '@/contexts/CartContext';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/spaces', label: 'Spaces' },
  { to: '/artists', label: 'Artists' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/about', label: 'About Us' },
];

export function PublicNav() {
  const [scrolled, setScrolled] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { isAuthenticated, user, profile, homePath, signOut } = useAuth();
  const { count } = useCart();
  const location = useLocation();
  const navigate = useNavigate();

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the mobile drawer whenever the route changes.
  React.useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 w-full transition-all duration-300 ease-[var(--ease-out-soft)]',
        scrolled
          ? 'border-b border-line bg-canvas/85 backdrop-blur-md supports-[backdrop-filter]:bg-canvas/70'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      <div className="mx-auto flex h-[4.5rem] w-full max-w-[104rem] items-center gap-6 px-5 sm:px-8 lg:px-12">
        <Logo />

        <nav className="ml-auto hidden items-center gap-9 lg:flex" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'relative py-1 font-label text-[0.6875rem] uppercase tracking-[0.16em] transition-colors',
                  isActive ? 'text-ink' : 'text-muted hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {item.label}
                  <span
                    className={cn(
                      'absolute -bottom-0.5 left-0 h-px w-full origin-left bg-ink transition-transform duration-300 ease-[var(--ease-out-soft)]',
                      isActive ? 'scale-x-100' : 'scale-x-0',
                    )}
                  />
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1 lg:ml-4 lg:gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Search photographs"
            onClick={() => navigate('/gallery')}
            className="hidden sm:inline-flex"
          >
            <Search />
          </Button>

          {isAuthenticated && user?.role === 'space_owner' && (
            <Button variant="ghost" size="icon" asChild aria-label={`Cart, ${count} items`}>
              <Link to="/space/cart" className="relative">
                <ShoppingBag />
                {count > 0 && (
                  <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-bronze font-label tabular-nums text-[0.5625rem] text-white">
                    {count > 9 ? '9+' : count}
                  </span>
                )}
              </Link>
            </Button>
          )}

          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="ml-1 rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze/40"
                  aria-label="Account menu"
                >
                  <Avatar
                    name={profile?.fullName ?? user?.email}
                    src={profile?.avatarUrl}
                    className="size-9"
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
                  <Link to={homePath}>
                    <LayoutGrid /> Dashboard
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to={`${homePath}/notifications`}>
                    <Bell /> Notifications
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to={`${homePath}/profile`}>
                    <User /> Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => void signOut()}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button variant="ghost" size="sm" asChild className="hidden lg:inline-flex">
              <Link to="/signin">Sign In</Link>
            </Button>
          )}

          <Button shape="pill" size="sm" asChild className="hidden gap-1.5 sm:inline-flex">
            <Link to="/lets-talk">
              Let&rsquo;s Talk
              <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full max-w-xs">
              <Logo className="mb-4" />
              <nav className="flex flex-col" aria-label="Mobile">
                {NAV_ITEMS.map((item) => (
                  <SheetClose asChild key={item.to}>
                    <NavLink
                      to={item.to}
                      className={({ isActive }) =>
                        cn(
                          'border-b border-line-soft py-4 font-display text-2xl transition-colors',
                          isActive ? 'text-bronze' : 'text-ink hover:text-bronze',
                        )
                      }
                    >
                      {item.label}
                    </NavLink>
                  </SheetClose>
                ))}
              </nav>

              <div className="mt-auto flex flex-col gap-3 pt-6">
                {isAuthenticated ? (
                  <>
                    <Button asChild>
                      <Link to={homePath}>Go to dashboard</Link>
                    </Button>
                    <Button variant="outline" onClick={() => void signOut()}>
                      Sign out
                    </Button>
                  </>
                ) : (
                  <>
                    <Button asChild>
                      <Link to="/lets-talk">Let&rsquo;s Talk</Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link to="/signin">Sign In</Link>
                    </Button>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
