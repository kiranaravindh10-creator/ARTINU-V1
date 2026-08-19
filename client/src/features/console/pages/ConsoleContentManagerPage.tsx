import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ExternalLink,
  GripVertical,
  Image as ImageIcon,
  Images,
  Loader2,
  Pencil,
  Plus,
  Search,
  Store,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type {
  Cafe,
  CreateCafeInput,
  CreateHeroSlideInput,
  FeaturedCollection,
  HeroSlide,
  UpdateCafeInput,
} from '@artinu/shared';
import { PageHeader } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/display';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Photo } from '@/components/ui/photo';
import { SimpleSelect } from '@/components/ui/select';
import { errorMessage } from '@/lib/api';
import { qk } from '@/lib/query';
import { catalogService } from '@/services/catalog.service';
import { contentService } from '@/services/content.service';
import { cn, fileToBase64, formatBytes } from '@/lib/utils';

/**
 * Console → Homepage.
 *
 * This screen is used by the manager and the IT team, not by developers, and it
 * used to ask them to type things only a developer has: an image URL that had
 * to be hosted somewhere else first, and a photographer's raw uuid. Adding one
 * carousel photograph meant finding two identifiers by hand, and there was no
 * way to see what you were about to publish.
 *
 * It now works the way the brief asks: choose a photograph from your computer,
 * add the details that matter, save, and the homepage has it. Everything the
 * API already did — ordering, showing and hiding, deleting the stored file
 * along with the row — is unchanged underneath.
 */

const IMAGE_TYPES = /^image\/(jpeg|jpg|png|webp|avif)$/;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Sentinel for "nobody to credit" — Radix Select cannot hold an empty value. */
const NO_CREDIT = 'none';

// ── Picking a photograph ─────────────────────────────────────────────────────

/**
 * Choose an image from this computer, upload it, hand back its URL.
 *
 * Validation mirrors the server so a 10 MB screenshot is refused here with a
 * sentence rather than there with a status code.
 */
function useImageUpload(folder: 'hero' | 'cafes' | 'featured') {
  const [uploading, setUploading] = React.useState(false);

  const upload = async (file: File): Promise<string | null> => {
    if (!IMAGE_TYPES.test(file.type)) {
      toast.error(`${file.name} is not a JPG, PNG, WebP or AVIF image.`);
      return null;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(`${file.name} is ${formatBytes(file.size)} — the limit is 25 MB.`);
      return null;
    }

    setUploading(true);
    try {
      const imageBase64 = await fileToBase64(file);
      const { url } = await contentService.uploadImage({
        imageBase64,
        folder,
        fileName: file.name,
      });
      return url;
    } catch (error) {
      toast.error(errorMessage(error));
      return null;
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploading };
}

/** The large "choose a photograph" tile used inside the add/edit dialogs. */
function ImageField({
  value,
  onChange,
  folder,
  label = 'Photograph',
  hint = 'JPG, PNG, WebP or AVIF, up to 25 MB. Landscape works best.',
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  folder: 'hero' | 'cafes' | 'featured';
  label?: string;
  hint?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { upload, uploading } = useImageUpload(folder);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    const url = await upload(file);
    if (url) onChange(url);
  };

  return (
    <Field label={label} hint={value ? undefined : hint}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        onChange={(event) => {
          void choose(event.target.files?.[0]);
          event.target.value = '';
        }}
      />

      {value ? (
        <div className="space-y-2">
          <Photo src={value} alt="" ratio="aspect-[16/9]" className="rounded-md photo-edge" />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={uploading}
              onClick={() => inputRef.current?.click()}
            >
              <Upload /> Choose a different one
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              <X /> Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line-strong bg-sand-soft text-muted transition-colors hover:border-bronze hover:text-ink disabled:cursor-wait"
        >
          {uploading ? (
            <>
              <Loader2 className="size-6 animate-spin" aria-hidden />
              <span className="text-sm">Uploading…</span>
            </>
          ) : (
            <>
              <ImageIcon className="size-6" aria-hidden />
              <span className="text-sm font-medium">Choose a photograph</span>
              <span className="text-xs">from this computer</span>
            </>
          )}
        </button>
      )}
    </Field>
  );
}

// ── Small shared pieces ──────────────────────────────────────────────────────

function SortableRows<T extends { id: string }>({
  items,
  onReorder,
  children,
}: {
  items: T[];
  onReorder: (items: T[]) => void;
  children: (item: T, handle: React.ReactNode) => React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (!over || active.id === over.id) return;
        const from = items.findIndex((item) => item.id === active.id);
        const to = items.findIndex((item) => item.id === over.id);
        if (from < 0 || to < 0) return;
        onReorder(arrayMove(items, from, to));
      }}
    >
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-3">
          {items.map((item) => (
            <SortableRow key={item.id} item={item}>
              {children}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

/**
 * One row.
 *
 * The drag listeners are on the handle rather than the whole row: with them on
 * the row, every switch and button inside it had to fight the drag sensor for
 * the pointer.
 */
function SortableRow<T extends { id: string }>({
  item,
  children,
}: {
  item: T;
  children: (item: T, handle: React.ReactNode) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label="Drag to reorder"
      className="cursor-grab text-subtle transition-colors hover:text-ink active:cursor-grabbing"
    >
      <GripVertical className="size-5" />
    </button>
  );

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex flex-wrap items-center gap-4 rounded-lg border border-line bg-surface p-3 sm:flex-nowrap',
        isDragging && 'opacity-60 shadow-lifted',
      )}
    >
      {children(item, handle)}
    </li>
  );
}

function Empty({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof ImageIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line-strong bg-sand-soft/60 px-6 py-14 text-center">
      <Icon className="size-6 text-subtle" aria-hidden />
      <p className="font-medium text-ink">{title}</p>
      <p className="max-w-sm text-sm text-muted">{description}</p>
      {action}
    </div>
  );
}

/** Show/hide, with the word next to it so nobody has to guess what the switch does. */
function VisibilityToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
      <span className={checked ? 'text-ink' : 'text-subtle'}>{checked ? 'Shown' : 'Hidden'}</span>
    </label>
  );
}

function DeleteButton({
  what,
  onConfirm,
  pending,
}: {
  what: string;
  onConfirm: () => void;
  pending?: boolean;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Remove ${what}`}
        className="text-danger hover:bg-danger/10"
        onClick={() => setOpen(true)}
      >
        <Trash2 />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove {what}?</DialogTitle>
            <DialogDescription>
              It comes off the homepage straight away, and the uploaded image is deleted. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() => {
                onConfirm();
                setOpen(false);
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Artists, for the credit picker. Loaded once and shared by both dialogs. */
function useArtistOptions() {
  const { data } = useQuery({
    queryKey: qk.artists({ pageSize: 60 }),
    queryFn: () => catalogService.artists({ pageSize: 60 }),
    staleTime: 5 * 60 * 1000,
  });

  return React.useMemo(
    () => [
      { value: NO_CREDIT, label: 'No credit' },
      ...(data?.items ?? []).map((artist) => ({ value: artist.id, label: artist.name })),
    ],
    [data],
  );
}

// ── The homepage carousel ────────────────────────────────────────────────────

function CarouselTab() {
  const queryClient = useQueryClient();
  const artistOptions = useArtistOptions();

  const { data, isLoading } = useQuery({
    queryKey: ['content-manager', 'hero-slides'],
    queryFn: () => contentService.getHeroSlides({ pageSize: 100 }),
  });

  const slides = React.useMemo(
    () => [...(data?.items ?? [])].sort((a, b) => a.order - b.order),
    [data],
  );

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['content-manager', 'hero-slides'] });
  };

  const create = useMutation({
    mutationFn: (input: CreateHeroSlideInput) => contentService.createHeroSlide(input),
    onSuccess: () => {
      refresh();
      toast.success('Added to the homepage carousel');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof contentService.updateHeroSlide>[1] }) =>
      contentService.updateHeroSlide(id, input),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => contentService.deleteHeroSlide(id),
    onSuccess: () => {
      refresh();
      toast.success('Removed from the carousel');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const reorder = useMutation({
    mutationFn: (items: { id: string; order: number }[]) => contentService.reorderHeroSlides(items),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  });

  const shown = slides.filter((slide) => slide.isActive).length;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Homepage carousel</CardTitle>
          <CardDescription>
            The photographs at the top of artinu.in. Drag to change the order they appear in — the
            top one is shown first. The credit under each one names the photographer on the
            homepage; leave it as “No credit” for a room shot.
            {slides.length > 0 && (
              <>
                {' '}
                {shown} of {slides.length} {slides.length === 1 ? 'photograph is' : 'photographs are'}{' '}
                on the homepage now.
              </>
            )}
          </CardDescription>
        </div>
        <AddSlideDialog
          artistOptions={artistOptions}
          pending={create.isPending}
          onAdd={(input) => create.mutate(input)}
        />
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : slides.length === 0 ? (
          <Empty
            icon={Images}
            title="No photographs in the carousel"
            description="Add one and it appears at the top of the homepage immediately. Until then the homepage shows its standing opening image."
            action={
              <AddSlideDialog
                artistOptions={artistOptions}
                pending={create.isPending}
                onAdd={(input) => create.mutate(input)}
              />
            }
          />
        ) : (
          <SortableRows
            items={slides}
            onReorder={(next) =>
              reorder.mutate(next.map((slide, index) => ({ id: slide.id, order: index })))
            }
          >
            {(slide, handle) => (
              <SlideRow
                slide={slide}
                handle={handle}
                artistOptions={artistOptions}
                onUpdate={(input) => update.mutate({ id: slide.id, input })}
                onDelete={() => remove.mutate(slide.id)}
                busy={update.isPending || remove.isPending}
              />
            )}
          </SortableRows>
        )}
      </CardContent>
    </Card>
  );
}

function SlideRow({
  slide,
  handle,
  artistOptions,
  onUpdate,
  onDelete,
  busy,
}: {
  slide: HeroSlide;
  handle: React.ReactNode;
  artistOptions: { value: string; label: string }[];
  onUpdate: (input: { imageUrl?: string; photographerId?: string | null; isActive?: boolean }) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { upload, uploading } = useImageUpload('hero');

  return (
    <>
      {handle}

      <Photo
        src={slide.imageUrl}
        alt=""
        ratio="aspect-[16/9]"
        className="w-28 shrink-0 rounded-md photo-edge"
      />

      {/*
        The credit sits inline so changing it is one click, and the sentence
        explaining it is in the card description rather than repeated under
        every row.
      */}
      <div className="min-w-[11rem] flex-1 basis-full sm:basis-auto">
        <p className="text-[0.8125rem] font-medium text-ink">Photographer credit</p>
        <SimpleSelect
          value={slide.photographerId ?? NO_CREDIT}
          onValueChange={(value) =>
            onUpdate({ photographerId: value === NO_CREDIT ? null : value })
          }
          options={artistOptions}
          placeholder="No credit"
          className="mt-1.5 w-full max-w-xs"
        />
      </div>

      <div className="flex items-center gap-1.5">
        <VisibilityToggle
          checked={slide.isActive}
          onChange={() => onUpdate({ isActive: !slide.isActive })}
          disabled={busy}
        />

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="sr-only"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            const url = await upload(file);
            if (url) onUpdate({ imageUrl: url });
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Replace this photograph"
          title="Replace this photograph"
          loading={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload />
        </Button>

        <DeleteButton what="this photograph" onConfirm={onDelete} pending={busy} />
      </div>
    </>
  );
}

function AddSlideDialog({
  artistOptions,
  onAdd,
  pending,
}: {
  artistOptions: { value: string; label: string }[];
  onAdd: (input: CreateHeroSlideInput) => void;
  pending: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [photographerId, setPhotographerId] = React.useState(NO_CREDIT);

  const close = () => {
    setOpen(false);
    setImageUrl(null);
    setPhotographerId(NO_CREDIT);
  };

  return (
    <>
      <Button className="shrink-0" onClick={() => setOpen(true)}>
        <Plus /> Add a photograph
      </Button>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add to the homepage carousel</DialogTitle>
            <DialogDescription>
              Choose the photograph, credit the photographer if there is one, and save. It is on
              the homepage as soon as you save.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <ImageField value={imageUrl} onChange={setImageUrl} folder="hero" />

            <Field
              label="Photographer credit"
              hint="Optional. Their name appears under the photograph on the homepage."
            >
              <SimpleSelect
                value={photographerId}
                onValueChange={setPhotographerId}
                options={artistOptions}
                placeholder="No credit"
              />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              loading={pending}
              disabled={!imageUrl}
              onClick={() => {
                if (!imageUrl) return;
                onAdd({
                  imageUrl,
                  photographerId: photographerId === NO_CREDIT ? null : photographerId,
                });
                close();
              }}
            >
              Add to homepage
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Collaborations ───────────────────────────────────────────────────────────

function CollaborationsTab() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['content-manager', 'cafes'],
    queryFn: () => contentService.getCafes({ pageSize: 100 }),
  });

  const cafes = React.useMemo(
    () => [...(data?.items ?? [])].sort((a, b) => a.order - b.order),
    [data],
  );

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['content-manager', 'cafes'] });
  };

  const create = useMutation({
    mutationFn: (input: CreateCafeInput) => contentService.createCafe(input),
    onSuccess: () => {
      refresh();
      toast.success('Collaboration added to the homepage');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCafeInput }) =>
      contentService.updateCafe(id, input),
    onSuccess: () => {
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => contentService.deleteCafe(id),
    onSuccess: () => {
      refresh();
      toast.success('Collaboration removed');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const reorder = useMutation({
    mutationFn: (items: { id: string; order: number }[]) => contentService.reorderCafes(items),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  });

  const missingLinks = cafes.filter((cafe) => cafe.isActive && !cafe.websiteUrl).length;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Collaborations</CardTitle>
          <CardDescription>
            The cafés, restaurants and spaces shown on the homepage. Drag to change their order.
          </CardDescription>
        </div>
        <CafeDialog
          title="Add a collaboration"
          submitLabel="Add to homepage"
          pending={create.isPending}
          onSubmit={(values) => create.mutate(values as CreateCafeInput)}
          trigger={
            <Button className="shrink-0">
              <Plus /> Add a collaboration
            </Button>
          }
        />
      </CardHeader>

      <CardContent className="space-y-4">
        {/*
          A card with no address is not broken — it simply does not link
          anywhere. Saying so here is the difference between a manager knowing
          the field is empty and a visitor finding a card that does nothing.
        */}
        {missingLinks > 0 && (
          <p className="flex items-start gap-2.5 rounded-md border border-line bg-sand-soft px-3.5 py-3 text-sm text-muted">
            <ExternalLink className="mt-0.5 size-4 shrink-0 text-bronze" aria-hidden />
            <span>
              {missingLinks === 1
                ? 'One collaboration on the homepage has no website address, so its card does not link anywhere.'
                : `${missingLinks} collaborations on the homepage have no website address, so their cards do not link anywhere.`}{' '}
              Add one with the edit button and the card becomes clickable.
            </span>
          </p>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : cafes.length === 0 ? (
          <Empty
            icon={Store}
            title="No collaborations yet"
            description="Add the cafés and spaces ARTINU works with. They appear on the homepage in the order you set here."
            action={
              <CafeDialog
                title="Add a collaboration"
                submitLabel="Add to homepage"
                pending={create.isPending}
                onSubmit={(values) => create.mutate(values as CreateCafeInput)}
                trigger={
                  <Button>
                    <Plus /> Add a collaboration
                  </Button>
                }
              />
            }
          />
        ) : (
          <SortableRows
            items={cafes}
            onReorder={(next) =>
              reorder.mutate(next.map((cafe, index) => ({ id: cafe.id, order: index })))
            }
          >
            {(cafe, handle) => (
              <>
                {handle}

                <Photo
                  src={cafe.photoUrl}
                  alt=""
                  ratio="aspect-[4/3]"
                  className="w-24 shrink-0 rounded-md photo-edge"
                />

                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{cafe.name}</p>
                  <p className="truncate text-sm text-muted">{cafe.description}</p>
                  {cafe.websiteUrl ? (
                    <a
                      href={cafe.websiteUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-1 inline-flex items-center gap-1.5 text-xs text-bronze hover:underline"
                    >
                      <ExternalLink className="size-3.5" aria-hidden />
                      {cafe.websiteUrl}
                    </a>
                  ) : (
                    <p className="mt-1 text-xs text-subtle">No website address — the card will not link anywhere</p>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <VisibilityToggle
                    checked={cafe.isActive}
                    onChange={() => update.mutate({ id: cafe.id, input: { isActive: !cafe.isActive } })}
                    disabled={update.isPending}
                  />

                  <CafeDialog
                    title="Edit collaboration"
                    submitLabel="Save changes"
                    initial={cafe}
                    pending={update.isPending}
                    onSubmit={(values) => update.mutate({ id: cafe.id, input: values })}
                    trigger={
                      <Button variant="ghost" size="icon" aria-label={`Edit ${cafe.name}`}>
                        <Pencil />
                      </Button>
                    }
                  />

                  <DeleteButton
                    what={cafe.name}
                    onConfirm={() => remove.mutate(cafe.id)}
                    pending={remove.isPending}
                  />
                </div>
              </>
            )}
          </SortableRows>
        )}
      </CardContent>
    </Card>
  );
}

function CafeDialog({
  title,
  submitLabel,
  initial,
  trigger,
  onSubmit,
  pending,
}: {
  title: string;
  submitLabel: string;
  initial?: Cafe;
  trigger: React.ReactElement<{ onClick?: () => void }>;
  onSubmit: (values: UpdateCafeInput) => void;
  pending: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(initial?.name ?? '');
  const [description, setDescription] = React.useState(initial?.description ?? '');
  const [photoUrl, setPhotoUrl] = React.useState<string | null>(initial?.photoUrl ?? null);
  const [websiteUrl, setWebsiteUrl] = React.useState(initial?.websiteUrl ?? '');

  // Reopening after an edit elsewhere should show what is stored, not what was
  // typed the last time this dialog was open.
  React.useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setDescription(initial?.description ?? '');
    setPhotoUrl(initial?.photoUrl ?? null);
    setWebsiteUrl(initial?.websiteUrl ?? '');
  }, [open, initial]);

  const trimmedWebsite = websiteUrl.trim();
  const websiteLooksWrong =
    trimmedWebsite.length > 0 && !/^https?:\/\/[^\s.]+\.[^\s]{2,}$/i.test(trimmedWebsite);

  const complete = Boolean(name.trim() && description.trim() && photoUrl) && !websiteLooksWrong;

  return (
    <>
      {React.cloneElement(trigger, { onClick: () => setOpen(true) })}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              This is what appears on the homepage under “Collaborations”.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[70vh] space-y-4 overflow-y-auto py-2 pr-1">
            <ImageField
              value={photoUrl}
              onChange={setPhotoUrl}
              folder="cafes"
              hint="A photograph of the space. JPG, PNG, WebP or AVIF, up to 25 MB."
            />

            <Field label="Name" htmlFor="cafe-name">
              <Input
                id="cafe-name"
                value={name}
                placeholder="Nibban Nosh"
                onChange={(event) => setName(event.target.value)}
              />
            </Field>

            <Field label="One line about them" htmlFor="cafe-description">
              <Textarea
                id="cafe-description"
                rows={2}
                value={description}
                placeholder="What the space is, in a sentence."
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>

            <Field
              label="Website"
              htmlFor="cafe-website"
              hint="Optional. With an address here, the homepage card opens their site in a new tab."
              error={websiteLooksWrong ? 'Include the full address, starting with https://' : null}
            >
              <Input
                id="cafe-website"
                type="url"
                inputMode="url"
                value={websiteUrl}
                placeholder="https://example.com"
                invalid={websiteLooksWrong}
                onChange={(event) => setWebsiteUrl(event.target.value)}
              />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={pending}
              disabled={!complete}
              onClick={() => {
                if (!complete || !photoUrl) return;
                onSubmit({
                  name: name.trim(),
                  description: description.trim(),
                  photoUrl,
                  websiteUrl: trimmedWebsite || null,
                });
                setOpen(false);
              }}
            >
              {submitLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Featured photographs ─────────────────────────────────────────────────────

function FeaturedTab() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['content-manager', 'featured-collections'],
    queryFn: () => contentService.getFeaturedCollections({ pageSize: 100 }),
  });

  const featured = React.useMemo(
    () => [...(data?.items ?? [])].sort((a, b) => a.order - b.order),
    [data],
  );

  const ids = featured.map((entry) => entry.collectionId);

  // One request for every pinned photograph, so the console shows the picture
  // and the title rather than the uuid it stores.
  const { data: artworks } = useQuery({
    queryKey: qk.gallery({ ids, pageSize: 100 }),
    queryFn: () => catalogService.gallery({ ids, pageSize: 100 }),
    enabled: ids.length > 0,
  });

  const byId = React.useMemo(
    () => new Map((artworks?.items ?? []).map((artwork) => [artwork.id, artwork])),
    [artworks],
  );

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['content-manager', 'featured-collections'] });
  };

  const create = useMutation({
    mutationFn: (collectionId: string) => contentService.createFeaturedCollection({ collectionId }),
    onSuccess: () => {
      refresh();
      toast.success('Pinned to the homepage');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const update = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      contentService.updateFeaturedCollection(id, { isActive }),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => contentService.deleteFeaturedCollection(id),
    onSuccess: () => {
      refresh();
      toast.success('Removed from the homepage');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const reorder = useMutation({
    mutationFn: (items: { id: string; order: number }[]) =>
      contentService.reorderFeaturedCollections(items),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Featured photographs</CardTitle>
          <CardDescription>
            The photographs pinned to the middle of the homepage. Search the gallery to add one.
          </CardDescription>
        </div>
        <PickArtworkDialog
          alreadyPinned={new Set(ids)}
          pending={create.isPending}
          onPick={(artworkId) => create.mutate(artworkId)}
        />
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : featured.length === 0 ? (
          <Empty
            icon={ImageIcon}
            title="Nothing pinned"
            description="Pin a few photographs and they appear on the homepage under “Featured”. Leave it empty and the section stays off the page."
            action={
              <PickArtworkDialog
                alreadyPinned={new Set(ids)}
                pending={create.isPending}
                onPick={(artworkId) => create.mutate(artworkId)}
              />
            }
          />
        ) : (
          <SortableRows
            items={featured}
            onReorder={(next) =>
              reorder.mutate(next.map((entry, index) => ({ id: entry.id, order: index })))
            }
          >
            {(entry: FeaturedCollection, handle) => {
              const artwork = byId.get(entry.collectionId);
              return (
                <>
                  {handle}

                  {artwork ? (
                    <Photo
                      src={artwork.thumbnailUrl || artwork.imageUrl}
                      alt=""
                      ratio="aspect-square"
                      className="w-20 shrink-0 rounded-md photo-edge"
                    />
                  ) : (
                    <div className="flex aspect-square w-20 shrink-0 items-center justify-center rounded-md bg-sand text-subtle">
                      <ImageIcon className="size-5" aria-hidden />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    {artwork ? (
                      <>
                        <p className="truncate font-medium text-ink">{artwork.title}</p>
                        <p className="truncate text-sm text-muted">{artwork.artist?.name}</p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium text-ink">This photograph is no longer in the gallery</p>
                        <p className="text-sm text-muted">
                          It was removed or unpublished. Remove it here so the homepage does not
                          hold a gap.
                        </p>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <VisibilityToggle
                      checked={entry.isActive}
                      onChange={() => update.mutate({ id: entry.id, isActive: !entry.isActive })}
                      disabled={update.isPending}
                    />
                    <DeleteButton
                      what="this photograph"
                      onConfirm={() => remove.mutate(entry.id)}
                      pending={remove.isPending}
                    />
                  </div>
                </>
              );
            }}
          </SortableRows>
        )}
      </CardContent>
    </Card>
  );
}

/** Search the published gallery and pin a photograph — no ids to copy. */
function PickArtworkDialog({
  alreadyPinned,
  onPick,
  pending,
}: {
  alreadyPinned: Set<string>;
  onPick: (artworkId: string) => void;
  pending: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [term, setTerm] = React.useState('');
  const [debounced, setDebounced] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(timer);
  }, [term]);

  const { data, isFetching } = useQuery({
    queryKey: qk.gallery({ q: debounced || undefined, pageSize: 18, sort: 'latest' }),
    queryFn: () => catalogService.gallery({ q: debounced || undefined, pageSize: 18, sort: 'latest' }),
    enabled: open,
  });

  const results = data?.items ?? [];

  return (
    <>
      <Button className="shrink-0" onClick={() => setOpen(true)}>
        <Plus /> Pin a photograph
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pin a photograph to the homepage</DialogTitle>
            <DialogDescription>
              Search by title, photographer or place, then click the one you want.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search the gallery…"
              icon={<Search />}
              aria-label="Search the gallery"
            />

            <div className="grid max-h-[52vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
              {isFetching && results.length === 0
                ? Array.from({ length: 6 }, (_, index) => (
                    <Skeleton key={index} className="aspect-[4/3] w-full rounded-md" />
                  ))
                : results.map((artwork) => {
                    const pinned = alreadyPinned.has(artwork.id);
                    return (
                      <button
                        key={artwork.id}
                        type="button"
                        disabled={pinned || pending}
                        onClick={() => {
                          onPick(artwork.id);
                          setOpen(false);
                        }}
                        className={cn(
                          'group overflow-hidden rounded-md border border-line text-left transition-all',
                          pinned
                            ? 'cursor-not-allowed opacity-45'
                            : 'hover:border-bronze hover:shadow-card',
                        )}
                      >
                        <Photo
                          src={artwork.thumbnailUrl || artwork.imageUrl}
                          alt=""
                          ratio="aspect-[4/3]"
                        />
                        <span className="block truncate px-2.5 py-2 text-xs text-ink">
                          {artwork.title}
                          {pinned && <span className="text-subtle"> · already pinned</span>}
                        </span>
                      </button>
                    );
                  })}
            </div>

            {!isFetching && results.length === 0 && (
              <p className="py-6 text-center text-sm text-muted">
                No photographs match “{debounced}”.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'carousel', label: 'Carousel', icon: Images },
  { id: 'collaborations', label: 'Collaborations', icon: Store },
  { id: 'featured', label: 'Featured photographs', icon: ImageIcon },
] as const;

export default function ConsoleContentManagerPage() {
  const [tab, setTab] = React.useState<(typeof TABS)[number]['id']>('carousel');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Homepage"
        description="What visitors see first — the carousel at the top, the collaborations, and the photographs featured in between. Changes are live as soon as you save."
      />

      <div
        className="flex gap-1 overflow-x-auto border-b border-line"
        role="tablist"
        aria-label="Homepage sections"
      >
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className={cn(
              'flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              tab === entry.id
                ? 'border-bronze text-ink'
                : 'border-transparent text-muted hover:text-ink',
            )}
          >
            <entry.icon className="size-4" aria-hidden />
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'carousel' && <CarouselTab />}
      {tab === 'collaborations' && <CollaborationsTab />}
      {tab === 'featured' && <FeaturedTab />}
    </div>
  );
}
