import {
  ROTATION_INTERVALS,
  SPACE_TYPE_LABELS,
  SPACE_TYPES,
  spaceSchema,
  type Space,
  type SpaceInput,
} from '@artinu/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Building2, Plus, TriangleAlert, Upload, X } from 'lucide-react';
import * as React from 'react';
import { ErrorState } from '@/components/ui/display';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PanelHeader } from '@/components/layout/DashboardShell';
import { Status } from '@/components/layout/panel';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Photo } from '@/components/ui/photo';
import { SimpleSelect } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { errorMessage } from '@/lib/api';
import { qk } from '@/lib/query';
import { spaceService } from '@/services/space.service';
import { fileToBase64 } from '@/lib/utils';
import { cn } from '@/lib/utils';

const NEEDS_CUISINE = ['cafe', 'restaurant', 'hotel'];

/**
 * A signed-in owner already told us who they are. Asking them to retype their
 * own name, phone and email is work we imposed, not information we needed — so
 * the contact block starts filled in from their account and stays editable for
 * the case where the on-site contact is someone else.
 */
function blankSpace(contact: { name: string; phone: string; email: string }): SpaceInput {
  return {
    name: '',
    type: 'cafe',
    theme: '',
    cuisine: '',
    wallColor: '',
    lighting: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    pin: '',
    contactName: contact.name,
    contactPhone: contact.phone,
    contactEmail: contact.email,
    wallCount: null,
    imageUrls: [],
    rotationIntervalMonths: 3,
  };
}

export default function RegisterSpacePage() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // Arrived here mid-checkout because we needed an address? Go straight back
  // once it's saved, rather than stranding them in settings with a full cart.
  const returnTo = params.get('next');

  const emptyValues = React.useMemo(
    () =>
      blankSpace({
        name: profile?.fullName ?? '',
        phone: profile?.phone ?? '',
        email: user?.email ?? '',
      }),
    [profile?.fullName, profile?.phone, user?.email],
  );
  const [editing, setEditing] = React.useState<Space | null>(null);
  const [images, setImages] = React.useState<string[]>([]);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const { data: spaces, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.spaces,
    queryFn: () => spaceService.list(),
  });

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<SpaceInput>({
    resolver: zodResolver(spaceSchema),
    defaultValues: emptyValues,
  });

  const type = watch('type');
  const rotation = watch('rotationIntervalMonths');

  React.useEffect(() => {
    if (editing) return;
    if (!getValues('contactName') && emptyValues.contactName) {
      setValue('contactName', emptyValues.contactName);
    }
    if (!getValues('contactPhone') && emptyValues.contactPhone) {
      setValue('contactPhone', emptyValues.contactPhone);
    }
    if (!getValues('contactEmail') && emptyValues.contactEmail) {
      setValue('contactEmail', emptyValues.contactEmail);
    }
  }, [editing, emptyValues, getValues, setValue]);

  const startEditing = (space: Space) => {
    setEditing(space);
    setImages(space.imageUrls ?? []);
    reset({
      name: space.name,
      type: space.type,
      theme: space.theme ?? '',
      cuisine: space.cuisine ?? '',
      wallColor: space.wallColor ?? '',
      lighting: space.lighting ?? '',
      addressLine1: space.addressLine1,
      addressLine2: space.addressLine2 ?? '',
      city: space.city,
      state: space.state ?? '',
      pin: space.pin ?? '',
      contactName: space.contactName,
      contactPhone: space.contactPhone,
      contactEmail: space.contactEmail,
      wallCount: space.wallCount ?? null,
      imageUrls: space.imageUrls,
      rotationIntervalMonths: space.rotationIntervalMonths,
    });
    window.scrollTo({ top: 300, behavior: 'smooth' });
  };

  const save = useMutation({
    mutationFn: (values: SpaceInput) =>
      editing
        ? spaceService.update(editing.id, { ...values, imageUrls: images })
        : spaceService.create({ ...values, imageUrls: images }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.spaces });
      toast.success(editing ? 'Space updated' : 'Space registered');
      if (returnTo && !editing) {
        navigate(returnTo, { replace: true });
        return;
      }
      setEditing(null);
      setImages([]);
      reset(emptyValues);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const addImages = async (files: FileList) => {
    const next = [...images];
    for (const file of Array.from(files)) {
      if (next.length >= 12) {
        toast.error('You can add up to 12 photographs of a space.');
        break;
      }
      if (file.size > 8 * 1024 * 1024) {
        toast.error(`${file.name} is larger than 8 MB.`);
        continue;
      }
      next.push(await fileToBase64(file));
    }
    setImages(next);
    setValue('imageUrls', next, { shouldDirty: true });
  };

  return (
    <div>
      <PanelHeader
        title="My spaces"
        description="The details here are what our curators work from — the more you tell us, the better the fit."
        actions={
          editing ? (
            <Button
              variant="outline"
              onClick={() => {
                setEditing(null);
                setImages([]);
                reset(emptyValues);
              }}
            >
              <Plus /> Register another space
            </Button>
          ) : undefined
        }
      />

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 2 }, (_, index) => (
            <div key={index} className="h-44 rounded-lg bg-sand-soft" />
          ))}
        </div>
      ) : spaces && spaces.length > 0 ? (
        <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {spaces.map((space) => (
            <div
              key={space.id}
              className={cn(
                'group',
                editing?.id === space.id && 'ring-2 ring-bronze ring-offset-4 ring-offset-canvas',
              )}
            >
              <Photo
                src={space.imageUrls[0] ?? ''}
                alt={space.name}
                ratio="aspect-[3/2]"
                className="rounded-t-lg"
              />
              <div className="pt-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-medium text-ink">{space.name}</h3>
                  {space.verified ? (
                    <Status tone="success" className="inline-flex items-center gap-1">
                      <BadgeCheck className="size-3.5" /> Verified
                    </Status>
                  ) : (
                    <Status tone="warning">Pending review</Status>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted">
                  {SPACE_TYPE_LABELS[space.type]} · {space.city}
                </p>
                <p className="mt-0.5 text-xs text-subtle">
                  {space.wallCount ? `${space.wallCount} walls · ` : ''}rotates every{' '}
                  {space.rotationIntervalMonths}{' '}
                  {space.rotationIntervalMonths === 1 ? 'month' : 'months'}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => startEditing(space)}
                >
                  Edit details
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <section className="mt-12 border-t border-line pt-10">
        <h2 className="font-display text-xl leading-none text-ink">
          {editing ? `Edit ${editing.name}` : 'Add a space'}
        </h2>

        <div className="mt-8">
          {editing && !editing.verified && (
            <p className="mb-5 flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning-soft p-4 text-sm text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              We&rsquo;ll confirm these details with you before the first installation.
            </p>
          )}

          <form onSubmit={handleSubmit((values) => save.mutate(values))} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Space name" htmlFor="name" required error={errors.name?.message}>
                <Input
                  id="name"
                  placeholder="e.g. Blue Tokai — Koramangala"
                  invalid={!!errors.name}
                  {...register('name')}
                />
              </Field>

              <Field label="Type of space" required error={errors.type?.message}>
                <Controller
                  control={control}
                  name="type"
                  render={({ field }) => (
                    <SimpleSelect
                      value={field.value}
                      onValueChange={field.onChange}
                      options={SPACE_TYPES.map((entry) => ({
                        value: entry,
                        label: SPACE_TYPE_LABELS[entry],
                      }))}
                    />
                  )}
                />
              </Field>
            </div>

            <fieldset className="space-y-4 rounded-md border border-line p-5">
              <legend className="px-2 font-label text-[0.625rem] uppercase tracking-[0.16em] text-bronze">
                Where it is
              </legend>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Address line 1"
                  htmlFor="addressLine1"
                  required
                  error={errors.addressLine1?.message}
                >
                  <Input id="addressLine1" invalid={!!errors.addressLine1} {...register('addressLine1')} />
                </Field>
                <Field label="Address line 2" htmlFor="addressLine2">
                  <Input id="addressLine2" {...register('addressLine2')} />
                </Field>
                <Field label="City" htmlFor="city" required error={errors.city?.message}>
                  <Input id="city" invalid={!!errors.city} {...register('city')} />
                </Field>
                <Field label="State" htmlFor="state">
                  <Input id="state" {...register('state')} />
                </Field>
                <Field label="PIN code" htmlFor="pin" error={errors.pin?.message}>
                  <Input id="pin" inputMode="numeric" invalid={!!errors.pin} {...register('pin')} />
                </Field>
                <Field
                  label="How many walls?"
                  htmlFor="wallCount"
                  hint="Roughly is fine"
                  error={errors.wallCount?.message}
                >
                  <Input id="wallCount" type="number" min={1} {...register('wallCount')} />
                </Field>
              </div>
            </fieldset>

            <fieldset className="space-y-4 rounded-md border border-line p-5">
              <legend className="px-2 font-label text-[0.625rem] uppercase tracking-[0.16em] text-bronze">
                Who we speak to
              </legend>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field
                  label="Contact name"
                  htmlFor="contactName"
                  required
                  error={errors.contactName?.message}
                >
                  <Input id="contactName" invalid={!!errors.contactName} {...register('contactName')} />
                </Field>
                <Field
                  label="Phone"
                  htmlFor="contactPhone"
                  required
                  error={errors.contactPhone?.message}
                >
                  <Input
                    id="contactPhone"
                    type="tel"
                    invalid={!!errors.contactPhone}
                    {...register('contactPhone')}
                  />
                </Field>
                <Field
                  label="Email"
                  htmlFor="contactEmail"
                  required
                  error={errors.contactEmail?.message}
                >
                  <Input
                    id="contactEmail"
                    type="email"
                    invalid={!!errors.contactEmail}
                    {...register('contactEmail')}
                  />
                </Field>
              </div>
            </fieldset>

            <fieldset className="space-y-4 rounded-md border border-line p-5">
              <legend className="px-2 font-label text-[0.625rem] uppercase tracking-[0.16em] text-bronze">
                Help us ARTINU
              </legend>
              <p className="text-xs text-muted">
                These notes drive the recommendations you see. Write them the way you&rsquo;d
                describe the room to a friend.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Interior theme" htmlFor="theme">
                  <Input
                    id="theme"
                    placeholder="Industrial minimal with reclaimed wood"
                    {...register('theme')}
                  />
                </Field>

                {NEEDS_CUISINE.includes(type) && (
                  <Field label="Cuisine / offering" htmlFor="cuisine">
                    <Input id="cuisine" placeholder="Speciality coffee" {...register('cuisine')} />
                  </Field>
                )}

                <Field label="Wall colour" htmlFor="wallColor">
                  <Input id="wallColor" placeholder="Warm white" {...register('wallColor')} />
                </Field>

                <Field label="Lighting" htmlFor="lighting">
                  <Textarea
                    id="lighting"
                    rows={2}
                    placeholder="Large north-facing windows, warm pendants after dark"
                    {...register('lighting')}
                  />
                </Field>
              </div>
            </fieldset>

            <div>
              <p className="text-[0.8125rem] font-medium text-ink-soft">Rotation cadence</p>
              <div className="mt-2.5 grid gap-3 sm:grid-cols-3">
                {ROTATION_INTERVALS.map((months) => (
                  <button
                    key={months}
                    type="button"
                    onClick={() => setValue('rotationIntervalMonths', months, { shouldDirty: true })}
                    aria-pressed={rotation === months}
                    className={cn(
                      'rounded-md border px-4 py-3 text-left transition-all',
                      rotation === months
                        ? 'border-ink bg-sand'
                        : 'border-line hover:border-line-strong',
                    )}
                  >
                    <span className="block text-sm font-medium text-ink">
                      Every {months} {months === 1 ? 'month' : 'months'}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {months === 1
                        ? 'Always something new'
                        : months === 2
                          ? 'A steady refresh'
                          : 'Our most popular'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[0.8125rem] font-medium text-ink-soft">Photographs of the space</p>
              <p className="mt-1 text-xs text-subtle">
                A few wide shots help our curators see the light and the walls.
              </p>

              <div className="mt-3 flex flex-wrap gap-3">
                {images.map((image, index) => (
                  <div key={index} className="group relative">
                    <Photo src={image} alt="" className="size-24 rounded-md" />
                    <button
                      type="button"
                      onClick={() => {
                        const next = images.filter((_, position) => position !== index);
                        setImages(next);
                        setValue('imageUrls', next, { shouldDirty: true });
                      }}
                      aria-label="Remove photograph"
                      className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-ink text-canvas opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="flex size-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line-strong bg-canvas-soft text-muted transition-colors hover:border-bronze hover:text-bronze"
                >
                  <Upload className="size-4" aria-hidden />
                  <span className="text-[0.625rem]">Add photos</span>
                </button>
              </div>

              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(event) => {
                  if (event.target.files) void addImages(event.target.files);
                  event.target.value = '';
                }}
              />
            </div>

            <div className="flex justify-end gap-3 border-t border-line pt-5">
              <Button type="submit" loading={save.isPending}>
                {editing ? 'Save changes' : 'Register space'}
              </Button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
