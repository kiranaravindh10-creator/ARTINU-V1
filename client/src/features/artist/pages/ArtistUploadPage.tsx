import { SUGGESTED_TAGS, type Artwork, type ArtworkUploadInput } from '@artinu/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Info, Loader2, Upload, X } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PanelHeader } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { CharCount, Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { LocationInput } from '@/components/ui/location-input';
import { Photo } from '@/components/ui/photo';
import { errorMessage } from '@/lib/api';
import { catalogService } from '@/services/catalog.service';
import { fileToImageDataUrl, formatBytes, isHeicFile, readImageSizeOrZero } from '@/lib/utils';
import { cn } from '@/lib/utils';

/**
 * How many photographs can go up in one batch.
 *
 * Raised from 4 to 50. Nothing else about an upload changed - same formats,
 * same 25 MB per file, same quality, same pipeline. Only how many may be
 * queued at once.
 */
const MAX_PHOTOS = 50;

/**
 * How many of those upload at the SAME TIME.
 *
 * The batch used to be handed straight to `Promise.allSettled(photos.map(…))`,
 * which starts every request at once. At four files that is harmless. At fifty,
 * each up to 25 MB, it is well over a gigabyte in flight: the browser caps
 * itself at around six connections per host so the rest queue anyway, but they
 * queue holding their full base64 payload in memory, and on a phone connection
 * the early requests time out before the late ones ever start.
 *
 * Four at a time keeps the pipe busy without any of that. A fifty-photograph
 * batch simply takes longer, which is honest, rather than failing halfway.
 */
const UPLOAD_CONCURRENCY = 4;

/**
 * Run `task` over `items`, at most `limit` at once, settling every one.
 *
 * Mirrors `Promise.allSettled` - same result shape, same order, one entry per
 * input, never rejects - so the reporting below it did not have to change.
 */
async function settleWithLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      try {
        results[index] = { status: 'fulfilled', value: await task(items[index]) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
const MAX_TAGS = 10;

interface Picked {
  id: string;
  dataUrl: string;
  name: string;
  size: number;
  width: number;
  height: number;
  title: string;
  location: string;
  capturedAt: string;
  story: string;
  tags: string[];
}

/** What became of one file in a batch — published, or why it was not. */
type UploadOutcome =
  | { ok: true; artwork: Artwork }
  | { ok: false; name: string; reason: string };

let nextId = 0;
const newId = () => `picked-${Date.now()}-${nextId++}`;

export default function ArtistUploadPage() {
  const queryClient = useQueryClient();
  const fileInput = React.useRef<HTMLInputElement>(null);

  const [picked, setPicked] = React.useState<Picked[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, { title?: string; location?: string }>>(
    {},
  );
  const [results, setResults] = React.useState<UploadOutcome[] | null>(null);

  const uploadAll = useMutation({
    /*
     * A batch upload settles per photograph, not all-or-nothing.
     *
     * This used to be `Promise.all`, which rejects the moment any one file
     * fails. The others still finished and were still published server-side,
     * but the rejection meant `onSuccess` never ran: the artist saw a single
     * red toast, the form still full, no result screen, and no idea that three
     * of their four photographs were already live. Re-submitting then uploaded
     * the successful ones a second time, where the duplicate check flagged
     * them against their own portfolio.
     *
     * `allSettled` reports what actually happened to each file.
     */
    mutationFn: async (photos: Picked[]): Promise<UploadOutcome[]> => {
      const settled = await settleWithLimit(photos, UPLOAD_CONCURRENCY, async (photo) => {
          const input: ArtworkUploadInput = {
            title: photo.title.trim(),
            description: null,
            story: photo.story.trim(),
            category: 'street',
            mood: [],
            colors: [],
            tags: photo.tags,
            location: photo.location.trim(),
            capturedAt: photo.capturedAt || null,
            imageBase64: photo.dataUrl,
          };
        return catalogService.upload({
          ...input,
          width: photo.width,
          height: photo.height,
        });
      });

      return settled.map((outcome, index) =>
        outcome.status === 'fulfilled'
          ? { ok: true as const, artwork: outcome.value }
          : {
              ok: false as const,
              name: photos[index]?.name ?? 'That photograph',
              reason: errorMessage(outcome.reason),
            },
      );
    },
    onSuccess: (outcomes) => {
      setResults(outcomes);
      void queryClient.invalidateQueries({ queryKey: ['my-artworks'] });
      window.scrollTo({ top: 0, behavior: 'smooth' });

      const failed = outcomes.filter((outcome) => !outcome.ok).length;
      if (failed > 0) {
        toast.error(
          failed === outcomes.length
            ? 'None of your photographs could be published.'
            : `${failed} of ${outcomes.length} photographs could not be published - the rest are live.`,
        );
      }
    },
    // Only reached if the batch itself could not be assembled; per-file
    // failures are carried in the result above.
    onError: (error) => toast.error(errorMessage(error)),
  });

  const addFiles = async (files: File[] | undefined) => {
    if (!files || files.length === 0) return;
    const incoming = Array.from(files);

    const room = MAX_PHOTOS - picked.length;
    const accepted = incoming.slice(0, room);
    if (incoming.length > room) {
      toast.warning(`You can upload up to ${MAX_PHOTOS} photographs at a time - the extra ones were skipped.`);
    }

    for (const file of accepted) {
      // Any photograph, any size, any resolution. The only thing checked here
      // is the file type, and only because the server can store exactly these
      // five — AVIF is included now, and was previously rejected by the browser
      // before the server ever got a say. There is no dimension floor: a phone
      // screenshot uploads the same as a 50-megapixel export.
      /*
        HEIC IS ACCEPTED NOW.

        It is what an iPhone shoots by default, and it used to be turned away
        here with "export it as a JPG and add that instead" - a chore standing
        between a photographer and uploading, on a product whose biggest problem
        is that people sign up and never upload. The server converts it to a
        full-resolution JPEG on arrival.

        `isHeicFile` checks the extension as well as the type because the OS
        picker frequently hands over a .heic with an empty `file.type`, which no
        MIME pattern would ever match.
      */
      const acceptable =
        /^image\/(jpeg|jpg|png|webp|avif|gif|heic|heif)$/i.test(file.type) || isHeicFile(file);

      if (!acceptable) {
        const probe = `${file.type} ${file.name}`;
        const guidance = /\.(tiff?|psd|cr2|cr3|nef|arw|dng|raf|orf|rw2)$/i.test(probe)
          ? 'That is a camera raw or layered file, which browsers cannot display. Export it as a JPG and add that instead.'
          : 'Add a JPG, PNG, HEIC, WebP, AVIF or GIF.';
        toast.error(`${file.name} was skipped. ${guidance}`);
        continue;
      }
      if (file.size > 25 * 1024 * 1024) {
        toast.error(`${file.name} is ${formatBytes(file.size)} - the limit is 25 MB.`);
        continue;
      }
      const dataUrl = await fileToImageDataUrl(file);
      /*
        Zeroes are fine for a HEIC: no browser but Safari can decode one, so the
        preview below shows a placeholder and these numbers stay empty until the
        server reads the real ones out of the converted JPEG.
      */
      const { width, height } = await readImageSizeOrZero(dataUrl);
      setPicked((current) => [
        ...current,
        {
          id: newId(),
          dataUrl,
          name: file.name,
          size: file.size,
          width,
          height,
          title: '',
          location: '',
          capturedAt: '',
          story: '',
          tags: [],
        },
      ]);
    }
  };

  const updatePhoto = (id: string, patch: Partial<Picked>) => {
    setPicked((current) =>
      current.map((photo) => (photo.id === id ? { ...photo, ...patch } : photo)),
    );
  };

  const removePhoto = (id: string) => {
    setPicked((current) => current.filter((photo) => photo.id !== id));
    setErrors((current) => {
      const { [id]: _drop, ...rest } = current;
      return rest;
    });
  };

  const addTag = (photo: Picked, raw: string) => {
    const value = raw.trim().toLowerCase().replace(/^#/, '');
    if (!value) return;
    if (photo.tags.length >= MAX_TAGS) {
      toast(`Up to ${MAX_TAGS} tags per photograph.`);
      return;
    }
    if (photo.tags.includes(value)) return;
    updatePhoto(photo.id, { tags: [...photo.tags, value] });
  };

  const validate = (): boolean => {
    const next: Record<string, { title?: string; location?: string; story?: string }> = {};
    let valid = true;
    for (const photo of picked) {
      const entry: { title?: string; location?: string; story?: string } = {};
      if (photo.title.trim().length < 2) {
        entry.title = 'Give this photograph a title';
        valid = false;
      }
      if (photo.location.trim().length < 2) {
        entry.location = 'Enter the location where this was photographed';
        valid = false;
      }
      /*
        The story is required, and it is checked here as well as on the server.

        Not belt-and-braces: the server rejects the whole batch, so without this
        an artist who left one story blank in a batch of fifty would upload
        forty-nine, get a single failure back, and have to work out which one.
        Catching it before anything is sent points at the photograph.
      */
      if (photo.story.trim().length < 20) {
        entry.story = 'Tell us what this photograph is about';
        valid = false;
      }
      if (entry.title || entry.location) next[photo.id] = entry;
    }
    setErrors(next);
    return valid;
  };

  const startOver = () => {
    setResults(null);
    setPicked([]);
    setErrors({});
  };

  // ── Result state ─────────────────────────────────────────────────────────
  // Reports the batch as it actually settled. A partial failure gets both
  // lists: what is live, and what is not and why.
  if (results) {
    const published = results.filter((outcome) => outcome.ok);
    const failed = results.filter((outcome) => !outcome.ok);
    const allFailed = published.length === 0;

    return (
      <div className="mx-auto max-w-3xl">
        <PanelHeader
          icon={Upload}
          title={allFailed ? 'Nothing was published' : failed.length > 0 ? 'Partly published' : 'Published'}
          description={
            allFailed
              ? 'None of your photographs could be published. Nothing was lost - you can try again below.'
              : failed.length > 0
                ? `${published.length} of ${results.length} photographs are live. The rest are listed below with what went wrong.`
                : published.length === 1
                  ? 'Your photograph is now live on your public profile and available for curation.'
                  : `${published.length} photographs are now live on your public profile and available for curation.`
          }
        />

        <div className="mt-8 border-t border-line pt-8">
          {published.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {published.map((outcome) => (
                <div
                  key={outcome.artwork.id}
                  className="overflow-hidden rounded-lg border border-line bg-surface"
                >
                  <Photo
                    src={outcome.artwork.thumbnailUrl}
                    alt={outcome.artwork.title}
                    thumbnail
                    className="aspect-[3/4] w-full"
                    imgClassName="h-full w-full object-cover"
                  />
                  <div className="p-3">
                    <p className="truncate text-sm text-ink">{outcome.artwork.title}</p>
                    {outcome.artwork.photoId && (
                      <p className="mt-0.5 font-mono text-xs tracking-widest text-bronze">
                        {outcome.artwork.photoId}
                      </p>
                    )}
                    {outcome.artwork.location && (
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {outcome.artwork.location}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {failed.length > 0 && (
            <ul
              className={cn(
                'space-y-2 rounded-lg border border-danger/30 bg-danger/5 p-4',
                published.length > 0 && 'mt-6',
              )}
            >
              {failed.map((outcome, index) => (
                <li key={`${outcome.name}-${index}`} className="text-sm">
                  <span className="font-medium text-ink">{outcome.name}</span>
                  <span className="text-muted"> - {outcome.reason}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            <Button onClick={startOver}>
              {allFailed ? 'Start over' : 'Upload another batch'}
            </Button>
            {published.length > 0 && (
              <Button variant="outline" asChild>
                <Link to="/studio/submissions">View submissions</Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PanelHeader
        title="Upload work"
        description={`Add up to ${MAX_PHOTOS} photographs at a time - one at a time or all together.`}
      />

      <div className="mb-6 flex gap-3 rounded-lg border border-line bg-surface p-5">
        <Info className="size-4 shrink-0 text-bronze" aria-hidden />
        <div className="text-sm text-muted">
          <p className="font-medium text-ink">What we look for</p>
          <p className="mt-1 leading-relaxed">
            Work you shot yourself, with honest metadata. We don&rsquo;t publish
            AI-generated imagery. You keep your copyright - ARTINU only licenses the right to print,
            frame and display your photograph in subscribing spaces. Every photograph needs a title
            and a location.
          </p>
        </div>
      </div>

      {/* ── The photographs ─────────────────────────────────────────────── */}
      <section>
        <h2 className="border-b border-line pb-2.5 font-display text-xl leading-none text-ink">
          The photographs{' '}
          <span className="text-sm text-subtle">
            ({picked.length}/{MAX_PHOTOS})
          </span>
        </h2>

        <div className="pt-7">
          {picked.length > 0 && (
            <div className="space-y-5">
              {picked.map((photo) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  errors={errors[photo.id]}
                  onChange={(patch) => updatePhoto(photo.id, patch)}
                  onRemove={() => removePhoto(photo.id)}
                  onAddTag={(raw) => addTag(photo, raw)}
                />
              ))}

              {picked.length < MAX_PHOTOS && (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong px-4 py-4 text-sm text-subtle transition-colors hover:border-bronze hover:text-bronze-deep"
                >
                  <Upload className="size-4" aria-hidden /> Add more photographs
                </button>
              )}
            </div>
          )}

          {picked.length === 0 && (
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                void addFiles(Array.from(event.dataTransfer.files));
              }}
              className={cn(
                'flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center transition-colors',
                dragging ? 'border-bronze bg-bronze-soft/40' : 'border-line-strong bg-canvas-soft',
              )}
            >
              <Upload className="size-6 text-bronze" strokeWidth={1.5} aria-hidden />
              <p className="mt-3 text-sm text-ink">
                Drag photographs here or{' '}
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="text-bronze underline-offset-4 hover:underline"
                >
                  browse
                </button>
              </p>
              <p className="mt-3 text-xs text-subtle">
                JPG, PNG, WebP, AVIF or GIF · up to 25 MB each · up to {MAX_PHOTOS} at a time
                <br />
                Any size and resolution - we accept whatever you shoot
              </p>
            </div>
          )}

          <input
            ref={fileInput}
            type="file"
            /*
              This was "image/jpeg,image/png,image/webp" while addFiles below
              accepted AVIF and the server accepted AVIF and GIF too. The comment
              in addFiles says AVIF "was previously rejected by the browser
              before the server ever got a say" — that fix was applied there and
              never here, so the OS file dialog went on greying AVIF out.

              That is the "upload button does nothing sometimes": with an AVIF or
              GIF selected the dialog would not let it be picked, so nothing was
              chosen, no handler ran and no message appeared. Dragging the same
              file onto the drop zone worked, because a drop never consults
              `accept` — which is exactly why it failed only sometimes.
            */
            accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/heic,image/heif,.heic,.heif"
            multiple
            className="sr-only"
            onChange={(event) => {
              void addFiles(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />

          {uploadAll.isPending && <UploadingProgress count={picked.length} done={0} />}
        </div>
      </section>

      {/* ── Publish bar ─────────────────────────────────────────────────── */}
      <div className="mt-8 border-t border-line pt-6">
        <Button
          type="button"
          size="lg"
          className="w-full sm:w-auto"
          loading={uploadAll.isPending}
          disabled={picked.length === 0}
          onClick={() => {
            if (!validate()) {
              toast.error('Every photograph needs a title, a location and its story.');
              return;
            }
            uploadAll.mutate(picked);
          }}
        >
          Publish {picked.length === 1 ? '1 photograph' : `${picked.length} photographs`}
        </Button>
      </div>
    </div>
  );
}

function PhotoCard({
  photo,
  errors,
  onChange,
  onRemove,
  onAddTag,
}: {
  photo: Picked;
  errors?: { title?: string; location?: string; story?: string };
  onChange: (patch: Partial<Picked>) => void;
  onRemove: () => void;
  onAddTag: (raw: string) => void;
}) {
  const [tagDraft, setTagDraft] = React.useState('');

  const commitTag = () => {
    onAddTag(tagDraft);
    setTagDraft('');
  };

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="grid gap-5 p-5 md:grid-cols-[10rem_minmax(0,1fr)]">
        <div>
          <div className="relative overflow-hidden rounded-md">
            <Photo
              src={photo.dataUrl}
              alt={photo.name}
              className="aspect-[3/4] w-full"
              imgClassName="h-full w-full object-cover"
            />
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remove photograph"
              className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-ink/80 text-canvas transition-colors hover:bg-ink"
            >
              <X className="size-4" />
            </button>
          </div>
          <dl className="mt-3 space-y-1 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-subtle">Dimensions</dt>
              <dd className="text-ink">
                {photo.width} × {photo.height}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-subtle">File size</dt>
              <dd className="text-ink">{formatBytes(photo.size)}</dd>
            </div>
          </dl>
        </div>

        <div className="space-y-4">
          <Field label="Title" htmlFor={`title-${photo.id}`} required error={errors?.title}>
            <Input
              id={`title-${photo.id}`}
              value={photo.title}
              onChange={(event) => onChange({ title: event.target.value })}
              placeholder="Give this photograph a title"
              invalid={!!errors?.title}
            />
          </Field>

          <Field
            label="Location"
            htmlFor={`location-${photo.id}`}
            required
            error={errors?.location}
          >
            <LocationInput
              id={`location-${photo.id}`}
              value={photo.location}
              onChange={(location) => onChange({ location })}
              placeholder="Where this was photographed"
              invalid={!!errors?.location}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date captured" htmlFor={`capturedAt-${photo.id}`}>
              <Input
                id={`capturedAt-${photo.id}`}
                type="date"
                value={photo.capturedAt}
                onChange={(event) => onChange({ capturedAt: event.target.value })}
              />
            </Field>

            <Field
              label="What is this photograph about?"
              htmlFor={`story-${photo.id}`}
              required
              error={errors?.story}
              aside={<CharCount value={photo.story} max={1500} />}
            >
              <Textarea
                id={`story-${photo.id}`}
                rows={3}
                value={photo.story}
                onChange={(event) => onChange({ story: event.target.value })}
                placeholder="Where you were, what was happening, why you took it."
              />
            </Field>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label
                htmlFor={`tags-${photo.id}`}
                className="text-[0.8125rem] font-medium text-ink-soft"
              >
                Tags / hashtags
                <span className="ml-1 text-subtle">(up to {MAX_TAGS})</span>
              </label>
              <span className="font-label text-[0.625rem] uppercase tracking-[0.14em] text-subtle">
                {photo.tags.length}/{MAX_TAGS}
              </span>
            </div>

            <div className="mt-2 flex gap-2">
              <Input
                id={`tags-${photo.id}`}
                value={tagDraft}
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ',') {
                    event.preventDefault();
                    commitTag();
                  } else if (event.key === 'Backspace' && !tagDraft && photo.tags.length > 0) {
                    onChange({ tags: photo.tags.slice(0, -1) });
                  }
                }}
                onBlur={commitTag}
                placeholder="#tag, press Enter to add"
              />
              <Button type="button" variant="outline" className="shrink-0" onClick={commitTag}>
                Add
              </Button>
            </div>

            {photo.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {photo.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas-soft px-3 py-1.5 text-xs text-ink"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => onChange({ tags: photo.tags.filter((entry) => entry !== tag) })}
                      aria-label={`Remove #${tag}`}
                      className="text-subtle transition-colors hover:text-danger"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-1.5">
              {SUGGESTED_TAGS.filter((suggestion) => !photo.tags.includes(suggestion))
                .slice(0, 12)
                .map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => onAddTag(suggestion)}
                    className="rounded-full border border-line px-2.5 py-1 font-label text-[0.625rem] uppercase tracking-[0.08em] text-subtle transition-colors hover:border-bronze hover:text-bronze-deep"
                  >
                    #{suggestion}
                  </button>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function UploadingProgress({ count, done }: { count: number; done: number }) {
  const [progress, setProgress] = React.useState(done);

  React.useEffect(() => {
    if (progress >= count) return;
    const timer = setInterval(
      () => setProgress((value) => Math.min(count, value + 1)),
      600,
    );
    return () => clearInterval(timer);
  }, [count, progress]);

  return (
    <div className="mt-5 rounded-md border border-line bg-canvas-soft p-4">
      <p className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-bronze">
        Publishing your photographs
      </p>
      <p className="mt-2 flex items-center gap-2 text-sm text-ink">
        <Loader2 className="size-4 animate-spin text-subtle" aria-hidden />
        {count === 1
          ? 'Uploading and publishing…'
          : `Uploading and publishing photograph ${progress + 1} of ${count}…`}
      </p>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-bronze transition-all duration-500"
          style={{ width: `${Math.round((progress / count) * 100)}%` }}
        />
      </div>
    </div>
  );
}