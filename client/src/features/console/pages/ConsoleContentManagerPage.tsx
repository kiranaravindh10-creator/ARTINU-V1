import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ExternalLink,
  GripVertical,
  Image as ImageIcon,
  Images,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Save,
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
import { DEFAULT_SLIDESHOW_SETTINGS, SLIDESHOW_LIMITS } from '@artinu/shared';
import type {
  Cafe,
  CreateCafeInput,
  CreateHeroSlideInput,
  FeaturedCollection,
  HeroSlide,
  SlideshowSettings,
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
import { CharCount, Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Photo } from '@/components/ui/photo';
import { SimpleSelect } from '@/components/ui/select';
import { SegmentedList, SegmentedTrigger, Tabs } from '@/components/ui/tabs';
import { errorMessage } from '@/lib/api';
import { qk } from '@/lib/query';
import { catalogService } from '@/services/catalog.service';
import { SLIDESHOW_CONTENT_ID, contentService } from '@/services/content.service';
import { cn, fileToImageDataUrl, formatBytes } from '@/lib/utils';

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

/*
  The formats a browser will actually draw, which is the only list worth
  enforcing: everything chosen here ends up in an `<img>` on the homepage.

  This mirrors EXTENSIONS in server/src/services/storage.service.ts. Both sides
  check, on purpose — the client so a refusal is a sentence next to the field
  rather than a status code, the server because the client is not a security
  boundary. If one list grows, grow the other.
*/
const IMAGE_TYPES = /^image\/(jpeg|jpg|png|webp|avif|gif)$/;

/*
  Formats people really do try, that no browser can draw. Worth naming
  individually: "that file type is not supported" sends someone back to a folder
  of .HEIC with no idea what to do, and HEIC is what every iPhone shoots by
  default. `.heic` sometimes arrives with an empty `file.type` from the OS
  picker, so the extension is checked too.
*/
const UNRENDERABLE: { test: RegExp; why: string }[] = [
  { test: /^image\/tiff$|\.tiff?$/i, why: 'TIFF cannot be displayed by any browser.' },
  { test: /photoshop|\.psd$/i, why: 'A Photoshop file cannot be displayed by a browser.' },
  { test: /^application\/pdf$|\.pdf$/i, why: 'A PDF cannot be used as an image on the site.' },
  { test: /\.(cr2|cr3|nef|arw|dng|raf|orf|rw2)$/i, why: 'That is a camera raw file.' },
];

/*
  SVG is refused rather than merely unsupported. A browser renders it happily,
  which is the problem: an SVG is a document that can carry <script>, and these
  are served from our own origin. There is also no such thing as a photograph in
  SVG.
*/
const SVG = /^image\/svg|\.svg$/i;

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
      const probe = `${file.type} ${file.name}`;

      if (SVG.test(probe)) {
        toast.error('SVG files are not accepted. Choose a photograph as a JPG, PNG, WebP, AVIF or GIF.');
        return null;
      }

      const known = UNRENDERABLE.find((entry) => entry.test.test(probe));
      toast.error(
        known
          ? `${known.why} Export it as a JPG and choose that instead.`
          : `${file.name} is not an image format browsers can display. Choose a JPG, PNG, WebP, AVIF or GIF.`,
      );
      return null;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(`${file.name} is ${formatBytes(file.size)} - the limit is 25 MB.`);
      return null;
    }

    setUploading(true);
    try {
      const imageBase64 = await fileToImageDataUrl(file);
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
  hint = 'JPG, PNG, WebP, AVIF or GIF, up to 25 MB. Landscape works best, and at least 800px on the short edge.',
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
        accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/heic,image/heif,.heic,.heif"
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
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Homepage carousel</CardTitle>
            <CardDescription>
              The photographs at the top of artinu.in. Drag to change the order they appear in - the
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

      {/* The photographs are the point of the screen, so they come first; how
          they play sits underneath. */}
      <SlideshowSettingsCard />
    </div>
  );
}

// ── How the slideshow plays ──────────────────────────────────────────────────

/** A labelled on/off row, which is most of the panel below. */
function SettingSwitch({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-line-soft py-4 last:border-b-0">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-ink">
          {label}
        </label>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5 shrink-0" />
    </div>
  );
}

/**
 * Builds the dropdown options for a duration, and makes sure whatever is
 * currently saved is one of them.
 *
 * A dropdown rather than a number box on purpose: this screen is used by the
 * manager and the IT team, the sensible values are a short list, and a free text
 * field would let someone save a two-second rotation or an empty one and have
 * the API reject it after the fact. If a stored value came from somewhere else —
 * a hand-edited record — it is added to the list rather than silently reset,
 * which would otherwise happen the first time anybody pressed Save.
 */
function durationOptions(currentMs: number, presetMs: number[], format: (ms: number) => string) {
  const values = presetMs.includes(currentMs) ? presetMs : [...presetMs, currentMs].sort((a, b) => a - b);
  return values.map((ms) => ({ value: String(ms), label: format(ms) }));
}

const secondsLabel = (ms: number) => {
  const seconds = ms / 1000;
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} seconds`;
};

/**
 * Console → Homepage → how the slideshow plays.
 *
 * The photographs above this were always editable. Their timing was not: the
 * dwell, the cross-fade length, the slow zoom and which controls appeared were
 * all constants in the homepage component, so "hold each photograph a bit
 * longer" or "drop the zoom" was a code change and a deploy.
 *
 * Saved as one `ui_content` record rather than a table of its own — a single row
 * of settings for a single slideshow does not need a migration — and the API
 * bounds every value on the way in, so nothing saved here can stop the homepage
 * or spin it.
 */
function SlideshowSettingsCard() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['content', SLIDESHOW_CONTENT_ID],
    queryFn: () => contentService.getSlideshowSettings(),
  });

  // The form edits a local copy. Nothing reaches the homepage until Save, so a
  // half-made decision is never live on the front page of the site.
  const [draft, setDraft] = React.useState<SlideshowSettings | null>(null);
  React.useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const save = useMutation({
    mutationFn: (settings: SlideshowSettings) => contentService.saveSlideshowSettings(settings),
    onSuccess: (saved) => {
      queryClient.setQueryData(['content', SLIDESHOW_CONTENT_ID], saved);
      toast.success('The homepage slideshow has been updated');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (isLoading || !draft) {
    return <Skeleton className="h-[32rem] w-full rounded-lg" />;
  }

  const set = <K extends keyof SlideshowSettings>(key: K, value: SlideshowSettings[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const dirty = !!data && JSON.stringify(draft) !== JSON.stringify(data);

  return (
    <Card>
      <CardHeader>
        <CardTitle>How the slideshow plays</CardTitle>
        <CardDescription>
          Timing and controls for the photographs above. Changes go live on the homepage as soon
          as you save - visitors already on the page see them on their next visit.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-8">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Hold each photograph for"
            htmlFor="slideshow-interval"
            hint="How long one photograph stays before the next one comes in."
          >
            <SimpleSelect
              id="slideshow-interval"
              value={String(draft.intervalMs)}
              onValueChange={(value) => set('intervalMs', Number(value))}
              options={durationOptions(
                draft.intervalMs,
                [3000, 4000, 5000, 6000, 8000, 10000, 12000, 15000, 20000],
                secondsLabel,
              )}
            />
          </Field>

          <Field
            label="Change between photographs by"
            htmlFor="slideshow-transition"
            hint="Fading is the quieter of the two and is what the homepage has always done."
          >
            <SimpleSelect
              id="slideshow-transition"
              value={draft.transition}
              onValueChange={(value) => set('transition', value === 'slide' ? 'slide' : 'fade')}
              options={[
                { value: 'fade', label: 'Fading one into the next' },
                { value: 'slide', label: 'Sliding in from the side' },
              ]}
            />
          </Field>

          <Field
            label="Take this long to change"
            htmlFor="slideshow-transition-ms"
            hint="The length of that fade or slide."
          >
            <SimpleSelect
              id="slideshow-transition-ms"
              value={String(draft.transitionMs)}
              onValueChange={(value) => set('transitionMs', Number(value))}
              options={durationOptions(
                draft.transitionMs,
                [300, 600, 900, 1200, 1500, 2000],
                secondsLabel,
              )}
            />
          </Field>

          <Field
            label="Line beside the controls"
            htmlFor="slideshow-caption"
            hint="Shown on wide screens only. Leave it empty and the photographs take the full width."
            aside={<CharCount value={draft.caption} max={SLIDESHOW_LIMITS.caption.max} />}
          >
            <Input
              id="slideshow-caption"
              value={draft.caption}
              maxLength={SLIDESHOW_LIMITS.caption.max}
              onChange={(event) => set('caption', event.target.value)}
              placeholder={DEFAULT_SLIDESHOW_SETTINGS.caption}
            />
          </Field>
        </div>

        <div>
          <p className="eyebrow eyebrow-muted">Movement</p>
          <div className="mt-2">
            <SettingSwitch
              id="slideshow-autoplay"
              label="Move through the photographs on its own"
              description="Off leaves the slideshow entirely manual - visitors move it with the arrows and thumbnails."
              checked={draft.autoPlay}
              onChange={(next) => set('autoPlay', next)}
            />
            <SettingSwitch
              id="slideshow-pause-hover"
              label="Hold while the visitor's pointer is over it"
              description="Stops the rotation from moving a photograph out from under someone who is looking at it."
              checked={draft.pauseOnHover}
              onChange={(next) => set('pauseOnHover', next)}
            />
            <SettingSwitch
              id="slideshow-ken-burns"
              label="Slowly push in on each photograph"
              description="A very gradual zoom while a photograph is on screen. Turn it off for a completely still image."
              checked={draft.kenBurns}
              onChange={(next) => set('kenBurns', next)}
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-subtle">
            Visitors whose device is set to reduce motion always get still photographs and a plain
            change between them, whatever is chosen here.
          </p>
        </div>

        <div>
          <p className="eyebrow eyebrow-muted">Controls on the homepage</p>
          <div className="mt-2">
            <SettingSwitch
              id="slideshow-thumbnails"
              label="Row of upcoming photographs"
              description="The small previews under the photograph. Visitors can click one to jump to it."
              checked={draft.showThumbnails}
              onChange={(next) => set('showThumbnails', next)}
            />
            <SettingSwitch
              id="slideshow-arrows"
              label="Back and forward arrows"
              description="Lets visitors step through by hand. Doing so restarts the timer rather than stopping it."
              checked={draft.showArrows}
              onChange={(next) => set('showArrows', next)}
            />
            <SettingSwitch
              id="slideshow-counter"
              label="Counter and photographer's credit"
              description="Reads 01 / 08 followed by the photographer named against the current slide."
              checked={draft.showCounter}
              onChange={(next) => set('showCounter', next)}
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-subtle">
            A pause button appears alongside these whenever the slideshow moves on its own, and
            cannot be switched off - auto-advancing content has to be stoppable.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-line-soft pt-5">
          <Button onClick={() => save.mutate(draft)} loading={save.isPending} disabled={!dirty}>
            <Save /> Save
          </Button>

          {dirty && (
            <Button variant="ghost" onClick={() => data && setDraft(data)} disabled={save.isPending}>
              Discard changes
            </Button>
          )}

          <Button
            variant="ghost"
            className="ml-auto text-muted"
            onClick={() => setDraft({ ...DEFAULT_SLIDESHOW_SETTINGS })}
            disabled={save.isPending}
          >
            <RotateCcw /> Back to the standard settings
          </Button>
        </div>
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
          accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif"
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

/**
 * What a chosen photograph amounts to: a URL, and a photographer to credit if
 * one is known.
 *
 * `from` is kept so step two can say where the image came from and so a gallery
 * pick can present its credit as already settled rather than as a dropdown to
 * fill in again.
 */
interface ChosenImage {
  from: 'upload' | 'gallery';
  imageUrl: string;
  /** Pre-resolved for a gallery pick. Null for an upload — nobody to credit yet. */
  photographerId: string | null;
  /** Shown back to the manager in step two. Never sent to the API. */
  caption?: string;
}

/**
 * Pick a photograph that is already in the gallery.
 *
 * This is the option the screen was missing. Uploading was the only way to add a
 * carousel image, which meant a manager who wanted a photograph the site already
 * holds had to find the file, upload a second copy of it into the hero folder,
 * and then re-select its photographer from a dropdown by hand — two chances to
 * mis-credit somebody, and a duplicate of an image we already store.
 *
 * A gallery pick carries its own artist, so the credit cannot be wrong.
 */
function GalleryPicker({
  value,
  onChange,
}: {
  value: ChosenImage | null;
  onChange: (chosen: ChosenImage | null) => void;
}) {
  const [term, setTerm] = React.useState('');
  const [search, setSearch] = React.useState('');

  // The gallery query hits the network, so it follows a submitted term rather
  // than every keystroke.
  React.useEffect(() => {
    const timer = setTimeout(() => setSearch(term.trim()), 350);
    return () => clearTimeout(timer);
  }, [term]);

  const { data, isLoading } = useQuery({
    queryKey: ['content-manager', 'gallery-picker', search],
    queryFn: () => catalogService.gallery({ q: search || undefined, pageSize: 24, sort: 'latest' }),
    staleTime: 60 * 1000,
  });

  const artworks = data?.items ?? [];

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
          aria-hidden
        />
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search the gallery by title, photographer or tag"
          className="pl-9"
          aria-label="Search the gallery"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="aspect-[4/3] w-full rounded-md" />
          ))}
        </div>
      ) : artworks.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-strong bg-sand-soft px-4 py-8 text-center text-sm text-muted">
          {search
            ? `Nothing in the gallery matches “${search}”.`
            : 'There are no photographs in the gallery yet.'}
        </p>
      ) : (
        <div
          role="listbox"
          aria-label="Photographs in the gallery"
          className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto pr-1"
        >
          {artworks.map((artwork) => {
            const selected = value?.from === 'gallery' && value.imageUrl === artwork.imageUrl;
            return (
              <button
                key={artwork.id}
                type="button"
                role="option"
                aria-selected={selected}
                title={`${artwork.title} - ${artwork.artist.name}`}
                onClick={() =>
                  onChange(
                    selected
                      ? null
                      : {
                          from: 'gallery',
                          imageUrl: artwork.imageUrl,
                          photographerId: artwork.artist.id,
                          caption: `${artwork.title} - ${artwork.artist.name}`,
                        },
                  )
                }
                className={cn(
                  'group relative overflow-hidden rounded-md transition-all',
                  selected
                    ? 'ring-2 ring-bronze ring-offset-2 ring-offset-surface'
                    : 'ring-1 ring-line hover:ring-bronze/50',
                )}
              >
                <Photo
                  src={artwork.thumbnailUrl || artwork.imageUrl}
                  alt={artwork.title}
                  ratio="aspect-[4/3]"
                  className="w-full"
                />
                <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-ink/85 to-transparent px-2 pb-1.5 pt-5 text-left text-[0.6875rem] text-canvas">
                  {artwork.title}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Add a photograph to the homepage carousel, in two steps.
 *
 * It used to be one screen whose only button said "Add to homepage" — so the
 * button that publishes to the front page of the site was live from the moment
 * the dialog opened, sitting next to an empty picker. Choosing the image and
 * agreeing to publish it were the same click.
 *
 * Now: choose the photograph, Next, then confirm the credit and publish. The
 * split also gives the gallery option somewhere to live, and gives step two a
 * full-width preview of what is about to go up.
 */
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
  const [step, setStep] = React.useState<1 | 2>(1);
  const [source, setSource] = React.useState<'upload' | 'gallery'>('upload');
  const [chosen, setChosen] = React.useState<ChosenImage | null>(null);
  const [photographerId, setPhotographerId] = React.useState(NO_CREDIT);

  const close = () => {
    setOpen(false);
    setStep(1);
    setSource('upload');
    setChosen(null);
    setPhotographerId(NO_CREDIT);
  };

  // Step two opens with the credit the gallery already knows, and with "No
  // credit" for an upload, which is the honest default — an uploaded file tells
  // us nothing about who took it.
  const toStepTwo = () => {
    if (!chosen) return;
    setPhotographerId(chosen.photographerId ?? NO_CREDIT);
    setStep(2);
  };

  return (
    <>
      <Button className="shrink-0" onClick={() => setOpen(true)}>
        <Plus /> Add a photograph
      </Button>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {step === 1 ? 'Choose a photograph' : 'Credit and publish'}
            </DialogTitle>
            <DialogDescription>
              {step === 1
                ? 'Pick one that is already in the gallery, or upload a new file.'
                : 'Check the credit, then add it. It is on the homepage as soon as you do.'}
            </DialogDescription>
          </DialogHeader>

          {step === 1 ? (
            <div className="space-y-4 py-2">
              <Tabs
                value={source}
                onValueChange={(next) => {
                  // Switching source clears the pick rather than carrying a
                  // gallery credit onto an uploaded file, or vice versa.
                  setSource(next as 'upload' | 'gallery');
                  setChosen(null);
                }}
              >
                <SegmentedList>
                  <SegmentedTrigger value="upload">Upload a file</SegmentedTrigger>
                  <SegmentedTrigger value="gallery">From the gallery</SegmentedTrigger>
                </SegmentedList>
              </Tabs>

              {source === 'upload' ? (
                <ImageField
                  value={chosen?.from === 'upload' ? chosen.imageUrl : null}
                  onChange={(url) =>
                    setChosen(url ? { from: 'upload', imageUrl: url, photographerId: null } : null)
                  }
                  folder="hero"
                />
              ) : (
                <GalleryPicker value={chosen} onChange={setChosen} />
              )}
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {chosen && (
                <div className="space-y-2">
                  <Photo
                    src={chosen.imageUrl}
                    alt=""
                    ratio="aspect-[16/9]"
                    className="photo-edge rounded-md"
                  />
                  <p className="text-xs text-subtle">
                    {chosen.from === 'gallery'
                      ? `From the gallery - ${chosen.caption}`
                      : 'Uploaded from this computer'}
                  </p>
                </div>
              )}

              <Field
                label="Photographer credit"
                hint={
                  chosen?.from === 'gallery'
                    ? 'Taken from the gallery entry. Change it only if it is wrong.'
                    : 'Optional. Their name appears under the photograph on the homepage.'
                }
              >
                <SimpleSelect
                  value={photographerId}
                  onValueChange={setPhotographerId}
                  options={artistOptions}
                  placeholder="No credit"
                />
              </Field>
            </div>
          )}

          <DialogFooter>
            {step === 1 ? (
              <>
                <Button variant="outline" onClick={close}>
                  Cancel
                </Button>
                <Button disabled={!chosen} onClick={toStepTwo}>
                  Next
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setStep(1)} disabled={pending}>
                  Back
                </Button>
                <Button
                  loading={pending}
                  disabled={!chosen}
                  onClick={() => {
                    if (!chosen) return;
                    onAdd({
                      imageUrl: chosen.imageUrl,
                      photographerId: photographerId === NO_CREDIT ? null : photographerId,
                    });
                    close();
                  }}
                >
                  Add to homepage
                </Button>
              </>
            )}
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
                    <p className="mt-1 text-xs text-subtle">No website address - the card will not link anywhere</p>
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
        description="What visitors see first - the carousel at the top, the collaborations, and the photographs featured in between. Changes are live as soon as you save."
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
