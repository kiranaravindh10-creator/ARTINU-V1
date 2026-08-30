import {
  adminProvisionSpaceSchema,
  ROTATION_INTERVALS,
  SPACE_TYPE_LABELS,
  SPACE_TYPES,
  type AdminProvisionSpaceInput,
  type AdminProvisionSpaceResult,
} from '@artinu/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/select';
import { errorMessage } from '@/lib/api';
import { adminService } from '@/services/admin.service';

/**
 * REGISTERING A SPACE FOR SOMEONE WHO WILL NOT DO IT THEMSELVES.
 *
 * The other half of CreateOrderDialog. A good share of café owners will never
 * open the site - they will describe the room over the phone and expect it to
 * be handled - and until now the only way a space could exist was the public
 * sign-up form, which needs the owner sitting at it.
 *
 * Three things worth knowing:
 *
 * 1. THE SAME FIELDS THE OWNER WOULD FILL IN. It validates with the real
 *    `spaceSchema`, so a space created here is the same shape as one created by
 *    its owner. The old dead endpoint took four loose fields and wrote a row
 *    that failed the owner's own edit form the moment they opened it.
 *
 * 2. THE PASSWORD IS SHOWN ONCE AND NEVER EMAILED. Mail is the one channel that
 *    cannot be recalled. It appears here for staff to read down the phone, and
 *    the owner is forced to change it on first sign-in.
 *
 * 3. AN EXISTING EMAIL IS NOT AN ERROR. A chain with three cafés is one owner
 *    with three spaces, so the new space attaches to the account that is
 *    already there and no password is issued.
 */
export function CreateSpaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [result, setResult] = React.useState<AdminProvisionSpaceResult | null>(null);

  const form = useForm<AdminProvisionSpaceInput>({
    resolver: zodResolver(adminProvisionSpaceSchema),
    defaultValues: {
      name: '',
      type: 'cafe',
      addressLine1: '',
      city: '',
      contactName: '',
      contactPhone: '',
      contactEmail: '',
      ownerName: '',
      ownerEmail: '',
      ownerPhone: '',
      imageUrls: [],
      rotationIntervalMonths: ROTATION_INTERVALS[0],
    },
  });

  const { register, handleSubmit, setValue, watch, reset, formState } = form;

  React.useEffect(() => {
    if (open) {
      reset();
      setResult(null);
    }
  }, [open, reset]);

  /*
    The contact is the owner unless staff say otherwise.

    On the phone these are the same person nine times out of ten, and asking for
    the same name and email twice is how a form gets abandoned halfway.
  */
  const ownerName = watch('ownerName');
  const ownerEmail = watch('ownerEmail');
  const ownerPhone = watch('ownerPhone');

  const create = useMutation({
    mutationFn: (values: AdminProvisionSpaceInput) => adminService.provisionSpace(values),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'spaces'] });
      setResult(data);
      toast.success(
        data.ownerExisted
          ? `${data.space.name} added to ${data.space.contactEmail}.`
          : `${data.space.name} created.`,
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const copy = (value: string, what: string) => {
    navigator.clipboard
      .writeText(value)
      .then(() => toast.success(`${what} copied`))
      .catch(() => toast.error('Could not copy - note it down instead.'));
  };

  // ── After it exists: the credentials, once ──────────────────────────────
  if (result) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{result.space.name} is registered</DialogTitle>
            <DialogDescription>
              {result.ownerExisted
                ? 'Added to the owner’s existing account. Their password is unchanged.'
                : 'Read these out to the owner now. The password is not shown again and is not emailed.'}
            </DialogDescription>
          </DialogHeader>

          <dl className="space-y-3 rounded-md border border-line bg-canvas-soft p-4 text-sm">
            {result.spaceCode && (
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted">Space ID</dt>
                <dd className="font-mono text-ink">{result.spaceCode}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted">Sign in with</dt>
              <dd className="truncate font-mono text-ink">{result.space.contactEmail}</dd>
            </div>
            {result.temporaryPassword && (
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted">Password</dt>
                <dd className="flex items-center gap-2">
                  <span className="font-mono text-base text-ink">{result.temporaryPassword}</span>
                  <button
                    type="button"
                    onClick={() => copy(result.temporaryPassword as string, 'Password')}
                    aria-label="Copy the password"
                    className="text-subtle transition-colors hover:text-ink"
                  >
                    <Copy className="size-3.5" />
                  </button>
                </dd>
              </div>
            )}
          </dl>

          <p className="text-xs leading-relaxed text-muted">
            {result.temporaryPassword
              ? 'They will be asked to choose their own password the first time they sign in. The space is unverified until someone confirms it, and it still needs photographs of the room.'
              : 'The space is unverified until someone confirms it, and it still needs photographs of the room.'}
          </p>

          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── The form ────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add a space</DialogTitle>
          <DialogDescription>
            For an owner who is not going to register themselves. They get an account and can sign
            in whenever they want to.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-6"
          onSubmit={handleSubmit((values) => create.mutate(values))}
          noValidate
        >
          <fieldset className="space-y-4">
            <legend className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
              Who owns it
            </legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Owner's name" error={formState.errors.ownerName?.message}>
                <Input {...register('ownerName')} placeholder="Priya Nair" />
              </Field>
              <Field label="Email" error={formState.errors.ownerEmail?.message}>
                <Input type="email" {...register('ownerEmail')} placeholder="priya@example.com" />
              </Field>
              <Field label="Phone" error={formState.errors.ownerPhone?.message}>
                <Input {...register('ownerPhone')} placeholder="+91 98450 00000" />
              </Field>
            </div>
            <p className="text-xs text-muted">
              If they already have an ARTINU account this space is added to it, and their password
              is left alone.
            </p>
          </fieldset>

          <fieldset className="space-y-4 border-t border-line pt-5">
            <legend className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
              The space
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" error={formState.errors.name?.message}>
                <Input {...register('name')} placeholder="Blue Tokai, Koramangala" />
              </Field>
              <Field label="Type" error={formState.errors.type?.message}>
                <SimpleSelect
                  value={watch('type')}
                  onValueChange={(value) => setValue('type', value as never, { shouldValidate: true })}
                  options={SPACE_TYPES.map((type) => ({ value: type, label: SPACE_TYPE_LABELS[type] }))}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Street address" error={formState.errors.addressLine1?.message}>
                <Input {...register('addressLine1')} placeholder="12, 5th Block" />
              </Field>
              <Field label="Address line 2" error={formState.errors.addressLine2?.message}>
                <Input {...register('addressLine2')} placeholder="Optional" />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="City" error={formState.errors.city?.message}>
                <Input {...register('city')} placeholder="Bengaluru" />
              </Field>
              <Field label="State" error={formState.errors.state?.message}>
                <Input {...register('state')} placeholder="Karnataka" />
              </Field>
              <Field label="PIN" error={formState.errors.pin?.message}>
                <Input {...register('pin')} placeholder="560095" />
              </Field>
            </div>
          </fieldset>

          <fieldset className="space-y-4 border-t border-line pt-5">
            <legend className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
              Who we contact about this room
            </legend>
            {/* Nine times out of ten this is the owner, so it can be filled in
                from what was already typed rather than typed again. */}
            <button
              type="button"
              onClick={() => {
                setValue('contactName', ownerName ?? '', { shouldValidate: true });
                setValue('contactEmail', ownerEmail ?? '', { shouldValidate: true });
                setValue('contactPhone', ownerPhone ?? '', { shouldValidate: true });
              }}
              className="text-xs text-ink underline underline-offset-4 transition-opacity hover:opacity-70"
            >
              Same as the owner
            </button>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Contact name" error={formState.errors.contactName?.message}>
                <Input {...register('contactName')} />
              </Field>
              <Field label="Contact phone" error={formState.errors.contactPhone?.message}>
                <Input {...register('contactPhone')} placeholder="+91 98450 00000" />
              </Field>
              <Field label="Contact email" error={formState.errors.contactEmail?.message}>
                <Input type="email" {...register('contactEmail')} />
              </Field>
            </div>
          </fieldset>

          <fieldset className="space-y-4 border-t border-line pt-5">
            <legend className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
              What the curators need to know
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Interior theme" error={formState.errors.theme?.message}>
                <Input {...register('theme')} placeholder="Warm minimal, a lot of wood" />
              </Field>
              <Field label="Wall colour" error={formState.errors.wallColor?.message}>
                <Input {...register('wallColor')} placeholder="Warm white" />
              </Field>
            </div>
            <Field label="Lighting" error={formState.errors.lighting?.message}>
              <Textarea
                rows={2}
                {...register('lighting')}
                placeholder="Large north-facing windows, warm pendants after dark"
              />
            </Field>
            <p className="text-xs text-muted">
              Photographs of the room are asked for at verification. They are not required to create
              the record, so this can be filled in from a phone call.
            </p>
          </fieldset>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Create space
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
