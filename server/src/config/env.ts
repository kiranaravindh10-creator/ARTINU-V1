import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

// One .env at the repo root feeds both workspaces.
for (const candidate of [path.join(repoRoot, '.env'), path.join(repoRoot, 'server/.env')]) {
  if (existsSync(candidate)) dotenv.config({ path: candidate });
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  CLIENT_URL: z.string().default('http://localhost:5173'),

  DATA_DRIVER: z.enum(['memory', 'supabase']).default('memory'),
  /**
   * Whether an empty database gets the demo dataset on boot.
   *
   * Unset, this follows the driver: the in-process store seeds (that is the
   * whole point of it), a real database does not. Seeding a fresh Supabase
   * project used to be automatic and silent, which put 31 fictional users,
   * 140 invented artworks and a CEO account whose password is printed in the
   * README into what may well be production. Opt in with SEED_DEMO_DATA=true
   * when demo data is genuinely wanted.
   */
  SEED_DEMO_DATA: z
    .string()
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  /** Persist the in-memory store to disk so dev restarts keep their data. */
  MEMORY_PERSIST: z
    .string()
    .optional()
    .transform((value) => value !== 'false'),

  SUPABASE_URL: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  AUTH_DRIVER: z.enum(['local', 'supabase']).default('local'),
  JWT_SECRET: z.string().min(16).default('artinu-development-secret-change-me-32'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  STORAGE_DRIVER: z.enum(['local', 'supabase', 'cloudinary', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./uploads'),
  STORAGE_PUBLIC_BASE_URL: z.string().default('http://localhost:4000/uploads'),

  

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // S3
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('ARTINU <hello@artinu.in>'),

  /**
   * SendGrid. Server-only — this key can send mail as the whole domain, so it
   * must never reach the browser bundle (no VITE_ prefix, never returned by an
   * endpoint). Unset simply means SendGrid is not the transport.
   */
  SENDGRID_API_KEY: z.string().optional(),
  /**
   * Which transport actually delivers. 'auto' is the intended setting: SendGrid
   * when its key is present, SMTP when that is configured instead, and the
   * console otherwise so every flow stays walkable with no provider at all.
   * The explicit values exist to pin one, or to force 'console' in a staging
   * environment that must not send real mail.
   */
  MAIL_PROVIDER: z.enum(['auto', 'sendgrid', 'smtp', 'console']).default('auto'),
  /**
   * The From header, provider-neutral. Defaults to SMTP_FROM so existing
   * deployments keep the sender they already had. Must be an address SendGrid
   * has authenticated, or delivery is rejected at the API call.
   */
  MAIL_FROM: z.string().optional(),
  /** Where replies go when it is not the From address. */
  MAIL_REPLY_TO: z.string().email().optional(),
  /**
   * Optional blind archive copy of every outgoing message. Leave unset in
   * production: it doubles the send count against the monthly SMTP allowance
   * and puts one-time codes and reset links in a second inbox.
   */
  MAIL_ARCHIVE: z.string().email().optional(),
  /**
   * Messages the SMTP plan allows per calendar month. Tracked durably so the
   * IT team is warned before sign-in codes start failing.
   */
  MAIL_MONTHLY_LIMIT: z.coerce.number().int().positive().default(3000),

  /**
   * Anthropic API key for the upload image-safety check (requirements §28).
   * Unset means the visual check does not run — uploads are then published on
   * the text and dimension checks alone, which cannot see the photograph.
   */
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-opus-5'),

  PAYMENT_PROVIDER: z.enum(['mock_qr', 'razorpay', 'stripe']).default('mock_qr'),
  PAYMENT_UPI_VPA: z.string().default('artinu@upi'),
  PAYMENT_PAYEE_NAME: z.string().default('ARTINU'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Google Drive Mirror (deprecated - kept for migration)
  GOOGLE_SERVICE_ACCOUNT_KEY: z.string().optional(),
  GOOGLE_DRIVE_ROOT_FOLDER_ID: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  · ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const raw = parsed.data;

/**
 * A production JWT secret must be genuinely unique.
 *
 * The check used to compare against the one built-in default, which meant the
 * placeholder shipped in `.env.example` —
 * "change-me-in-production-please-use-32-chars-min" — sailed through it: not
 * the default string, and comfortably over the 16-character minimum. Anyone who
 * copied the template and deployed it would be signing sessions with a value
 * published in the repository, so any reader could mint a token for any account,
 * including a CEO one. Match on the shape of a placeholder instead of one exact
 * string, and require real length while we are here.
 */
const WEAK_SECRET_MARKERS = [/change[-_ ]?me/i, /^artinu-development-secret/i, /please[-_ ]use/i, /^(secret|password|changeit|test)$/i];

if (raw.NODE_ENV === 'production') {
  if (WEAK_SECRET_MARKERS.some((marker) => marker.test(raw.JWT_SECRET))) {
    throw new Error(
      'JWT_SECRET is still a placeholder. Set a unique random value in production — ' +
        'generate one with:  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    );
  }
  if (raw.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production.');
  }
}

// Falling back to a driver whose credentials are missing would fail at the
// first request instead of at boot, so resolve it here and say so out loud.
const dataDriver =
  raw.DATA_DRIVER === 'supabase' && !(raw.SUPABASE_URL && raw.SUPABASE_SERVICE_ROLE_KEY)
    ? 'memory'
    : raw.DATA_DRIVER;

const storageDriver =
  (raw.STORAGE_DRIVER === 'supabase' && !(raw.SUPABASE_URL && raw.SUPABASE_SERVICE_ROLE_KEY)) ||
  (raw.STORAGE_DRIVER === 'cloudinary' && !(raw.CLOUDINARY_CLOUD_NAME && raw.CLOUDINARY_API_KEY && raw.CLOUDINARY_API_SECRET)) ||
  (raw.STORAGE_DRIVER === 's3' && !(raw.AWS_REGION && raw.AWS_ACCESS_KEY_ID && raw.AWS_SECRET_ACCESS_KEY && raw.S3_BUCKET))
    ? 'local'
    : raw.STORAGE_DRIVER;

// Supabase Auth is not implemented yet — auth.service.ts is bcrypt + JWT only.
// Accepting the setting and then quietly ignoring it would be worse than
// refusing it, so the driver is pinned to local and the fallback is reported.
const authDriver = 'local' as const;

// Same idea as the data and storage drivers: resolve the transport once, at
// boot, rather than discovering at the first send that the chosen provider has
// no credentials behind it.
const smtpConfigured = Boolean(raw.SMTP_HOST && raw.SMTP_USER);
const sendgridConfigured = Boolean(raw.SENDGRID_API_KEY);

const mailProvider: 'sendgrid' | 'smtp' | 'console' =
  raw.MAIL_PROVIDER === 'console'
    ? 'console'
    : raw.MAIL_PROVIDER === 'sendgrid'
      ? sendgridConfigured
        ? 'sendgrid'
        : 'console'
      : raw.MAIL_PROVIDER === 'smtp'
        ? smtpConfigured
          ? 'smtp'
          : 'console'
        : // 'auto' — SendGrid wins when both are present.
          sendgridConfigured
          ? 'sendgrid'
          : smtpConfigured
            ? 'smtp'
            : 'console';

export const env = {
  ...raw,
  DATA_DRIVER: dataDriver,
  STORAGE_DRIVER: storageDriver,
  AUTH_DRIVER: authDriver,
  /** Explicit setting wins; otherwise only the throwaway store seeds itself. */
  SEED_DEMO_DATA: raw.SEED_DEMO_DATA ?? dataDriver === 'memory',
  isProduction: raw.NODE_ENV === 'production',
  isDevelopment: raw.NODE_ENV === 'development',
  repoRoot,
  serverRoot: path.resolve(here, '../..'),
  uploadsDir: path.isAbsolute(raw.STORAGE_LOCAL_DIR)
    ? raw.STORAGE_LOCAL_DIR
    : path.resolve(here, '../..', raw.STORAGE_LOCAL_DIR),
  smtpConfigured,
  sendgridConfigured,
  /** The transport that will actually be used, after credential resolution. */
  MAIL_PROVIDER: mailProvider,
  /** True when a real provider is behind sendMail — not the console fallback. */
  mailConfigured: mailProvider !== 'console',
  /** Canonical sender. MAIL_FROM wins; SMTP_FROM is the backwards-compatible fallback. */
  mailFrom: raw.MAIL_FROM?.trim() || raw.SMTP_FROM,
} as const;

export const driverSummary = {
  data: env.DATA_DRIVER,
  auth: env.AUTH_DRIVER,
  storage: env.STORAGE_DRIVER,
  email: env.MAIL_PROVIDER,
  payments: env.PAYMENT_PROVIDER,
};

/** Warn when a requested driver was downgraded for missing credentials. */
export function reportDriverFallbacks(log: (message: string) => void) {
  if (raw.DATA_DRIVER !== env.DATA_DRIVER)
    log('DATA_DRIVER=supabase requested but SUPABASE_URL/SERVICE_ROLE_KEY are missing — using memory');
if (raw.STORAGE_DRIVER !== env.STORAGE_DRIVER) {
    const reason =
      raw.STORAGE_DRIVER === 'supabase' && !(raw.SUPABASE_URL && raw.SUPABASE_SERVICE_ROLE_KEY)
        ? 'Supabase credentials are missing'
        : raw.STORAGE_DRIVER === 'cloudinary' && !(raw.CLOUDINARY_CLOUD_NAME && raw.CLOUDINARY_API_KEY && raw.CLOUDINARY_API_SECRET)
        ? 'Cloudinary credentials are missing'
        : raw.STORAGE_DRIVER === 's3' && !(raw.AWS_REGION && raw.AWS_ACCESS_KEY_ID && raw.AWS_SECRET_ACCESS_KEY && raw.S3_BUCKET)
        ? 'S3 credentials are missing'
        : 'credentials are missing';
    log(`STORAGE_DRIVER=${raw.STORAGE_DRIVER} requested but ${reason} — using local disk`);
  }
  if (raw.AUTH_DRIVER !== env.AUTH_DRIVER)
    log(
      'AUTH_DRIVER=supabase is not implemented yet (see docs/SERVICES.md) — using the local bcrypt + JWT driver',
    );

  // Mail silently falling back to the console is the failure that hurts most in
  // production: registration still succeeds, so nothing looks broken, and the
  // welcome mail simply never arrives. Say it out loud at boot.
  if (raw.MAIL_PROVIDER === 'sendgrid' && !sendgridConfigured)
    log('MAIL_PROVIDER=sendgrid requested but SENDGRID_API_KEY is missing — printing mail to the console');
  if (raw.MAIL_PROVIDER === 'smtp' && !smtpConfigured)
    log('MAIL_PROVIDER=smtp requested but SMTP_HOST/SMTP_USER are missing — printing mail to the console');
  if (raw.MAIL_PROVIDER === 'auto' && env.MAIL_PROVIDER === 'console')
    log('No SENDGRID_API_KEY and no SMTP credentials — mail is printed to the console, not delivered');
  if (env.isProduction && env.MAIL_PROVIDER === 'console')
    log('PRODUCTION with no mail provider configured — sign-in codes and password resets cannot be delivered');
}
