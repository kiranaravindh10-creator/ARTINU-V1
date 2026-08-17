import type { Notification, Paginated } from '@artinu/shared';
import { api } from '@/lib/api';

export const notificationService = {
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
