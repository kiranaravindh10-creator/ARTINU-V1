import type {
  AccountAccess,
  AccountType,
  AuditLogEntry,
  InviteUserInput,
  OrderMoney,
  Paginated,
  Payment,
  PhotographerLink,
  Profile,
  SupportSession,
  SupportSessionGrant,
  User,
} from '@artinu/shared';
import { api } from '@/lib/api';

/** People & access → User Management. See server/src/routes/people.routes.ts. */

export interface ManagedUser extends User {
  profile: Profile | null;
  accountType: AccountType;
  businesses: string[];
  access: AccountAccess;
  photographer: PhotographerLink | null;
}

export interface ManagedUserDetail {
  user: User;
  profile: Profile | null;
  accountType: AccountType;
  access: AccountAccess;
  photographer: PhotographerLink | null;
  spaces: { id: string; name: string; city: string; code: string | null }[];
  clients: { id: string; name: string; city: string }[];
  employee: { employeeCode: string | null; jobTitle: string | null; department: string | null; status: string | null } | null;
  orders: { id: string; reference: string; status: string; placedAt: string; spaceId: string; total: number; money: OrderMoney }[];
  payments: (Payment & { orderReference: string })[];
  supportSessions: SupportSession[];
  activity: AuditLogEntry[];
}

type Query = Record<string, string | number | boolean | undefined>;

export const peopleService = {
  async users(params: Query = {}) {
    const { data } = await api.get<Paginated<ManagedUser>>('/admin/people/users', { params });
    return data;
  },

  async user(id: string) {
    const { data } = await api.get<ManagedUserDetail>(`/admin/people/users/${id}`);
    return data;
  },

  /** An account in that role and a single-use link to choose a password - never a password. */
  async invite(input: InviteUserInput) {
    const { data } = await api.post<{ user: User; delivered: boolean; expiresAt: string }>('/admin/people/invitations', input);
    return data;
  },

  async resendInvitation(id: string) {
    const { data } = await api.post<{ delivered: boolean; expiresAt: string }>(`/admin/people/users/${id}/invitation`);
    return data;
  },

  /** The CEO approves IT access someone else granted. */
  async approve(id: string) {
    const { data } = await api.post<User>(`/admin/people/users/${id}/approve`);
    return data;
  },

  async updateProfile(id: string, input: { fullName: string; displayName?: string | null; phone?: string | null; city?: string | null }) {
    const { data } = await api.patch<Profile>(`/admin/people/users/${id}/profile`, input);
    return data;
  },

  async changeRole(id: string, role: string, reason?: string) {
    const { data } = await api.post<User>(`/admin/people/users/${id}/role`, { role, reason });
    return data;
  },

  /** The configured branches, and whether the person asking sees all of them or one. */
  async branches() {
    const { data } = await api.get<{ branches: string[]; scope: { all: boolean; branch: string } }>('/admin/people/branches');
    return data;
  },

  async changeBranch(id: string, branch: string, reason?: string) {
    const { data } = await api.post<User>(`/admin/people/users/${id}/branch`, { branch, reason });
    return data;
  },

  async suspend(id: string, reason: string) {
    const { data } = await api.post<User>(`/admin/people/users/${id}/suspend`, { reason });
    return data;
  },

  async reactivate(id: string, reason: string) {
    const { data } = await api.post<User>(`/admin/people/users/${id}/reactivate`, { reason });
    return data;
  },

  async passwordReset(id: string, mode: 'email' | 'link') {
    const { data } = await api.post<{ mode: 'email' | 'link'; delivered?: boolean; link?: string; expiresAt: string }>(
      `/admin/people/users/${id}/password`,
      { mode },
    );
    return data;
  },

  async forcePasswordChange(id: string) {
    const { data } = await api.post<User>(`/admin/people/users/${id}/force-password-change`);
    return data;
  },

  async revokeSessions(id: string) {
    const { data } = await api.post<User>(`/admin/people/users/${id}/revoke-sessions`);
    return data;
  },

  async changeEmail(id: string, newEmail: string, reason: string) {
    const { data } = await api.post<{ pendingEmail: string; delivered: boolean; expiresAt: string }>(
      `/admin/people/users/${id}/email`,
      { newEmail, reason },
    );
    return data;
  },

  async startSupportSession(userId: string, reason: string) {
    const { data } = await api.post<SupportSessionGrant>('/admin/people/support-sessions', { userId, reason });
    return data;
  },

  async supportSessions(userId?: string) {
    const { data } = await api.get<SupportSession[]>('/admin/people/support-sessions', { params: { userId } });
    return data;
  },

  async endSupportSession(id: string) {
    const { data } = await api.post<SupportSession>(`/admin/people/support-sessions/${id}/end`);
    return data;
  },

  async confirmEmailChange(token: string) {
    const { data } = await api.post<{ email: string }>('/auth/confirm-email-change', { token });
    return data;
  },
};
