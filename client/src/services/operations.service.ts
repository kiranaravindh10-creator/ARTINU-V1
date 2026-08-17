import { api } from '@/lib/api';

/**
 * Manager / IT operational endpoints: system health, employee accounts and
 * physical frame inventory. Mirrors server/src/routes/operations.routes.ts.
 */

export interface MailQuota {
  month: string;
  limit: number;
  used: number;
  remaining: number;
  percentage: number;
  state: 'ok' | 'info' | 'warning' | 'critical' | 'exhausted';
  projectedMonthEnd: number;
  reservedForCriticalOnly: boolean;
}

export interface ErrorSummary {
  open: number;
  critical: number;
  autoRecovered: number;
  last24h: number;
  bySource: Record<string, number>;
}

export interface SystemHealth {
  errors: ErrorSummary;
  mail: MailQuota;
  uptimeSeconds: number;
  memory: { heapUsedMb: number; rssMb: number };
  checkedAt: string;
}

export interface ErrorLogEntry {
  id: string;
  source: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  route?: string | null;
  operation?: string | null;
  occurrences: number;
  resolution: 'open' | 'auto_recovered' | 'resolved' | 'ignored';
  lastSeenAt: string;
  createdAt: string;
}

export interface Employee {
  id: string;
  userId: string;
  employeeCode: string;
  fullName: string;
  companyEmail: string;
  personalEmail?: string | null;
  jobTitle: string;
  department?: string | null;
  role: string;
  status: 'active' | 'suspended' | 'offboarded';
  createdAt: string;
}

export interface Frame {
  id: string;
  frameCode: string;
  size: string;
  material: string;
  color: string;
  glass: string;
  condition: string;
  status: string;
  spaceId?: string | null;
  timesReused: number;
  createdAt: string;
}

export interface FrameSummary {
  total: number;
  available: number;
  reserved: number;
  installed: number;
  inTransit: number;
  maintenance: number;
  retired: number;
  totalReuses: number;
  reusableNow: number;
}

/**
 * The fulfilment pipeline as IT sees it (requirements §7) — deliberately
 * carries no order totals or payment state. See server/src/services/
 * pipeline.service.ts for what is withheld and why.
 */
export interface Pipeline {
  orders: {
    id: string;
    reference: string;
    status: string;
    spaceName: string | null;
    itemCount: number;
    placedAt: string;
    updatedAt: string;
    ageDays: number;
    stale: boolean;
  }[];
  installations: {
    id: string;
    orderId: string;
    spaceName: string | null;
    scheduledFor: string;
    window: string | null;
    status: string;
    technician: string | null;
    daysUntil: number;
    overdue: boolean;
  }[];
  counts: {
    open: number;
    stale: number;
    byStatus: Record<string, number>;
    installationsUpcoming: number;
    installationsOverdue: number;
  };
  checkedAt: string;
}

export interface ReallocationPlan {
  lines: {
    size: string;
    material: string;
    color: string;
    required: number;
    fromStock: number;
    toPurchase: number;
    candidates: { frameCode: string; condition: string; previousSpaceId: string | null }[];
  }[];
  totalRequired: number;
  totalFromStock: number;
  totalToPurchase: number;
}

export interface FeaturedArtistEntry {
  artistId: string;
  sponsored: boolean;
  order: number;
  note?: string | null;
}

export const operationsService = {
  // ── Featured artists ──────────────────────────────────────────────────────
  async featuredArtists() {
    const { data } = await api.get<FeaturedArtistEntry[]>('/ops/featured-artists');
    return data;
  },

  /** Replaces the whole list — array order is the running order. */
  async setFeaturedArtists(
    entries: { artistId: string; sponsored?: boolean; note?: string | null }[],
  ) {
    const { data } = await api.put<FeaturedArtistEntry[]>('/ops/featured-artists', { entries });
    return data;
  },

  // ── System ────────────────────────────────────────────────────────────────
  async health() {
    const { data } = await api.get<SystemHealth>('/ops/system/health');
    return data;
  },

  async pipeline() {
    const { data } = await api.get<Pipeline>('/ops/pipeline');
    return data;
  },

  async errors(params?: { resolution?: string; severity?: string; source?: string; limit?: number }) {
    const { data } = await api.get<ErrorLogEntry[]>('/ops/system/errors', { params });
    return data;
  },

  async resolveErrorEntry(id: string) {
    const { data } = await api.post<ErrorLogEntry>(`/ops/system/errors/${id}/resolve`);
    return data;
  },

  async mailUsage() {
    const { data } = await api.get<{ current: MailQuota; history: { month: string; sent: number }[] }>(
      '/ops/system/mail-usage',
    );
    return data;
  },

  // ── Employees ─────────────────────────────────────────────────────────────
  async employees(params?: { status?: string; department?: string }) {
    const { data } = await api.get<Employee[]>('/ops/employees', { params });
    return data;
  },

  async createEmployee(input: {
    fullName: string;
    jobTitle: string;
    role: string;
    department?: string | null;
    personalEmail?: string | null;
    phone?: string | null;
  }) {
    const { data } = await api.post<Employee>('/ops/employees', input);
    return data;
  },

  async offboardEmployee(id: string) {
    const { data } = await api.post<Employee>(`/ops/employees/${id}/offboard`);
    return data;
  },

  // ── Frames ────────────────────────────────────────────────────────────────
  async frameSummary() {
    const { data } = await api.get<FrameSummary>('/ops/frames/summary');
    return data;
  },

  async frames(params?: { status?: string; spaceId?: string; limit?: number }) {
    const { data } = await api.get<Frame[]>('/ops/frames', { params });
    return data;
  },

  async addFrames(input: {
    size: string;
    material: string;
    color: string;
    glass?: string;
    purchaseCost?: number;
    quantity: number;
  }) {
    const { data } = await api.post<{ added: number; frames: Frame[] }>('/ops/frames', input);
    return data;
  },

  async reallocationPlan(
    requirements: { size: string; material: string; color: string; quantity: number }[],
  ) {
    const { data } = await api.post<ReallocationPlan>('/ops/frames/reallocation-plan', {
      requirements,
    });
    return data;
  },

  async releaseFrames(spaceId: string, reason = 'cancelled') {
    const { data } = await api.post<{ released: number }>(
      `/ops/spaces/${spaceId}/release-frames`,
      { reason },
    );
    return data;
  },
};
