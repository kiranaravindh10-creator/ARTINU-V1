import { FRAME_COLORS, FRAME_MATERIALS, FRAME_SIZES } from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Frame as FrameIcon, PackagePlus, Recycle, Search } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/DashboardShell';
import { SubNav } from '@/features/console/components/SubNav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMessage } from '@/lib/api';
import { operationsService, type ReallocationPlan } from '@/services/operations.service';

const STATUS_TONE: Record<string, 'success' | 'info' | 'bronze' | 'neutral' | 'danger'> = {
  available: 'success',
  reserved: 'info',
  installed: 'bronze',
  in_transit: 'info',
  maintenance: 'danger',
  retired: 'neutral',
};

const sizeOptions = FRAME_SIZES.map((size) => ({ value: size.value, label: size.label }));
const materialOptions = FRAME_MATERIALS.map((m) => ({ value: m.value, label: m.label }));
const colorOptions = FRAME_COLORS.map((c) => ({ value: c.value, label: c.label }));

export default function ConsoleFramesPage() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = React.useState(false);
  const [planOpen, setPlanOpen] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState('');

  const { data: summary } = useQuery({
    queryKey: ['ops', 'frames', 'summary'],
    queryFn: () => operationsService.frameSummary(),
  });

  const { data: frames, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['ops', 'frames', statusFilter],
    queryFn: () => operationsService.frames({ status: statusFilter || undefined, limit: 200 }),
  });

  const addFrames = useMutation({
    mutationFn: operationsService.addFrames,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['ops', 'frames'] });
      setAddOpen(false);
      toast.success(`${result.added} frame${result.added === 1 ? '' : 's'} added to stock.`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div>
      <PageHeader
        title="Frame inventory"
        description="Every physical frame, where it is, and what can be reused before you buy more."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setPlanOpen(true)}>
              <Recycle /> Check reuse
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <PackagePlus /> Add stock
            </Button>
          </div>
        }
      />
      <SubNav
        items={[
          { to: '/console/printing', label: 'Print & frame', end: true },
          { to: '/console/frames', label: 'Frame inventory' },
        ]}
      />

      {/* Reusable-now is the number that prevents an unnecessary purchase, so it
          leads rather than sitting in a table somewhere. */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="border-bronze/40 bg-bronze-soft/30">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-bronze">Reusable now</p>
            <p className="mt-1 font-display text-3xl text-ink">{summary?.reusableNow ?? 0}</p>
            <p className="mt-1 text-xs text-muted">Available before buying</p>
          </CardContent>
        </Card>
        {[
          { label: 'Installed', value: summary?.installed },
          { label: 'Reserved', value: summary?.reserved },
          { label: 'Maintenance', value: summary?.maintenance },
          { label: 'Total reuses', value: summary?.totalReuses },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-wide text-subtle">{stat.label}</p>
              <p className="mt-1 font-display text-3xl text-ink">{stat.value ?? 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {['', 'available', 'reserved', 'installed', 'maintenance'].map((status) => (
          <Button
            key={status || 'all'}
            variant={statusFilter === status ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(status)}
          >
            {status === '' ? 'All' : status.replace('_', ' ')}
          </Button>
        ))}
      </div>

      {isError ? (
        <ErrorState
          title="Frame inventory unavailable."
          error={error}
          onRetry={() => void refetch()}
        />
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : frames && frames.length > 0 ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Frame</TableHead>
                <TableHead>Specification</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Reuses</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {frames.map((frame) => (
                <TableRow key={frame.id}>
                  <TableCell className="font-mono text-xs text-ink">{frame.frameCode}</TableCell>
                  <TableCell className="text-sm text-muted">
                    {frame.size} · {frame.material} · {frame.color}
                  </TableCell>
                  <TableCell className="text-sm text-muted">{frame.condition}</TableCell>
                  <TableCell className="text-sm text-muted">{frame.timesReused}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_TONE[frame.status] ?? 'neutral'}>
                      {frame.status.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <EmptyState
          icon={<FrameIcon />}
          title="No frames recorded yet."
          description="Add your existing stock so the system can tell you what to reuse before ordering more."
          action={<Button onClick={() => setAddOpen(true)}>Add stock</Button>}
        />
      )}

      <AddStockDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        pending={addFrames.isPending}
        onSubmit={(values) => addFrames.mutate(values)}
      />
      <ReusePlanDialog open={planOpen} onOpenChange={setPlanOpen} />
    </div>
  );
}

function AddStockDialog({
  open,
  onOpenChange,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onSubmit: (values: {
    size: string;
    material: string;
    color: string;
    quantity: number;
    purchaseCost?: number;
  }) => void;
}) {
  const [size, setSize] = React.useState<string>(sizeOptions[0]!.value);
  const [material, setMaterial] = React.useState<string>(materialOptions[0]!.value);
  const [color, setColor] = React.useState<string>(colorOptions[0]!.value);
  const [quantity, setQuantity] = React.useState('10');
  const [cost, setCost] = React.useState('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add frames to stock</DialogTitle>
          <DialogDescription>
            Each frame is tracked individually with its own asset tag, so it can be followed from
            one space to the next.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Size">
            <SimpleSelect value={size} onValueChange={setSize} options={sizeOptions} />
          </Field>
          <Field label="Material">
            <SimpleSelect value={material} onValueChange={setMaterial} options={materialOptions} />
          </Field>
          <Field label="Colour">
            <SimpleSelect value={color} onValueChange={setColor} options={colorOptions} />
          </Field>
          <Field label="Quantity" htmlFor="frame-qty" required>
            <Input
              id="frame-qty"
              type="number"
              min={1}
              max={500}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </Field>
          <Field label="Unit cost" htmlFor="frame-cost" hint="Optional - used for reuse savings">
            <Input
              id="frame-cost"
              type="number"
              min={0}
              placeholder="1400"
              value={cost}
              onChange={(event) => setCost(event.target.value)}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            loading={pending}
            disabled={!Number(quantity)}
            onClick={() =>
              onSubmit({
                size,
                material,
                color,
                quantity: Number(quantity),
                purchaseCost: cost ? Number(cost) : undefined,
              })
            }
          >
            Add {Number(quantity) || 0} frames
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The procurement question in dialog form: describe what a new installation
 * needs, and get back how much of it existing stock already covers.
 */
function ReusePlanDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [size, setSize] = React.useState<string>(sizeOptions[0]!.value);
  const [material, setMaterial] = React.useState<string>(materialOptions[0]!.value);
  const [color, setColor] = React.useState<string>(colorOptions[0]!.value);
  const [quantity, setQuantity] = React.useState('6');
  const [plan, setPlan] = React.useState<ReallocationPlan | null>(null);

  const check = useMutation({
    mutationFn: () =>
      operationsService.reallocationPlan([
        { size, material, color, quantity: Number(quantity) || 1 },
      ]),
    onSuccess: setPlan,
    onError: (error) => toast.error(errorMessage(error)),
  });

  React.useEffect(() => {
    if (!open) setPlan(null);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>What can we reuse?</DialogTitle>
          <DialogDescription>
            Describe what the next installation needs. Anything already in stock is listed so it can
            be moved instead of bought.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Size">
            <SimpleSelect value={size} onValueChange={setSize} options={sizeOptions} />
          </Field>
          <Field label="Material">
            <SimpleSelect value={material} onValueChange={setMaterial} options={materialOptions} />
          </Field>
          <Field label="Colour">
            <SimpleSelect value={color} onValueChange={setColor} options={colorOptions} />
          </Field>
          <Field label="How many" htmlFor="plan-qty">
            <Input
              id="plan-qty"
              type="number"
              min={1}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </Field>

          {plan && (
            <div className="rounded-lg border border-line bg-canvas-soft p-5">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="font-display text-2xl text-ink">{plan.totalRequired}</p>
                  <p className="text-xs text-subtle">Required</p>
                </div>
                <div>
                  <p className="font-display text-2xl text-success">{plan.totalFromStock}</p>
                  <p className="text-xs text-subtle">From stock</p>
                </div>
                <div>
                  <p className="font-display text-2xl text-bronze">{plan.totalToPurchase}</p>
                  <p className="text-xs text-subtle">To purchase</p>
                </div>
              </div>

              {plan.lines[0]?.candidates.length ? (
                <div className="mt-4 border-t border-line pt-4">
                  <p className="text-xs uppercase tracking-wide text-subtle">Reusable frames</p>
                  <p className="mt-2 font-mono text-xs leading-relaxed text-ink">
                    {plan.lines[0].candidates.map((c) => c.frameCode).join(', ')}
                  </p>
                </div>
              ) : (
                <p className="mt-4 border-t border-line pt-4 text-sm text-muted">
                  Nothing matching in stock - this specification has to be ordered.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button loading={check.isPending} onClick={() => check.mutate()}>
            <Search /> Check stock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
