import type { AnnouncementInput, Notification, Paginated } from '@artinu/shared';
import { api } from '@/lib/api';

export const notificationService = {
  /**
   * Send one notification to a whole audience. Manager, IT and CEO only — the
   * server enforces that; this is the console's side of it.
   */
  async announce(input: AnnouncementInput) {
    const { data } = await api.post<{ sent: number; audience: string }>(
      '/notifications/announce',
      input,
    );
    return data;
  },

  async list(params: { unread?: boolean; page?: number; pageSize?: number } = {}) {
    const { data } = await api.get<Paginated<Notification>>('/notifications', { params });
    return data;
  },

  async unreadCount() {
    const { data } = await api.get<{ count: number }>('/notifications/unread-count');
    return data.count;
  },

  async markRead(id: string) {
    const { data } = await api.post<Notification>(`/notifications/${id}/read`);
    return data;
  },

  async markAllRead() {
    await api.post('/notifications/read-all');
  },

  async archive(id: string) {
    const { data } = await api.post<Notification>(`/notifications/${id}/archive`);
    return data;
  },
};
