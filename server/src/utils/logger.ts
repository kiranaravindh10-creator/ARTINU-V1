import { env } from '@/config/env';

/** Minimal structured-ish logger — readable in dev, greppable in production. */
const stamp = () => new Date().toISOString().slice(11, 23);

// ESC built from its code point so no raw control byte lives in the source.
const CSI = `${String.fromCharCode(27)}[`;
const paint = (color: number, text: string) =>
  env.isProduction ? text : `${CSI}${color}m${text}${CSI}0m`;

export const logger = {
  info(message: string, meta?: unknown) {
    console.log(`${paint(90, stamp())} ${paint(36, 'info ')} ${message}`, meta ?? '');
  },
  warn(message: string, meta?: unknown) {
    console.warn(`${paint(90, stamp())} ${paint(33, 'warn ')} ${message}`, meta ?? '');
  },
  error(message: string, meta?: unknown) {
    console.error(`${paint(90, stamp())} ${paint(31, 'error')} ${message}`, meta ?? '');
  },
  success(message: string, meta?: unknown) {
    console.log(`${paint(90, stamp())} ${paint(32, 'ready')} ${message}`, meta ?? '');
  },
  /** Emails, OTPs and payment callbacks print here when no provider is wired. */
  channel(channel: string, message: string, meta?: unknown) {
    console.log(`${paint(90, stamp())} ${paint(35, channel.padEnd(5))} ${message}`, meta ?? '');
  },
};
