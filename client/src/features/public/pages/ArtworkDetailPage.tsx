import {
  type ArtworkWithArtist,
  formatDate,
  GALLERY_CATEGORY_LABELS,
  ORIENTATION_LABELS,
  SPACE_TYPE_LABELS,
} from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BadgeCheck,
  Calendar,
  Heart,
  ImageOff,
  MapPin,
  RectangleHorizontal,
  Share2,
  Tag,
  Fingerprint,
} from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Container, Section } from '@/components/layout/primitives';
import { Button } from '@/components/ui/button';
import { Avatar, EmptyState, Skeleton } from '@/components/ui/display';
import { Photo } from '@/components/ui/photo';
import { ArtworkCard, ArtworkMasonry } from '@/features/public/components/ArtworkCard';
import { ShareButton, ShareSheet } from '@/features/public/components/ShareSheet';
import { useAuth } from '@/contexts/AuthContext';
import { errorMessage } from '@/lib/api';
import { qk } from '@/lib/query';
import { SITE_URL } from '@/lib/seo';
import { EntityMeta } from '@/components/seo';
import { catalogService } from '@/services/catalog.service';
import { cn } from '@/lib/utils';
import { resizedUpload } from '@/lib/imageOptimization';

export default function ArtworkDetailPage() {
  const { artworkId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();

  /*
    The artwork whose share sheet is open, or null.

    Set only where the browser has no native share sheet: `ShareButton` calls
    `onFallback` in that case and otherwise handles the share itself, so on a
    phone this stays null and the panel at the bottom never renders.
  */
  const [sharing, setSharing] = React.useState<ArtworkWithArtist | null>(null);

  const {
    data: artwork,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: qk.artwork(artworkId),
    queryFn: () => catalogService.artwork(artworkId),
    enabled: Boolean(artworkId),
  });

  const { data: related = [] } = useQuery({
    queryKey: qk.artworkRelated(artworkId),
    queryFn: () => catalogService.related(artworkId, 8),
    enabled: Boolean(artworkId),
  });

  const wishlist = useMutation({
    mutationFn: () => catalogService.toggleWishlist(artworkId),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: qk.artwork(artworkId) });
      void queryClient.invalidateQueries({ queryKey: qk.wishlist });
      toast.success(result.wishlisted ? 'Saved to your wishlist' : 'Removed from your wishlist');
    },
    onError: (mutationError) => toast.error(errorMessage(mutationError)),
  });

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: artwork?.title, url });
        return;
      } catch {
        // The user dismissed the share sheet — fall through to copying.
      }
    }
    await navigator.clipboard.writeText(url);
    toast.success('Link copied');
  };

  if (isLoading) return <ArtworkDetailSkeleton />;

  if (isError || !artwork) {
    return (
      <Container className="py-24">
        <EmptyState
          icon={<ImageOff />}
          title="We couldn't find that photograph."
          description={errorMessage(error)}
          action={
            <Button asChild>
              <Link to="/gallery">Back to the gallery</Link>
            </Button>
          }
        />
      </Container>
    );
  }

  const ratio =
    artwork.orientation === 'portrait'
      ? 'aspect-[3/4]'
      : artwork.orientation === 'square'
        ? 'aspect-square'
        : 'aspect-[3/2]';

  const strip = [artwork, ...related].slice(0, 8);
  const index = related.findIndex((entry) => entry.id === artworkId);

  /*
    These pages carried `noindex` until now, so none of this existed. Each one
    is a distinct photograph with a title, a photographer and often a place —
    exactly the sort of page that answers a long-tail search the homepage never
    will.

    Every value comes from the artwork record. `creator` links the photograph to
    the photographer's own page, which is the relationship Google needs to treat
    them as connected entities rather than two unrelated URLs.
  */
  const artworkPath = `/gallery/${artwork.id}`;
  const artworkTitle = `${artwork.title} by ${artwork.artist.name} - ARTINU`;
  const artworkDescription =
    artwork.description?.trim().slice(0, 155) ||
    `"${artwork.title}", a ${GALLERY_CATEGORY_LABELS[artwork.category] ?? artwork.category} ` +
      `photograph by ${artwork.artist.name}${artwork.location ? ` shot in ${artwork.location}` : ''}. ` +
      `Printed, framed and installed by ARTINU for cafés, restaurants and offices.`;

  const artworkJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'ImageObject',
    name: artwork.title,
    contentUrl: artwork.imageUrl,
    url: `${SITE_URL}${artworkPath}`,
    ...(artwork.description ? { description: artwork.description } : {}),
    ...(artwork.width ? { width: artwork.width } : {}),
    ...(artwork.height ? { height: artwork.height } : {}),
    ...(artwork.location ? { contentLocation: { '@type': 'Place', name: artwork.location } } : {}),
    ...(artwork.tags?.length ? { keywords: artwork.tags.join(', ') } : {}),
    creator: {
      '@type': 'Person',
      name: artwork.artist.name,
      url: `${SITE_URL}/artists/${artwork.artist.slug}`,
    },
    // The photographer keeps copyright; ARTINU licenses and installs the print.
    copyrightHolder: { '@type': 'Person', name: artwork.artist.name },
    provider: { '@type': 'Organization', name: 'ARTINU', url: SITE_URL },
  };

  return (
    <>
      <EntityMeta
        title={artworkTitle}
        description={artworkDescription}
        path={artworkPath}
        /* WhatsApp and Facebook refuse preview images past a few megabytes,
           so a shared photograph must unfurl from a resized copy. */
        image={resizedUpload(artwork.imageUrl, 1200)}
        imageAlt={`${artwork.title} by ${artwork.artist.name}`}
        jsonLd={artworkJsonLd}
      />
      <Container size="wide" className="pt-8">
        <div className="flex items-center justify-between gap-4">
          <Link
            to="/gallery"
            className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" /> Back to Gallery
          </Link>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous photograph"
              disabled={related.length === 0}
              onClick={() => related[0] && navigate(`/gallery/${related[related.length - 1]!.id}`)}
            >
              <ArrowLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Save to wishlist"
              aria-pressed={artwork.wishlisted}
              onClick={() =>
                isAuthenticated
                  ? wishlist.mutate()
                  : navigate(`/signin?as=space&next=/gallery/${artworkId}`)
              }
            >
              <Heart className={cn(artwork.wishlisted && 'fill-bronze text-bronze')} />
            </Button>
            {/* Native sheet on a phone, our own on a desktop — same button. */}
            <ShareButton
              artwork={artwork}
              onFallback={setSharing}
              className="inline-flex size-10 items-center justify-center rounded-sm text-ink-muted transition-colors hover:bg-sand hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze"
            />
          </div>
        </div>
      </Container>

      <Container size="wide" className="py-8">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] lg:gap-14">
          {/* ── Main column ────────────────────────────────────────────── */}
          <div className="min-w-0">
            <Photo
              src={artwork.imageUrl}
              alt={artwork.title}
              ratio={ratio}
              priority
              className="photo-edge rounded-sm"
            />

            {strip.length > 1 && (
              <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
                {strip.map((entry) => (
                  <Link
                    key={entry.id}
                    to={`/gallery/${entry.id}`}
                    aria-current={entry.id === artworkId ? 'true' : undefined}
                    className={cn(
                      'w-20 shrink-0 overflow-hidden rounded-sm transition-all',
                      entry.id === artworkId
                        ? 'ring-2 ring-bronze ring-offset-2 ring-offset-canvas'
                        : 'opacity-70 hover:opacity-100',
                    )}
                  >
                    <Photo src={entry.thumbnailUrl} alt={entry.title} ratio="aspect-square" />
                  </Link>
                ))}
              </div>
            )}

            <h1 className="mt-10 font-display text-[2.25rem] leading-tight text-ink sm:text-[2.75rem]">
              {artwork.title}
            </h1>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
              by{' '}
              <Link
                to={`/artists/${artwork.artist?.slug}`}
                className="font-medium text-ink underline-offset-4 hover:underline"
              >
                {artwork.artist?.name}
              </Link>
              {artwork.artist?.verified && (
                <BadgeCheck className="size-4 text-bronze" aria-label="Verified artist" />
              )}
            </p>

            {/*
              The specimen label under the work. Location moved out of here into
              a section of its own below, so the place is read rather than
              scanned — and so it is not printed twice on the same page.
            */}
            <dl className="mt-8 grid grid-cols-2 gap-6 border-y border-line py-6 sm:grid-cols-4">
              <Meta icon={Fingerprint} label="Photo ID" value={artwork.photoId ?? '-'} />
              <Meta
                icon={Calendar}
                label="Captured"
                value={artwork.capturedAt ? formatDate(artwork.capturedAt, 'long') : '-'}
              />
              <Meta icon={Tag} label="Category" value={GALLERY_CATEGORY_LABELS[artwork.category]} />
              <Meta
                icon={RectangleHorizontal}
                label="Orientation"
                value={ORIENTATION_LABELS[artwork.orientation]}
              />
            </dl>

            {/*
              The story, told in full.

              It used to be folded behind a "Read more" toggle underneath the
              description, which put the one thing this page exists for — why
              the photograph was taken — one click away and two paragraphs
              down. A visitor who came to look at a photograph is exactly the
              person who wants to read about it, so it opens as it is written,
              in the reading measure the rest of the site uses for prose.
            */}
            {(artwork.story || artwork.description) && (
              <section className="mt-12 border-t border-line pt-10">
                <p className="eyebrow">The story</p>
                {artwork.description && (
                  <p className="mt-5 max-w-[62ch] font-display text-[1.375rem] leading-[1.45] text-ink sm:text-[1.5rem]">
                    {artwork.description}
                  </p>
                )}
                {artwork.story && (
                  <div className="mt-6 max-w-[62ch] space-y-4">
                    {artwork.story
                      .split(/\n{2,}/)
                      .map((paragraph) => paragraph.trim())
                      .filter(Boolean)
                      .map((paragraph, index) => (
                        <p key={index} className="prose-quiet">
                          {paragraph}
                        </p>
                      ))}
                  </div>
                )}
              </section>
            )}

            {/*
              Where it was taken. Shown only when the photographer recorded a
              place — an empty "Location: —" says nothing worth a heading.
            */}
            {artwork.location && (
              <section className="mt-10 border-t border-line pt-10">
                <p className="eyebrow">Where it was made</p>
                <p className="mt-4 flex items-start gap-3 font-display text-[1.5rem] leading-snug text-ink sm:text-[1.75rem]">
                  <MapPin className="mt-1.5 size-5 shrink-0 text-bronze" aria-hidden />
                  {artwork.location}
                </p>
              </section>
            )}

            {artwork.suitableFor.length > 0 && (
              <section className="mt-10 border-t border-line pt-10">
                <p className="eyebrow">Suited to</p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {artwork.suitableFor.map((type) => (
                    <li
                      key={type}
                      className="rounded-full border border-line-strong px-3.5 py-1.5 text-[0.8125rem] text-muted"
                    >
                      {SPACE_TYPE_LABELS[type]}
                    </li>
                  ))}
                </ul>
              </section>
            )}

          </div>

          {/* ── Right rail ─────────────────────────────────────────────── */}
          {/*
            The rail is the credits panel, not a checkout.

            It used to open with "Customize & Add to Cart" and a list of print
            assurances — giclée stock, worldwide shipping, a replacement policy
            — which framed a photograph as a product in a basket. ARTINU does
            not sell prints from this page: it puts photographs on other
            people's walls, and the thing a visitor should leave with is who
            made this one and where. So the photographer comes first, the place
            second, and the invitation to talk to us last.
          */}
          <aside className="lg:sticky lg:top-24 lg:h-fit">
            {artwork.artist && (
              <div className="rounded-lg border border-line bg-surface p-6 shadow-card">
                <p className="eyebrow">Photograph by</p>
                <Link
                  to={`/artists/${artwork.artist.slug}`}
                  className="group mt-4 flex items-center gap-3.5"
                >
                  <Avatar
                    name={artwork.artist.name}
                    src={artwork.artist.avatarUrl}
                    className="size-12 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 truncate font-display text-lg text-ink">
                      {artwork.artist.name}
                      {artwork.artist.verified && (
                        <BadgeCheck className="size-4 shrink-0 text-bronze" aria-label="Verified artist" />
                      )}
                    </span>
                    {artwork.artist.city && (
                      <span className="block truncate text-sm text-muted">{artwork.artist.city}</span>
                    )}
                  </span>
                </Link>

                <Button variant="outline" className="mt-5 w-full" asChild>
                  <Link to={`/artists/${artwork.artist.slug}`}>See their work</Link>
                </Button>

                <Button
                  variant="ghost"
                  className="mt-2 w-full"
                  onClick={() =>
                    isAuthenticated
                      ? wishlist.mutate()
                      : navigate(`/signin?next=/gallery/${artworkId}`)
                  }
                >
                  <Heart className={cn(artwork.wishlisted && 'fill-bronze text-bronze')} />
                  {artwork.wishlisted ? 'Saved' : 'Save this photograph'}
                </Button>
              </div>
            )}

            {/*
              The one commercial sentence on the page, and it leads to a
              conversation rather than a basket: ARTINU curates a collection for
              a room, it does not sell this single frame off the shelf.
            */}
            <div className="mt-4 rounded-lg border border-bronze/30 bg-bronze-soft/40 p-5">
              <p className="font-display text-lg leading-snug text-ink">
                Photographs like this hang in real spaces.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                We read the room, print and frame the work that suits it, hang it,
                and change it for new work every month.
              </p>
              <Button variant="outline" className="mt-4 w-full" asChild>
                <Link to="/lets-talk">Talk to us about your space</Link>
              </Button>
            </div>
          </aside>
        </div>
      </Container>

      {related.length > 0 && (
        <Section tone="soft" size="compact">
          <Container size="wide">
            <h2 className="font-display text-2xl text-ink">You might also like</h2>
            <ArtworkMasonry className="mt-8">
              {related.map((entry) => (
                <ArtworkCard key={entry.id} artwork={entry} onShare={setSharing} />
              ))}
            </ArtworkMasonry>
          </Container>
        </Section>
      )}

      {/* Only ever rendered where the browser has no native share sheet. */}
      <ShareSheet artwork={sharing} onClose={() => setSharing(null)} />
    </>
  );
}

function Meta({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-bronze" aria-hidden />
      <div className="min-w-0">
        <dt className="text-xs text-subtle">{label}</dt>
        <dd className="truncate text-sm text-ink">{value}</dd>
      </div>
    </div>
  );
}

function ArtworkDetailSkeleton() {
  return (
    <Container size="wide" className="py-12">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] lg:gap-14">
        <div className="space-y-4">
          <Skeleton className="aspect-[3/2] w-full" />
          <div className="flex gap-2">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="size-20" />
            ))}
          </div>
          <Skeleton className="mt-8 h-10 w-2/3" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-6 h-24 w-full" />
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    </Container>
  );
}
