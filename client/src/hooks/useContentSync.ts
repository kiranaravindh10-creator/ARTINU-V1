import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface ContentPointer {
  ids: string[];
  updatedAt: string;
}

type ContentType = 'heroSlides' | 'featuredCollections' | 'cafes' | 'collaborationSlides';

type ContentSyncCallbacks = {
  onHeroSlidesUpdate?: () => void;
  onFeaturedCollectionsUpdate?: () => void;
  onCafesUpdate?: () => void;
  onCollaborationSlidesUpdate?: () => void;
};

/**
 * Content state sync using TanStack Query invalidation.
 * Replaces Firebase Firestore onSnapshot with queryClient-based approach.
 * Content pointers are expected to be managed server-side via the ARTINU API.
 */
export function useContentSync(callbacks?: ContentSyncCallbacks) {
  const queryClient = useQueryClient();
  const unsubscribersRef = useRef<(() => void)[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const invalidateContent = useCallback((type: ContentType) => {
    queryClient.invalidateQueries({ queryKey: ['content-manager', type] });
    queryClient.invalidateQueries({ queryKey: ['content-manager', type, 'active'] });

    switch (type) {
      case 'heroSlides':
        queryClient.invalidateQueries({ queryKey: ['content', 'homepage_hero'] });
        callbacks?.onHeroSlidesUpdate?.();
        break;
      case 'featuredCollections':
        queryClient.invalidateQueries({ queryKey: ['content', 'featured_artists'] });
        callbacks?.onFeaturedCollectionsUpdate?.();
        break;
      case 'cafes':
        queryClient.invalidateQueries({ queryKey: ['content', 'dashboard_cafes'] });
        callbacks?.onCafesUpdate?.();
        break;
      case 'collaborationSlides':
        queryClient.invalidateQueries({
          queryKey: ['content-manager', 'collaborationSlides', 'active'],
        });
        callbacks?.onCollaborationSlidesUpdate?.();
        break;
    }
  }, [queryClient, callbacks]);

  useEffect(() => {
    // No Firebase dependency — content sync is driven by
    // explicit API calls (SSE/webhook) or manual invalidation.
    // The hook remains available for future real-time subscription
    // migration to Supabase Realtime, but for now it is a no-op
    // that keeps the UI consistent with the previous API surface.
    setIsConnected(true);

    return () => {
      unsubscribersRef.current = [];
      setIsConnected(false);
    };
  }, [invalidateContent]);

  return { isConnected };
}

export function disconnectContentSync() {
  // No-op — the hook manages its own cleanup
}