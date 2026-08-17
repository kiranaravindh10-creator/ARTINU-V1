import type { Payment } from '@artinu/shared';
import QRCode from 'qrcode';
import { env } from '@/config/env';
import { HttpError } from '@/utils/errors';
import { isPast, minutesFromNow } from '@/utils/ids';

/**
 * The payment layer sits behind this interface on purpose: the MVP settles with
 * a dynamic UPI QR code, and the tech stack requires that swapping in a real
 * gateway later touches nothing outside this file. Routes and the order service
 * only ever see `PaymentProvider`.
 */

export type PaymentProviderId = Payment['provider'];

export interface ChargeInput {
  orderId: string;
  amount: number;
  /** Human-quotable reference printed in the UPI note (PAY…). */
  reference: string;
}

export interface ChargeResult {
  qrPayload?: string;
  qrImageDataUrl?: string;
  expiresAt: string;
}

export interface VerifyInput {
  /** The UTR the space owner typed in, or the gateway's payment id. */
  reference?: string | null;
  /** Dev affordance so the QR flow can be walked without moving money. */
  simulate?: 'success' | 'failure';
}

export interface VerifyResult {
  status: 'succeeded' | 'failed';
  failureReason?: string;
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
    if (simulate === 'success') return { status: 'succeeded' };
    if (simulate === 'failure') {
      return { status: 'failed', failureReason: 'The payment was declined by the bank.' };
    }

    if (isPast(payment.expiresAt)) {
      return { status: 'failed', failureReason: 'Payment window expired.' };
    }

    // Without a gateway to ask, a supplied UTR is the only evidence a transfer
    // happened. No reference means the owner is still mid-payment.
    if (reference && reference.trim().length > 0) return { status: 'succeeded' };

    return { status: 'failed', failureReason: 'We have not seen this payment yet.' };
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

class RazorpayProvider implements PaymentProvider {
  readonly id = 'razorpay' as const;

  async createCharge(): Promise<ChargeResult> {
    throw notConfigured('Razorpay');
  }

  async verifyCharge(): Promise<VerifyResult> {
    throw notConfigured('Razorpay');
  }
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
    `${name} is not configured yet — set PAYMENT_PROVIDER=mock_qr to take payments by UPI QR.`,
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
