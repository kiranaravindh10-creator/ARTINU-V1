import type {
  ArtistAnalytics,
  ArtworkWithArtist,
  ConsoleAnalytics,
  Installation,
  Invoice,
  Order,
  Paginated,
  Payment,
  PriceBreakdown,
  RotationCycle,
  Space,
  SpaceInput,
  SpaceOwnerAnalytics,
} from '@artinu/shared';
import { api } from '@/lib/api';

export const spaceService = {
  async list() {
    const { data } = await api.get<Space[]>('/spaces');
    return data;
  },

  async get(id: string) {
    const { data } = await api.get<Space>(`/spaces/${id}`);
    return data;
  },

  async create(input: SpaceInput) {
    const { data } = await api.post<Space>('/spaces', input);
    return data;
  },

  async update(id: string, patch: Partial<SpaceInput>) {
    const { data } = await api.patch<Space>(`/spaces/${id}`, patch);
    return data;
  },

  async recommendations(id: string, limit = 12) {
    const { data } = await api.get<ArtworkWithArtist[]>(`/spaces/${id}/recommendations`, {
      params: { limit },
    });
    return data;
  },
};

export interface CreateOrderPayload {
  spaceId: string;
  items: { artworkId: string; quantity: number; frame: Record<string, string> }[];
  couponCode?: string | null;
  includeSecurityDeposit?: boolean;
  notes?: string | null;
}

export const orderService = {
  /** Server-authoritative checkout preview. */
  async quote(payload: CreateOrderPayload) {
    const { data } = await api.post<PriceBreakdown>('/orders/quote', payload);
    return data;
  },

  async create(payload: CreateOrderPayload) {
    const { data } = await api.post<Order>('/orders', payload);
    return data;
  },

  async list(params: { status?: string; page?: number; pageSize?: number } = {}) {
    const { data } = await api.get<Paginated<Order>>('/orders', { params });
    return data;
  },

  async get(id: string) {
    const { data } = await api.get<Order>(`/orders/${id}`);
    return data;
  },

  async cancel(id: string, reason?: string) {
    const { data } = await api.post<Order>(`/orders/${id}/cancel`, { reason });
    return data;
  },
};

export const paymentService = {
  async create(orderId: string) {
    const { data } = await api.post<Payment>('/payments', { orderId });
    return data;
  },

  async get(id: string) {
    const { data } = await api.get<Payment>(`/payments/${id}`);
    return data;
  },

  async verify(id: string, input: { reference?: string | null; simulate?: 'success' | 'failure' } = {}) {
    const { data } = await api.post<{ payment: Payment; order: Order }>(
      `/payments/${id}/verify`,
      input,
    );
    return data;
  },

  async retry(id: string) {
    const { data } = await api.post<Payment>(`/payments/${id}/retry`);
    return data;
  },
};

export const invoiceService = {
  async list() {
    const { data } = await api.get<Invoice[]>('/invoices');
    return data;
  },

  async get(id: string) {
    const { data } = await api.get<{ invoice: Invoice; order: Order }>(`/invoices/${id}`);
    return data;
  },

  /** Streams the GST invoice and hands it to the browser as a download. */
  async download(invoice: Invoice) {
    const response = await api.get<Blob>(`/invoices/${invoice.id}/download`, {
      responseType: 'blob',
    });
    const url = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${invoice.number}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};

export const rotationService = {
  async list() {
    const { data } = await api.get<RotationCycle[]>('/rotation');
    return data;
  },

  async get(id: string) {
    const { data } = await api.get<RotationCycle & { current: ArtworkWithArtist[]; proposed: ArtworkWithArtist[] }>(
      `/rotation/${id}`,
    );
    return data;
  },

  async approve(id: string) {
    const { data } = await api.post<RotationCycle>(`/rotation/${id}/approve`);
    return data;
  },

  async requestChanges(id: string, note: string) {
    const { data } = await api.post<RotationCycle>(`/rotation/${id}/request-changes`, { note });
    return data;
  },
};

export type DashboardAnalytics = SpaceOwnerAnalytics | ArtistAnalytics | ConsoleAnalytics;

export const analyticsService = {
  async me<T extends DashboardAnalytics>() {
    const { data } = await api.get<T>('/analytics/me');
    return data;
  },
};

export const installationService = {
  async mine() {
    const { data } = await api.get<Installation[]>('/analytics/me/installations');
    return data;
  },
};
