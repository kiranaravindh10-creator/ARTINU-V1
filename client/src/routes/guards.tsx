import { INTERNAL_ROLES, ROLE_MODULES, type Role } from '@artinu/shared';
import * as React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Logo } from '@/components/layout/Logo';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

/** Full-page hold while the stored token is exchanged for a session. */
export function BootSplash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas">
      <Logo size="large" asLink={false} className="animate-pulse" />
      <span className="font-label text-[0.625rem] uppercase tracking-[0.18em] text-subtle">
        Preparing your space
      </span>
    </div>
  );
}

/**
 * Gate for authenticated areas. Unauthenticated visitors are sent to sign-in
 * with a `next` param so they land where they were headed; signed-in users with
 * the wrong role are redirected to their own dashboard rather than shown a
 * dead end.
 */
export function ProtectedRoute({
  roles,
  children,
}: {
  roles?: Role[];
  children?: React.ReactNode;
}) {
  const { isAuthenticated, isBooting, user, homePath } = useAuth();
  const location = useLocation();

  if (isBooting) return <BootSplash />;

  if (!isAuthenticated) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/signin?next=${next}`} replace />;
  }

  /**
   * An ARTINU-issued password is a credential we have seen, so it buys exactly
   * one thing: the ability to replace itself (requirements §1). Checked before
   * the role test so the redirect target is the same for every role.
   */
  if (user?.mustChangePassword && location.pathname !== '/account/password') {
    return <Navigate to="/account/password" replace />;
  }

  if (roles && user && !roles.includes(user.role)) {
    return <Navigate to={homePath} replace />;
  }

  return <>{children ?? <Outlet />}</>;
}

/** Console areas are further restricted per internal role (requirements §15). */
export function ModuleRoute({ module, children }: { module: string; children?: React.ReactNode }) {
  const { user, isBooting } = useAuth();

  if (isBooting) return <BootSplash />;
  if (!user) return <Navigate to="/signin" replace />;

  const allowed = ROLE_MODULES[user.role] ?? [];
  if (!allowed.includes(module)) {
    return <ModuleDenied module={module} />;
  }

  return <>{children ?? <Outlet />}</>;
}

function ModuleDenied({ module }: { module: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <p className="eyebrow">Restricted</p>
      <h1 className="font-display text-3xl text-ink">You don&rsquo;t have access to {module}.</h1>
      <p className="max-w-md text-sm text-muted">
        Your role doesn&rsquo;t include this module. If you think that&rsquo;s wrong, ask the CEO or
        IT team to update your access.
      </p>
      <Button variant="outline" asChild className="mt-2">
        <a href="/console">Back to overview</a>
      </Button>
    </div>
  );
}

/** Keeps signed-in users off the auth screens. */
export function GuestOnlyRoute({ children }: { children?: React.ReactNode }) {
  const { isAuthenticated, isBooting, homePath } = useAuth();
  const location = useLocation();

  if (isBooting) return <BootSplash />;

  if (isAuthenticated) {
    const next = new URLSearchParams(location.search).get('next');
    return <Navigate to={next || homePath} replace />;
  }

  return <>{children ?? <Outlet />}</>;
}

export const isInternalRole = (role: Role) => (INTERNAL_ROLES as readonly string[]).includes(role);
