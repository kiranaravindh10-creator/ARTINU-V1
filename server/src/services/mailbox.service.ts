import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { db } from '@/database/db';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { now, uuid } from '@/utils/ids';
import { currentContext } from '@/utils/request-context';

/**
 * WHERE SENT MAIL IS RECORDED, AND WHY IT IS NOW IN TWO PLACES.
 *
 * This began as a development inbox backed by JSON files under
 * server/.data/mail, which is exactly right locally and useless in production:
 * Render gives every deploy a fresh filesystem, so the Console's mail log was
 * always empty on the live site. The practical consequence was that when
 * password reset emails appeared not to arrive there was no way to tell whether
 * they had been sent, refused by the provider, or never attempted - the only
 * honest answer available was "no idea".
 *
 * So every message is now also written to a `mail_log` table. The disk copy
 * stays because it is genuinely convenient offline and costs nothing, but the
 * database is the source of truth whenever a real driver is configured.
 *
 * Neither write is allowed to fail a send. An email that went out but was not
 * logged is a small problem; an email that failed to go out because logging
 * broke is a much larger one.
 */

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

  /*
    Fire and forget, deliberately.

    `recordMail` is called from inside `sendMail` on the request path and is
    synchronous by signature, so this cannot be awaited without turning every
    caller async. Failing to write the log must never fail the send, so the
    error is swallowed to a warning.
  */
  void db.mailLog
    .insert({
      id: entry.id,
      to: entry.to,
      subject: entry.subject,
      heading: entry.heading,
      body: entry.body,
      html: entry.html,
      delivered: entry.delivered,
      via: entry.via,
      sentAt: entry.sentAt,
      triggeredBy: entry.triggeredBy,
      requestId: entry.requestId,
      trigger: entry.trigger,
    })
    .catch((error) => logger.warn('Could not write the mail log entry', error));

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

/**
 * Read the log, preferring the durable copy.
 *
 * Falls back to the on-disk mailbox when the database has nothing - which is
 * the normal case locally, and the case for anything sent before the mail_log
 * table existed.
 */
export async function listMailDurable(
  options: { to?: string; actor?: string; requestId?: string; limit?: number } = {},
): Promise<RecordedMail[]> {
  let rows: RecordedMail[] = [];
  try {
    rows = (await db.mailLog.find({
      orderBy: { field: 'sentAt', direction: 'desc' },
    })) as unknown as RecordedMail[];
  } catch (error) {
    logger.warn('Could not read the mail log from the database', error);
  }

  if (rows.length === 0) return listMail(options);

  let filtered = rows;
  if (options.to) {
    const needle = options.to.toLowerCase();
    filtered = filtered.filter((entry) => (entry.to ?? '').toLowerCase().includes(needle));
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

export async function getMailDurable(id: string): Promise<RecordedMail | null> {
  try {
    const row = (await db.mailLog.byId(id)) as unknown as RecordedMail | null;
    if (row) return row;
  } catch (error) {
    logger.warn('Could not read that mail log entry from the database', error);
  }
  return getMail(id);
}

export async function mailboxSummaryDurable() {
  try {
    const rows = (await db.mailLog.find()) as unknown as RecordedMail[];
    if (rows.length > 0) {
      const sorted = [...rows].sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''));
      return {
        captured: rows.length,
        delivered: rows.filter((entry) => entry.delivered).length,
        lastSentAt: sorted[0]?.sentAt ?? null,
      };
    }
  } catch (error) {
    logger.warn('Could not summarise the mail log', error);
  }
  return mailboxSummary();
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
