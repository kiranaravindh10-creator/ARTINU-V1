import { SPACE_TYPES, SPACE_TYPE_LABELS, formatCurrency, formatDate, type Coupon } from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Tag } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/DashboardShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckboxRow, Switch } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { errorMessage } from '@/lib/api';
import { couponService } from '@/services/admin.service';

/**
 * DISCOUNT CODES.
 *
 * The API, the table and the checkout redemption all existed already —
 * `/admin/coupons`, migration 014, and `coupon.service.ts` on the server. What
 * was missing was any way to reach them: no page, no route, no nav entry and no
 * client service, so the three roles the endpoint names could not create a code
 * at all. This screen is that missing surface and nothing more; no endpoint or
 * column changed.
 *
 * Gated on the roles the API names — CEO, manager, IT team — rather than on a
 * module, because no single module is held by exactly those three. Matching the
 * endpoint directly is what stops the screen and the API drifting apart.
 */
export default function ConsoleCouponsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Coupon | null>(null);

  const [code, setCode] = React.useState('');
  const [label, setLabel] = React.useState('');
  const [type, setType] = React.useState<'percent' | 'flat'>('percent');
  const [value, setValue] = React.useState('10');
  const [minOrderAmount, setMinOrderAmount] = React.useState('');
  const [maxDiscount, setMaxDiscount] = React.useState('');
  const [expiresAt, setExpiresAt] = React.useState('');
  const [usageLimit, setUsageLimit] = React.useState('');
  const [categories, setCategories] = React.useState<string[]>([]);

  const reset = () => {
    setEditing(null); setCode(''); setLabel(''); setType('percent'); setValue('10');
    setMinOrderAmount(''); setMaxDiscount(''); setExpiresAt(''); setUsageLimit(''); setCategories([]);
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'coupons'],
    queryFn: () => couponService.list(),
  });

  const save = useMutation({
    mutationFn: (body: Partial<Coupon>) =>
      editing ? couponService.update(editing.id, body) : couponService.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] });
      setOpen(false); reset();
      toast.success(editing ? 'Coupon updated' : 'Coupon created');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      couponService.update(id, { active }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] });
      toast.success('Coupon updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const openEditor = (coupon: Coupon) => {
    setEditing(coupon);
    setCode(coupon.code); setLabel(coupon.label); setType(coupon.type);
    setValue(String(coupon.value));
    setMinOrderAmount(coupon.minOrderAmount ? String(coupon.minOrderAmount) : '');
    setMaxDiscount(coupon.maxDiscount ? String(coupon.maxDiscount) : '');
    setExpiresAt(coupon.expiresAt ? coupon.expiresAt.slice(0, 10) : '');
    setUsageLimit(coupon.usageLimit ? String(coupon.usageLimit) : '');
    setCategories(coupon.categories ?? []);
    setOpen(true);
  };

  const submit = () => {
    if (code.trim().length < 3) return toast.error('A code needs at least three characters.');
    if (label.trim().length < 3) return toast.error('Give the coupon a short description.');
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error('Enter a discount above zero.');
    if (type === 'percent' && amount > 100) return toast.error('A percentage cannot be over 100%.');

    save.mutate({
      code: code.trim().toUpperCase(),
      label: label.trim(),
      type,
      value: amount,
      active: true,
      // Empty means "no limit" — sent as null rather than 0, which would mean
      // something quite different to the redemption check.
      minOrderAmount: minOrderAmount ? Number(minOrderAmount) : null,
      maxDiscount: type === 'percent' && maxDiscount ? Number(maxDiscount) : null,
      expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
      usageLimit: usageLimit ? Number(usageLimit) : null,
      categories,
    } as Partial<Coupon>);
  };

  const coupons = data ?? [];

  return (
    <div>
      <PageHeader
        title="Discount codes"
        description="Codes a space owner types at checkout. Leave the space types empty and a code applies to every kind of space."
        actions={
          <Button onClick={() => { reset(); setOpen(true); }}>
            <Plus aria-hidden /> New code
          </Button>
        }
      />

      {isLoading && <Skeleton className="h-48 w-full" />}
      {isError && <ErrorState error={error} onRetry={() => void refetch()} />}

      {data && coupons.length === 0 && (
        <EmptyState icon={<Tag />} title="No discount codes yet." />
      )}

      {coupons.length > 0 && (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Applies to</TableHead>
                  <TableHead>Used</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Live</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {coupons.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <span className="block font-medium tabular-nums text-ink">{c.code}</span>
                      <span className="block text-xs text-subtle">{c.label}</span>
                    </TableCell>
                    <TableCell className="text-sm text-ink">
                      {c.type === 'percent' ? `${c.value}% off` : `${formatCurrency(c.value)} off`}
                      {c.minOrderAmount ? (
                        <span className="block text-xs text-subtle">
                          over {formatCurrency(c.minOrderAmount)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs text-muted">
                      {c.categories && c.categories.length > 0
                        ? c.categories
                            .map((t) => SPACE_TYPE_LABELS[t as keyof typeof SPACE_TYPE_LABELS] ?? t)
                            .join(', ')
                        : 'Every space type'}
                    </TableCell>
                    <TableCell className="text-xs text-subtle tabular-nums">
                      {c.usedCount ?? 0}
                      {c.usageLimit ? ` / ${c.usageLimit}` : ''}
                    </TableCell>
                    <TableCell className="text-xs text-subtle">
                      {c.expiresAt ? formatDate(c.expiresAt) : 'No end date'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.active ? 'success' : 'neutral'}>
                        {c.active ? 'Live' : 'Off'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-2">
                        <Switch
                          checked={c.active}
                          onCheckedChange={(active) => toggle.mutate({ id: c.id, active })}
                          aria-label={c.active ? `Switch ${c.code} off` : `Switch ${c.code} on`}
                        />
                        <Button variant="ghost" size="sm" onClick={() => openEditor(c)}>
                          Edit
                        </Button>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.code}` : 'New discount code'}</DialogTitle>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            <Field label="Code" hint="What the customer types. Stored in capitals.">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="WELCOME10"
                disabled={Boolean(editing)}
              />
            </Field>

            <Field label="Description" hint="Shown at checkout when it applies.">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="10% off your first collection" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <SimpleSelect
                  value={type}
                  onValueChange={(v) => setType(v as 'percent' | 'flat')}
                  options={[
                    { value: 'percent', label: 'Percentage off' },
                    { value: 'flat', label: 'Rupees off' },
                  ]}
                />
              </Field>
              <Field label={type === 'percent' ? 'Percent' : 'Rupees'}>
                <Input type="number" min="1" value={value} onChange={(e) => setValue(e.target.value)} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Minimum order" hint="Optional">
                <Input type="number" min="0" value={minOrderAmount} onChange={(e) => setMinOrderAmount(e.target.value)} placeholder="No minimum" />
              </Field>
              {type === 'percent' && (
                <Field label="Cap the discount" hint="Optional">
                  <Input type="number" min="1" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} placeholder="No cap" />
                </Field>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Expires" hint="Optional">
                <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </Field>
              <Field label="Total uses" hint="Optional">
                <Input type="number" min="1" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} placeholder="Unlimited" />
              </Field>
            </div>

            <Field label="Space types" hint="Leave all unticked to apply to every kind of space.">
              <div className="grid grid-cols-2 gap-x-4">
                {SPACE_TYPES.map((t) => (
                  <CheckboxRow
                    key={t}
                    checked={categories.includes(t)}
                    onCheckedChange={(on) =>
                      setCategories((cur) => (on ? [...cur, t] : cur.filter((x) => x !== t)))
                    }
                    label={SPACE_TYPE_LABELS[t]}
                  />
                ))}
              </div>
            </Field>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
            <Button onClick={submit} loading={save.isPending}>
              {editing ? 'Save changes' : 'Create code'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
