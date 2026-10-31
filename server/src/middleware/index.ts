import {
  hasPermission,
  INTERNAL_ROLES,
  ROLE_MODULES,
  SUPPORT_SESSION_WRITE_ALLOWLIST,
  type Permission,
  type Role,
  type SupportSession,
} from '@artinu/shared';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ZodError, type ZodSchema } from 'zod';
import { env } from '@/config/env';
import { db, readOnlyRefusal, writesAreLocked, type StoredUser } from '@/database/db';
import { forbidden, HttpError, unauthorized } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { verifyToken, type TokenPayload } from '@/services/token.service';
import { newRequestId, runWithContext } from '@/utils/request-context';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: StoredUser;
      /** Set when the request carries a support-session credential. See support-session.service.ts. */
      supportSession?: SupportSession;
      /** The administrator behind a support session. `user` is the account being assisted. */
      supportAdmin?: StoredUser;
      /** Body/query/params after Zod has parsed and coerced them. */
      valid?: any;
    }
  }
}

/** Wraps an async handler so a rejected promise reaches the error middleware. */
export const asyncHandler =
  <T extends RequestHandler>(handler: T): RequestHandler =>
  (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };

/**
 * Reads the bearer token, attaches the user, and opens the request context that
 * audit entries and outgoing email read their actor from. Anonymous requests are
 * not rejected — they simply carry a null actor.
 */
/**
 * Every session issued at or before this moment is refused.
 *
 * A JWT is valid for a week and carries no state, so "sign this person out
 * everywhere" - after a password reset, an email correction or a compromise -
 * needs something the server checks. Compared at whole-second precision, the
 * same precision as the token's `iat`; a token issued in the very second of a
 * revocation is treated as revoked, which errs on the safe side.
 */
export function sessionRevoked(user: StoredUser, payload: TokenPayload): boolean {
  if (!user.sessionsRevokedAt) return false;
  const revokedAt = Math.floor(new Date(user.sessionsRevokedAt).getTime() / 1000);
  return typeof payload.iat !== 'number' || payload.iat <= revokedAt;
}

const BLOCKED = ['suspended', 'banned', 'pending_ceo_approval'];

export const attachUser: RequestHandler = async (req, res, next) => {
  const open = () =>
    runWithContext(
      {
        requestId: newRequestId(),
        // During a support session the ADMINISTRATOR is the actor: they are the
        // person doing it, and the audit trail has to say so.
        actor: req.supportAdmin
          ? { id: req.supportAdmin.id, email: req.supportAdmin.email, role: req.supportAdmin.role }
          : req.user
            ? { id: req.user.id, email: req.user.email, role: req.user.role }
            : null,
        route: `${req.method} ${req.baseUrl}${req.route?.path ?? req.path}`,
        ip: req.ip ?? null,
        supportSessionId: req.supportSession?.id ?? null,
        onBehalfOf: req.supportSession ? (req.user?.id ?? null) : null,
      },
      () => next(),
    );

  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return open();

    const payload = verifyToken(header.slice(7));
    if (!payload) return open();

    /*
      A support-session credential.

      It is only honoured while the recorded session is open and unexpired, for
      the account it was opened on, by an administrator who still exists, is
      still active and still holds users.assist. Any of those failing turns the
      request anonymous, exactly like an expired token - and the Console then
      leaves support mode.
    */
    if (payload.sid) {
      const session = await db.supportSessions.byId(payload.sid).catch(() => null);
      const live =
        session &&
        !session.endedAt &&
        new Date(session.expiresAt).getTime() > Date.now() &&
        session.targetUserId === payload.sub &&
        session.adminId === payload.act;
      if (!live || !session) return open();

      const [target, admin] = await Promise.all([
        db.users.byId(payload.sub),
        db.users.byId(payload.act ?? ''),
      ]);
      if (
        !target ||
        !admin ||
        BLOCKED.includes(target.status) ||
        BLOCKED.includes(admin.status) ||
        !hasPermission(admin.role, 'users.assist') ||
        sessionRevoked(admin, payload)
      ) {
        return open();
      }

      req.user = target;
      req.supportSession = session;
      req.supportAdmin = admin;
      return open();
    }

    /*
      The account is re-read on every request, and its status is checked here
      rather than trusted from the token.

      This is what makes a suspension or a ban take effect immediately. A JWT is
      valid for a week and carries no status of its own, so a check at sign-in
      alone would leave a banned photographer working normally until their token
      happened to expire. Refusing to attach the user turns the very next
      request into an anonymous one, which `requireAuth` then rejects.
    */
    const user = await db.users.byId(payload.sub);
    if (user && !BLOCKED.includes(user.status) && !sessionRevoked(user, payload)) {
      req.user = user;
    }
    open();
  } catch {
    // A malformed token is simply an anonymous request.
    open();
  }
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  next();
};

/**
 * Read-only mode at the front door (READ_ONLY_MODE=true).
 *
 * Anything that could change something is refused before it reaches a route,
 * except signing in and out: sessions are stateless tokens, and in this mode
 * a sign-in does not record the last-login time either. The tables refuse
 * writes as well (database/db.ts), which is what stops a GET with a side
 * effect. Both read the same lock, so they cannot disagree.
 */
const READ_ONLY_ALLOWED = new Set(['POST /api/auth/sign-in', 'POST /api/auth/sign-out']);

export const readOnlyGuard: RequestHandler = (req, _res, next) => {
  if (!writesAreLocked()) return next();
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
  const path = `${req.baseUrl}${req.path}`.replace(/\/+$/, '');
  if (READ_ONLY_ALLOWED.has(`${method} ${path}`)) return next();
  logger.warn(`read-only mode: refused ${method} ${path}`);
  next(readOnlyRefusal());
};

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(forbidden('Your account does not have access to this area.'));
    }
    next();
  };

export const requireInternal: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (!(INTERNAL_ROLES as readonly string[]).includes(req.user.role)) {
    return next(forbidden('This is an ARTINU Console endpoint.'));
  }
  next();
};

/** Console module gate — mirrors ROLE_MODULES on the client (requirements §15). */
export const requireModule =
  (module: string): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    const allowed = ROLE_MODULES[req.user.role] ?? [];
    if (!allowed.includes(module)) {
      return next(forbidden(`Your role does not include the ${module} module.`));
    }
    next();
  };

/**
 * Action-level gate - mirrors ROLE_PERMISSIONS on the client (permissions.ts).
 * Passing several means any one of them is enough.
 */
export const requirePermission =
  (...permissions: Permission[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!permissions.some((permission) => hasPermission(req.user!.role, permission))) {
      return next(forbidden('Your role does not allow this action.'));
    }
    next();
  };

/**
 * Keeps a support session to what it is for: looking.
 *
 * Mounted at the top of the API router, so it sees every request. Reads are
 * allowed except anywhere staff-only; writes are refused unless they are on
 * SUPPORT_SESSION_WRITE_ALLOWLIST (empty by default) or end the session itself.
 * Every write attempt is recorded, allowed or not, under the session it
 * happened in.
 */
export const supportSessionGuard: RequestHandler = (req, _res, next) => {
  const session = req.supportSession;
  if (!session) return next();

  const method = req.method.toUpperCase();
  const path = `${req.baseUrl}${req.path}`.replace(/\/+$/, '');
  const isRead = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
  const staffArea = /^\/api\/(admin|ops|content-manager)(\/|$)/.test(path);
  const endingItself = method === 'POST' && path === '/api/support-session/end';
  const allowed =
    endingItself ||
    (isRead && !staffArea) ||
    SUPPORT_SESSION_WRITE_ALLOWLIST.includes(`${method} ${path}`);

  void db.supportSessions
    .update(session.id, {
      requestCount: session.requestCount + 1,
      ...(allowed ? {} : { blockedCount: session.blockedCount + 1 }),
    })
    .catch(() => undefined);

  if (!isRead && !endingItself) {
    void import('@/services/audit.service')
      .then(({ recordAudit }) =>
        recordAudit({
          action: allowed ? 'support_session.action' : 'support_session.blocked',
          entity: 'support_session',
          entityId: session.id,
          meta: { method, path, targetUserId: session.targetUserId },
        }),
      )
      .catch((error) => logger.error('Could not record a support-session action', error));
  }

  if (!allowed) {
    return next(
      new HttpError(
        403,
        'Not available in a support session. Support sessions are read-only - exit and act from the Console instead.',
        'support_session_read_only',
      ),
    );
  }
  next();
};

export const requireVerified: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (!req.user.emailVerified) {
    return next(new HttpError(403, 'Please verify your email address first.', 'email_unverified'));
  }
  next();
};

/**
 * Validates with a shared Zod schema and hands the parsed value to the handler
 * on `req.valid`. Field errors come back shaped for the client's form mapper.
 */
export const validate =
  (schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body'): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(zodToHttpError(result.error));
    }
    req.valid = result.data;
    next();
  };

export function zodToHttpError(error: ZodError): HttpError {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = issue.path.join('.') || 'form';
    (details[field] ??= []).push(issue.message);
  }
  const first = error.issues[0];
  return new HttpError(
    422,
    first ? first.message : 'Please check the highlighted fields.',
    'validation_failed',
    details,
  );
}

// ── Rate limits ──────────────────────────────────────────────────────────────

const limiterOptions = {
  standardHeaders: true as const,
  legacyHeaders: false as const,
  // Rate limiting exists to protect the API, not to break local development.
  skip: () => env.isDevelopment,
};

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  message: { message: 'Too many requests. Please slow down.' },
  ...limiterOptions,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  message: { message: 'Too many attempts. Please wait a few minutes and try again.' },
  ...limiterOptions,
});

export const uploadLimiter = rateLimit({
  windowMs: 60_000,
  limit: 40,
  message: { message: 'Too many uploads at once. Give it a moment.' },
  ...limiterOptions,
});

// ── Errors ───────────────────────────────────────────────────────────────────

/** Rolling error log surfaced on the IT dashboard (`GET /admin/system`). */
/**
 * Lets a public GET be cached for a short while.
 *
 * ── The problem ─────────────────────────────────────────────────────────────
 *
 * Opening the homepage fired six requests for content that changes a few times
 * a month — the hero slides, the slideshow settings, the collaborations, the
 * featured collections, the testimonials — and every one of them was answered
 * with no cache headers at all. Browsers therefore revalidated the lot on every
 * navigation and every reload, and each answer meant a round trip to Supabase.
 * A visitor clicking Gallery and pressing Back paid the whole bill twice.
 *
 * ── Why these numbers ───────────────────────────────────────────────────────
 *
 * `max-age` is what the visitor's own browser honours; `s-maxage` is for any
 * shared cache in front of us. `stale-while-revalidate` is the one that removes
 * the wait: past the freshness window the cached copy is still painted
 * immediately and refreshed in the background, so a manager's edit shows up
 * within a minute or two while nobody ever stares at an empty section waiting
 * for a database.
 *
 * ── Why it is not simply on everything ──────────────────────────────────────
 *
 * `public` means any shared cache may keep the response and hand it to somebody
 * else, which for a signed-in response would serve one person's data to
 * another. This must therefore only be mounted on routes that take no session
 * into account — and it asserts that rather than trusting the caller: if a
 * request arrives with credentials, the response is marked private instead.
 */
export const cachePublic =
  (seconds: number, staleWhileRevalidate = seconds * 10): RequestHandler =>
  (req, res, next) => {
    const personalised = Boolean(req.user) || Boolean(req.headers.authorization);

    if (personalised) {
      // Correct rather than fast: this response may reflect who is asking.
      res.setHeader('Cache-Control', 'private, no-store');
    } else {
      res.setHeader(
        'Cache-Control',
        `public, max-age=${seconds}, s-maxage=${seconds}, stale-while-revalidate=${staleWhileRevalidate}`,
      );
      // The same URL answers differently once a session is attached, so any
      // shared cache has to key on that rather than on the path alone.
      res.setHeader('Vary', 'Authorization');
    }

    next();
  };

export const recentErrors: { at: string; status: number; message: string; path: string }[] = [];

/**
 * A body-parser rejection: unparseable JSON, a bad charset, or a payload over
 * the configured limit.
 *
 * body-parser marks these with a `type` and an HTTP status, which is how they
 * are told apart from a genuine server fault that merely happens to be a
 * SyntaxError.
 */
function isBodyParserError(error: unknown): error is Error & { status: number; type: string } {
  if (!(error instanceof Error)) return false;
  const candidate = error as Error & { type?: unknown; status?: unknown };
  return (
    typeof candidate.type === 'string' &&
    candidate.type.startsWith('entity.') &&
    typeof candidate.status === 'number'
  );
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, `No API route matches ${req.method} ${req.originalUrl}`, 'not_found'));
};

export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  /*
    Never let a failure be cached.

    `cachePublic` runs before the handler, so by the time something throws the
    response is already carrying a "keep this for 60 seconds" header. Without
    this line a single 500 during a Supabase blip would be stored by the
    visitor's browser and any shared cache and replayed for the next minute,
    long after the server recovered — turning a momentary error into a sticky
    one, on the homepage, for everybody who happened to load it.
  */
  res.setHeader('Cache-Control', 'no-store');

  let status = 500;
  let message = 'Something went wrong on our side.';
  let code: string | undefined;
  let details: Record<string, string[]> | undefined;

  if (error instanceof HttpError) {
    status = error.status;
    message = error.message;
    code = error.code;
    details = error.details;
  } else if (error instanceof ZodError) {
    const http = zodToHttpError(error);
    status = http.status;
    message = http.message;
    code = http.code;
    details = http.details;
  } else if (isBodyParserError(error)) {
    // express.json() rejecting a malformed or oversized body is the caller's
    // fault, not ours. Left to the branch below it became a 500 — which told
    // the visitor "something went wrong on our side", recorded an incident
    // against the IT dashboard's error count, and wrote a durable error_logs
    // row, for what is simply a bad request.
    status = error.status === 413 ? 413 : 400;
    code = status === 413 ? 'payload_too_large' : 'malformed_body';
    message =
      status === 413
        ? 'That request was too large.'
        : 'That request body could not be read. It must be valid JSON.';
  } else if (error instanceof Error) {
    // Don't leak internals in production, but never hide them in development.
    message = env.isProduction ? message : error.message;
  }

  if (status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} - ${String(error)}`);

    // Durably record anything that is our fault so the IT console can see it.
    // 4xx is the caller being told no and is not worth an incident. Imported
    // lazily to keep the middleware free of a service-layer import cycle, and
    // deliberately not awaited — logging must not delay the response.
    void import('@/services/error-log.service')
      .then(({ captureError }) =>
        captureError({
          source: 'api',
          severity: 'error',
          error,
          operation: `${req.method} ${req.route?.path ?? req.originalUrl}`,
          meta: { status, url: req.originalUrl },
        }),
      )
      .catch((failure) => logger.error('Error logging failed', failure));
  }

  recentErrors.unshift({
    at: new Date().toISOString(),
    status,
    message,
    path: `${req.method} ${req.originalUrl}`,
  });
  recentErrors.splice(50);

  res.status(status).json({ message, code, details });
};

/** Counts requests and failures for the IT dashboard. */
export const metrics = { requests: 0, errors: 0, startedAt: new Date().toISOString() };

export const countRequests: RequestHandler = (_req, res, next) => {
  metrics.requests += 1;
  res.on('finish', () => {
    if (res.statusCode >= 400) metrics.errors += 1;
  });
  next();
};
