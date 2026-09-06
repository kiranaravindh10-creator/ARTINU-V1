import type {
  ActiveCampaign,
  CampaignInput,
  CampaignStatus,
  SocialMediaCampaign,
} from '@artinu/shared';
import { api } from '@/lib/api';

/** A campaign as the dashboard lists it — the row plus its derived status. */
export type CampaignRow = SocialMediaCampaign & { status: CampaignStatus };

/** An artist the team may promote. Exactly the public /artists shape. */
export interface PromotableArtist {
  id: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  city: string | null;
  artworkCount: number;
}

/** A space the team may promote — the projection the API allows, no more. */
export interface PromotableSpace {
  id: string;
  code: string | null;
  name: string;
  type: string;
  city: string;
  imageUrl: string | null;
}

export const campaignService = {
  /** The popup, for anonymous visitors. Returns null when nothing is running. */
  async active() {
    const { data } = await api.get<ActiveCampaign | null>('/campaigns/active');
    return data;
  },

  async list() {
    const { data } = await api.get<CampaignRow[]>('/campaigns');
    return data;
  },

  async create(input: CampaignInput) {
    const { data } = await api.post<SocialMediaCampaign>('/campaigns', input);
    return data;
  },

  async update(id: string, input: CampaignInput) {
    const { data } = await api.put<SocialMediaCampaign>(`/campaigns/${id}`, input);
    return data;
  },

  /** Start or stop a campaign without resubmitting the whole form. */
  async setActive(id: string, active: boolean) {
    const { data } = await api.patch<CampaignRow>(`/campaigns/${id}/active`, { active });
    return data;
  },

  async remove(id: string) {
    await api.delete(`/campaigns/${id}`);
  },

  async promotableArtists() {
    const { data } = await api.get<PromotableArtist[]>('/campaigns/promotable/artists');
    return data;
  },

  async promotableSpaces() {
    const { data } = await api.get<PromotableSpace[]>('/campaigns/promotable/spaces');
    return data;
  },
};
