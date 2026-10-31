import { hasPermission, ROLE_MODULES, type Permission } from '@artinu/shared';
import * as React from 'react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * What the signed-in member of staff may do, from the same map the API
 * authorises against (shared/permissions.ts). Used to decide what to SHOW -
 * the server still refuses anything the role does not hold.
 */
export function usePermissions() {
  const { user } = useAuth();
  const role = user?.role;
  return React.useMemo(
    () => ({
      can: (permission: Permission) => hasPermission(role, permission),
      hasModule: (module: string) => (ROLE_MODULES[role ?? ''] ?? []).includes(module),
    }),
    [role],
  );
}
