import { formatCurrency, PRICING } from '@artinu/shared';
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
} from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Block, PanelHeader } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState, Progress, Skeleton } from '@/components/ui/display';
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

export default function PaymentPage() {
  const { paymentId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reference, setReference] = React.useState('');
  const [confirming, setConfirming] = React.useState(false);

  const { data: payment, isLoading } = useQuery({
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
    mutationFn: (input: { reference?: string; simulate?: 'success' | 'failure' }) =>
      paymentService.verify(paymentId, input),
    onSuccess: (result) => {
      setConfirming(false);
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
          {formatCurrency(payment.amount)}. Printing starts right away — we&rsquo;ll email you at
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
            Scan with GPay, PhonePe, Paytm or any UPI app. We confirm it automatically — you can
            close this page.
          </p>

          {/* The primary path is automatic. Manual confirmation is the fallback
              for when a bank is slow, so it reads as one, not as another step. */}
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-3 text-sm text-bronze underline-offset-4 hover:underline"
          >
            Paid but still waiting? Enter your UTR
          </button>

          {import.meta.env.DEV && (
            <div className="mt-6 border-l-2 border-dashed border-bronze/60 bg-bronze-soft/30 py-3 pl-4">
              <p className="font-label text-[0.625rem] uppercase tracking-[0.14em] text-bronze-deep">
                Development
              </p>
              <p className="mt-1 text-xs text-muted">
                No gateway is wired up, so nothing will confirm this on its own.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  loading={verify.isPending}
                  onClick={() => verify.mutate({ simulate: 'success' })}
                >
                  Simulate successful payment
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => verify.mutate({ simulate: 'failure' })}
                >
                  Simulate failure
                </Button>
              </div>
            </div>
          )}
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
                <DataRow label="Subtotal" value={formatCurrency(order.pricing.subtotal)} />
                <DataRow label="GST" value={formatCurrency(order.pricing.gst)} />
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

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm your payment</DialogTitle>
            <DialogDescription>
              If your UPI app gave you a reference (UTR), add it — it helps us match the payment
              instantly.
            </DialogDescription>
          </DialogHeader>

          <Input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="UTR / reference number (optional)"
            aria-label="Payment reference"
          />

          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button loading={verify.isPending} onClick={() => verify.mutate({ reference })}>
              Verify payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
