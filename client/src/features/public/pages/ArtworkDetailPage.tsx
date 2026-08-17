import {
  DEFAULT_FRAME,
  formatCurrency,
  formatDate,
  FRAME_COLORS,
  FRAME_MATERIALS,
  FRAME_SIZES,
  GALLERY_CATEGORY_LABELS,
  GLASS_TYPES,
  ORIENTATION_LABELS,
  PRINT_FINISHES,
  SPACE_TYPE_LABELS,
  type FrameConfiguration,
} from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BadgeCheck,
  Calendar,
  ChevronDown,
  Globe,
  Heart,
  ImageOff,
  MapPin,
  Package,
  RectangleHorizontal,
  RefreshCw,
  Share2,
  Sparkles,
  Tag,
  Fingerprint,
} from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Container, Section } from '@/components/layout/primitives';
import { Button } from '@/components/ui/button';
import { Avatar, EmptyState, Skeleton } from '@/components/ui/display';
import { FramedPhoto, Photo } from '@/components/ui/photo';
import { ArtworkCard, ArtworkMasonry } from '@/features/public/components/ArtworkCard';
import { FrameConfigurator, frameHex } from '@/features/public/components/FrameConfigurator';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { errorMessage } from '@/lib/api';
import { IMAGES } from '@/lib/images';
import { qk } from '@/lib/query';
import { catalogService } from '@/services/catalog.service';
import { cn } from '@/lib/utils';

const ASSURANCES = [
  { icon: Sparkles, label: 'High quality giclée print' },
  { icon: Package, label: 'Museum grade materials' },
  { icon: Globe, label: 'Worldwide shipping' },
  { icon: RefreshCw, label: '7-day replacement policy' },
];

const optionLabel = <T extends readonly { value: string; label: string }[]>(options: T, value: string) =>
  options.find((option) => option.value === value)?.label ?? value;

export default function ArtworkDetailPage() {
  const { artworkId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuth();
  const cart = useCart();

  const [configuring, setConfiguring] = React.useState(false);
  const [frame, setFrame] = React.useState<FrameConfiguration>(DEFAULT_FRAME);
  const [storyOpen, setStoryOpen] = React.useState(false);

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

  React.useEffect(() => {
    setStoryOpen(false);
  }, [artworkId]);

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

  const addToCart = (chosen: FrameConfiguration, quantity: number) => {
    cart.add(artwork, chosen, quantity);
    setFrame(chosen);
    setConfiguring(false);
    toast.success(`${artwork.title} added to your cart`, {
      description: `${quantity} ${quantity === 1 ? 'frame' : 'frames'} · ${optionLabel(FRAME_SIZES, chosen.size)}`,
      action: { label: 'View cart', onClick: () => navigate('/space/cart') },
    });
  };

  return (
    <>
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
            <Button variant="ghost" size="icon" aria-label="Share" onClick={() => void share()}>
              <Share2 />
            </Button>
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

            <dl className="mt-8 grid grid-cols-2 gap-6 border-y border-line py-6 sm:grid-cols-4">
              <Meta icon={Fingerprint} label="Photo ID" value={artwork.photoId ?? '—'} />
              <Meta icon={MapPin} label="Location" value={artwork.location ?? '—'} />
              <Meta
                icon={Calendar}
                label="Captured"
                value={artwork.capturedAt ? formatDate(artwork.capturedAt, 'long') : '—'}
              />
              <Meta icon={Tag} label="Category" value={GALLERY_CATEGORY_LABELS[artwork.category]} />
              <Meta
                icon={RectangleHorizontal}
                label="Orientation"
                value={ORIENTATION_LABELS[artwork.orientation]}
              />
            </dl>

            <section className="mt-10">
              <h2 className="font-display text-xl text-ink">About this photograph</h2>
              <p className="prose-quiet mt-3">{artwork.description}</p>
              {artwork.story && (
                <>
                  {storyOpen && <p className="prose-quiet mt-4">{artwork.story}</p>}
                  <button
                    type="button"
                    onClick={() => setStoryOpen((value) => !value)}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm text-bronze transition-colors hover:text-bronze-deep"
                    aria-expanded={storyOpen}
                  >
                    {storyOpen ? 'Read less' : 'Read more'}
                    <ChevronDown className={cn('size-4 transition-transform', storyOpen && 'rotate-180')} />
                  </button>
                </>
              )}
            </section>

            {artwork.suitableFor.length > 0 && (
              <section className="mt-10">
                <h2 className="font-display text-xl text-ink">Perfect for spaces like</h2>
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

            {/* ── Print & frame preview ─────────────────────────────────── */}
            <section className="mt-12">
              <h2 className="font-display text-xl text-ink">Print &amp; Frame Preview</h2>
              <div className="mt-4 grid gap-0 overflow-hidden rounded-lg border border-line bg-surface sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <div className="relative">
                  <Photo src={IMAGES.livingRoomArt} alt="" ratio="aspect-[4/3]" imgClassName="brightness-95" />
                  <div className="absolute inset-0 flex items-center justify-center p-10">
                    <FramedPhoto
                      src={artwork.thumbnailUrl}
                      alt={`${artwork.title} in a ${optionLabel(FRAME_MATERIALS, frame.material)} frame`}
                      frameColor={frameHex(frame.color)}
                      ratio={ratio}
                      className="w-1/2 max-w-[13rem]"
                    />
                  </div>
                </div>

                <div className="flex flex-col justify-between gap-4 border-t border-line p-6 sm:border-l sm:border-t-0">
                  <dl className="space-y-4">
                    <Spec label="Frame" value={`${optionLabel(FRAME_MATERIALS, frame.material)} – ${optionLabel(FRAME_COLORS, frame.color)}`} />
                    <Spec label="Size" value={optionLabel(FRAME_SIZES, frame.size)} />
                    <Spec label="Glass" value={optionLabel(GLASS_TYPES, frame.glass)} />
                    <Spec label="Finish" value={optionLabel(PRINT_FINISHES, frame.finish)} />
                  </dl>
                  <button
                    type="button"
                    onClick={() => setConfiguring(true)}
                    className="self-start text-sm text-bronze transition-colors hover:text-bronze-deep"
                  >
                    Customize this artwork →
                  </button>
                </div>
              </div>
            </section>
          </div>

          {/* ── Right rail ─────────────────────────────────────────────── */}
          <aside className="lg:sticky lg:top-24 lg:h-fit">
            {/*
              A visitor looking at a photograph has no idea this can end up on
              their own wall — the invitation has to be made explicitly, once,
              where they are already looking. Shown only to people who are not
              signed in as a space owner, so it never nags a returning customer.
            */}
            {(!isAuthenticated || user?.role !== 'space_owner') && (
              <div className="mb-4 rounded-lg border border-bronze/30 bg-bronze-soft/40 p-5">
                <p className="font-display text-lg leading-snug text-ink">
                  You can put this photograph in your space.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  We print it, frame it, hang it, and swap it for new work every
                  few months. Want to see it on your wall?
                </p>
                <Button
                  variant="outline"
                  className="mt-4 w-full"
                  onClick={() =>
                    isAuthenticated
                      ? setConfiguring(true)
                      : navigate(`/signin?as=space&next=/gallery/${artworkId}`)
                  }
                >
                  Add this to my space
                </Button>
              </div>
            )}

            <div className="rounded-lg border border-line bg-surface p-6 shadow-card">


              <Button className="mt-5 w-full" onClick={() => setConfiguring(true)}>
                Customize &amp; Add to Cart
              </Button>
              <Button
                variant="outline"
                className="mt-2.5 w-full"
                onClick={() =>
                  isAuthenticated
                    ? wishlist.mutate()
                    : navigate(`/signin?as=space&next=/gallery/${artworkId}`)
                }
              >
                <Heart className={cn(artwork.wishlisted && 'fill-bronze text-bronze')} />
                {artwork.wishlisted ? 'Saved to Wishlist' : 'Save to Wishlist'}
              </Button>

              <ul className="mt-6 space-y-2.5 border-t border-line pt-5">
                {ASSURANCES.map((assurance) => (
                  <li key={assurance.label} className="flex items-center gap-2.5 text-[0.8125rem] text-muted">
                    <assurance.icon className="size-4 shrink-0 text-bronze" aria-hidden />
                    {assurance.label}
                  </li>
                ))}
              </ul>
            </div>

            {artwork.artist && (
              <Link
                to={`/artists/${artwork.artist.slug}`}
                className="mt-4 flex items-center gap-3 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-line-strong"
              >
                <Avatar name={artwork.artist.name} src={artwork.artist.avatarUrl} className="size-11" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium text-ink">
                    {artwork.artist.name}
                    {artwork.artist.verified && <BadgeCheck className="size-3.5 shrink-0 text-bronze" />}
                  </p>
                  <p className="truncate text-xs text-muted">{artwork.artist.city}</p>
                </div>
                <span className="shrink-0 text-xs text-bronze">View Artist Profile →</span>
              </Link>
            )}
          </aside>
        </div>
      </Container>

      {related.length > 0 && (
        <Section tone="soft" size="compact">
          <Container size="wide">
            <h2 className="font-display text-2xl text-ink">You might also like</h2>
            <ArtworkMasonry className="mt-8">
              {related.map((entry) => (
                <ArtworkCard key={entry.id} artwork={entry} />
              ))}
            </ArtworkMasonry>
          </Container>
        </Section>
      )}

      <FrameConfigurator
        artwork={artwork}
        open={configuring}
        onOpenChange={setConfiguring}
        initialFrame={frame}
        onConfirm={addToCart}
        signedOutAction={
          isAuthenticated && user?.role !== 'space_owner' ? undefined : !isAuthenticated ? (
            <Button asChild>
              <Link to={`/signin?as=space&next=/gallery/${artworkId}`}>Sign in to add to cart</Link>
            </Button>
          ) : undefined
        }
      />
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

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-subtle">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value}</dd>
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
