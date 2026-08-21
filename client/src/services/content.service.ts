import { api } from '@/lib/api';
import { DEFAULT_SLIDESHOW_SETTINGS } from '@artinu/shared';
import type { HeroSlide, FeaturedCollection, Cafe, CollaborationSlide, CreateHeroSlideInput, UpdateHeroSlideInput, CreateFeaturedCollectionInput, UpdateFeaturedCollectionInput, CreateCafeInput, UpdateCafeInput, CreateCollaborationSlideInput, UpdateCollaborationSlideInput, SlideshowSettings } from '@artinu/shared';

/** The `ui_content` row the homepage slideshow settings live in. */
export const SLIDESHOW_CONTENT_ID = 'homepage_slideshow';

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const contentService = {
  /**
   * Uploads one image and returns the URL to store against a slide, a
   * collaboration or a profile.
   *
   * The console used to ask a manager to paste an image URL into a text box,
   * which meant the picture had to be hosted somewhere else first. The server
   * has taken base64 uploads since the artist workspace was built; this is the
   * same endpoint, pointed at the homepage folders.
   */
  async uploadImage(input: { imageBase64: string; folder: 'hero' | 'cafes' | 'featured' | 'collaborations'; fileName?: string }) {
    const { data } = await api.post<{ url: string; path: string }>('/uploads', input);
    return data;
  },

  // UI Content (legacy)
  async getAllContent() {
    const { data } = await api.get('/content');
    return data;
  },

  async getContent(id: string) {
    const { data } = await api.get(`/content/${id}`);
    return data;
  },

  async setContent(id: string, contentData: any) {
    const { data } = await api.put(`/content/${id}`, { data: contentData });
    return data;
  },

  // Homepage slideshow settings

  /**
   * How the carousel plays. The server fills any missing field from the schema
   * defaults, so this resolves to a complete object even on an install where
   * nobody has opened the settings panel — the `??` is only there for a
   * response shape older than that change.
   */
  async getSlideshowSettings(): Promise<SlideshowSettings> {
    const { data } = await api.get<{ data: SlideshowSettings | null }>(`/content/${SLIDESHOW_CONTENT_ID}`);
    return data.data ?? { ...DEFAULT_SLIDESHOW_SETTINGS };
  },

  async saveSlideshowSettings(settings: SlideshowSettings) {
    const { data } = await api.put<{ data: SlideshowSettings }>(`/content/${SLIDESHOW_CONTENT_ID}`, {
      data: settings,
    });
    return data.data;
  },

  // Hero Slides
  async getHeroSlides(params?: { page?: number; pageSize?: number; isActive?: boolean; search?: string }) {
    const { data } = await api.get<PaginatedResponse<HeroSlide>>('/content-manager/hero-slides', { params });
    return data;
  },

  async getActiveHeroSlides() {
    const { data } = await api.get<HeroSlide[]>('/content-manager/hero-slides/active');
    return data;
  },

  async getHeroSlide(id: string) {
    const { data } = await api.get<HeroSlide>(`/content-manager/hero-slides/${id}`);
    return data;
  },

  async createHeroSlide(input: CreateHeroSlideInput) {
    const { data } = await api.post<HeroSlide>('/content-manager/hero-slides', input);
    return data;
  },

  async updateHeroSlide(id: string, input: UpdateHeroSlideInput) {
    const { data } = await api.put<HeroSlide>(`/content-manager/hero-slides/${id}`, input);
    return data;
  },

  async deleteHeroSlide(id: string) {
    await api.delete(`/content-manager/hero-slides/${id}`);
  },

  async reorderHeroSlides(items: { id: string; order: number }[]) {
    const { data } = await api.put<HeroSlide[]>('/content-manager/hero-slides/reorder', { items });
    return data;
  },

  // Featured Collections
  async getFeaturedCollections(params?: { page?: number; pageSize?: number; isActive?: boolean; search?: string }) {
    const { data } = await api.get<PaginatedResponse<FeaturedCollection>>('/content-manager/featured-collections', { params });
    return data;
  },

  async getActiveFeaturedCollections() {
    const { data } = await api.get<FeaturedCollection[]>('/content-manager/featured-collections/active');
    return data;
  },

  async getFeaturedCollection(id: string) {
    const { data } = await api.get<FeaturedCollection>(`/content-manager/featured-collections/${id}`);
    return data;
  },

  async createFeaturedCollection(input: CreateFeaturedCollectionInput) {
    const { data } = await api.post<FeaturedCollection>('/content-manager/featured-collections', input);
    return data;
  },

  async updateFeaturedCollection(id: string, input: UpdateFeaturedCollectionInput) {
    const { data } = await api.put<FeaturedCollection>(`/content-manager/featured-collections/${id}`, input);
    return data;
  },

  async deleteFeaturedCollection(id: string) {
    await api.delete(`/content-manager/featured-collections/${id}`);
  },

  async reorderFeaturedCollections(items: { id: string; order: number }[]) {
    const { data } = await api.put<FeaturedCollection[]>('/content-manager/featured-collections/reorder', { items });
    return data;
  },

  // Cafes
  async getCafes(params?: { page?: number; pageSize?: number; isActive?: boolean; search?: string }) {
    const { data } = await api.get<PaginatedResponse<Cafe>>('/content-manager/cafes', { params });
    return data;
  },

  async getActiveCafes() {
    const { data } = await api.get<Cafe[]>('/content-manager/cafes/active');
    return data;
  },

  async getCafe(id: string) {
    const { data } = await api.get<Cafe>(`/content-manager/cafes/${id}`);
    return data;
  },

  async createCafe(input: CreateCafeInput) {
    const { data } = await api.post<Cafe>('/content-manager/cafes', input);
    return data;
  },

  async updateCafe(id: string, input: UpdateCafeInput) {
    const { data } = await api.put<Cafe>(`/content-manager/cafes/${id}`, input);
    return data;
  },

  async deleteCafe(id: string) {
    await api.delete(`/content-manager/cafes/${id}`);
  },

  async reorderCafes(items: { id: string; order: number }[]) {
    const { data } = await api.put<Cafe[]>('/content-manager/cafes/reorder', { items });
    return data;
  },

  // Collaboration Slides
  async getCollaborationSlides(params?: { page?: number; pageSize?: number; isActive?: boolean; search?: string }) {
    const { data } = await api.get<PaginatedResponse<CollaborationSlide>>('/content-manager/collaboration-slides', { params });
    return data;
  },

  async getActiveCollaborationSlides(photographerId?: string) {
    const params = photographerId ? { photographerId } : {};
    const { data } = await api.get<CollaborationSlide[]>('/content-manager/collaboration-slides/active', { params });
    return data;
  },

  async getCollaborationSlide(id: string) {
    const { data } = await api.get<CollaborationSlide>(`/content-manager/collaboration-slides/${id}`);
    return data;
  },

  async createCollaborationSlide(input: CreateCollaborationSlideInput) {
    const { data } = await api.post<CollaborationSlide>('/content-manager/collaboration-slides', input);
    return data;
  },

  async updateCollaborationSlide(id: string, input: UpdateCollaborationSlideInput) {
    const { data } = await api.put<CollaborationSlide>(`/content-manager/collaboration-slides/${id}`, input);
    return data;
  },

  async deleteCollaborationSlide(id: string) {
    await api.delete(`/content-manager/collaboration-slides/${id}`);
  },

  async reorderCollaborationSlides(items: { id: string; order: number }[]) {
    const { data } = await api.put<CollaborationSlide[]>('/content-manager/collaboration-slides/reorder', { items });
    return data;
  },
};