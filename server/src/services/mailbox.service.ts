import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { now, uuid } from '@/utils/ids';
import { currentContext } from '@/utils/request-context';

/**
 * A development inbox.
 *
 * Every message the app sends is recorded here, whether or not a real provider
 * delivered it. Without SMTP configured you would otherwise have to read the
 * server log to check that a consultation confirmation or a moderation decision
 * actually went out, and you could never see how it looked. This keeps the
 * rendered HTML so the Console can show it.
 *
 * It doubles as a delivery audit once SMTP is live: `delivered` records whether
 * the provider accepted the message.
 */

export interface RecordedMail {
  id: string;
  to: string;
  subject: string;
  heading: string;
  body: string;
  html: string;
  /** True once a provider accepted it; false when only recorded. */
  delivered: boolean;
  /** Why it is a useful signal — 'smtp' or 'console'. */
  via: 'smtp' | 'console';
  sentAt: string;
  /** Who caused this to be sent — null for anonymous actions like a public form. */
  triggeredBy: { id: string; email: string; role: string } | null;
  /** The request that produced it, shared with the audit entry for the same action. */
  requestId: string | null;
  /** "POST /api/admin/moderation/:id" — the action behind the message. */
  trigger: string | null;
}

const MAX_KEPT = 200;

const mailDir = path.join(env.serverRoot, '.data', 'mail');
let mailbox: RecordedMail[] = [];
let loaded = false;

function ensureDir() {
  if (!existsSync(mailDir)) mkdirSync(mailDir, { recursive: true });
}

/** Restores previously captured mail so a dev-server restart does not lose it. */
function load() {
  if (loaded) return;
  loaded = true;
  try {
    ensureDir();
    const files = readdirSync(mailDir).filter((name) => name.endsWith('.json'));
    mailbox = files
      .map((name) => JSON.parse(readFileSync(path.join(mailDir, name), 'utf8')) as RecordedMail)
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
      .slice(0, MAX_KEPT);
  } catch (error) {
    logger.warn('Could not read the development mailbox', error);
    mailbox = [];
  }
}

export function recordMail(
  message: { to: string; subject: string; heading: string; body: string },
  html: string,
  delivered: boolean,
): RecordedMail {
  load();

  const context = currentContext();

  const entry: RecordedMail = {
    id: uuid(),
    to: message.to,
    subject: message.subject,
    heading: message.heading,
    body: message.body,
    html,
    delivered,
    via: delivered ? 'smtp' : 'console',
    sentAt: now(),
    triggeredBy: context?.actor ?? null,
    requestId: context?.requestId ?? null,
    trigger: context?.route ?? null,
  };

  mailbox.unshift(entry);

  // Trim, removing the dropped files from disk as well.
  const dropped = mailbox.splice(MAX_KEPT);
  try {
    ensureDir();
    writeFileSync(path.join(mailDir, `${entry.id}.json`), JSON.stringify(entry), 'utf8');
    for (const old of dropped) {
      const file = path.join(mailDir, `${old.id}.json`);
      if (existsSync(file)) unlinkSync(file);
    }
  } catch (error) {
    // Losing the copy on disk is not worth failing a send over.
    logger.warn('Could not persist a copy of that email', error);
  }

  return entry;
}

export function listMail(
  options: { to?: string; actor?: string; requestId?: string; limit?: number } = {},
): RecordedMail[] {
  load();

  let filtered = mailbox;
  if (options.to) {
    const needle = options.to.toLowerCase();
    filtered = filtered.filter((entry) => entry.to.toLowerCase().includes(needle));
  }
  if (options.actor) {
    const needle = options.actor.toLowerCase();
    filtered = filtered.filter((entry) =>
      (entry.triggeredBy?.email ?? '').toLowerCase().includes(needle),
    );
  }
  if (options.requestId) {
    filtered = filtered.filter((entry) => entry.requestId === options.requestId);
  }

  return filtered.slice(0, options.limit ?? 100);
}

export function getMail(id: string): RecordedMail | null {
  load();
  return mailbox.find((entry) => entry.id === id) ?? null;
}

export function clearMail(): number {
  load();
  const count = mailbox.length;
  try {
    for (const entry of mailbox) {
      const file = path.join(mailDir, `${entry.id}.json`);
      if (existsSync(file)) unlinkSync(file);
    }
  } catch {
    /* best effort */
  }
  mailbox = [];
  return count;
}

export const mailboxSummary = () => {
  load();
  return {
    captured: mailbox.length,
    delivered: mailbox.filter((entry) => entry.delivered).length,
    lastSentAt: mailbox[0]?.sentAt ?? null,
  };
};
