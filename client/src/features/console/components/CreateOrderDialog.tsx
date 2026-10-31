import {
  clientInputSchema,
  consoleOrderSchema,
  describeFrameLine,
  FRAME_COLOR_MATERIAL,
  FRAME_COLORS,
  FRAME_SIZES,
  formatAmount,
  MIN_ORDER_QUANTITY,
  ORDER_LINE_KIND_LABELS,
  ORDER_PAYMENT_TERMS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  SPACE_TYPE_LABELS,
  SPACE_TYPES,
  type ArtworkWithArtist,
  type ClientSearchResult,
  type ConsoleQuoteInput,
  type OrderLineKind,
  type OrderPaymentTerms,
  type PaymentMethod,
  type PricingMode,
} from '@artinu/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Check, Loader2, Plus, Search, Trash2, TriangleAlert, UserPlus, X } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox, RadioGroup, RadioGroupItem } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { DateInput, Input, PhoneInput, Textarea } from '@/components/ui/input';
import { Photo } from '@/components/ui/photo';
import { SimpleSelect } from '@/components/ui/select';
import { DataRow } from '@/components/ui/stat';
import { SegmentedList, SegmentedTrigger, Tabs } from '@/components/ui/tabs';
import { LinkClientAccount } from '@/features/console/components/LinkClientAccount';
import { useDebounced } from '@/hooks/useDebounced';
import { errorMessage, toApiError } from '@/lib/api';
import { usePermissions } from '@/lib/permissions';
import { qk } from '@/lib/query';
import { cn } from '@/lib/utils';
import { catalogService } from '@/services/catalog.service';
import { consoleOrdersService, type QuoteResult } from '@/services/console-orders.service';
import { peopleService } from '@/services/people.service';

/**
 * ADD AN ORDER - five steps: client, photographs, frames, price and payment,
 * review.
 *
 * For anyone ARTINU works with, whether or not they have ever signed in: a
 * registered space, a client on file, or a business met today. Nobody is made
 * to register so that staff can take their order.
 *
 * ── Prices ──────────────────────────────────────────────────────────────────
 *
 * Staff quote their own selling price - per frame style, per extra charge, with
 * a discount - and see the standard tariff beside it for reference. The browser
 * never decides what anything costs: every figure on these screens comes back
 * from the server's quote, which re-prices the order from its lines, and the
 * order is priced again from scratch when it is created. A price far enough
 * below the tariff waits for someone allowed to approve it; nothing here can
 * skip that, because the server applies it.
 *
 * ── Payment ─────────────────────────────────────────────────────────────────
 *
 * Paid is never a default. Money already received is recorded with its amount,
 * date and method - and may be part of the total. A client without an ARTINU
 * account is never sent a payment link; what they owe is tracked on the order.
 *
 * GST is not charged in this version, and none of these screens add it.
 */

const STEPS = ['Client', 'Photographs', 'Frames', 'Price & payment', 'Review'] as const;

type ClientChoice =
  | { kind: 'space'; result: ClientSearchResult }
  | { kind: 'client'; result: ClientSearchResult; spaceId: string | null };

interface ClientDraft {
  name: string;
  type: string;
  contactName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  pin: string;
  notes: string;
  installElsewhere: boolean;
  install: { addressLine1: string; addressLine2: string; city: string; pin: string };
}

const EMPTY_CLIENT: ClientDraft = {
  name: '',
  type: 'cafe',
  contactName: '',
  email: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  pin: '',
  notes: '',
  installElsewhere: false,
  install: { addressLine1: '', addressLine2: '', city: '', pin: '' },
};

interface FrameGroup {
  key: string;
  size: string;
  color: string;
  /** A negotiated monthly rate per frame. Empty means the standard tariff. */
  unitPrice: string;
}

interface ServiceLine {
  key: string;
  kind: Exclude<OrderLineKind, 'frames'>;
  description: string;
  quantity: string;
  unitPrice: string;
}

interface PaymentDraft {
  terms: OrderPaymentTerms | '';
  amount: string;
  receivedOn: string;
  method: PaymentMethod;
  reference: string;
  notes: string;
  creditNote: string;
}

const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

const newKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

const firstGroup = (): FrameGroup => ({ key: newKey(), size: 'a4', color: 'brown', unitPrice: '' });

const money = (value: string) => (value.trim() === '' ? null : Number(value));

const label = 'font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle';

export function CreateOrderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const mayCustomise = can('orders.custom_price');

  const [step, setStep] = React.useState(0);
  const [blockers, setBlockers] = React.useState<string[]>([]);

  // Step 1
  const [clientMode, setClientMode] = React.useState<'existing' | 'new'>('existing');
  const [choice, setChoice] = React.useState<ClientChoice | null>(null);
  const [draft, setDraft] = React.useState<ClientDraft>(EMPTY_CLIENT);
  const [duplicate, setDuplicate] = React.useState<string | null>(null);

  // Steps 2 and 3
  const [photos, setPhotos] = React.useState<ArtworkWithArtist[]>([]);
  const [groups, setGroups] = React.useState<FrameGroup[]>([firstGroup()]);
  const [assignment, setAssignment] = React.useState<Record<string, string>>({});
  const [services, setServices] = React.useState<ServiceLine[]>([]);

  // Step 4
  const [mode, setMode] = React.useState<PricingMode>('standard');
  const [discount, setDiscount] = React.useState('');
  const [couponCode, setCouponCode] = React.useState('');
  const [priceReason, setPriceReason] = React.useState('');
  const [commercialTerms, setCommercialTerms] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [payment, setPayment] = React.useState<PaymentDraft>({
    terms: '',
    amount: '',
    receivedOn: today(),
    method: 'upi',
    reference: '',
    notes: '',
    creditNote: '',
  });

  // One key per wizard: a double click or a retried request creates one order, not two.
  const [idempotencyKey, setIdempotencyKey] = React.useState(newKey);

  // The branch handling the order. Only central staff choose; anyone held to a
  // branch creates into their own (the API enforces it either way).
  const { data: branchInfo } = useQuery({ queryKey: ['admin', 'people', 'branches'], queryFn: () => peopleService.branches() });
  const [branch, setBranch] = React.useState('');
  const choosesBranch = can('branches.view_all') && (branchInfo?.branches.length ?? 0) > 1;

  // Start clean every time it opens - a half-built order left over from last
  // time is how the wrong photographs end up on someone's wall.
  React.useEffect(() => {
    if (!open) return;
    setStep(0);
    setBlockers([]);
    setClientMode('existing');
    setChoice(null);
    setDraft(EMPTY_CLIENT);
    setDuplicate(null);
    setPhotos([]);
    const group = firstGroup();
    setGroups([group]);
    setAssignment({});
    setServices([]);
    setMode('standard');
    setDiscount('');
    setCouponCode('');
    setPriceReason('');
    setCommercialTerms('');
    setNotes('');
    setPayment({ terms: '', amount: '', receivedOn: today(), method: 'upi', reference: '', notes: '', creditNote: '' });
    setIdempotencyKey(newKey());
  }, [open]);

  // ── Derived order ─────────────────────────────────────────────────────────

  const clientInput = React.useMemo(() => {
    return clientInputSchema.safeParse({
      name: draft.name,
      type: draft.type,
      contactName: draft.contactName,
      email: draft.email.trim(),
      phone: draft.phone,
      addressLine1: draft.addressLine1,
      addressLine2: draft.addressLine2 || null,
      city: draft.city,
      pin: draft.pin.trim(),
      notes: draft.notes || null,
      installAddress: draft.installElsewhere
        ? {
            addressLine1: draft.install.addressLine1,
            addressLine2: draft.install.addressLine2 || null,
            city: draft.install.city,
            pin: draft.install.pin.trim(),
          }
        : null,
    });
  }, [draft]);

  const clientRef = React.useMemo((): ConsoleQuoteInput['client'] | null => {
    if (clientMode === 'new') return clientInput.success ? { kind: 'new', client: clientInput.data } : null;
    if (!choice) return null;
    if (choice.kind === 'space') return { kind: 'space', spaceId: choice.result.spaceId! };
    return { kind: 'client', clientId: choice.result.clientId!, spaceId: choice.spaceId };
  }, [clientMode, clientInput, choice]);

  const groupFor = (artworkId: string) => assignment[artworkId] ?? groups[0]?.key;
  const photosIn = (group: FrameGroup) => photos.filter((photo) => groupFor(photo.id) === group.key);

  const lines = React.useMemo(() => {
    const frameLines = groups
      .map((group) => ({ group, ids: photos.filter((photo) => groupFor(photo.id) === group.key).map((photo) => photo.id) }))
      .filter(({ ids }) => ids.length > 0)
      .map(({ group, ids }) => ({
        kind: 'frames' as const,
        size: group.size,
        color: group.color,
        artworkIds: ids,
        unitPrice: mode === 'custom' ? money(group.unitPrice) : null,
      }));
    const serviceLines = services.map((service) => ({
      kind: service.kind,
      description: service.description.trim() || null,
      quantity: Math.max(1, Math.trunc(Number(service.quantity) || 1)),
      unitPrice: money(service.unitPrice),
    }));
    return [...frameLines, ...serviceLines];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, photos, assignment, services, mode]);

  const quoteInput = React.useMemo((): ConsoleQuoteInput | null => {
    if (!clientRef || lines.length === 0) return null;
    return {
      client: clientRef,
      pricingMode: mode,
      lines,
      discount: mode === 'custom' ? Number(discount || 0) : 0,
      couponCode: mode === 'standard' ? couponCode.trim() || null : null,
      priceReason: priceReason.trim() || null,
      commercialTerms: commercialTerms.trim() || null,
      notes: notes.trim() || null,
    };
  }, [clientRef, lines, mode, discount, couponCode, priceReason, commercialTerms, notes]);

  // The running total is the server's. Asked once typing pauses.
  const pendingQuote = useDebounced(quoteInput ? JSON.stringify(quoteInput) : '', 350);
  const quote = useQuery({
    queryKey: ['admin', 'orders', 'quote', pendingQuote],
    queryFn: () => consoleOrdersService.quote(JSON.parse(pendingQuote) as ConsoleQuoteInput),
    enabled: open && step >= 3 && Boolean(pendingQuote),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const quoted: QuoteResult | undefined = quote.data;
  const settling = Boolean(quoteInput) && (quote.isFetching || pendingQuote !== JSON.stringify(quoteInput));

  const total = quoted?.total ?? 0;
  const approvalNeeded = Boolean(quoted?.quote.requiresApproval);
  const waitsForApproval = approvalNeeded && !can('orders.approve_price');
  const customised = Boolean(quoted?.quote.customised);
  const receivedNow = payment.terms === 'paid_offline' ? Number(payment.amount || 0) : 0;

  // ── Steps ─────────────────────────────────────────────────────────────────

  const checkDuplicate = useMutation({
    mutationFn: () => consoleOrdersService.checkDuplicate(clientInput.data!),
  });

  const problemsFor = (index: number): string[] => {
    const problems: string[] = [];
    if (index === 0) {
      if (clientMode === 'existing') {
        if (!choice) problems.push('Choose the client, or switch to "New client".');
        else if (choice.kind === 'client' && (choice.result.spaces?.length ?? 0) > 1 && !choice.spaceId) {
          problems.push('This client has several locations - choose which one the order is for.');
        }
      } else if (!clientInput.success) {
        problems.push('Complete the client details marked below.');
      } else if (duplicate) {
        problems.push(duplicate);
      }
    }
    if (index === 1) {
      if (!mayCustomise && photos.length < MIN_ORDER_QUANTITY) {
        problems.push(`Choose at least ${MIN_ORDER_QUANTITY} photographs - the smallest standard collection.`);
      }
    }
    if (index === 2) {
      if (photos.length === 0 && services.length === 0) {
        problems.push('Add a service or charge - an order without photographs is a service-only order.');
      }
      for (const service of services) {
        if (service.kind === 'other' && !service.description.trim()) problems.push('Say what each "Other charge" is for.');
        if (!(Number(service.quantity) >= 1)) problems.push(`Give ${ORDER_LINE_KIND_LABELS[service.kind].toLowerCase()} a quantity of at least 1.`);
      }
      const empty = groups.filter((group) => photosIn(group).length === 0);
      if (photos.length > 0 && empty.length > 0) problems.push('A frame style has no photographs - assign some to it, or remove it.');
    }
    if (index === 3) {
      if (mode === 'standard' && services.length > 0) problems.push('Extra charges need custom pricing.');
      if (mode === 'standard' && new Set(photos.map((photo) => photo.id)).size < MIN_ORDER_QUANTITY) {
        problems.push(`A standard collection starts at ${MIN_ORDER_QUANTITY} photographs - choose more, or use custom pricing.`);
      }
      if (mode === 'custom') {
        for (const service of services) {
          if (money(service.unitPrice) === null) problems.push(`Enter a price for ${(service.description || ORDER_LINE_KIND_LABELS[service.kind]).toLowerCase()}.`);
        }
      }
      if (quote.isError) problems.push(errorMessage(quote.error));
      if (settling || !quoted) problems.push('Wait for the price to be worked out.');
      if (customised && !priceReason.trim()) problems.push('Say why this order is priced differently from the standard tariff.');
      if (!payment.terms) problems.push('Choose how payment stands.');
      if (payment.terms === 'paid_offline') {
        if (!(receivedNow > 0)) problems.push('Enter the amount received.');
        else if (Math.round(receivedNow * 100) > Math.round(total * 100)) problems.push('The amount received is more than the order total.');
        if (!payment.receivedOn) problems.push('Enter the date it was received.');
      }
      if (waitsForApproval && (payment.terms === 'paid_offline' || payment.terms === 'credit')) {
        problems.push('This price needs approval first - choose "collect later" and record the payment once it is approved.');
      }
    }
    return [...new Set(problems)];
  };

  const goNext = async () => {
    const problems = problemsFor(step);
    if (problems.length) {
      setBlockers(problems);
      return;
    }
    if (step === 0 && clientMode === 'new') {
      // Same business entered twice is how client records rot: ask before going on.
      try {
        const found = await checkDuplicate.mutateAsync();
        if (found) {
          setDuplicate(found);
          setBlockers([found]);
          return;
        }
      } catch (error) {
        setBlockers([errorMessage(error)]);
        return;
      }
    }
    setBlockers([]);
    setStep((current) => Math.min(STEPS.length - 1, current + 1));
  };

  const goBack = () => {
    setBlockers([]);
    setStep((current) => Math.max(0, current - 1));
  };

  // ── Create ────────────────────────────────────────────────────────────────

  const create = useMutation({
    mutationFn: () => {
      const parsed = consoleOrderSchema.safeParse({
        ...quoteInput,
        payment:
          payment.terms === 'paid_offline'
            ? {
                terms: 'paid_offline',
                amount: payment.amount,
                receivedOn: payment.receivedOn,
                method: payment.method,
                reference: payment.reference.trim() || null,
                notes: payment.notes.trim() || null,
              }
            : payment.terms === 'credit'
              ? { terms: 'credit', note: payment.creditNote.trim() || null }
              : { terms: payment.terms },
        ...(choosesBranch && branch ? { branch } : {}),
        idempotencyKey,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Check the order.');
      return consoleOrdersService.create(parsed.data);
    },
    onSuccess: ({ order, replayed }) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'clients'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
      toast.success(
        replayed
          ? `${order.reference} had already been created - opening it.`
          : order.pricing.approval?.status === 'pending'
            ? `${order.reference} created. Its price is waiting for approval.`
            : `${order.reference} created.`,
      );
      onOpenChange(false);
      navigate(`/console/orders/${order.id}`);
    },
    onError: (error) => {
      const apiError = toApiError(error);
      setBlockers([apiError.message]);
      if (apiError.code === 'conflict') setStep(0);
    },
  });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(next) => !create.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Add an order</DialogTitle>
          <DialogDescription>
            For any client - registered on ARTINU or not. Prices and totals are worked out by the server.
          </DialogDescription>
        </DialogHeader>

        <ol className="flex flex-wrap gap-x-5 gap-y-2 border-b border-line pb-4" aria-label="Steps">
          {STEPS.map((name, index) => (
            <li key={name}>
              <button
                type="button"
                disabled={index >= step}
                onClick={() => {
                  setBlockers([]);
                  setStep(index);
                }}
                aria-current={index === step ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-2 text-sm transition-colors disabled:cursor-default',
                  index === step ? 'text-ink' : index < step ? 'text-muted hover:text-ink' : 'text-subtle',
                )}
              >
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full border text-xs tabular-nums',
                    index === step && 'border-ink bg-ink text-canvas',
                    index < step && 'border-bronze text-bronze',
                    index > step && 'border-line-strong',
                  )}
                >
                  {index < step ? <Check className="size-3.5" aria-hidden /> : index + 1}
                </span>
                {name}
              </button>
            </li>
          ))}
        </ol>

        <div className="min-h-[22rem]">
          {step === 0 && (
            <ClientStep
              mode={clientMode}
              onMode={(next) => {
                setClientMode(next);
                setBlockers([]);
              }}
              choice={choice}
              onChoice={setChoice}
              draft={draft}
              onDraft={(next) => {
                setDraft(next);
                setDuplicate(null);
              }}
              errors={
                clientMode === 'new' && blockers.length > 0 && !clientInput.success ? fieldErrorsOf(clientInput.error.issues) : {}
              }
              duplicate={duplicate}
              onUseExisting={(name) => {
                searchSeed.current = name;
                setClientMode('existing');
                setDuplicate(null);
                setBlockers([]);
              }}
              open={open}
            />
          )}
          {step === 1 && (
            <PhotoStep
              open={open}
              photos={photos}
              mayCustomise={mayCustomise}
              onToggle={(artwork) =>
                setPhotos((current) =>
                  current.some((entry) => entry.id === artwork.id)
                    ? current.filter((entry) => entry.id !== artwork.id)
                    : [...current, artwork],
                )
              }
            />
          )}
          {step === 2 && (
            <FrameStep
              photos={photos}
              groups={groups}
              groupFor={groupFor}
              onGroups={setGroups}
              onAssign={(artworkId, key) => setAssignment((current) => ({ ...current, [artworkId]: key }))}
              services={services}
              onServices={(next) => {
                setServices(next);
                // Extra charges only exist at a negotiated price.
                if (next.length > 0 && mayCustomise) setMode('custom');
              }}
              mayCustomise={mayCustomise}
            />
          )}
          {step === 3 && (
            <PriceStep
              mode={mode}
              onMode={setMode}
              mayCustomise={mayCustomise}
              groups={groups}
              photosIn={photosIn}
              onGroups={setGroups}
              services={services}
              onServices={setServices}
              discount={discount}
              onDiscount={setDiscount}
              couponCode={couponCode}
              onCouponCode={setCouponCode}
              priceReason={priceReason}
              onPriceReason={setPriceReason}
              commercialTerms={commercialTerms}
              onCommercialTerms={setCommercialTerms}
              notes={notes}
              onNotes={setNotes}
              payment={payment}
              onPayment={setPayment}
              quote={quoted}
              quoteError={quote.isError ? errorMessage(quote.error) : null}
              settling={settling}
              hasAccount={clientMode === 'existing' && Boolean(choice?.result.hasAccount)}
              hasEmail={clientMode === 'new' ? Boolean(draft.email.trim()) : Boolean(choice?.result.email)}
              waitsForApproval={waitsForApproval}
              approvalNeeded={approvalNeeded}
              can={can}
            />
          )}
          {step === 4 && choosesBranch && (
            <Field label="Branch handling this order" hint="Its payments, invoice and costs follow it." className="mb-6">
              <SimpleSelect
                value={branch || branchInfo!.scope.branch}
                onValueChange={setBranch}
                options={branchInfo!.branches.map((name) => ({ value: name, label: name }))}
              />
            </Field>
          )}
          {step === 4 && quoted && (
            <ReviewStep
              client={
                clientMode === 'new'
                  ? {
                      name: draft.name,
                      lines: [
                        `${draft.contactName} · ${draft.phone}${draft.email ? ` · ${draft.email}` : ''}`,
                        `${draft.addressLine1}${draft.addressLine2 ? `, ${draft.addressLine2}` : ''}, ${draft.city}${draft.pin ? ` ${draft.pin}` : ''}`,
                        'New client - no ARTINU account',
                      ],
                    }
                  : {
                      name: choice!.result.name,
                      lines: [
                        [choice!.result.contactName, choice!.result.phone, choice!.result.email].filter(Boolean).join(' · '),
                        choice!.result.city ?? '',
                        choice!.result.hasAccount ? 'Registered on ARTINU' : 'No ARTINU account',
                      ].filter(Boolean),
                    }
              }
              quote={quoted}
              photos={photos}
              mode={mode}
              priceReason={priceReason}
              commercialTerms={commercialTerms}
              notes={notes}
              payment={payment}
              waitsForApproval={waitsForApproval}
            />
          )}
        </div>

        {blockers.length > 0 && (
          <div role="alert" className="rounded-md border border-danger/25 bg-danger-soft/50 px-3.5 py-3 text-sm text-ink-soft">
            <p className="flex items-start gap-2.5">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
              <span className="space-y-1">
                {blockers.map((problem) => (
                  <span key={problem} className="block">
                    {problem}
                  </span>
                ))}
              </span>
            </p>
          </div>
        )}

        <DialogFooter className="items-center sm:justify-between">
          <p className="text-sm text-muted">
            {step >= 3 && quoteInput ? (
              settling ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden /> Working out the price…
                </span>
              ) : quoted ? (
                <>
                  Total <span className="font-display text-lg text-ink">{formatAmount(quoted.total)}</span>
                  {receivedNow > 0 && <> · {formatAmount(Math.max(0, quoted.total - receivedNow))} still to pay</>}
                </>
              ) : null
            ) : (
              `Step ${step + 1} of ${STEPS.length}`
            )}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="ghost" disabled={create.isPending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {step > 0 && (
              <Button type="button" variant="outline" disabled={create.isPending} onClick={goBack}>
                Back
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button type="button" loading={checkDuplicate.isPending} onClick={() => void goNext()}>
                Continue
              </Button>
            ) : (
              <Button type="button" loading={create.isPending} disabled={settling} onClick={() => create.mutate()}>
                Create order
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The client search box is seeded with the name when "find the existing record" is chosen. */
const searchSeed = { current: '' };

function fieldErrorsOf(issues: { path: (string | number)[]; message: string }[]) {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.join('.');
    errors[key] ??= issue.message;
  }
  return errors;
}

// ── Step 1: client ─────────────────────────────────────────────────────────

function ClientStep({
  mode,
  onMode,
  choice,
  onChoice,
  draft,
  onDraft,
  errors,
  duplicate,
  onUseExisting,
  open,
}: {
  mode: 'existing' | 'new';
  onMode: (mode: 'existing' | 'new') => void;
  choice: ClientChoice | null;
  onChoice: (choice: ClientChoice | null) => void;
  draft: ClientDraft;
  onDraft: (draft: ClientDraft) => void;
  errors: Record<string, string>;
  duplicate: string | null;
  onUseExisting: (name: string) => void;
  open: boolean;
}) {
  const [q, setQ] = React.useState(searchSeed.current);
  React.useEffect(() => {
    if (mode === 'existing' && searchSeed.current) {
      setQ(searchSeed.current);
      searchSeed.current = '';
    }
  }, [mode]);
  const term = useDebounced(q.trim(), 250);
  const results = useQuery({
    queryKey: qk.admin.clients(term),
    queryFn: () => consoleOrdersService.searchClients(term),
    enabled: open && mode === 'existing' && !choice,
  });

  const set = <K extends keyof ClientDraft>(key: K, value: ClientDraft[K]) => onDraft({ ...draft, [key]: value });
  const setInstall = (key: keyof ClientDraft['install'], value: string) =>
    onDraft({ ...draft, install: { ...draft.install, [key]: value } });

  return (
    <div className="space-y-5">
      <Tabs value={mode} onValueChange={(value) => onMode(value as 'existing' | 'new')}>
        <SegmentedList>
          <SegmentedTrigger value="existing">
            <Building2 className="mr-1.5 inline size-3.5" aria-hidden /> Existing client
          </SegmentedTrigger>
          <SegmentedTrigger value="new">
            <UserPlus className="mr-1.5 inline size-3.5" aria-hidden /> New client or guest
          </SegmentedTrigger>
        </SegmentedList>
      </Tabs>

      {mode === 'existing' ? (
        choice ? (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4 rounded-md border border-ink/70 bg-surface px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-ink">{choice.result.name}</p>
                <p className="text-sm text-muted">
                  {[choice.result.contactName, choice.result.email, choice.result.phone, choice.result.city].filter(Boolean).join(' · ')}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline">{choice.kind === 'space' ? 'Registered space' : 'Client'}</Badge>
                  <Badge variant={choice.result.hasAccount ? 'success' : 'neutral'}>
                    {choice.result.hasAccount ? 'Has an ARTINU account' : 'No ARTINU account'}
                  </Badge>
                </div>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => onChoice(null)}>
                Change
              </Button>
            </div>
            {choice.kind === 'client' && (choice.result.spaces?.length ?? 0) > 1 && (
              <Field label="Which location is this order for?" htmlFor="order-location" required>
                <SimpleSelect
                  id="order-location"
                  value={choice.spaceId ?? undefined}
                  onValueChange={(spaceId) => onChoice({ ...choice, spaceId })}
                  placeholder="Choose the location"
                  options={(choice.result.spaces ?? []).map((space) => ({ value: space.id, label: `${space.name} - ${space.city}` }))}
                />
              </Field>
            )}
            {choice.kind === 'client' && !choice.result.hasAccount && choice.result.clientId && (
              <LinkClientAccount
                clientId={choice.result.clientId}
                clientName={choice.result.name}
                onLinked={() => onChoice({ ...choice, result: { ...choice.result, hasAccount: true } })}
              />
            )}
          </div>
        ) : (
          <div>
            <Input
              icon={<Search />}
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Business, contact, phone, email, city or client code"
              aria-label="Search clients"
              autoFocus
            />
            <div className="mt-3 max-h-[20rem] overflow-y-auto rounded-md border border-line">
              {results.isLoading ? (
                <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Searching…
                </p>
              ) : results.isError ? (
                <p className="px-4 py-6 text-sm text-danger">{errorMessage(results.error)}</p>
              ) : (results.data ?? []).length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted">
                  Nobody matches{term ? ` "${term}"` : ''}.{' '}
                  <button type="button" className="text-bronze hover:underline" onClick={() => onMode('new')}>
                    Add them as a new client
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {(results.data ?? []).map((result) => (
                    <li key={`${result.kind}-${result.clientId ?? ''}-${result.spaceId ?? ''}`}>
                      <button
                        type="button"
                        className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-sand-soft"
                        onClick={() =>
                          onChoice(
                            result.kind === 'space'
                              ? { kind: 'space', result }
                              : { kind: 'client', result, spaceId: result.spaceId },
                          )
                        }
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-ink">{result.name}</span>
                          <span className="block truncate text-xs text-muted">
                            {[result.contactName, result.email, result.city].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <span className="flex shrink-0 gap-1.5">
                          <Badge variant="outline">{result.kind === 'space' ? 'Space' : 'Client'}</Badge>
                          {result.hasAccount && <Badge variant="success">Account</Badge>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-muted">
            For a business that has never signed in to ARTINU. They do not need an account - this creates a client record and
            their location, and the order is theirs.
          </p>
          {duplicate && (
            <div className="rounded-md border border-warning/30 bg-warning-soft/50 px-3.5 py-3 text-sm text-ink-soft">
              <p>
                <span className="font-medium text-ink">Already on file? </span>
                {duplicate}
              </p>
              <Button type="button" size="sm" variant="outline" className="mt-2.5" onClick={() => onUseExisting(draft.name)}>
                Find the existing record
              </Button>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business or establishment" htmlFor="client-name" required error={errors.name}>
              <Input id="client-name" value={draft.name} onChange={(event) => set('name', event.target.value)} placeholder="ABC Cafe" invalid={Boolean(errors.name)} />
            </Field>
            <Field label="Kind of space" htmlFor="client-type" required>
              <SimpleSelect
                id="client-type"
                value={draft.type}
                onValueChange={(value) => set('type', value)}
                options={SPACE_TYPES.map((type) => ({ value: type, label: SPACE_TYPE_LABELS[type] }))}
              />
            </Field>
            <Field label="Contact person" htmlFor="client-contact" required error={errors.contactName}>
              <Input id="client-contact" value={draft.contactName} onChange={(event) => set('contactName', event.target.value)} placeholder="Anita Rao" invalid={Boolean(errors.contactName)} />
            </Field>
            <Field label="Phone" htmlFor="client-phone" required error={errors.phone}>
              <PhoneInput id="client-phone" value={draft.phone} onChange={(event) => set('phone', event.target.value)} invalid={Boolean(errors.phone)} />
            </Field>
            <Field label="Email" htmlFor="client-email" hint="Optional - some businesses deal by phone." error={errors.email}>
              <Input id="client-email" type="email" value={draft.email} onChange={(event) => set('email', event.target.value)} placeholder="hello@abccafe.in" invalid={Boolean(errors.email)} />
            </Field>
            <Field label="City" htmlFor="client-city" required error={errors.city}>
              <Input id="client-city" value={draft.city} onChange={(event) => set('city', event.target.value)} placeholder="Bengaluru" invalid={Boolean(errors.city)} />
            </Field>
            <Field label="Address" htmlFor="client-address" required hint="Where the frames are delivered and hung." error={errors.addressLine1} className="sm:col-span-2">
              <Input id="client-address" value={draft.addressLine1} onChange={(event) => set('addressLine1', event.target.value)} placeholder="12, 4th Cross, Indiranagar" invalid={Boolean(errors.addressLine1)} />
            </Field>
            <Field label="Address line 2" htmlFor="client-address2">
              <Input id="client-address2" value={draft.addressLine2} onChange={(event) => set('addressLine2', event.target.value)} />
            </Field>
            <Field label="PIN code" htmlFor="client-pin" hint="Optional." error={errors.pin}>
              <Input id="client-pin" inputMode="numeric" value={draft.pin} onChange={(event) => set('pin', event.target.value)} invalid={Boolean(errors.pin)} />
            </Field>
          </div>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-soft">
            <Checkbox checked={draft.installElsewhere} onCheckedChange={(value) => set('installElsewhere', value === true)} />
            The frames go somewhere other than this address
          </label>
          {draft.installElsewhere && (
            <div className="grid gap-4 rounded-md border border-line p-4 sm:grid-cols-2">
              <Field label="Installation address" htmlFor="install-address" required error={errors['installAddress.addressLine1']} className="sm:col-span-2">
                <Input id="install-address" value={draft.install.addressLine1} onChange={(event) => setInstall('addressLine1', event.target.value)} />
              </Field>
              <Field label="City" htmlFor="install-city" required error={errors['installAddress.city']}>
                <Input id="install-city" value={draft.install.city} onChange={(event) => setInstall('city', event.target.value)} />
              </Field>
              <Field label="PIN code" htmlFor="install-pin" error={errors['installAddress.pin']}>
                <Input id="install-pin" inputMode="numeric" value={draft.install.pin} onChange={(event) => setInstall('pin', event.target.value)} />
              </Field>
            </div>
          )}
          <Field label="Notes" htmlFor="client-notes">
            <Textarea id="client-notes" rows={2} value={draft.notes} onChange={(event) => set('notes', event.target.value)} placeholder="Best reached after 3pm" />
          </Field>
        </div>
      )}
    </div>
  );
}

// ── Step 2: photographs ────────────────────────────────────────────────────

function PhotoStep({
  open,
  photos,
  mayCustomise,
  onToggle,
}: {
  open: boolean;
  photos: ArtworkWithArtist[];
  mayCustomise: boolean;
  onToggle: (artwork: ArtworkWithArtist) => void;
}) {
  const [q, setQ] = React.useState('');
  const [page, setPage] = React.useState(1);
  const term = useDebounced(q.trim(), 300);
  React.useEffect(() => setPage(1), [term]);

  const gallery = useQuery({
    queryKey: qk.gallery({ q: term || undefined, page, pageSize: 24 }),
    queryFn: () => catalogService.gallery({ q: term || undefined, page, pageSize: 24 }),
    enabled: open,
    placeholderData: keepPreviousData,
  });
  const items = gallery.data?.items ?? [];
  const pages = gallery.data ? Math.max(1, Math.ceil(gallery.data.total / 24)) : 1;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <Input
          icon={<Search />}
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Title, photographer, place, tag or photo ID"
          aria-label="Search photographs"
        />
        <div className="mt-3 grid max-h-[24rem] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
          {gallery.isLoading
            ? Array.from({ length: 8 }, (_, index) => <div key={index} className="aspect-[3/4] animate-pulse rounded-sm bg-sand" />)
            : items.map((artwork) => {
                const picked = photos.some((entry) => entry.id === artwork.id);
                return (
                  <button
                    key={artwork.id}
                    type="button"
                    onClick={() => onToggle(artwork)}
                    aria-pressed={picked}
                    title={`${artwork.title} - ${artwork.artist?.name ?? 'ARTINU artist'}${artwork.location ? `, ${artwork.location}` : ''}`}
                    className={cn(
                      'group relative overflow-hidden rounded-sm text-left ring-offset-2 ring-offset-surface transition-all',
                      picked ? 'ring-2 ring-ink' : 'ring-1 ring-line hover:ring-line-strong',
                    )}
                  >
                    <Photo
                      src={artwork.thumbnailUrl || artwork.imageUrl}
                      alt={artwork.title}
                      ratio="aspect-[3/4]"
                      thumbnail
                      variants={artwork.imageVariants}
                      className="w-full"
                    />
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent px-1.5 pb-1 pt-4 text-[0.625rem] leading-tight text-canvas">
                      <span className="block truncate">{artwork.title}</span>
                      <span className="block truncate opacity-80">{artwork.artist?.name ?? 'ARTINU artist'}</span>
                    </span>
                    {picked && (
                      <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-ink text-canvas" aria-hidden>
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
        </div>
        {gallery.isError && <p className="mt-3 text-sm text-danger">{errorMessage(gallery.error)}</p>}
        {gallery.data && items.length === 0 && <p className="mt-3 text-sm text-muted">No photographs match that search.</p>}
        {pages > 1 && (
          <div className="mt-3 flex items-center gap-3 text-xs text-muted">
            <Button type="button" size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
              Previous
            </Button>
            Page {page} of {pages}
            <Button type="button" size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>
              Next
            </Button>
          </div>
        )}
      </div>

      <div className="min-w-0">
        <p className={label}>Chosen ({photos.length})</p>
        <p className="mt-1 text-xs text-subtle">
          One framed print per photograph.{' '}
          {mayCustomise
            ? `A standard collection starts at ${MIN_ORDER_QUANTITY}; a custom-priced order can have fewer, or none for a service-only visit.`
            : `Choose at least ${MIN_ORDER_QUANTITY}.`}
        </p>
        {photos.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Nothing chosen yet. Click a photograph to add it.</p>
        ) : (
          <ul className="mt-3 max-h-[22rem] space-y-2 overflow-y-auto pr-1">
            {photos.map((artwork) => (
              <li key={artwork.id} className="flex items-center gap-2.5">
                <Photo src={artwork.thumbnailUrl || artwork.imageUrl} alt={artwork.title} thumbnail variants={artwork.imageVariants} className="size-10 shrink-0 rounded-sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{artwork.title}</span>
                  <span className="block truncate text-xs text-subtle">
                    {artwork.artist?.name ?? 'ARTINU artist'}
                    {artwork.photoId ? ` · ${artwork.photoId}` : ''}
                  </span>
                </span>
                <button type="button" onClick={() => onToggle(artwork)} aria-label={`Remove ${artwork.title}`} className="shrink-0 text-subtle transition-colors hover:text-danger">
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Step 3: frames and charges ─────────────────────────────────────────────

const sizeOptions = FRAME_SIZES.map((size) => ({ value: size.value, label: `${size.label} - ${size.description}` }));
const colorOptions = FRAME_COLORS.map((color) => ({
  value: color.value,
  label: `${color.label} - ${FRAME_COLOR_MATERIAL[color.value] === 'metal' ? 'metal' : 'wooden'}`,
}));
const SERVICE_KINDS = ['printing', 'installation', 'delivery', 'other'] as const;

function FrameStep({
  photos,
  groups,
  groupFor,
  onGroups,
  onAssign,
  services,
  onServices,
  mayCustomise,
}: {
  photos: ArtworkWithArtist[];
  groups: FrameGroup[];
  groupFor: (artworkId: string) => string | undefined;
  onGroups: (groups: FrameGroup[]) => void;
  onAssign: (artworkId: string, key: string) => void;
  services: ServiceLine[];
  onServices: (services: ServiceLine[]) => void;
  mayCustomise: boolean;
}) {
  const groupLabel = (group: FrameGroup, index: number) => `Frame style ${index + 1} · ${describeFrameLine(group.size, group.color)}`;
  const updateGroup = (key: string, patch: Partial<FrameGroup>) =>
    onGroups(groups.map((group) => (group.key === key ? { ...group, ...patch } : group)));
  const updateService = (key: string, patch: Partial<ServiceLine>) =>
    onServices(services.map((service) => (service.key === key ? { ...service, ...patch } : service)));

  return (
    <div className="space-y-8">
      {photos.length > 0 ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className={label}>Frame styles</p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onGroups([...groups, { key: newKey(), size: 'a3', color: 'white', unitPrice: '' }])}
            >
              <Plus /> Add a frame style
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {groups.map((group, index) => {
              const count = photos.filter((photo) => groupFor(photo.id) === group.key).length;
              return (
                <div key={group.key} className="space-y-3 rounded-md border border-line bg-surface p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-ink">
                      Frame style {index + 1}
                      <span className="ml-2 text-xs text-subtle">
                        {count} {count === 1 ? 'frame' : 'frames'}
                      </span>
                    </p>
                    {groups.length > 1 && (
                      <button
                        type="button"
                        className="text-subtle transition-colors hover:text-danger"
                        aria-label={`Remove frame style ${index + 1}`}
                        onClick={() => {
                          const remaining = groups.filter((entry) => entry.key !== group.key);
                          // Its photographs go back to the first style rather than vanishing.
                          for (const photo of photos) if (groupFor(photo.id) === group.key) onAssign(photo.id, remaining[0]!.key);
                          onGroups(remaining);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Size" htmlFor={`group-size-${group.key}`}>
                      <SimpleSelect id={`group-size-${group.key}`} value={group.size} onValueChange={(size) => updateGroup(group.key, { size })} options={sizeOptions} />
                    </Field>
                    <Field label="Colour" htmlFor={`group-color-${group.key}`}>
                      <SimpleSelect id={`group-color-${group.key}`} value={group.color} onValueChange={(color) => updateGroup(group.key, { color })} options={colorOptions} />
                    </Field>
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            <p className={label}>Which frame each photograph gets</p>
            <ul className="mt-2 divide-y divide-line rounded-md border border-line">
              {photos.map((artwork) => (
                <li key={artwork.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <Photo src={artwork.thumbnailUrl || artwork.imageUrl} alt={artwork.title} thumbnail variants={artwork.imageVariants} className="size-9 shrink-0 rounded-sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{artwork.title}</span>
                    <span className="block truncate text-xs text-subtle">{artwork.artist?.name ?? 'ARTINU artist'}</span>
                  </span>
                  {groups.length > 1 ? (
                    <SimpleSelect
                      className="h-9 w-full sm:w-72"
                      value={groupFor(artwork.id)}
                      onValueChange={(key) => onAssign(artwork.id, key)}
                      options={groups.map((group, index) => ({ value: group.key, label: groupLabel(group, index) }))}
                    />
                  ) : (
                    <span className="text-xs text-muted">{describeFrameLine(groups[0]?.size, groups[0]?.color)}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : (
        <p className="rounded-md bg-sand-soft px-4 py-3 text-sm text-ink-soft">
          No photographs chosen - this is a service-only order. Add the services and charges below.
        </p>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className={label}>Printing, installation, delivery and other charges</p>
          {mayCustomise && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onServices([...services, { key: newKey(), kind: 'installation', description: '', quantity: '1', unitPrice: '' }])}
            >
              <Plus /> Add a charge
            </Button>
          )}
        </div>
        {!mayCustomise ? (
          <p className="text-sm text-muted">Extra charges are part of a custom price, which your role cannot set. A manager or the CEO can.</p>
        ) : services.length === 0 ? (
          <p className="text-sm text-muted">None. Prices for each are set in the next step.</p>
        ) : (
          <ul className="space-y-2">
            {services.map((service) => (
              <li key={service.key} className="grid items-end gap-3 rounded-md border border-line p-3 sm:grid-cols-[11rem_minmax(0,1fr)_6rem_auto]">
                <Field label="Kind" htmlFor={`service-kind-${service.key}`}>
                  <SimpleSelect
                    id={`service-kind-${service.key}`}
                    value={service.kind}
                    onValueChange={(kind) => updateService(service.key, { kind: kind as ServiceLine['kind'] })}
                    options={SERVICE_KINDS.map((kind) => ({ value: kind, label: ORDER_LINE_KIND_LABELS[kind] }))}
                  />
                </Field>
                <Field label={service.kind === 'other' ? 'What it is for' : 'Description'} htmlFor={`service-desc-${service.key}`} required={service.kind === 'other'}>
                  <Input
                    id={`service-desc-${service.key}`}
                    value={service.description}
                    onChange={(event) => updateService(service.key, { description: event.target.value })}
                    placeholder={service.kind === 'other' ? 'Wall repair before hanging' : ORDER_LINE_KIND_LABELS[service.kind]}
                    maxLength={140}
                  />
                </Field>
                <Field label="Quantity" htmlFor={`service-qty-${service.key}`}>
                  <Input
                    id={`service-qty-${service.key}`}
                    type="number"
                    min="1"
                    step="1"
                    value={service.quantity}
                    onChange={(event) => updateService(service.key, { quantity: event.target.value })}
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove this charge"
                  onClick={() => onServices(services.filter((entry) => entry.key !== service.key))}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ── Step 4: price and payment ──────────────────────────────────────────────

function PriceStep({
  mode,
  onMode,
  mayCustomise,
  groups,
  photosIn,
  onGroups,
  services,
  onServices,
  discount,
  onDiscount,
  couponCode,
  onCouponCode,
  priceReason,
  onPriceReason,
  commercialTerms,
  onCommercialTerms,
  notes,
  onNotes,
  payment,
  onPayment,
  quote,
  quoteError,
  settling,
  hasAccount,
  hasEmail,
  waitsForApproval,
  approvalNeeded,
  can,
}: {
  mode: PricingMode;
  onMode: (mode: PricingMode) => void;
  mayCustomise: boolean;
  groups: FrameGroup[];
  photosIn: (group: FrameGroup) => ArtworkWithArtist[];
  onGroups: (groups: FrameGroup[]) => void;
  services: ServiceLine[];
  onServices: (services: ServiceLine[]) => void;
  discount: string;
  onDiscount: (value: string) => void;
  couponCode: string;
  onCouponCode: (value: string) => void;
  priceReason: string;
  onPriceReason: (value: string) => void;
  commercialTerms: string;
  onCommercialTerms: (value: string) => void;
  notes: string;
  onNotes: (value: string) => void;
  payment: PaymentDraft;
  onPayment: (payment: PaymentDraft) => void;
  quote: QuoteResult | undefined;
  quoteError: string | null;
  settling: boolean;
  hasAccount: boolean;
  hasEmail: boolean;
  waitsForApproval: boolean;
  approvalNeeded: boolean;
  can: ReturnType<typeof usePermissions>['can'];
}) {
  const priced = quote?.quote;
  const frameGroups = groups.filter((group) => photosIn(group).length > 0);
  // Quote lines come back in the order they were sent: frame styles, then charges.
  const frameLine = (index: number) => priced?.lines.filter((line) => line.kind === 'frames')[index];
  const serviceLine = (index: number) => priced?.lines.filter((line) => line.kind !== 'frames')[index];
  const setPay = (patch: Partial<PaymentDraft>) => onPayment({ ...payment, ...patch });
  const total = quote?.total ?? 0;
  const received = payment.terms === 'paid_offline' ? Number(payment.amount || 0) : 0;

  const termDisabled = (terms: OrderPaymentTerms): string | null => {
    if (terms === 'paid_offline' && !can('payments.record_offline')) return 'Your role cannot record payments.';
    if (terms === 'credit' && !can('orders.extend_credit')) return 'Only finance or the CEO can confirm an order on credit.';
    if ((terms === 'paid_offline' || terms === 'credit') && waitsForApproval) return 'Not until the price is approved.';
    return null;
  };
  const termHint: Record<OrderPaymentTerms, string> = {
    request_payment: hasAccount
      ? 'The owner sees it in their ARTINU account and pays online there.'
      : hasEmail
        ? 'No ARTINU account, so no payment link: the client is emailed an order summary, and the payment is recorded on the order when it arrives.'
        : 'No ARTINU account and no email: there is no link to send. Record the payment on the order when it arrives.',
    paid_offline: 'Cash, UPI to the account, bank transfer or cheque already received - all of it or part. The order is confirmed once it is paid in full.',
    collect_later: 'The order waits for payment. Record payments on the order as they come in.',
    credit: 'Confirmed for production now, paid later on agreed terms. Invoiced straight away.',
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-7">
        <div>
          <p className={label}>Pricing</p>
          <RadioGroup className="mt-2 grid gap-2 sm:grid-cols-2" value={mode} onValueChange={(value) => onMode(value as PricingMode)}>
            {(['standard', 'custom'] as const).map((value) => {
              const off = value === 'custom' && !mayCustomise;
              return (
                <label
                  key={value}
                  htmlFor={`pricing-${value}`}
                  className={cn(
                    'flex items-start gap-3 rounded-md border border-line bg-surface px-3.5 py-3 transition-colors has-data-[state=checked]:border-ink',
                    off ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-line-strong',
                  )}
                >
                  <RadioGroupItem id={`pricing-${value}`} value={value} disabled={off} className="mt-0.5" />
                  <span>
                    <span className="block text-sm text-ink">{value === 'standard' ? 'Standard tariff' : 'Custom price'}</span>
                    <span className="block text-xs text-muted">
                      {value === 'standard'
                        ? 'The published monthly rate per frame, coupon optional.'
                        : off
                          ? 'Your role uses the standard tariff. A manager or the CEO can quote a custom price.'
                          : 'Your own price per frame style and charge, and a discount.'}
                    </span>
                  </span>
                </label>
              );
            })}
          </RadioGroup>
        </div>

        <div>
          <p className={label}>Items</p>
          <div className="mt-2 overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-subtle">
                  <th className="px-3 py-2 font-normal">Item</th>
                  <th className="px-3 py-2 text-right font-normal">Qty</th>
                  <th className="px-3 py-2 text-right font-normal">Standard</th>
                  <th className="px-3 py-2 text-right font-normal">Price each</th>
                  <th className="px-3 py-2 text-right font-normal">Line total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {frameGroups.map((group, index) => {
                  const line = frameLine(index);
                  return (
                    <tr key={group.key}>
                      <td className="px-3 py-2.5 text-ink">
                        {describeFrameLine(group.size, group.color)}
                        <span className="block text-xs text-subtle">Monthly rate per framed photograph</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{photosIn(group).length}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                        {line?.standardUnitPrice != null ? formatAmount(line.standardUnitPrice) : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {mode === 'custom' ? (
                          <Input
                            aria-label={`Price per frame for ${describeFrameLine(group.size, group.color)}`}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            className="ml-auto h-9 w-28 text-right"
                            value={group.unitPrice}
                            placeholder={line?.standardUnitPrice != null ? String(line.standardUnitPrice) : ''}
                            onChange={(event) =>
                              onGroups(groups.map((entry) => (entry.key === group.key ? { ...entry, unitPrice: event.target.value } : entry)))
                            }
                          />
                        ) : (
                          <span className="tabular-nums">{line ? formatAmount(line.unitPrice) : '-'}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink">{line ? formatAmount(line.lineTotal) : '-'}</td>
                    </tr>
                  );
                })}
                {services.map((service, index) => {
                  const line = serviceLine(index);
                  return (
                    <tr key={service.key}>
                      <td className="px-3 py-2.5 text-ink">
                        {service.description.trim() || ORDER_LINE_KIND_LABELS[service.kind]}
                        <span className="block text-xs text-subtle">{ORDER_LINE_KIND_LABELS[service.kind]}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Input
                          aria-label={`Quantity for ${service.description || ORDER_LINE_KIND_LABELS[service.kind]}`}
                          type="number"
                          min="1"
                          step="1"
                          className="ml-auto h-9 w-16 text-right"
                          value={service.quantity}
                          onChange={(event) =>
                            onServices(services.map((entry) => (entry.key === service.key ? { ...entry, quantity: event.target.value } : entry)))
                          }
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-subtle">No tariff</td>
                      <td className="px-3 py-2.5 text-right">
                        <Input
                          aria-label={`Price for ${service.description || ORDER_LINE_KIND_LABELS[service.kind]}`}
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          className="ml-auto h-9 w-28 text-right"
                          value={service.unitPrice}
                          placeholder="0.00"
                          onChange={(event) =>
                            onServices(services.map((entry) => (entry.key === service.key ? { ...entry, unitPrice: event.target.value } : entry)))
                          }
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink">{line ? formatAmount(line.lineTotal) : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {mode === 'custom' && frameGroups.length > 0 && (
            <p className="mt-1.5 text-xs text-subtle">Leave a frame price empty to charge the standard rate.</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {mode === 'custom' ? (
            <Field label="Discount (₹)" htmlFor="order-discount" hint="Taken off the whole order, never below zero.">
              <Input id="order-discount" type="number" inputMode="decimal" min="0" step="0.01" value={discount} onChange={(event) => onDiscount(event.target.value)} placeholder="0" />
            </Field>
          ) : (
            <Field label="Coupon code" htmlFor="order-coupon" hint="Applied exactly as at checkout.">
              <Input id="order-coupon" value={couponCode} onChange={(event) => onCouponCode(event.target.value)} placeholder="Optional" />
            </Field>
          )}
          {mode === 'custom' && (
            <Field
              label="Why this price"
              htmlFor="order-reason"
              required={Boolean(priced?.customised)}
              hint="Required when it differs from the tariff. Approvers and the audit trail see it."
              className="sm:col-span-2"
            >
              <Textarea id="order-reason" rows={2} value={priceReason} onChange={(event) => onPriceReason(event.target.value)} placeholder="Launch pricing agreed with the owner" />
            </Field>
          )}
          <Field label="Commercial terms" htmlFor="order-terms" hint="Printed on the invoice." className="sm:col-span-2">
            <Textarea id="order-terms" rows={2} value={commercialTerms} onChange={(event) => onCommercialTerms(event.target.value)} placeholder="Monthly rotation, six frames" />
          </Field>
          <Field label="Notes" htmlFor="order-notes" className="sm:col-span-2">
            <Textarea id="order-notes" rows={2} value={notes} onChange={(event) => onNotes(event.target.value)} placeholder="Taken over the phone by…" />
          </Field>
        </div>

        <div>
          <p className={label}>Payment</p>
          <RadioGroup className="mt-2 gap-2" value={payment.terms} onValueChange={(value) => setPay({ terms: value as OrderPaymentTerms, amount: value === 'paid_offline' && !payment.amount && total ? String(total) : payment.amount })}>
            {(['request_payment', 'paid_offline', 'collect_later', 'credit'] as const).map((terms) => {
              const disabled = termDisabled(terms);
              return (
                <label
                  key={terms}
                  htmlFor={`terms-${terms}`}
                  className={cn(
                    'flex items-start gap-3 rounded-md border border-line bg-surface px-3.5 py-3 transition-colors has-data-[state=checked]:border-ink',
                    disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-line-strong',
                  )}
                >
                  <RadioGroupItem id={`terms-${terms}`} value={terms} disabled={Boolean(disabled)} className="mt-0.5" />
                  <span>
                    <span className="block text-sm text-ink">{ORDER_PAYMENT_TERMS_LABELS[terms]}</span>
                    <span className="block text-xs text-muted">{disabled ?? termHint[terms]}</span>
                  </span>
                </label>
              );
            })}
          </RadioGroup>

          {payment.terms === 'paid_offline' && (
            <div className="mt-3 grid gap-3 rounded-md border border-line p-4 sm:grid-cols-2">
              <Field label="Amount received (₹)" htmlFor="paid-amount" required hint="Part of the total is fine.">
                <Input id="paid-amount" type="number" inputMode="decimal" min="0.01" step="0.01" value={payment.amount} onChange={(event) => setPay({ amount: event.target.value })} />
              </Field>
              <Field label="Received on" htmlFor="paid-on" required>
                <DateInput id="paid-on" value={payment.receivedOn} onChange={(event) => setPay({ receivedOn: event.target.value })} />
              </Field>
              <Field label="Method" htmlFor="paid-method" required>
                <SimpleSelect
                  id="paid-method"
                  value={payment.method}
                  onValueChange={(method) => setPay({ method: method as PaymentMethod })}
                  options={PAYMENT_METHODS.map((method) => ({ value: method, label: PAYMENT_METHOD_LABELS[method] }))}
                />
              </Field>
              <Field label="Reference" htmlFor="paid-reference">
                <Input id="paid-reference" value={payment.reference} onChange={(event) => setPay({ reference: event.target.value })} placeholder="UPI or UTR number" />
              </Field>
              <Field label="Payment notes" htmlFor="paid-notes" className="sm:col-span-2">
                <Input id="paid-notes" value={payment.notes} onChange={(event) => setPay({ notes: event.target.value })} />
              </Field>
            </div>
          )}
          {payment.terms === 'credit' && (
            <Field label="Credit terms" htmlFor="credit-note" className="mt-3">
              <Input id="credit-note" value={payment.creditNote} onChange={(event) => setPay({ creditNote: event.target.value })} placeholder="Net 15" />
            </Field>
          )}
        </div>
      </div>

      {/* The server's numbers, and only the server's. */}
      <aside className="min-w-0 self-start rounded-lg border border-line bg-sand-soft p-5 lg:sticky lg:top-0">
        <p className={label}>Price breakdown</p>
        {quoteError ? (
          <p className="mt-3 text-sm text-danger">{quoteError}</p>
        ) : !priced ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Working out the price…
          </p>
        ) : (
          <div className={cn('mt-2 transition-opacity', settling && 'opacity-60')}>
            {priced.framesTotal > 0 && <DataRow label={`Frames (${priced.frameCount})`} value={formatAmount(priced.framesTotal)} />}
            {priced.printing > 0 && <DataRow label="Printing" value={formatAmount(priced.printing)} />}
            {priced.installation > 0 && <DataRow label="Installation" value={formatAmount(priced.installation)} />}
            {priced.delivery > 0 && <DataRow label="Delivery" value={formatAmount(priced.delivery)} />}
            {priced.otherCharges > 0 && <DataRow label="Other charges" value={formatAmount(priced.otherCharges)} />}
            {(quote?.discount ?? 0) > 0 && (
              <DataRow label={quote?.couponApplied ? `Discount (${quote.couponApplied})` : 'Discount'} value={`− ${formatAmount(quote!.discount)}`} />
            )}
            <DataRow label="Order total" value={formatAmount(total)} emphasis />
            {received > 0 && (
              <>
                <DataRow label="Received now" value={formatAmount(received)} />
                <DataRow label="Still to pay" value={formatAmount(Math.max(0, total - received))} />
              </>
            )}
            <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-xs text-muted">
              {mode === 'custom' && (
                <p>
                  Standard price {formatAmount(priced.standardTotal)}
                  {priced.reductionPercent !== 0 &&
                    ` · ${Math.abs(priced.reductionPercent)}% ${priced.reductionPercent > 0 ? 'below' : 'above'} it`}
                </p>
              )}
              <p>{priced.taxNote}</p>
            </div>
            {approvalNeeded && (
              <p
                className={cn(
                  'mt-3 rounded-md px-3 py-2 text-xs',
                  waitsForApproval ? 'bg-warning-soft text-ink-soft' : 'bg-info-soft text-ink-soft',
                )}
              >
                {waitsForApproval
                  ? `More than ${quote?.approvalThresholdPercent}% below standard: the order is created with its price waiting for approval by Accounts or the CEO, and no payment can be taken until then.`
                  : `More than ${quote?.approvalThresholdPercent}% below standard. You hold price approval, so it is approved as you create it - recorded on the audit trail.`}
              </p>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

// ── Step 5: review ─────────────────────────────────────────────────────────

function ReviewStep({
  client,
  quote,
  photos,
  mode,
  priceReason,
  commercialTerms,
  notes,
  payment,
  waitsForApproval,
}: {
  client: { name: string; lines: string[] };
  quote: QuoteResult;
  photos: ArtworkWithArtist[];
  mode: PricingMode;
  priceReason: string;
  commercialTerms: string;
  notes: string;
  payment: PaymentDraft;
  waitsForApproval: boolean;
}) {
  const received = payment.terms === 'paid_offline' ? Number(payment.amount || 0) : 0;
  const byId = new Map(photos.map((photo) => [photo.id, photo]));

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-6">
        <section>
          <p className={label}>Client</p>
          <p className="mt-2 text-ink">{client.name}</p>
          {client.lines.map((line) => (
            <p key={line} className="text-sm text-muted">
              {line}
            </p>
          ))}
        </section>

        <section>
          <p className={label}>Items</p>
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {quote.quote.lines.map((line) => (
              <li key={line.key} className="py-3">
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="text-ink">
                    {line.description}
                    <span className="ml-2 text-xs text-subtle">
                      {line.quantity} × {formatAmount(line.unitPrice)}
                      {line.standardUnitPrice != null && line.priceSource === 'custom' && ` (standard ${formatAmount(line.standardUnitPrice)})`}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-ink">{formatAmount(line.lineTotal)}</span>
                </div>
                {line.kind === 'frames' && (
                  <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    {(line.artworkIds ?? []).map((id) => {
                      const artwork = byId.get(id);
                      return (
                        <li key={id} className="flex items-center gap-2 text-xs">
                          {artwork && <Photo src={artwork.thumbnailUrl || artwork.imageUrl} alt={artwork.title} thumbnail variants={artwork.imageVariants} className="size-8 shrink-0 rounded-sm" />}
                          <span className="min-w-0">
                            <span className="block truncate text-ink-soft">{artwork?.title ?? id}</span>
                            <span className="block truncate text-subtle">{artwork?.artist?.name ?? 'ARTINU artist'}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>

        {(priceReason.trim() || commercialTerms.trim() || notes.trim()) && (
          <section className="space-y-2 text-sm">
            {mode === 'custom' && priceReason.trim() && (
              <p>
                <span className="text-subtle">Why this price: </span>
                <span className="text-ink-soft">{priceReason}</span>
              </p>
            )}
            {commercialTerms.trim() && (
              <p>
                <span className="text-subtle">Commercial terms: </span>
                <span className="text-ink-soft">{commercialTerms}</span>
              </p>
            )}
            {notes.trim() && (
              <p>
                <span className="text-subtle">Notes: </span>
                <span className="text-ink-soft">{notes}</span>
              </p>
            )}
          </section>
        )}
      </div>

      <aside className="min-w-0 self-start rounded-lg border border-line bg-sand-soft p-5">
        <p className={label}>Money</p>
        <div className="mt-2">
          <DataRow label="Subtotal" value={formatAmount(quote.quote.subtotal)} />
          {quote.discount > 0 && <DataRow label="Discount" value={`− ${formatAmount(quote.discount)}`} />}
          <DataRow label="Order total" value={formatAmount(quote.total)} emphasis />
          <DataRow label="Payment" value={payment.terms ? ORDER_PAYMENT_TERMS_LABELS[payment.terms] : '-'} />
          <DataRow label="Received now" value={formatAmount(received)} />
          <DataRow label="Outstanding after this" value={formatAmount(Math.max(0, quote.total - received))} />
        </div>
        <p className="mt-3 text-xs text-muted">{quote.quote.taxNote}</p>
        {waitsForApproval && (
          <p className="mt-3 rounded-md bg-warning-soft px-3 py-2 text-xs text-ink-soft">
            The price will wait for approval before payment can be taken.
          </p>
        )}
        <p className="mt-3 text-xs text-subtle">The server prices the order again from these lines as it is created.</p>
      </aside>
    </div>
  );
}
