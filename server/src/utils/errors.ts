/** Errors the API raises on purpose, each mapping to an HTTP status. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, details?: Record<string, string[]>) =>
  new HttpError(400, message, 'bad_request', details);

export const unauthorized = (message = 'Please sign in to continue.') =>
  new HttpError(401, message, 'unauthorized');

export const forbidden = (message = 'You do not have access to this.') =>
  new HttpError(403, message, 'forbidden');

export const notFound = (what = 'That') => new HttpError(404, `${what} could not be found.`, 'not_found');

export const conflict = (message: string) => new HttpError(409, message, 'conflict');

export const tooMany = (message = 'Too many attempts. Please wait a moment and try again.') =>
  new HttpError(429, message, 'rate_limited');

export const serverError = (message = 'Something went wrong on our side.') =>
  new HttpError(500, message, 'server_error');

/**
 * A write that lost a race against a unique index.
 *
 * Thrown by the table layer so callers can tell "someone else got there first"
 * apart from a genuine fault. Without it a unique violation arrives as a bare
 * `Error` and becomes a 500 — the visitor is shown "something went wrong on our
 * side" when the truthful answer is that the slot was taken a moment ago.
 */
export class UniqueViolationError extends Error {
  constructor(
    public table: string,
    public constraint: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'UniqueViolationError';
  }
}

/** Postgres 23505 — unique_violation. */
export const isUniqueViolation = (error: unknown): error is UniqueViolationError =>
  error instanceof UniqueViolationError;
