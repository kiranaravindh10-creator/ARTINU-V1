import { formatNumber, type Artwork } from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Eye, Fingerprint, Heart, Images, MoreVertical, SquarePen, Upload } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PanelHeader } from '@/components/layout/DashboardShell';
import { Images as ImagesIcon } from 'lucide-react';
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
  const [editing, setEditing] = React.useState<Artwork | null>(null);
  const [archiving, setArchiving] = React.useState<Artwork | null>(null);

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

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['my-artworks'] });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Artwork> }) =>
      catalogService.updateArtwork(id, patch),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success('Details updated');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const archive = useMutation({
    mutationFn: (id: string) => catalogService.deleteArtwork(id),
    onSuccess: () => {
      invalidate();
      setArchiving(null);
      toast.success('Archived - it will no longer appear in the gallery');
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
                  <DropdownMenuItem destructive onSelect={() => setArchiving(artwork)}>
                    <Archive /> Archive
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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

      <Dialog open={Boolean(archiving)} onOpenChange={(open) => !open && setArchiving(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Archive this photograph?</DialogTitle>
            <DialogDescription>
              &ldquo;{archiving?.title}&rdquo; will be removed from the gallery. Existing orders and
              invoices keep their record of it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setArchiving(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={archive.isPending}
              onClick={() => archive.mutate(archiving!.id)}
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit details</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Title" htmlFor="edit-title">
            <Input id="edit-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label="Description" htmlFor="edit-description">
            <Textarea
              id="edit-description"
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <Field label="Story" htmlFor="edit-story">
            <Textarea
              id="edit-story"
              rows={4}
              value={story}
              onChange={(event) => setStory(event.target.value)}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={() => onSave({ title, description, story })}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
