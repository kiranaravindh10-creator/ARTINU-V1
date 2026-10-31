import type {
  ApproverOption,
  ExpenseCategory,
  ExpenseInput,
  ExpensePaymentInput,
  ExpenseView,
  FinanceSettings,
  FinanceSettingsInput,
  Invoice,
  LedgerEntry,
  OrderMoney,
} from '@artinu/shared';
import { api } from '@/lib/api';

/** Money: expenses, the transaction register, the dashboard and exports. */

export interface FinanceDashboard {
  generatedAt: string;
  month: string;
  /** Every branch, or the one branch the person asking works in. */
  scope: { all: boolean; branch: string };
  /** The same figures, branch by branch: orders and collections by the order's branch, costs by the expense's. */
  branches: {
    branch: string;
    orders: number;
    netCollected: number;
    balanceDue: number;
    expensesRecognised: number;
    expensesPaid: number;
    surplus: number;
  }[];
  revenue: {
    collected: number;
    refunded: number;
    netCollected: number;
    netCollectedThisMonth: number;
    byCity: { name: string; amount: number }[];
    byCustomer: { name: string; amount: number }[];
  };
  expenses: {
    recognised: number;
    recognisedThisMonth: number;
    paid: number;
    paidThisMonth: number;
    byCategory: { name: string; amount: number }[];
    byBranch: { name: string; amount: number }[];
    pendingApproval: { count: number; amount: number };
    unpaidApproved: { count: number; amount: number };
  };
  collections: {
    awaitingPayment: { count: number; amount: number };
    failedPayments: { count: number; amount: number };
    outstandingOnConfirmed: { count: number; amount: number };
    awaitingVerification: { count: number; amount: number };
  };
  profitability: {
    surplusThisMonth: number;
    months: {
      month: string;
      collected: number;
      refunded: number;
      netCollected: number;
      expensesPaid: number;
      surplus: number;
      recognisedExpenses: number;
    }[];
    contribution: { ordersWithCosts: number; orderValue: number; recordedCosts: number; contribution: number };
  };
}

/** An order an expense can be put against - see GET /admin/expenses/order-options. */
export interface ExpenseOrderOption {
  id: string;
  reference: string;
  customer: string;
  status: string;
  placedAt: string;
}

export interface InvoiceRow extends Invoice {
  orderReference: string | null;
  customer: string | null;
  money: OrderMoney | null;
}

type Query = Record<string, string | number | boolean | undefined>;

/** Save a file the API streams, through the authenticated client - never a public link. */
async function download(path: string, params: Query, fallbackName: string) {
  const response = await api.get<Blob>(path, { params, responseType: 'blob' });
  const disposition = String(response.headers['content-disposition'] ?? '');
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const financeService = {
  async dashboard() {
    const { data } = await api.get<FinanceDashboard>('/admin/finance/dashboard');
    return data;
  },

  async transactions(params: Query = {}) {
    const { data } = await api.get<LedgerEntry[]>('/admin/finance/transactions', { params });
    return data;
  },

  async invoices(params: Query = {}) {
    const { data } = await api.get<InvoiceRow[]>('/admin/finance/invoices', { params });
    return data;
  },

  async reports() {
    const { data } = await api.get<{ key: string; title: string }[]>('/admin/finance/reports');
    return data;
  },

  exportReport(report: string, format: 'csv' | 'xlsx', range: { from?: string; to?: string } = {}) {
    return download(`/admin/finance/exports/${report}`, { format, ...range }, `artinu-${report}.${format}`);
  },

  async settings() {
    const { data } = await api.get<FinanceSettings>('/admin/finance/settings');
    return data;
  },

  async updateSettings(input: FinanceSettingsInput) {
    const { data } = await api.put<FinanceSettings>('/admin/finance/settings', input);
    return data;
  },

  /** Staff the approval routing can choose from, each with the slots they fit. */
  async approverOptions() {
    const { data } = await api.get<ApproverOption[]>('/admin/finance/approvers');
    return data;
  },

  // ── Expenses ───────────────────────────────────────────────────────────────

  /** "Awaiting my approval": routed to me, or open to me as the backup approver. */
  async approvals() {
    const { data } = await api.get<ExpenseView[]>('/admin/expenses/approvals');
    return data;
  },

  async eligibleApprovers(id: string) {
    const { data } = await api.get<ApproverOption[]>(`/admin/expenses/${id}/eligible-approvers`);
    return data;
  },

  async reassignApprover(id: string, approverId: string, reason: string) {
    const { data } = await api.post<ExpenseView>(`/admin/expenses/${id}/approver`, { approverId, reason });
    return data;
  },

  /** Give every waiting expense without a workable approver one from the current routing. */
  async routePending() {
    const { data } = await api.post<{
      assigned: { id: string; number: string; approver: string }[];
      unchanged: number;
      unresolved: { id: string; number: string; problem: string }[];
    }>('/admin/expenses/route-pending');
    return data;
  },

  async expenses(params: Query = {}) {
    const { data } = await api.get<ExpenseView[]>('/admin/expenses', { params });
    return data;
  },

  async expense(id: string) {
    const { data } = await api.get<ExpenseView>(`/admin/expenses/${id}`);
    return data;
  },

  async orderOptions(q: string) {
    const { data } = await api.get<ExpenseOrderOption[]>('/admin/expenses/order-options', { params: { q } });
    return data;
  },

  async categories(all = false) {
    const { data } = await api.get<ExpenseCategory[]>('/admin/expenses/categories', { params: { all } });
    return data;
  },

  async createCategory(input: { name: string; description?: string | null; active: boolean; sortOrder: number }) {
    const { data } = await api.post<ExpenseCategory>('/admin/expenses/categories', input);
    return data;
  },

  async updateCategory(id: string, input: { name: string; description?: string | null; active: boolean; sortOrder: number }) {
    const { data } = await api.patch<ExpenseCategory>(`/admin/expenses/categories/${id}`, input);
    return data;
  },

  async createExpense(input: ExpenseInput) {
    const { data } = await api.post<ExpenseView>('/admin/expenses', input);
    return data;
  },

  async updateExpense(id: string, input: ExpenseInput) {
    const { data } = await api.put<ExpenseView>(`/admin/expenses/${id}`, input);
    return data;
  },

  async submitExpense(id: string) {
    const { data } = await api.post<ExpenseView>(`/admin/expenses/${id}/submit`);
    return data;
  },

  async decideExpense(id: string, decision: 'approve' | 'reject', note?: string) {
    const { data } = await api.post<ExpenseView>(`/admin/expenses/${id}/decision`, { decision, note });
    return data;
  },

  async payExpense(id: string, input: ExpensePaymentInput) {
    const { data } = await api.post<ExpenseView>(`/admin/expenses/${id}/payments`, input);
    return data;
  },

  async cancelExpense(id: string, reason: string) {
    const { data } = await api.post<ExpenseView>(`/admin/expenses/${id}/cancel`, { reason });
    return data;
  },

  async reverseExpense(id: string, reason: string) {
    const { data } = await api.post<ExpenseView>(`/admin/expenses/${id}/reverse`, { reason });
    return data;
  },

  /** Put an existing expense against an order, or take it off one (null). */
  async linkExpenseToOrder(id: string, orderId: string | null) {
    const { data } = await api.post<ExpenseView>(`/admin/expenses/${id}/order`, { orderId });
    return data;
  },

  async attachReceipt(id: string, receipt: { dataUrl: string; fileName: string }) {
    const { data } = await api.post<ExpenseView>(`/admin/expenses/${id}/receipt`, receipt);
    return data;
  },

  /** Opens the receipt in a new tab from an authenticated download. */
  async openReceipt(id: string) {
    const response = await api.get<Blob>(`/admin/expenses/${id}/receipt`, { responseType: 'blob' });
    const url = URL.createObjectURL(response.data);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
};
