import type {
  Artwork,
  ArtworkUploadInput,
  ArtworkWithArtist,
  GalleryQuery,
  Paginated,
  PublicArtist,
} from '@artinu/shared';
import { api } from '@/lib/api';

export interface GalleryFacetCounts {
  category: Record<string, number>;
  mood: Record<string, number>;
  colors: Record<string, number>;
  orientation: Record<string, number>;
  suitableFor: Record<string, number>;
}

/** Facet arrays go over the wire as comma-joined values (see galleryQuerySchema). */
export function toQueryParams(query: Partial<GalleryQuery>): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) params[key] = value.join(',');
    } else {
      params[key] = value as string | number;
    }
  }
  return params;
}

export const catalogService = {
  /** Ask the server whether a code applies to this basket. */
  async validateCoupon(code: string, subtotal: number, spaceId?: string | null) {
    const { data } = await api.post<{
      ok: boolean;
      message: string;
      discount: number;
      code: string | null;
    }>('/orders/validate-coupon', { code, subtotal, spaceId: spaceId ?? undefined });
    return data;
  },

  async gallery(query: Partial<GalleryQuery>) {
    const { data } = await api.get<Paginated<ArtworkWithArtist>>('/artworks', {
      params: toQueryParams(query),
    });
    return data;
  },

  async facets() {
    const { data } = await api.get<GalleryFacetCounts>('/artworks/facets');
    return data;
  },

  async artwork(id: string) {
    const { data } = await api.get<ArtworkWithArtist>(`/artworks/${id}`);
    return data;
  },

  async related(id: string, limit = 8) {
    const { data } = await api.get<ArtworkWithArtist[]>(`/artworks/${id}/related`, {
      params: { limit },
    });
    return data;
  },

  async artists(params: { q?: string; genre?: string; featured?: boolean; page?: number; pageSize?: number } = {}) {
    const { data } = await api.get<Paginated<PublicArtist>>('/users/artists', { params });
    return data;
  },

  async artist(slug: string) {
    const { data } = await api.get<PublicArtist>(`/users/artists/${slug}`);
    return data;
  },

  async artistArtworks(slug: string, params: { category?: string; page?: number; pageSize?: number } = {}) {
    const { data } = await api.get<Paginated<ArtworkWithArtist>>(`/users/artists/${slug}/artworks`, {
      params,
    });
    return data;
  },

  async follow(targetId: string, targetType: 'artist' | 'user' = 'artist') {
    const { data } = await api.post<{ following: boolean; followers: number; followingCount: number }>(
      '/users/follow',
      { targetId, targetType },
    );
    return data;
  },

  async unfollow(targetId: string) {
    const { data } = await api.delete<{ following: boolean; followers: number; followingCount: number }>(
      `/users/follow/${targetId}`,
    );
    return data;
  },

  async followers(userId: string, params: { page?: number; pageSize?: number } = {}) {
    const { data } = await api.get<Paginated<{ id: string; name: string; avatarUrl: string | null; slug: string | null }>>(
      `/users/followers/${userId}`,
      { params },
    );
    return data;
  },

  async following(userId: string, params: { page?: number; pageSize?: number } = {}) {
    const { data } = await api.get<Paginated<{ id: string; name: string; avatarUrl: string | null; slug: string | null }>>(
      `/users/following/${userId}`,
      { params },
    );
    return data;
  },

  async wishlist() {
    const { data } = await api.get<ArtworkWithArtist[]>('/artworks/wishlist');
    return data;
  },

  async toggleWishlist(artworkId: string) {
    const { data } = await api.post<{ wishlisted: boolean }>(`/artworks/${artworkId}/wishlist`);
    return data;
  },

  // ── Artist-owned work ─────────────────────────────────────────────────────

  async myArtworks(params: { status?: string; page?: number; pageSize?: number } = {}) {
    const { data } = await api.get<Paginated<Artwork>>('/artworks/mine', { params });
    return data;
  },

  async upload(input: ArtworkUploadInput & { width?: number; height?: number }) {
    const { data } = await api.post<Artwork>('/artworks', input);
    return data;
  },

  async updateArtwork(id: string, patch: Partial<Artwork>) {
    const { data } = await api.patch<Artwork>(`/artworks/${id}`, patch);
    return data;
  },

  async deleteArtwork(id: string) {
    await api.delete(`/artworks/${id}`);
  },
};
