import type {
  ArtistApplication,
  Artwork,
  AuditLogEntry,
  ConsoleAnalytics,
  ConsultationRequest,
  CostBreakdown,
  Installation,
  Order,
  Paginated,
  Payment,
  Payout,
  Profile,
  PublicArtist,
  Space,
  TrendPoint,
  User,
} from '@artinu/shared';
import { api } from '@/lib/api';

export interface AdminUser extends User {
  profile: Profile | null;
}

export interface ReportBundle {
  revenueTrend: TrendPoint[];
  ordersTrend: TrendPoint[];
  topSpaces: { id: string; name: string; orders: number; revenue: number }[];
  topArtists: { id: string; name: string; selections: number; earnings: number }[];
  popularArtworks: { id: string; title: string; selections: number; views: number }[];
  gst: { collected: number; period: string }[];
}

export interface RecordedMail {
  id: string;
  to: string;
  subject: string;
  heading: string;
  body: string;
  html?: string;
  delivered: boolean;
  via: 'smtp' | 'console';
  sentAt: string;
  triggeredBy: { id: string; email: string; role: string } | null;
  requestId: string | null;
  trigger: string | null;
}

export interface Mailbox {
  captured: number;
  delivered: number;
  lastSentAt: string | null;
  smtpConfigured: boolean;
  items: RecordedMail[];
}

export interface SystemHealth {
  uptime: number;
  startedAt: string;
  node: string;
  memory: { rss: number; heapUsed: number; heapTotal: number };
  drivers: Record<string, string>;
  requestCount: number;
  errorCount: number;
  recentErrors: { at: string; status: number; message: string; path: string }[];
  routes: string[];
}

type Query = Record<string, string | number | boolean | undefined>;

export const adminService = {
  async analytics() {
    const { data } = await api.get<ConsoleAnalytics>('/admin/analytics');
    return data;
  },

  async orders(params: Query = {}) {
    const { data } = await api.get<Paginated<Order>>('/admin/orders', { params });
    return data;
  },

  async order(id: string) {
    const { data } = await api.get<Order>(`/orders/${id}`);
    return data;
  },

  async updateOrderStatus(id: string, status: string, note?: string) {
    const { data } = await api.patch<Order>(`/admin/orders/${id}/status`, { status, note });
    return data;
  },

  async updateOrderCost(
    id: string,
    cost: Pick<CostBreakdown, 'frame' | 'printing' | 'logistics' | 'misc'>,
  ) {
    const { data } = await api.patch<Order>(`/admin/orders/${id}/cost`, cost);
    return data;
  },

  async scheduleInstallation(
    id: string,
    input: { scheduledFor: string; installationWindow?: string; technician?: string },
  ) {
    const { data } = await api.post<Installation>(`/admin/orders/${id}/installation`, input);
    return data;
  },

  async moderationQueue(params: Query = {}) {
    const { data } = await api.get<Paginated<Artwork & { artist: PublicArtist }>>('/admin/moderation', {
      params,
    });
    return data;
  },

  async review(id: string, decision: 'approve' | 'reject', note?: string) {
    const { data } = await api.post<Artwork>(`/admin/moderation/${id}`, { decision, note });
    return data;
  },

  async artists(params: Query = {}) {
    const { data } = await api.get<Paginated<PublicArtist>>('/admin/artists', { params });
    return data;
  },

  async applications(params: Query = {}) {
    const { data } = await api.get<Paginated<ArtistApplication>>('/admin/applications', { params });
    return data;
  },

  async decideApplication(id: string, decision: 'accept' | 'reject', note?: string) {
    const { data } = await api.post<ArtistApplication>(`/admin/applications/${id}`, {
      decision,
      note,
    });
    return data;
  },

  async spaces(params: Query = {}) {
    const { data } = await api.get<Paginated<Space>>('/admin/spaces', { params });
    return data;
  },

  async verifySpace(id: string, verified: boolean) {
    const { data } = await api.post<Space>(`/admin/spaces/${id}/verify`, { verified });
    return data;
  },

  async consultations(params: Query = {}) {
    const { data } = await api.get<Paginated<ConsultationRequest>>('/admin/consultations', { params });
    return data;
  },

  async updateConsultation(id: string, status: ConsultationRequest['status']) {
    const { data } = await api.post<ConsultationRequest>(`/admin/consultations/${id}`, { status });
    return data;
  },

  async printingQueue() {
    const { data } = await api.get<Order[]>('/admin/printing');
    return data;
  },

  async payments(params: Query = {}) {
    const { data } = await api.get<Paginated<Payment>>('/admin/payments', { params });
    return data;
  },

  async payouts(params: Query = {}) {
    const { data } = await api.get<Paginated<Payout>>('/admin/payouts', { params });
    return data;
  },

  async payPayout(id: string) {
    const { data } = await api.post<Payout>(`/admin/payouts/${id}/pay`);
    return data;
  },

  async reports() {
    const { data } = await api.get<ReportBundle>('/admin/reports');
    return data;
  },

  async users(params: Query = {}) {
    const { data } = await api.get<Paginated<AdminUser>>('/admin/users', { params });
    return data;
  },

  async updateUser(id: string, patch: { role?: string; status?: string }) {
    const { data } = await api.patch<User>(`/admin/users/${id}`, patch);
    return data;
  },

  /**
   * Permanently deletes an account and everything belonging to it. Returns a
   * count of what went, so the Console can report it rather than just claiming
   * success.
   */
  async deleteUser(id: string) {
    const { data } = await api.delete<{
      email: string;
      role: string;
      spaces: number;
      artworks: number;
      orders: number;
      invoices: number;
      filesRemoved: number;
      filesFailed: number;
    }>(`/admin/users/${id}`);
    return data;
  },

  async createUser(input: { email: string; role: string; fullName?: string }) {
    const { data } = await api.post<User>(`/admin/users`, input);
    return data;
  },

  async audit(params: Query = {}) {
    const { data } = await api.get<Paginated<AuditLogEntry>>('/admin/audit', { params });
    return data;
  },

  async mailbox(params: Query = {}) {
    const { data } = await api.get<Mailbox>('/admin/mail', { params });
    return data;
  },

  async mail(id: string) {
    const { data } = await api.get<RecordedMail>(`/admin/mail/${id}`);
    return data;
  },

  async sendTestMail(to: string) {
    const { data } = await api.post<{ delivered: boolean; smtpConfigured: boolean; message: string }>(
      '/admin/mail/test',
      { to },
    );
    return data;
  },

  async clearMailbox() {
    const { data } = await api.post<{ cleared: number }>('/admin/mail/clear');
    return data;
  },

  async system() {
    const { data } = await api.get<SystemHealth>('/admin/system');
    return data;
  },
};
