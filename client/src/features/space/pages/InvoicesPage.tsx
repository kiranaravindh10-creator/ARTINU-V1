import { formatCurrency, formatDate } from '@artinu/shared';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, Receipt } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PanelHeader } from '@/components/layout/DashboardShell';
import { Figure, FigureRow, Status } from '@/components/layout/panel';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import { qk } from '@/lib/query';
import { invoiceService, orderService } from '@/services/space.service';

/** Column widths, shared by the header row and the body so they stay aligned. */
const COLS = 'grid grid-cols-[1fr_auto] gap-x-6 sm:grid-cols-[9rem_7rem_1fr_7rem_5rem_2rem]';

export default function InvoicesPage() {
  const { data: invoices, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.invoices,
    queryFn: () => invoiceService.list(),
  });

  // An invoice carries an order id; the accountant wants the order reference.
  const { data: orders } = useQuery({
    queryKey: qk.orders({ pageSize: 100 }),
    queryFn: () => orderService.list({ pageSize: 100 }),
  });
  const referenceFor = new Map((orders?.items ?? []).map((order) => [order.id, order.reference]));

  // The Indian financial year runs April to March.
  const now = new Date();
  const fyStart = new Date(now.getFullYear() - (now.getMonth() < 3 ? 1 : 0), 3, 1);
  const thisYear = (invoices ?? []).filter((invoice) => new Date(invoice.issuedAt) >= fyStart);

  const totalGst = thisYear.reduce((sum, invoice) => sum + invoice.gst, 0);
  const totalSpend = (invoices ?? []).reduce((sum, invoice) => sum + invoice.amount, 0);

  return (
    <div>
      <PanelHeader
        icon={FileText}
        title="Invoices"
        description="View and download your invoices — GST included, ready for your accountant."
      />

      <div className="border-b border-line pb-10">
        <FigureRow className="lg:gap-x-16">
          <Figure value={thisYear.length} label="Invoices this FY" hint="Since 1 April" />
          <Figure value={formatCurrency(totalGst)} label="GST paid this FY" hint="Claimable input" />
          <Figure
            value={formatCurrency(totalSpend, { compact: true })}
            label="Total spend"
            hint="All time"
          />
        </FigureRow>
      </div>

      <div className="mt-10">
        {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
          <div className="space-y-px">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : invoices && invoices.length > 0 ? (
          <>
            <div
              className={`${COLS} hidden border-b border-line pb-2.5 font-label text-[0.5625rem] uppercase tracking-[0.16em] text-subtle sm:grid`}
            >
              <span>Invoice ID</span>
              <span>Date</span>
              <span>Order</span>
              <span className="text-right">Amount</span>
              <span>Status</span>
              <span className="sr-only">Download</span>
            </div>

            <ul className="divide-y divide-line-soft">
              {invoices.map((invoice) => (
                <li key={invoice.id} className={`${COLS} items-center py-3.5 text-sm`}>
                  <span className="font-mono text-xs text-ink">{invoice.number}</span>
                  <span className="hidden text-muted sm:block">{formatDate(invoice.issuedAt)}</span>
                  <Link
                    to={`/space/orders/${invoice.orderId}`}
                    className="hidden truncate font-mono text-xs text-subtle transition-colors hover:text-bronze sm:block"
                  >
                    {referenceFor.get(invoice.orderId) ?? '—'}
                  </Link>
                  <span className="hidden text-right tabular-nums text-ink sm:block">
                    {formatCurrency(invoice.amount)}
                  </span>
                  <Status tone="success" className="hidden sm:inline">
                    Paid
                  </Status>

                  {/* On narrow screens the row collapses to number + total + action. */}
                  <span className="text-right tabular-nums text-ink sm:hidden">
                    {formatCurrency(invoice.amount)}
                  </span>

                  <button
                    type="button"
                    onClick={() => void invoiceService.download(invoice)}
                    aria-label={`Download invoice ${invoice.number}`}
                    className="justify-self-end text-subtle transition-colors hover:text-bronze"
                  >
                    <Download className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <EmptyState
            icon={<Receipt />}
            title="No invoices yet."
            description="An invoice is issued the moment a payment is confirmed."
          />
        )}
      </div>
    </div>
  );
}
