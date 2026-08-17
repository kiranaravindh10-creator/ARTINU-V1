import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * Per-request context, carried implicitly.
 *
 * Accountability was the reason for this: an email or an audit entry is far more
 * useful when it records *who* caused it, not just who received it. Threading an
 * actor through every service call would mean touching ~40 signatures and would
 * be forgotten at the next one, so the actor is stashed here when the request is
 * authenticated and read wherever it is needed.
 *
 * The shared `requestId` is what lets an audit entry and the emails it triggered
 * be lined up afterwards: one action, one id, everything it caused.
 */
export interface RequestContext {
  requestId: string;
  actor: { id: string; email: string; role: string } | null;
  /** "POST /api/admin/moderation/:id" — what was being done. */
  route: string;
  ip: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function currentContext(): RequestContext | null {
  return storage.getStore() ?? null;
}

export function currentActor(): RequestContext['actor'] {
  return storage.getStore()?.actor ?? null;
}

export function currentRequestId(): string | null {
  return storage.getStore()?.requestId ?? null;
}

export const newRequestId = () => randomUUID();
