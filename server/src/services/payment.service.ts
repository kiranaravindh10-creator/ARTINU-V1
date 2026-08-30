import type { Payment } from '@artinu/shared';
import { createHmac, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import { env } from '@/config/env';
import { HttpError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { isPast, minutesFromNow } from '@/utils/ids';

/**
 * The payment layer sits behind this interface on purpose: the MVP settles with
 * a dynamic UPI QR code, and the tech stack requires that swapping in a real
 * gateway later touches nothing outside this file. Routes and the order service
 * only ever see `PaymentProvider`.
 */

/**
 * The providers you can actually CHARGE through.
 *
 * `Payment['provider']` also includes `manual`, which is money taken outside
 * the system - cash, a bank transfer - and recorded afterwards by staff. There
 * is nothing to construct for it and nothing to call, so it is excluded here
 * rather than given a stub that would have to throw on every method.
 */
export type PaymentProviderId = Exclude<Payment['provider'], 'manual'>;

export interface ChargeInput {
  orderId: string;
  amount: number;
  /** Human-quotable reference printed in the UPI note (PAY…). */
  reference: string;
}

/**
 * What the client needs to open a hosted checkout.
 *
 * `keyId` is the publishable half of the Razorpay key pair and is meant to reach
 * the browser. The secret never leaves this process — it signs and verifies here.
 */
export interface GatewayHandoff {
  provider: 'razorpay';
  orderId: string;
  keyId: string;
  /** Minor units, as the gateway wants them. Paise for INR. */
  amount: number;
  currency: string;
}

export interface ChargeResult {
  qrPayload?: string;
  qrImageDataUrl?: string;
  expiresAt: string;
  /** Present only for a hosted gateway. The mock provider returns a QR instead. */
  gateway?: GatewayHandoff;
  /** Stored against the payment so verification has something to check against. */
  gatewayOrderId?: string;
}

export interface VerifyInput {
  /** The UTR the space owner typed in, or the gateway's payment id. */
  reference?: string | null;
  /** Dev affordance so the QR flow can be walked without moving money. */
  simulate?: 'success' | 'failure';
  /** From Razorpay Checkout's success callback. */
  gatewayPaymentId?: string;
  gatewaySignature?: string;
}

export interface VerifyResult {
  /**
   * `verifying` means the customer says they have paid and a human has to
   * check the account. It is NOT a success: no invoice is issued and no
   * settlement runs until somebody confirms the money arrived.
   */
  status: 'succeeded' | 'verifying' | 'failed';
  failureReason?: string;
  /** Recorded on the payment so a settlement can be traced back to the gateway. */
  gatewayPaymentId?: string;
}

export interface PaymentProvider {
  readonly id: PaymentProviderId;
  createCharge(input: ChargeInput): Promise<ChargeResult>;
  verifyCharge(payment: Payment, input: VerifyInput): Promise<VerifyResult>;
}

/** How long a QR stays valid before the owner has to ask for a fresh one. */
export const PAYMENT_WINDOW_MINUTES = 10;

// ── Mock UPI QR (default) ────────────────────────────────────────────────────

class MockQrProvider implements PaymentProvider {
  readonly id = 'mock_qr' as const;

  async createCharge({ amount, reference }: ChargeInput): Promise<ChargeResult> {
    const qrPayload = upiIntent(amount, reference);

    const qrImageDataUrl = await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 512,
      color: { dark: '#14120f', light: '#f7f5f2' },
    });

    return { qrPayload, qrImageDataUrl, expiresAt: minutesFromNow(PAYMENT_WINDOW_MINUTES) };
  }

async verifyCharge(payment: Payment, { reference, simulate }: VerifyInput): Promise<VerifyResult> {
    /*
      ── `simulate` is a development tool and nothing else ────────────────────

      This honoured `simulate: 'success'` from the request body unconditionally.
      Any signed-in space owner could POST it to their own payment and mark the
      order paid without transferring a rupee - the invoice would issue and the
      settlement would run. It is fenced to non-production now, so the escape
      hatch that makes local testing bearable cannot be used against the real
      account.
    */
    if (simulate) {
      if (env.NODE_ENV === 'production') {
        return { status: 'failed', failureReason: 'We have not seen this payment yet.' };
      }
      if (simulate === 'success') return { status: 'succeeded' };
      return { status: 'failed', failureReason: 'The payment was declined by the bank.' };
    }

    if (isPast(payment.expiresAt)) {
      return { status: 'failed', failureReason: 'Payment window expired.' };
    }

    /*
      ── A reference is a CLAIM, not a receipt ───────────────────────────────

      This returned `succeeded` for any non-empty string, so typing "abc123"
      marked the order paid, issued a GST-less invoice and released the order
      into production. There is no gateway to ask - money arrives in a UPI
      account and somebody has to look - so the honest answer is that a
      reference moves the payment to `verifying` and a human decides.
    */
    if (reference && reference.trim().length >= 6) {
      return { status: 'verifying' };
    }

    return {
      status: 'failed',
      failureReason: 'Enter the transaction or UTR number from your UPI app so we can match it.',
    };
  }
}

/**
 * A UPI intent string, built by hand rather than with URLSearchParams because
 * that encodes spaces as `+`, which several UPI apps read literally.
 */
function upiIntent(amount: number, reference: string): string {
  const query = [
    ['pa', env.PAYMENT_UPI_VPA],
    ['pn', env.PAYMENT_PAYEE_NAME],
    ['am', amount.toFixed(2)],
    ['cu', 'INR'],
    ['tn', reference],
  ]
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');

  return `upi://pay?${query}`;
}

// ── Real gateways ────────────────────────────────────────────────────────────
// Registered so PAYMENT_PROVIDER can be flipped the moment keys exist; until
// then they fail loudly rather than silently falling back to the mock.

/**
 * Razorpay, via the Orders + Checkout + signature flow.
 *
 * The shape of the integration, and why:
 *
 *   1. `createCharge` opens a Razorpay Order server-side for the amount ARTINU
 *      calculated. The browser is never told what to charge — it is handed an
 *      order id and asked to pay *that*, so a tampered client cannot pay less.
 *   2. The customer completes Checkout in the browser, which returns
 *      `razorpay_order_id`, `razorpay_payment_id` and `razorpay_signature`.
 *   3. `verifyCharge` recomputes the signature as
 *      `HMAC_SHA256("<order_id>|<payment_id>", key_secret)` and compares it in
 *      constant time. The order id used is the one WE stored when opening the
 *      charge, never the one the request supplied — otherwise a caller could
 *      present a genuine signature from a cheaper order of their own and have it
 *      verify against this one.
 *
 * Amounts are integer paise. Razorpay rejects fractional minor units, and
 * floating point rupees are exactly how a total ends up a paisa short.
 */
class RazorpayProvider implements PaymentProvider {
  readonly id = 'razorpay' as const;

  private credentials() {
    const keyId = env.RAZORPAY_KEY_ID;
    const keySecret = env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) throw notConfigured('Razorpay');
    return { keyId, keySecret };
  }

  async createCharge({ orderId, amount, reference }: ChargeInput): Promise<ChargeResult> {
    const { keyId, keySecret } = this.credentials();

    // Integer paise. `Math.round` rather than a cast, so 3299.999 from a
    // multiplier chain becomes 330000 rather than 329999.
    const paise = Math.round(amount * 100);

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      },
      body: JSON.stringify({
        amount: paise,
        currency: 'INR',
        // Razorpay caps receipt at 40 characters and rejects longer ones.
        receipt: reference.slice(0, 40),
        notes: { artinuOrderId: orderId, artinuReference: reference },
      }),
      signal: AbortSignal.timeout(15000),
    });

    const body = (await response.json().catch(() => ({}))) as {
      id?: string;
      error?: { description?: string };
    };

    if (!response.ok || !body.id) {
      // Surfaced rather than swallowed: a gateway that will not open an order is
      // not something to retry silently behind a spinner.
      const detail = body.error?.description ?? `HTTP ${response.status}`;
      logger.error(`Razorpay order creation failed: ${detail}`);
      throw new HttpError(
        502,
        `The payment provider could not open this payment (${detail}). Nothing has been charged - please try again.`,
        'gateway_error',
      );
    }

    return {
      expiresAt: minutesFromNow(PAYMENT_WINDOW_MINUTES),
      gatewayOrderId: body.id,
      gateway: { provider: 'razorpay', orderId: body.id, keyId, amount: paise, currency: 'INR' },
    };
  }

  async verifyCharge(payment: Payment, input: VerifyInput): Promise<VerifyResult> {
    const { keySecret } = this.credentials();

    /*
      `simulate` is refused outright here.

      It exists so the QR flow can be walked without moving money, and on a real
      gateway it would be a way to mark an order paid without paying. The mock
      provider is the only place it means anything.
    */
    if (input.simulate) {
      throw new HttpError(
        400,
        'Simulated payments are not available on a live payment provider.',
        'simulate_not_allowed',
      );
    }

    const { gatewayPaymentId, gatewaySignature } = input;
    if (!gatewayPaymentId || !gatewaySignature) {
      return { status: 'failed', failureReason: 'The payment confirmation was incomplete.' };
    }

    // Ours, not theirs. See the class comment.
    const orderId = payment.gatewayOrderId;
    if (!orderId) {
      return {
        status: 'failed',
        failureReason: 'This payment was not opened with the payment provider.',
      };
    }

    const expected = createHmac('sha256', keySecret)
      .update(`${orderId}|${gatewayPaymentId}`)
      .digest('hex');

    if (!safeEqualHex(expected, gatewaySignature)) {
      logger.warn(
        `Razorpay signature mismatch for payment ${payment.id} (order ${orderId}) - rejected.`,
      );
      return { status: 'failed', failureReason: 'The payment could not be verified.' };
    }

    return { status: 'succeeded', gatewayPaymentId };
  }
}

/**
 * Constant-time comparison of two hex digests.
 *
 * `timingSafeEqual` throws when the buffers differ in length, which for a
 * caller-supplied signature is itself a leak of "wrong length" versus "wrong
 * value" — so the length check happens first and returns the same false.
 */
function safeEqualHex(expected: string, provided: string): boolean {
  if (typeof provided !== 'string' || expected.length !== provided.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Verifies a Razorpay webhook body against the shared webhook secret.
 *
 * Separate from `verifyCharge` because a webhook is signed differently: the HMAC
 * covers the entire raw request body, not an id pair. The RAW body matters —
 * re-serialising the parsed JSON changes key order and whitespace and the digest
 * stops matching, which is the single most common reason webhook verification
 * "randomly" fails.
 */
export function verifyRazorpayWebhook(rawBody: string, signature: string | undefined): boolean {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}

class StripeProvider implements PaymentProvider {
  readonly id = 'stripe' as const;

  async createCharge(): Promise<ChargeResult> {
    throw notConfigured('Stripe');
  }

  async verifyCharge(): Promise<VerifyResult> {
    throw notConfigured('Stripe');
  }
}

const notConfigured = (name: string) =>
  new HttpError(
    501,
    `${name} is not configured yet - set PAYMENT_PROVIDER=mock_qr to take payments by UPI QR.`,
    'provider_not_configured',
  );

// ── Factory ──────────────────────────────────────────────────────────────────

const registry: Record<PaymentProviderId, () => PaymentProvider> = {
  mock_qr: () => new MockQrProvider(),
  razorpay: () => new RazorpayProvider(),
  stripe: () => new StripeProvider(),
};

let active: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (!active || active.id !== env.PAYMENT_PROVIDER) {
    active = registry[env.PAYMENT_PROVIDER]();
  }
  return active;
}
