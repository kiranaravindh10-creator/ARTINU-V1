import { PRICING } from '@artinu/shared';
import { env } from '@/config/env';

/**
 * Whether this server charges GST - the one question every pricing and invoice
 * path asks, and the only answer they use.
 *
 * Both switches have to be on: GST_FEATURE_ENABLED here, and the shared
 * PRICING.GST_REGISTERED that decides whether checkout and the Console show a
 * GST line. With either off, tax is zero on every new order and invoice, so
 * the server can never charge a tax the screen did not show. Nothing in a
 * request is read: the pricing functions take this as an argument from the
 * server, never from a body.
 */
export const gstCharged = (): boolean => env.GST_FEATURE_ENABLED && PRICING.GST_REGISTERED;
