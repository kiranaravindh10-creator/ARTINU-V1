import type {
  AuthSession,
  RemovalRequest,
  RemovalRequestStatus,
  Warning,
  WarningCategory,
} from '@artinu/shared';
import { api } from '@/lib/api';

/** What a reviewer sees about one photographer. */
export interface ArtistModerationRecord {
  user: {
    id: string;
    email: string;
    role: string;
    status: string;
    statusReason: string | null;
    statusChangedAt: string | null;
    emailVerified: boolean;
    createdAt: string;
    lastLoginAt: string | null;
  };
  profile: {
    fullName: string;
    displayName: string | null;
    photographerCode: string | null;
    guidelinesVersion: string | null;
    guidelinesAcceptedAt: string | null;
  } | null;
  artworks: { total: number; byStatus: Record<string, number> };
  warnings: Warning[];
  warningLimit: number;
  eligibleForEnforcement: boolean;
  removalRequests: RemovalRequest[];
}

export const moderationService = {
  // ── The signed-in photographer's own view ────────────────────────────────

  async myWarnings() {
    const { data } = await api.get<{ items: Warning[]; count: number; limit: number }>(
      '/moderation/me/warnings',
    );
    return data;
  },

  async acknowledgeWarnings() {
    await api.post('/moderation/me/warnings/acknowledge');
  },

  async myRemovalRequests() {
    const { data } = await api.get<{ items: RemovalRequest[] }>('/moderation/me/removal-requests');
    return data.items;
  },

  async requestRemoval(input: { kind: 'artwork' | 'account'; artworkId?: string; reason?: string }) {
    const { data } = await api.post<RemovalRequest>('/moderation/me/removal-requests', input);
    return data;
  },

  // ── Staff ────────────────────────────────────────────────────────────────

  async artist(id: string) {
    const { data } = await api.get<ArtistModerationRecord>(`/moderation/artists/${id}`);
    return data;
  },

  async issueWarning(
    id: string,
    input: { reason: string; category?: WarningCategory; notes?: string; artworkId?: string },
  ) {
    const { data } = await api.post<{
      warning: Warning;
      count: number;
      eligibleForEnforcement: boolean;
    }>(`/moderation/artists/${id}/warnings`, input);
    return data;
  },

  async withdrawWarning(warningId: string) {
    await api.delete(`/moderation/warnings/${warningId}`);
  },

  async suspend(id: string, reason: string) {
    const { data } = await api.post(`/moderation/artists/${id}/suspend`, { reason });
    return data;
  },

  async ban(id: string, reason: string) {
    const { data } = await api.post(`/moderation/artists/${id}/ban`, { reason });
    return data;
  },

  async restore(id: string, reason: string) {
    const { data } = await api.post(`/moderation/artists/${id}/restore`, { reason });
    return data;
  },

  async removeArtwork(artworkId: string, reason: string) {
    const { data } = await api.post(`/moderation/artworks/${artworkId}/remove`, { reason });
    return data;
  },

  async removalRequests(status?: RemovalRequestStatus) {
    const { data } = await api.get<{ items: RemovalRequest[]; overdue: RemovalRequest[] }>(
      '/moderation/removal-requests',
      { params: status ? { status } : undefined },
    );
    return data;
  },

  async markPhysicallyRemoved(id: string) {
    const { data } = await api.post<RemovalRequest>(
      `/moderation/removal-requests/${id}/physically-removed`,
    );
    return data;
  },

  async setRemovalStatus(id: string, status: RemovalRequestStatus, notes?: string) {
    const { data } = await api.post<RemovalRequest>(`/moderation/removal-requests/${id}/status`, {
      status,
      notes,
    });
    return data;
  },

  /** Runs the §13 and §14 sweeps now rather than waiting for the nightly one. */
  async runLifecycle() {
    const { data } = await api.post('/moderation/lifecycle/run');
    return data;
  },
};

/**
 * Email verification by code.
 *
 * Lives here rather than in auth.service because it is a short flow of its own
 * and none of it belongs on the sign-in path.
 */
export const verificationService = {
  async status() {
    const { data } = await api.get<{ emailVerified: boolean; email: string }>(
      '/auth/verification/status',
    );
    return data;
  },

  /** Sends a code. Also the resend path — the cooldown is enforced server-side. */
  async send() {
    const { data } = await api.post<{ challengeId: string; expiresAt: string; sentTo: string }>(
      '/auth/verification/send',
    );
    return data;
  },

  /** Returns a fresh session, so the verified badge appears without a reload. */
  async confirm(challengeId: string, code: string) {
    const { data } = await api.post<AuthSession>('/auth/verification/confirm', {
      challengeId,
      code,
    });
    return data;
  },
};
