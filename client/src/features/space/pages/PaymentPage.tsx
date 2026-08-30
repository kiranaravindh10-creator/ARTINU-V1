import { formatCurrency, PRICING, CONTACT } from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  CircleAlert,
  FileText,
  Hammer,
  Printer,
  QrCode,
  RefreshCw,
  Truck,
  Clock,
} from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Block, PanelHeader } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Progress, Skeleton } from '@/components/ui/display';
import { Input } from '@/components/ui/input';
import { Photo } from '@/components/ui/photo';
import { DataRow } from '@/components/ui/stat';
import { useCountdown } from '@/features/auth/components/AuthBits';
import { errorMessage } from '@/lib/api';
import { qk } from '@/lib/query';
import { orderService, paymentService } from '@/services/space.service';

const NEXT_STEPS = [
  { icon: Check, label: 'Payment verified' },
  { icon: Printer, label: 'Printing' },
  { icon: Hammer, label: 'Framing' },
  { icon: Truck, label: 'Installation' },
];

/**
 * The ARTINU bank account, exactly as supplied by the account holder.
 *
 * Not derived from anything and not editable from the UI: a wrong digit here
 * sends a customer's money to a stranger. If the account ever changes, it
 * changes here, once.
 */
const BANK_DETAILS: { label: string; value: string; mono?: boolean; copyable?: boolean }[] = [
  { label: 'Account name', value: 'S R Kiran Aravindh', copyable: true },
  { label: 'Bank', value: 'Axis Bank' },
  { label: 'Account number', value: '923010014908434', mono: true, copyable: true },
  { label: 'IFSC', value: 'UTIB0000065', mono: true, copyable: true },
  { label: 'Account type', value: 'Savings' },
];

export default function PaymentPage() {
  const { paymentId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reference, setReference] = React.useState('');
  /** Enough characters to be a real reference somebody can look up. */
  const referenceValid = reference.trim().length >= 6;

  /*
    How they paid. Asked because a person reconciles this by hand and the
    reference alone does not say which ledger to open - Google Pay's history or
    the bank statement. One tap for the customer, minutes saved at the other end.
  */
  /*
    Two methods, because the page offers two ways to pay: the QR and the bank
    details. "Google Pay" and "another UPI app" were a distinction without a
    difference - both land in the same UPI account and are reconciled the same
    way - so they are one option, labelled with the app most people will
    actually have used.
  */
  const [paidVia, setPaidVia] = React.useState<'upi' | 'bank'>('upi');

  /*
    Copy, with the label as the flag so only the row you pressed says "Copied".
    An account number read off a screen is the commonest way a transfer goes to
    the wrong place, so every value worth mistyping has a button.
  */
  const [copied, setCopied] = React.useState<string | null>(null);
  const copy = (label: string, value: string) => {
    void navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(label);
        window.setTimeout(() => setCopied(null), 2000);
      },
      () => undefined,
    );
  };

  const {
    data: payment,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: qk.payment(paymentId),
    queryFn: () => paymentService.get(paymentId),
    enabled: Boolean(paymentId),
    // Poll only while the payment could still change on its own.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'awaiting_payment' || status === 'verifying' ? 5000 : false;
    },
  });

  const { data: order } = useQuery({
    queryKey: qk.order(payment?.orderId ?? ''),
    queryFn: () => orderService.get(payment!.orderId),
    enabled: Boolean(payment?.orderId),
  });

  const countdown = useCountdown(payment?.expiresAt ?? undefined);

  const verify = useMutation({
    mutationFn: (input: { reference?: string; simulate?: 'success' | 'failure'; paidVia?: string }) =>
      paymentService.verify(paymentId, input),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: qk.payment(paymentId) });
      void queryClient.invalidateQueries({ queryKey: qk.orders() });
      void queryClient.invalidateQueries({ queryKey: qk.invoices });
      if (result.payment.status === 'succeeded') toast.success('Payment received');
      else toast.error(result.payment.failureReason ?? 'We could not confirm that payment.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const retry = useMutation({
    mutationFn: () => paymentService.retry(paymentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.payment(paymentId) });
      toast.success('A fresh QR code is ready');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (isLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-96 rounded-lg" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  /*
    Same bug, higher stakes: this is the screen someone is on WHILE paying. A
    dropped request rendered "We couldn't find that payment.", which reads as
    "your money has gone somewhere we cannot see". It is an error, and it says
    so, and it offers to try again.
  */
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;

  if (!payment) {
    return (
      <EmptyState
        icon={<QrCode />}
        title="We couldn't find that payment."
        action={
          <Button asChild>
            <Link to="/space/orders">Your orders</Link>
          </Button>
        }
      />
    );
  }

  /*
    ── Submitted, and waiting on a person ────────────────────────────────────

    This is the screen the customer lands on after sending their transaction
    reference, and it has one job: say plainly that the money has NOT been
    confirmed yet, without making them feel something went wrong.

    It deliberately does not say "payment received" or show a tick. Nobody has
    looked at the account yet - manager and operations have been told, and one
    of them will check the reference against Google Pay or the bank statement.
    Claiming success here and retracting it later is the one thing this flow
    cannot do.
  */
  if (payment.status === 'verifying') {
    return (
      <div className="max-w-lg">
        <span className="flex size-12 items-center justify-center rounded-full bg-sand text-ink">
          <Clock className="size-6" strokeWidth={1.5} aria-hidden />
        </span>
        <h1 className="mt-6 font-display text-[2.5rem] leading-[1.05] text-ink">
          Payment details submitted.
        </h1>
        <span className="rule mt-6" />

        <p className="prose-quiet mt-6">
          Thank you. We have your reference{' '}
          <span className="font-mono text-ink">{payment.reference}</span> for order{' '}
          <span className="font-mono text-ink">{order?.reference}</span> of{' '}
          {formatCurrency(payment.amount)}.
        </p>
        <p className="prose-quiet mt-4">
          Our team is checking it against our account now. Once the payment is confirmed we will
          email your invoice to your registered address and start printing.
        </p>
        <p className="prose-quiet mt-4">
          There is nothing more for you to do, and no need to pay again. Verification is usually
          done the same working day.
        </p>

        <div className="mt-8 rounded-md border border-line bg-canvas-soft px-4 py-3">
          <p className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
            Status
          </p>
          <p className="mt-1 text-sm text-ink">Verification pending</p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button shape="pill" asChild>
            <Link to={`/space/orders/${payment.orderId}`}>Track your order</Link>
          </Button>
          <Button variant="outline" shape="pill" asChild>
            <Link to="/space/orders">Your orders</Link>
          </Button>
        </div>

        <p className="mt-8 text-xs text-subtle">
          Something wrong with the payment? Call us on{' '}
          <a href={`tel:${CONTACT.phoneRaw}`} className="text-ink underline underline-offset-4">
            {CONTACT.phone}
          </a>
          .
        </p>
      </div>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────
  if (payment.status === 'succeeded') {
    return (
      <div className="max-w-lg">
        <span className="flex size-12 items-center justify-center rounded-full bg-bronze-soft text-bronze">
          <Check className="size-6" strokeWidth={1.5} aria-hidden />
        </span>
        <h1 className="mt-6 font-display text-[2.5rem] leading-[1.05] text-ink">
          Payment received.
        </h1>
        <span className="rule mt-6" />
        <p className="prose-quiet mt-6">
          Order <span className="font-mono text-ink">{order?.reference}</span> is confirmed for{' '}
          {formatCurrency(payment.amount)}. Printing starts right away - we&rsquo;ll email you at
          every stage, so there is nothing to check on.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button shape="pill" asChild>
            <Link to={`/space/orders/${payment.orderId}`}>Track your order</Link>
          </Button>
          {order?.invoiceId && (
            <Button variant="outline" shape="pill" asChild>
              <Link to="/space/invoices">
                <FileText /> Invoices
              </Link>
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ── Failure / expiry ─────────────────────────────────────────────────────
  if (payment.status === 'failed' || payment.status === 'expired' || countdown.expired) {
    return (
      <div className="max-w-lg">
        <span className="flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
          <CircleAlert className="size-6" strokeWidth={1.5} aria-hidden />
        </span>
        <h1 className="mt-6 font-display text-[2.5rem] leading-[1.05] text-ink">
          {countdown.expired && payment.status === 'awaiting_payment'
            ? 'That code expired.'
            : 'Payment didn’t go through.'}
        </h1>
        <span className="rule mt-6" />
        <p className="prose-quiet mt-6">
          {payment.failureReason ??
            'The payment window closed before we saw the money. Nothing has been charged, and your cart is exactly as you left it.'}
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button shape="pill" loading={retry.isPending} onClick={() => retry.mutate()}>
            <RefreshCw /> Try again
          </Button>
          <Button variant="outline" shape="pill" asChild>
            <Link to="/space/cart">Back to cart</Link>
          </Button>
        </div>
      </div>
    );
  }

  // ── Awaiting payment ─────────────────────────────────────────────────────
  const windowSeconds = 10 * 60;
  const progress = Math.max(0, Math.min(100, (countdown.remaining / windowSeconds) * 100));

  return (
    <div>
      <PanelHeader
        title="Complete your payment"
        description="Scan the code with any UPI app. We'll confirm the moment it lands."
      />

      <div className="grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
            <p className="font-label text-xs uppercase tracking-[0.14em] text-subtle">
              {payment.reference}
            </p>
            <p className="font-label text-[0.625rem] uppercase tracking-[0.14em] text-subtle">
              {PRICING.CURRENCY}
            </p>
          </div>

          <p className="mt-5 font-display text-[2.75rem] leading-none text-ink">
            {formatCurrency(payment.amount)}
          </p>

          {payment.qrImageDataUrl && (
            <div className="mt-6 flex justify-center border border-line bg-white p-6">
              <Photo
                src={payment.qrImageDataUrl}
                alt="UPI QR code for this payment"
                className="size-56"
                tone="bg-white"
                priority
              />
            </div>
          )}

          <div className="mt-5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Code expires in</span>
              <span className="font-mono tabular-nums text-ink">{countdown.label}</span>
            </div>
            <Progress value={progress} className="mt-2" />
          </div>

          <p className="mt-6 text-sm leading-relaxed text-muted">
            Scan with GPay, PhonePe, Paytm or any UPI app. We confirm it automatically - you can
            close this page.
          </p>

          {/* The primary path is automatic. Manual confirmation is the fallback
              for when a bank is slow, so it reads as one, not as another step. */}
          {/*
            Bank transfer, alongside the QR rather than instead of it.

            The QR above is untouched - same account, same dynamic amount. This
            is a second way to pay for anyone who would rather move money from
            their bank than open a UPI app, which is most finance departments.

            Every value here was supplied by the account holder. Nothing is
            derived, abbreviated or reformatted: an account number that is one
            character out is money that goes somewhere else.
          */}
          <div className="mt-8 border-t border-line pt-6">
            <p className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
              Or pay by bank transfer
            </p>
            <p className="mt-2 text-xs text-muted">
              Transfer {formatCurrency(payment.amount)} using these details, then enter the
              reference below.
            </p>

            <dl className="mt-4 divide-y divide-line-soft border-y border-line-soft">
              {BANK_DETAILS.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4 py-2.5">
                  <dt className="text-xs text-subtle">{row.label}</dt>
                  <dd className="flex items-center gap-2 text-right">
                    <span className={cn('text-sm text-ink', row.mono && 'font-mono')}>
                      {row.value}
                    </span>
                    {row.copyable && (
                      <button
                        type="button"
                        onClick={() => copy(row.label, row.value)}
                        className="text-[0.6875rem] text-bronze underline-offset-4 hover:underline"
                        aria-label={`Copy ${row.label.toLowerCase()}`}
                      >
                        {copied === row.label ? 'Copied' : 'Copy'}
                      </button>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/*
            ── The last step, on the page ────────────────────────────────────

            This was a small orange link reading "Paid but still waiting? Enter
            your UTR", which opened a dialog. Two problems, and both cost
            orders: it read like troubleshooting for a payment that had gone
            wrong rather than the normal next step, and "UTR" means nothing to
            most people. Somebody who had just paid was left on a page with no
            obvious way to tell us.

            It is a plain form now, in the flow, in the order the customer does
            things: pay, say how, paste the reference, submit.
          */}
          <form
            className="mt-8 border-t border-line pt-6"
            onSubmit={(event) => {
              event.preventDefault();
              if (!referenceValid) return;
              verify.mutate({ reference: reference.trim(), paidVia });
            }}
          >
            <h2 className="font-display text-xl text-ink">After completing your payment</h2>
            <p className="prose-quiet mt-1.5 text-sm">
              Tell us how you paid and the reference your bank or app gave you. We check it
              against our account and email your invoice once it clears.
            </p>

            <div className="mt-5 grid gap-4 sm:max-w-md">
              <div>
                <label
                  htmlFor="paid-via"
                  className="block font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle"
                >
                  How did you pay?
                </label>
                {/*
                  A select, not the three buttons that were here. Two options do
                  not need three controls, and a dropdown is the thing everyone
                  already knows how to use on a form.
                */}
                <select
                  id="paid-via"
                  value={paidVia}
                  onChange={(event) => setPaidVia(event.target.value as 'upi' | 'bank')}
                  className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze"
                >
                  <option value="upi">UPI / Google Pay</option>
                  <option value="bank">Net banking / Bank transfer</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="payment-reference"
                  className="block font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle"
                >
                  {paidVia === 'bank' ? 'Transaction reference number' : 'UPI transaction ID'}
                </label>
                <Input
                  id="payment-reference"
                  className="mt-2 bg-white"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder={
                    paidVia === 'bank'
                      ? 'The reference on your bank statement'
                      : 'The transaction ID in your UPI app'
                  }
                  aria-invalid={reference.trim().length > 0 && !referenceValid}
                  required
                />
                <p className="mt-2 text-xs text-subtle">
                  Never share your UPI PIN, OTP or any password. We will never ask for them.
                </p>
              </div>

              <div>
                <Button type="submit" loading={verify.isPending} disabled={!referenceValid}>
                  Submit payment details
                </Button>
              </div>
            </div>
          </form>

        </div>

        <div className="space-y-10">
          {order && (
            <Block label={`Order ${order.reference}`}>
              <ul className="divide-y divide-line-soft">
                {order.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                    <Photo
                      src={item.artworkImageUrl}
                      alt={item.artworkTitle}
                      className="size-12 shrink-0 rounded-sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{item.artworkTitle}</p>
                      <p className="truncate text-xs text-subtle">{item.artistName}</p>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums text-muted">× {item.quantity}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 border-t border-line pt-3">
                <DataRow label="Printing and framing" value={formatCurrency(order.pricing.subtotal)} />
                {/* Only when there is tax to show. See CheckoutPage. */}
                {order.pricing.gst > 0 && (
                  <DataRow label="GST" value={formatCurrency(order.pricing.gst)} />
                )}
                <DataRow label="Total" value={formatCurrency(order.pricing.total)} emphasis />
              </div>
            </Block>
          )}

          {/* These four really are a sequence, so they are numbered. */}
          <Block label="Then we take over">
            <ol className="flex flex-wrap gap-x-8 gap-y-5">
              {NEXT_STEPS.map((step, index) => (
                <li key={step.label} className="flex items-center gap-2.5">
                  <step.icon className="size-4 shrink-0 stroke-[1.5] text-bronze" aria-hidden />
                  <span className="text-sm text-muted">
                    <span className="font-mono text-[0.625rem] text-subtle">
                      0{index + 1}
                    </span>{' '}
                    {step.label}
                  </span>
                </li>
              ))}
            </ol>
          </Block>
        </div>
      </div>

    </div>
  );
}
