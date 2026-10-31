import type { SupportSessionGrant } from '@artinu/shared';

/**
 * The browser's half of "Assist User".
 *
 * The server issues the support credential and enforces everything about it.
 * All the browser does is put the administrator's own session aside, use the
 * support credential until the session ends, then put the administrator's
 * session back - so leaving support mode never means signing in again.
 *
 * Kept in localStorage rather than memory so a reload inside the session does
 * not strand the administrator in the customer's account with no way back.
 */

const KEY = 'artinu.support';
const TOKEN_KEY = 'artinu.token';

export interface SupportState {
  /** The administrator's own session, restored on exit. */
  returnToken: string;
  supportToken: string;
  sessionId: string;
  targetId: string;
  targetName: string;
  targetEmail: string;
  targetRole: string;
  reason: string;
  expiresAt: string;
  /** Where the administrator goes back to. */
  returnPath: string;
}

function read(): SupportState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SupportState) : null;
  } catch {
    return null;
  }
}

function currentToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** The active support session, if this tab is in one. */
export function activeSupportSession(): SupportState | null {
  const state = read();
  return state && currentToken() === state.supportToken ? state : null;
}

function homeFor(role: string) {
  if (role === 'artist') return '/studio';
  if (role === 'space_owner') return '/space';
  return '/';
}

/** Enter a support session. Reloads into the customer's own home screen. */
export function beginSupportSession(grant: SupportSessionGrant, returnPath: string) {
  const returnToken = currentToken();
  if (!returnToken) throw new Error('Sign in again before starting a support session.');

  const state: SupportState = {
    returnToken,
    supportToken: grant.token,
    sessionId: grant.session.id,
    targetId: grant.target.id,
    targetName: grant.target.name,
    targetEmail: grant.target.email,
    targetRole: grant.target.role,
    reason: grant.session.reason,
    expiresAt: grant.expiresAt,
    returnPath,
  };
  localStorage.setItem(KEY, JSON.stringify(state));
  localStorage.setItem(TOKEN_KEY, grant.token);
  // A full load, so nothing cached from the Console is shown as the customer's.
  window.location.assign(homeFor(grant.target.role));
}

/**
 * Leave the support session and go back to the Console as yourself.
 *
 * Tells the server first - with the support credential, which may end its own
 * session - but never depends on that succeeding: an expired session has
 * already ended, and the administrator must get their own session back
 * regardless.
 */
export async function endSupportSession(reason: 'exited' | 'expired' = 'exited') {
  const state = read();
  if (!state) return;

  if (reason === 'exited' && currentToken() === state.supportToken) {
    const base = import.meta.env.VITE_API_URL ?? '/api';
    await fetch(`${base}/support-session/end`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${state.supportToken}` },
    }).catch(() => undefined);
  }

  localStorage.setItem(TOKEN_KEY, state.returnToken);
  localStorage.removeItem(KEY);
  const separator = state.returnPath.includes('?') ? '&' : '?';
  window.location.assign(`${state.returnPath}${separator}support=${reason}`);
}
