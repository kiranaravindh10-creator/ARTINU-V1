import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/query';
import { notificationService } from '@/services/notification.service';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Unread badge shown in the dashboard shell. Polls gently — every important
 * event must surface in-product (tech stack: "no email-only notification
 * dependency"), but this is a calm interface, not a live ticker.
 */
export function useUnreadNotifications() {
  const { isAuthenticated } = useAuth();

  const { data = 0, isLoading } = useQuery({
    queryKey: [...qk.notifications, 'unread-count'],
    queryFn: () => notificationService.unreadCount(),
    enabled: isAuthenticated,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return { count: data, isLoading };
}

export function useNotifications(params: { unread?: boolean; page?: number } = {}) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: [...qk.notifications, params],
    queryFn: () => notificationService.list(params),
    enabled: isAuthenticated,
  });
}

export function useNotificationActions() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.notifications });

  const markRead = useMutation({
    mutationFn: (id: string) => notificationService.markRead(id),
    onSuccess: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onSuccess: invalidate,
  });

  const archive = useMutation({
    mutationFn: (id: string) => notificationService.archive(id),
    onSuccess: invalidate,
  });

  return { markRead, markAllRead, archive };
}
