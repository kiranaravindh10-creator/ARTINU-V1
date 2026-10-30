import {
  ARTWORK_RECOVERY_DAYS,
  artworkMetadataStatus,
  formatCalendarDate,
  formatNumber,
  GALLERY_CATEGORIES,
  GALLERY_CATEGORY_LABELS,
  isPlaceholderTitle,
  isValidCaptureDate,
  STORY_MIN_LENGTH,
  type Artwork,
  type GalleryCategory,
  type MetadataGap,
} from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Camera,
  CircleAlert,
  Eye,
  Fingerprint,
  Heart,
  Images,
  MoreVertical,
  SquarePen,
  Trash2,
  Upload,
} from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PanelHeader } from '@/components/layout/DashboardShell';
import { Images as ImagesIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Input, Textarea } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import { Photo } from '@/components/ui/photo';
import { SimpleSelect } from '@/components/ui/select';
import { ArtworkMasonry } from '@/features/public/components/ArtworkCard';
import { useAuth } from '@/contexts/AuthContext';
import { errorMessage } from '@/lib/api';
import { qk } from '@/lib/query';
import { catalogService } from '@/services/catalog.service';
import { slugify } from '@artinu/shared';

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'views', label: 'Most viewed' },
  { value: 'selections', label: 'Most selected' },
];

export default function ArtistPortfolioPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [sort, setSort] = React.useState('newest');
  const navigate = useNavigate();
  const [editing, setEditing] = React.useState<Artwork | null>(null);
  const [deleting, setDeleting] = React.useState<Artwork | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.myArtworks({ status: 'approved' }),
    queryFn: () => catalogService.myArtworks({ status: 'approved', pageSize: 100 }),
  });

  const items = React.useMemo(() => {
    const list = [...(data?.items ?? [])];
    if (sort === 'views') list.sort((a, b) => b.views - a.views);
    else if (sort === 'selections') list.sort((a, b) => b.selections - a.selections);
    else list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return list;
  }, [data, sort]);

  // Photographs still missing the title or story a visitor reads. Work carried
  // over from an artist application arrives without either.
  const incomplete = items.filter((artwork) => !artworkMetadataStatus(artwork).complete);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['my-artworks'] });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Artwork> }) =>
      catalogService.updateArtwork(id, patch),
    onSuccess: (_updated, { id }) => {
      invalidate();
      // The gallery, the photograph's page and the profile show the same
      // fields; without this they kept the old title until a reload.
      void queryClient.invalidateQueries({ queryKey: ['gallery'] });
      void queryClient.invalidateQueries({ queryKey: ['artwork', id] });
      void queryClient.invalidateQueries({ queryKey: ['artists'] });
      void queryClient.invalidateQueries({ queryKey: ['artist'] });
      setEditing(null);
      toast.success('Details updated');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => catalogService.deleteArtwork(id),
    onSuccess: () => {
      invalidate();
      // It has left the public gallery and profile too; drop any cached copy of those.
      void queryClient.invalidateQueries({ queryKey: ['gallery'] });
      void queryClient.invalidateQueries({ queryKey: ['artists'] });
      setDeleting(null);
      toast.success(`Moved to Recently Deleted. You can recover it for ${ARTWORK_RECOVERY_DAYS} days.`, {
        action: { label: 'Recently Deleted', onClick: () => navigate('/studio/recently-deleted') },
      });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const totals = items.reduce(
    (sum, artwork) => ({
      views: sum.views + artwork.views,
      likes: sum.likes + artwork.likes,
      selections: sum.selections + artwork.selections,
    }),
    { views: 0, likes: 0, selections: 0 },
  );

  const slug = slugify(profile?.displayName || profile?.fullName || '');

  return (
    <div>
      <PanelHeader
        icon={ImagesIcon}
        title="Portfolio"
        description={`${items.length} ${items.length === 1 ? 'work' : 'works'} published.`}
        actions={
          <>
            {profile?.photographerCode && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-3 py-1.5 font-mono text-xs tracking-widest text-ink">
                <Fingerprint className="size-3.5 text-bronze" aria-hidden />
                Photographer {profile.photographerCode}
              </span>
            )}
            {slug && (
              <Button variant="outline" asChild>
                <Link to={`/artists/${slug}`}>View public profile</Link>
              </Button>
            )}
            <Button asChild>
              <Link to="/studio/upload">
                <Upload /> Upload
              </Link>
            </Button>
          </>
        }
      />

      {/* The three numbers that tell an artist whether the work is landing. */}
      <div className="mb-9 flex flex-wrap items-end justify-between gap-x-10 gap-y-5 border-b border-line pb-5">
        <dl className="flex flex-wrap gap-x-10 gap-y-3">
          {[
            { label: 'Views', value: formatNumber(totals.views) },
            { label: 'Likes', value: formatNumber(totals.likes) },
            { label: 'Selected by a space', value: formatNumber(totals.selections) },
          ].map((entry) => (
            <div key={entry.label}>
              <dt className="font-label text-[0.5625rem] uppercase tracking-[0.16em] text-subtle">
                {entry.label}
              </dt>
              <dd className="mt-1.5 font-display text-2xl leading-none text-ink">{entry.value}</dd>
            </div>
          ))}
        </dl>

        <SimpleSelect value={sort} onValueChange={setSort} options={SORTS} className="h-10 w-48" />
      </div>

      {items.length > 0 && (
        <div
          role="status"
          className={
            incomplete.length > 0
              ? 'mb-9 flex flex-wrap items-center justify-between gap-4 rounded-sm border border-warning/30 bg-warning-soft px-5 py-4'
              : 'mb-9 flex items-center gap-2 text-sm text-muted'
          }
        >
          {incomplete.length > 0 ? (
            <>
              <div className="min-w-0 max-w-[62ch]">
                <p className="flex items-center gap-2 font-medium text-ink">
                  <CircleAlert className="size-4 shrink-0 text-warning" aria-hidden />
                  {incomplete.length} of {items.length}{' '}
                  {items.length === 1 ? 'photograph needs' : 'photographs need'} details
                </p>
                <p className="mt-1 text-sm text-muted">
                  Each needs a real title and a story of at least {STORY_MIN_LENGTH} characters,
                  in your own words. Until then visitors see a placeholder title and no story.
                </p>
              </div>
              <Button onClick={() => setEditing(incomplete[0])}>
                <SquarePen /> Complete details
              </Button>
            </>
          ) : (
            <>Every photograph has a title and a story.</>
          )}
        </div>
      )}

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <ArtworkMasonry>
          {Array.from({ length: 9 }, (_, index) => (
            <Skeleton key={index} className="aspect-[3/4] w-full" />
          ))}
        </ArtworkMasonry>
      ) : items.length > 0 ? (
        <ArtworkMasonry>
          {items.map((artwork) => (
            <article key={artwork.id} className="group relative">
              <Photo
                src={artwork.thumbnailUrl}
                alt={artwork.title}
                ratio={
                  artwork.orientation === 'portrait'
                    ? 'aspect-[3/4]'
                    : artwork.orientation === 'square'
                      ? 'aspect-square'
                      : 'aspect-[3/2]'
                }
                className="photo-edge rounded-sm"
              >
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
                  <p className="truncate text-sm text-canvas">{artwork.title}</p>
                  <div className="mt-1 flex items-center gap-3 text-[0.6875rem] text-canvas/70">
                    <span className="flex items-center gap-1">
                      <Eye className="size-3" /> {formatNumber(artwork.views)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Heart className="size-3" /> {formatNumber(artwork.likes)}
                    </span>
                    <span className="flex items-center gap-1">
                      {/* Selections are spaces choosing the work, not magic. */}
                      <Heart className="size-3" /> {artwork.selections}
                    </span>
                    {artwork.photoId && (
                      <span className="ml-auto font-mono tracking-widest">{artwork.photoId}</span>
                    )}
                  </div>
                </div>
              </Photo>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label={`Actions for ${artwork.title}`}
                    className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-canvas/85 text-ink opacity-0 backdrop-blur-sm transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <MoreVertical className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link to={`/gallery/${artwork.id}`}>
                      <Eye /> View public page
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setEditing(artwork)}>
                    <SquarePen /> Edit details
                  </DropdownMenuItem>
                  <DropdownMenuItem destructive onSelect={() => setDeleting(artwork)}>
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <MetadataStatusRow artwork={artwork} onComplete={() => setEditing(artwork)} />
            </article>
          ))}
        </ArtworkMasonry>
      ) : (
        <EmptyState
          icon={<Images />}
          title="Nothing published yet."
          description="Once a photograph clears review it appears here and in the public gallery."
          action={
            <Button asChild>
              <Link to="/studio/upload">Upload your first photograph</Link>
            </Button>
          }
        />
      )}

      {editing && (
        <EditDialog
          artwork={editing}
          pending={update.isPending}
          onClose={() => setEditing(null)}
          onSave={(patch) => update.mutate({ id: editing.id, patch })}
        />
      )}

      <Dialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this photograph?</DialogTitle>
            <DialogDescription>
              This photograph will be removed from your public ARTINU profile and gallery. You can
              recover it for {ARTWORK_RECOVERY_DAYS} days.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => remove.mutate(deleting!.id)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Same tags, same order?
 *
 * This was `a.join(sep) !== b.join(sep)`, which is the usual shortcut and is
 * wrong twice over: the separator has to be a character no tag can contain, and
 * the one that ended up in the file was a literal NUL. That compared correctly
 * by luck and turned the source file into something every tool reported as
 * binary — grep refused to search it, and a diff would have been unreadable.
 *
 * Comparing element by element needs no separator and cannot be fooled by a tag
 * that happens to contain one.
 */
function sameTags(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((tag, i) => tag === b[i]);
}

/** Up to ten tags, comma-separated, trimmed and de-duplicated. */
function parseTags(value: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const raw of value.split(',')) {
    const tag = raw.trim();
    // The server requires 2–30 characters per tag; silently dropping a stray
    // comma is friendlier than failing the whole save over one.
    if (tag.length < 2 || tag.length > 30) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }

  return tags.slice(0, 10);
}

/**
 * Editing a published photograph.
 *
 * ── What changed ────────────────────────────────────────────────────────────
 *
 * The dialog offered title, description and story. `PATCH /artworks/:id` has
 * always also accepted `location` and `tags` — the two fields that decide
 * whether a photograph is findable — so a photographer who mistyped a location
 * at upload had no way to correct it and no way to know why searches missed
 * their work. They are here now.
 *
 * Category and the date taken followed. Photographs carried over from an
 * artist application arrived as "Untitled 3", with no story or date and filed
 * under the category of the photographer's first genre, and nothing here could
 * put any of that right. The dialog says what the photograph still needs, and
 * offers the camera's own date from the original file - offers, because only
 * the photographer can say it is right.
 *
 * ── Why Save can be disabled ────────────────────────────────────────────────
 *
 * The form sends only what actually changed, and the schema rejects an empty
 * patch. Submitting an untouched form would therefore have failed with
 * "Nothing to update", which reads as a bug rather than as a no-op — so the
 * button says so before it is pressed.
 *
 * The image is not editable, by design: it is what a moderator approved and
 * what may already be printed and hanging in a room. Replacing it is a new
 * upload.
 */
function EditDialog({
  artwork,
  pending,
  onClose,
  onSave,
}: {
  artwork: Artwork;
  pending: boolean;
  onClose: () => void;
  onSave: (patch: Partial<Artwork>) => void;
}) {
  const [title, setTitle] = React.useState(artwork.title);
  const [description, setDescription] = React.useState(artwork.description ?? '');
  const [story, setStory] = React.useState(artwork.story ?? '');
  const [location, setLocation] = React.useState(artwork.location ?? '');
  const [tags, setTags] = React.useState((artwork.tags ?? []).join(', '));
  const [category, setCategory] = React.useState<GalleryCategory>(artwork.category);
  // Capture dates are stored as midnight UTC of the day, so the first ten
  // characters are the day itself - what a date input wants.
  const recordedDay = artwork.capturedAt ? artwork.capturedAt.slice(0, 10) : '';
  const [capturedAt, setCapturedAt] = React.useState(recordedDay);

  const trimmedTitle = title.trim();
  const parsedTags = parseTags(tags);

  // Compared against what was loaded, so re-typing the same value is not a change.
  const patch: Partial<Artwork> = {};
  if (trimmedTitle !== artwork.title) patch.title = trimmedTitle;
  if (description.trim() !== (artwork.description ?? '')) patch.description = description.trim();
  if (story.trim() !== (artwork.story ?? '')) patch.story = story.trim();
  if (location.trim() !== (artwork.location ?? '')) patch.location = location.trim();
  if (!sameTags(parsedTags, artwork.tags ?? [])) patch.tags = parsedTags;
  if (category !== artwork.category) patch.category = category;
  if (capturedAt !== recordedDay) patch.capturedAt = capturedAt || null;

  const changedCount = Object.keys(patch).length;

  // Mirrors the server schema, so the failure is shown next to the field rather
  // than as a toast after a round trip.
  const titleError =
    trimmedTitle.length < 2
      ? 'Give this photograph a title'
      : trimmedTitle.length > 160
        ? 'Titles are limited to 160 characters'
        : undefined;

  // A location can be corrected but not removed: the server requires one, as
  // the upload did, so clearing it would only fail after the round trip.
  const locationError =
    (location.trim().length > 0 && location.trim().length < 2) ||
    (location.trim().length === 0 && Boolean(artwork.location))
      ? 'Enter the location where this was photographed'
      : undefined;

  const trimmedStory = story.trim();
  const storyError =
    'story' in patch && trimmedStory.length > 0 && trimmedStory.length < STORY_MIN_LENGTH
      ? `A story needs at least ${STORY_MIN_LENGTH} characters - it is printed beside the photograph`
      : undefined;

  const dateError =
    capturedAt && !isValidCaptureDate(capturedAt) ? 'Enter a real date, not in the future' : undefined;

  const blocked =
    Boolean(titleError || locationError || storyError || dateError) || changedCount === 0;

  // What the photograph will still need if it is saved as the form stands.
  const status = artworkMetadataStatus({
    title: trimmedTitle,
    story: trimmedStory,
    capturedAt: capturedAt || null,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit details</DialogTitle>
          <DialogDescription>
            The photograph itself stays as it was approved. To show a different image,
            upload it as a new piece.
          </DialogDescription>
        </DialogHeader>

        <p
          role="status"
          className={
            status.complete
              ? 'flex items-center gap-2 text-sm text-success'
              : 'flex items-center gap-2 text-sm text-warning'
          }
        >
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          {status.complete
            ? 'Title and story complete.'
            : `Still needed: ${describeGaps(status.missing)}.`}
        </p>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          <Field
            label="Title"
            htmlFor="edit-title"
            required
            error={titleError}
            hint={
              !titleError && isPlaceholderTitle(trimmedTitle)
                ? 'This is a placeholder. Give the photograph the title you want beside it.'
                : undefined
            }
          >
            <Input
              id="edit-title"
              value={title}
              invalid={Boolean(titleError)}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field label="Description" htmlFor="edit-description">
            <Textarea
              id="edit-description"
              rows={2}
              maxLength={600}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <Field
            label="Story"
            htmlFor="edit-story"
            error={storyError}
            hint={`In your own words, at least ${STORY_MIN_LENGTH} characters - it is printed on the plate beside the photograph. ${trimmedStory.length} so far.`}
          >
            <Textarea
              id="edit-story"
              rows={4}
              maxLength={1500}
              value={story}
              invalid={Boolean(storyError)}
              onChange={(event) => setStory(event.target.value)}
            />
          </Field>
          <Field label="Category" htmlFor="edit-category">
            <SimpleSelect
              id="edit-category"
              value={category}
              onValueChange={(value) => setCategory(value as GalleryCategory)}
              options={GALLERY_CATEGORIES.map((value) => ({
                value,
                label: GALLERY_CATEGORY_LABELS[value],
              }))}
            />
          </Field>
          <Field
            label="Date taken"
            htmlFor="edit-captured"
            error={dateError}
            hint={capturedAt ? undefined : 'Leave it empty if you do not know it.'}
          >
            <Input
              id="edit-captured"
              type="date"
              max={localToday()}
              value={capturedAt}
              invalid={Boolean(dateError)}
              onChange={(event) => setCapturedAt(event.target.value)}
            />
          </Field>
          <CaptureDateHint artworkId={artwork.id} value={capturedAt} onUse={setCapturedAt} />
          <Field label="Location" htmlFor="edit-location" error={locationError}>
            <Input
              id="edit-location"
              value={location}
              placeholder="Where this was photographed"
              invalid={Boolean(locationError)}
              onChange={(event) => setLocation(event.target.value)}
            />
          </Field>
          <Field
            label="Tags"
            htmlFor="edit-tags"
            hint="Comma-separated, up to 10. These are what visitors search on."
          >
            <Input
              id="edit-tags"
              value={tags}
              placeholder="monsoon, rooftop, long exposure"
              onChange={(event) => setTags(event.target.value)}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} disabled={blocked} onClick={() => onSave(patch)}>
            {changedCount === 0
              ? 'No changes yet'
              : `Save ${changedCount} change${changedCount === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const GAP_LABELS: Record<MetadataGap, string> = { title: 'a title', story: 'a story' };

function describeGaps(gaps: MetadataGap[]): string {
  return gaps.map((gap) => GAP_LABELS[gap]).join(' and ');
}

/** Today on the photographer's own calendar, as a date input writes it. */
function localToday(): string {
  const today = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

/**
 * Under a tile: what the photograph still needs, and the way to add it. A
 * complete photograph shows nothing here - the note above the grid says so.
 */
function MetadataStatusRow({ artwork, onComplete }: { artwork: Artwork; onComplete: () => void }) {
  const status = artworkMetadataStatus(artwork);
  if (status.complete) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
      <Badge variant="warning">
        <CircleAlert /> Needs {describeGaps(status.missing)}
      </Badge>
      <Button size="sm" variant="outline" onClick={onComplete}>
        Complete details
      </Button>
    </div>
  );
}

/**
 * The camera's date for this photograph, offered beside the date field.
 *
 * Read from the original file's EXIF each time the dialog opens, and only ever
 * offered: it reaches the photograph when the photographer presses "Use" and
 * then saves. A camera's clock can be wrong, an edited copy can carry the
 * editing day, and a date on the public page reads as a fact - so it is the
 * photographer who confirms it. When there is nothing usable in the file the
 * reason is shown instead.
 */
function CaptureDateHint({
  artworkId,
  value,
  onUse,
}: {
  artworkId: string;
  value: string;
  onUse: (day: string) => void;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-artworks', artworkId, 'capture-date'],
    queryFn: () => catalogService.captureDateSuggestion(artworkId),
    staleTime: Infinity,
  });

  if (isLoading) {
    return <p className="text-xs text-subtle">Checking your original file for the camera&apos;s date…</p>;
  }
  if (isError || !data) {
    return (
      <p className="text-xs text-subtle">
        We could not check your original file for a date just now. If you know the day it was
        taken, enter it.
      </p>
    );
  }

  const days =
    data.status === 'found' && data.date ? [data.date] : data.status === 'ambiguous' ? data.candidates : [];

  return (
    <div className="rounded-sm border border-line bg-sand/40 px-3 py-2.5 text-xs text-muted">
      <p className="flex gap-2">
        <Camera className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>{data.message}</span>
      </p>
      {days.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2 pl-5">
          {days.map((day) =>
            day === value ? (
              <span key={day} className="inline-flex h-9 items-center text-success">
                {formatCalendarDate(day, 'long')} is entered
              </span>
            ) : (
              <Button key={day} size="sm" variant="outline" onClick={() => onUse(day)}>
                Use {formatCalendarDate(day, 'long')}
              </Button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
