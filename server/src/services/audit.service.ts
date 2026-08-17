import type { AuditLogEntry } from '@artinu/shared';
import { db } from '@/database/db';
import { currentActor, currentContext, currentRequestId } from '@/utils/request-context';
import { now } from '@/utils/ids';
import { logger } from '@/utils/logger';

/**
 * The audit trail behind `GET /admin/audit` (SDD §19). Every critical action —
 * moderation decisions, order status changes, payouts, role edits — writes one
 * entry here, so the Console can answer "who changed this, and when".
 */

export interface AuditInput {
  actor?: { id: string; email: string } | null;
  action: string;
  entity: string;
  entityId?: string;
  meta?: Record<string, unknown>;
  ip?: string | null;
}

export async function recordAudit(input: AuditInput): Promise<AuditLogEntry> {
  const entry: Omit<AuditLogEntry, 'id'> = {
    // An explicitly passed actor wins; otherwise take whoever made the request,
    // so nothing is ever recorded without attribution.
    actorId: input.actor?.id ?? currentActor()?.id ?? null,
    actorEmail: input.actor?.email ?? currentActor()?.email ?? null,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    // The requestId ties this entry to every email the same action sent.
    meta: { ...(input.meta ?? {}), requestId: currentRequestId() },
    ip: input.ip ?? currentContext()?.ip ?? null,
    createdAt: now(),
  };

  const written = await db.auditLogs.insert(entry);
  logger.info(
    `audit ${entry.action} ${entry.entity}${entry.entityId ? `:${entry.entityId}` : ''} by ${entry.actorEmail ?? 'system'}`,
  );
  return written;
}

/** Newest first — feeds the Console activity feed and `ConsoleAnalytics`. */
export async function recentAudit(limit = 20): Promise<AuditLogEntry[]> {
  return db.auditLogs.find({
    orderBy: { field: 'createdAt', direction: 'desc' },
    limit,
  });
}
