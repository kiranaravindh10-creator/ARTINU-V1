import type {
  Client,
  ClientInput,
  ClientSearchResult,
  ConsoleOrderInput,
  ConsoleQuote,
  ConsoleQuoteInput,
  ExpenseView,
  OfflinePaymentInput,
  Order,
  OrderMoney,
  Payment,
  Space,
} from '@artinu/shared';
import { api } from '@/lib/api';

/** Clients and Console orders. See server/src/routes/console-orders.routes.ts. */

export interface QuoteResult {
  quote: ConsoleQuote;
  total: number;
  discount: number;
  couponApplied: string | null;
  approvalThresholdPercent: number;
}

/** A custom price waiting for a decision - GET /admin/orders/price-approvals. */
export interface PriceApprovalRow {
  id: string;
  reference: string;
  customer: string;
  total: number;
  standardTotal: number | null;
  reductionPercent: number;
  thresholdPercent: number;
  reason: string | null;
  requestedByEmail: string | null;
  requestedAt: string;
  mayDecide: boolean;
}

export interface OrderFinance {
  money: OrderMoney;
  payments: Payment[];
  expenses: ExpenseView[];
  contribution: { orderValue: number; recordedCosts: number; contribution: number } | null;
  client: Client | null;
}

export const consoleOrdersService = {
  async searchClients(q: string) {
    const { data } = await api.get<ClientSearchResult[]>('/admin/clients', { params: { q } });
    return data;
  },

  async checkDuplicate(input: ClientInput) {
    const { data } = await api.post<{ duplicate: string | null }>('/admin/clients/check-duplicate', input);
    return data.duplicate;
  },

  async client(id: string) {
    const { data } = await api.get<{ client: Client; spaces: Space[]; orders: { id: string; reference: string; status: string; total: number; placedAt: string }[] }>(
      `/admin/clients/${id}`,
    );
    return data;
  },

  /** Deliberately attach a client to the account that signs in with `email`. */
  async linkClient(id: string, account: { userId?: string; email?: string }, reason: string) {
    const { data } = await api.post(`/admin/clients/${id}/link`, { ...account, reason });
    return data;
  },

  async priceApprovals() {
    const { data } = await api.get<PriceApprovalRow[]>('/admin/orders/price-approvals');
    return data;
  },

  async quote(input: ConsoleQuoteInput) {
    const { data } = await api.post<QuoteResult>('/admin/orders/quote', input);
    return data;
  },

  async create(input: ConsoleOrderInput) {
    const { data } = await api.post<{ order: Order; money: OrderMoney; replayed: boolean }>('/admin/orders/console', input);
    return data;
  },

  async finance(orderId: string) {
    const { data } = await api.get<OrderFinance>(`/admin/orders/${orderId}/finance`);
    return data;
  },

  async recordPayment(orderId: string, input: OfflinePaymentInput) {
    const { data } = await api.post<{ order: Order; payment: Payment; money: OrderMoney; replayed: boolean }>(
      `/admin/orders/${orderId}/payments`,
      input,
    );
    return data;
  },

  async decidePrice(orderId: string, decision: 'approve' | 'reject', note?: string) {
    const { data } = await api.post<{ order: Order; money: OrderMoney }>(`/admin/orders/${orderId}/price-approval`, {
      decision,
      note,
    });
    return data;
  },
};
