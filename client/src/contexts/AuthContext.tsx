import { INTERNAL_ROLES, type AuthSession, type Profile, type Role, type User } from '@artinu/shared';
import * as React from 'react';
import { tokenStore, UNAUTHORIZED_EVENT } from '@/lib/api';
import { queryClient } from '@/lib/query';
import { authService } from '@/services/auth.service';

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  isAuthenticated: boolean;
  /** True while the very first session lookup is in flight. */
  isBooting: boolean;
  hasRole: (...roles: Role[]) => boolean;
  isInternal: boolean;
  /** Where this user's dashboard lives. */
  homePath: string;
  setSession: (session: AuthSession) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (profile: Profile) => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function homePathForRole(role: Role | undefined | null): string {
  if (!role) return '/';
  if (role === 'artist') return '/studio';
  if (role === 'space_owner') return '/space';
  if ((INTERNAL_ROLES as readonly string[]).includes(role)) return '/console';
  return '/';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [status, setStatus] = React.useState<AuthContextValue['status']>(
    tokenStore.get() ? 'loading' : 'unauthenticated',
  );
  const [isBooting, setIsBooting] = React.useState(Boolean(tokenStore.get()));

  const clear = React.useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setProfile(null);
    setStatus('unauthenticated');
    queryClient.clear();
  }, []);

  const setSession = React.useCallback((session: AuthSession) => {
    tokenStore.set(session.accessToken);
    setUser(session.user);
    setProfile(session.profile);
    setStatus('authenticated');
    setIsBooting(false);
  }, []);

  const refresh = React.useCallback(async () => {
    if (!tokenStore.get()) {
      setStatus('unauthenticated');
      setIsBooting(false);
      return;
    }
    try {
      const session = await authService.session();
      setUser(session.user);
      setProfile(session.profile);
      setStatus('authenticated');
    } catch {
      // A stale or rejected token: drop it rather than leaving the UI in limbo.
      clear();
    } finally {
      setIsBooting(false);
    }
  }, [clear]);

  // Restore the session on first paint.
  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  // The axios interceptor fires this when the API rejects our token mid-session.
  React.useEffect(() => {
    const onUnauthorized = () => clear();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [clear]);

  const signOut = React.useCallback(async () => {
    await authService.signOut();
    clear();
  }, [clear]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      status,
      isAuthenticated: status === 'authenticated',
      isBooting,
      hasRole: (...roles: Role[]) => Boolean(user && roles.includes(user.role)),
      isInternal: Boolean(user && (INTERNAL_ROLES as readonly string[]).includes(user.role)),
      homePath: homePathForRole(user?.role),
      setSession,
      refresh,
      signOut,
      updateProfile: setProfile,
    }),
    [user, profile, status, isBooting, setSession, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
