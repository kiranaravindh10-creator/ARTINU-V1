import {
  formatDate,
  FRAME_COLORS,
  FRAME_MATERIALS,
  FRAME_SIZES,
  GLASS_TYPES,
  ORDER_STATUS_LABELS,
  PRINT_FINISHES,
  type Order,
} from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState, Skeleton } from '@/components/ui/display';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMessage } from '@/lib/api';
import { adminService } from '@/services/admin.service';

type ProductionOrder = Order & { spaceName?: string; spaceCity?: string };

const STAGES = [
  { status: 'confirmed' as const, title: 'Ready to print', next: 'printing' as const },
  { status: 'printing' as const, title: 'Printing', next: 'framing' as const },
  { status: 'framing' as const, title: 'Framing', next: 'dispatched' as const },
];

const label = <T extends readonly { value: string; label: string }[]>(options: T, value: string) =>
  options.find((option) => option.value === value)?.label ?? value;

export default function ConsolePrintingPage() {
  const queryClient = useQueryClient();
  const [workOrder, setWorkOrder] = React.useState<ProductionOrder | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'printing'],
    queryFn: () => adminService.printingQueue(),
  });

  const advance = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      adminService.updateOrderStatus(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'printing'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      toast.success('Moved to the next stage');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const orders = (data ?? []) as ProductionOrder[];

  if (isLoading) return <Skeleton className="h-96 w-full rounded-lg" />;

  return (
    <div>
      <PageHeader
        title="Print &amp; frame"
        description="The production floor. Every order that needs making, in the order it arrived."
      />

      {orders.length === 0 ? (
        <EmptyState
          icon={<Printer />}
          title="Nothing in production."
          description="Confirmed orders land here the moment a payment clears."
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          {STAGES.map((stage) => {
            const items = orders.filter((order) => order.status === stage.status);
            return (
              <section key={stage.status}>
                <div className="mb-3 flex items-baseline justify-between gap-2">
                  <h2 className="font-display text-lg text-ink">{stage.title}</h2>
                  <span className="font-label tabular-nums text-xs text-subtle">{items.length}</span>
                </div>

                <ul className="space-y-3">
                  {items.map((order) => (
                    <li key={order.id}>
                      <Card>
                        <CardContent className="p-4">
                          <p className="font-mono text-xs text-ink">{order.reference}</p>
                          <p className="mt-0.5 truncate text-sm text-ink-soft">
                            {order.spaceName ?? 'Unknown space'}
                          </p>
                          <p className="text-xs text-subtle">
                            {order.spaceCity} · placed {formatDate(order.placedAt)}
                          </p>

                          <p className="mt-3 text-sm text-ink">
                            {order.pricing.quantity} frames ·{' '}
                            <span className="text-muted">
                              {new Set(order.items.map((item) => item.frame.size)).size} sizes
                            </span>
                          </p>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => setWorkOrder(order)}>
                              Work order
                            </Button>
                            <Button
                              size="sm"
                              loading={advance.isPending}
                              onClick={() => advance.mutate({ id: order.id, status: stage.next })}
                            >
                              Move to {ORDER_STATUS_LABELS[stage.next]}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  ))}

                  {items.length === 0 && (
                    <li className="rounded-lg border border-dashed border-line py-8 text-center text-xs text-subtle">
                      Nothing at this stage
                    </li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(workOrder)} onOpenChange={(open) => !open && setWorkOrder(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Work order · {workOrder?.reference}</DialogTitle>
            <DialogDescription>
              {workOrder?.spaceName} · {workOrder?.spaceCity} · {workOrder?.pricing.quantity} frames
            </DialogDescription>
          </DialogHeader>

          {workOrder && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Photograph</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Frame</TableHead>
                  <TableHead>Glass</TableHead>
                  <TableHead>Finish</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workOrder.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="max-w-[12rem] truncate text-ink">
                      {item.artworkTitle}
                      <span className="block text-xs text-subtle">{item.artistName}</span>
                    </TableCell>
                    <TableCell className="text-xs">{label(FRAME_SIZES, item.frame.size)}</TableCell>
                    <TableCell className="text-xs">
                      {label(FRAME_MATERIALS, item.frame.material)} ·{' '}
                      {label(FRAME_COLORS, item.frame.color)}
                    </TableCell>
                    <TableCell className="text-xs">{label(GLASS_TYPES, item.frame.glass)}</TableCell>
                    <TableCell className="text-xs">
                      {label(PRINT_FINISHES, item.frame.finish)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-ink">
                      {item.quantity}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <Button variant="outline" onClick={() => window.print()}>
            Print this work order
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
