import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

type ContentUpdateEvent = {
  type: 'hero-slides' | 'featured-collections' | 'cafes' | 'collaboration-slides';
  action: 'create' | 'update' | 'delete' | 'reorder';
  id?: string;
  ids?: string[];
  timestamp: string;
};

type SSECallbacks = {
  onHeroSlidesUpdate?: () => void;
  onFeaturedCollectionsUpdate?: () => void;
  onCafesUpdate?: () => void;
  onCollaborationSlidesUpdate?: () => void;
};

export function useContentSSE(callbacks?: SSECallbacks) {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);

  const invalidateQueries = useCallback((type: ContentUpdateEvent['type']) => {
    queryClient.invalidateQueries({ queryKey: ['content-manager', type] });
    queryClient.invalidateQueries({ queryKey: ['content-manager', type, 'active'] });
    /*
      The homepage now reads all of this from one aggregated payload
      (hooks/useHomepage.ts), so every content type has to invalidate it.
      Without this line a manager's save would still refresh the console and
      leave the live homepage showing the previous version until its own
      staleTime expired — or, for a returning visitor, until the remembered
      copy in localStorage was replaced.
    */
    queryClient.invalidateQueries({ queryKey: ['homepage'] });

    switch (type) {
      case 'hero-slides':
        queryClient.invalidateQueries({ queryKey: ['content', 'homepage_hero'] });
        break;
      case 'featured-collections':
        queryClient.invalidateQueries({ queryKey: ['content', 'featured_artists'] });
        break;
      case 'cafes':
        queryClient.invalidateQueries({ queryKey: ['content', 'dashboard_cafes'] });
        break;
      case 'collaboration-slides':
        queryClient.invalidateQueries({ queryKey: ['content-manager', 'collaboration-slides', 'active'] });
        break;
    }

    callbacks?.onHeroSlidesUpdate?.();
    callbacks?.onFeaturedCollectionsUpdate?.();
    callbacks?.onCafesUpdate?.();
    callbacks?.onCollaborationSlidesUpdate?.();
  }, [queryClient, callbacks]);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource('/api/events/content', {
      withCredentials: true,
    });

    eventSource.onopen = () => {
      reconnectAttempts.current = 0;
    };

    eventSource.addEventListener('content-updated', (event) => {
      try {
        const data: ContentUpdateEvent = JSON.parse(event.data);
        invalidateQueries(data.type);
      } catch (err) {
        console.warn('Failed to parse SSE event:', err);
      }
    });

    eventSource.addEventListener('connected', () => {
      reconnectAttempts.current = 0;
    });

    eventSource.onerror = () => {
      eventSource.close();

      if (reconnectAttempts.current < 5) {
        const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000);
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttempts.current++;
          connect();
        }, delay);
      }
    };

    eventSourceRef.current = eventSource;
  }, [invalidateQueries]);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);
}

export function disconnectContentSSE() {
  // This is a no-op since the hook manages its own connection
}