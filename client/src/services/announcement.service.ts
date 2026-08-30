import type { AnnouncementInput } from '@artinu/shared';
import { api } from '@/lib/api';

export interface AudienceOption {
  value: string;
  label: string;
  /** Active accounts the audience currently covers. */
  recipients: number;
}

export interface SentAnnouncement {
  id: string;
  at: string;
  by: string | null;
  audience: string | null;
  title: string | null;
  recipients: number | null;
}

export interface SendResult {
  sent: number;
  audience: string;
  audienceLabel: string;
}

export const announcementService = {
  /** Audiences with a live recipient count, so the console can say who this reaches. */
  async audiences() {
    const { data } = await api.get<{ audiences: AudienceOption[] }>('/announcements/audiences');
    return data.audiences;
  },

  /** Broadcasts already sent, read back out of the audit log. */
  async history() {
    const { data } = await api.get<{ sent: SentAnnouncement[] }>('/announcements/history');
    return data.sent;
  },

  async send(input: AnnouncementInput) {
    const { data } = await api.post<SendResult>('/announcements', input);
    return data;
  },

  async sendDirect(input: Omit<AnnouncementInput, 'audience'> & { email: string }) {
    const { data } = await api.post<SendResult>('/announcements/direct', input);
    return data;
  },
};
