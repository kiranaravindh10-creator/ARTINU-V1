import {
  formatNumber,
  GALLERY_CATEGORY_LABELS,
  type GalleryCategory,
} from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Award,
  BadgeCheck,
  ChevronDown,
  Fingerprint,
  Globe,
  Instagram,
  MapPin,
  Share2,
  UserX,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Container, Section } from '@/components/layout/primitives';
import { Button } from '@/components/ui/button';
import { Avatar, EmptyState, Skeleton } from '@/components/ui/display';
import { Photo } from '@/components/ui/photo';
import { FilterChips, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArtworkCard, ArtworkCardSkeleton, ArtworkMasonry } from '@/features/public/components/ArtworkCard';
import { ShareSheet, useShare } from '@/features/public/components/ShareSheet';
import { useAuth } from '@/contexts/AuthContext';
import { errorMessage } from '@/lib/api';
import { IMAGES } from '@/lib/images';
import { qk } from '@/lib/query';
import { SITE_URL } from '@/lib/seo';
import { EntityMeta } from '@/components/seo';
import { catalogService } from '@/services/catalog.service';
import { cn } from '@/lib/utils';

export default function ArtistProfilePage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();

  const [category, setCategory] = React.useState('all');
  const [pages, setPages] = React.useState(1);
  const [bioOpen, setBioOpen] = React.useState(false);
  /** The share sheet for an individual photograph, not for this profile. */
  const photoShare = useShare();

  const { data: artist, isLoading, isError, error } = useQuery({
    queryKey: qk.artist(slug),
    queryFn: () => catalogService.artist(slug),
    enabled: Boolean(slug),
  });

  const { data: works, isLoading: loadingWorks } = useQuery({
    queryKey: [...qk.artist(slug), 'artworks', category, pages],
    queryFn: () =>
      catalogService.artistArtworks(slug, {
        category: category === 'all' ? undefined : category,
        pageSize: 12 * pages,
      }),
    enabled: Boolean(slug),
  });

  const follow = useMutation({
    mutationFn: () => catalogService.follow(artist!.id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: qk.artist(slug) });
      const previousArtist = queryClient.getQueryData(qk.artist(slug));
      queryClient.setQueryData(qk.artist(slug), (old: typeof artist) => {
        if (!old) return old;
        const isFollowing = !old.following;
        return {
          ...old,
          following: isFollowing,
          followers: isFollowing ? old.followers + 1 : Math.max(0, old.followers - 1),
          followingCount: isFollowing ? old.followingCount + 1 : Math.max(0, old.followingCount - 1),
        };
      });
      return { previousArtist };
    },
    onError: (error, _variables, context) => {
      if (context?.previousArtist) {
        queryClient.setQueryData(qk.artist(slug), context.previousArtist);
      }
      toast.error(errorMessage(error));
    },
    onSuccess: (result) => {
      toast.success(result.following ? `Following ${artist?.name}` : `Unfollowed ${artist?.name}`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qk.artist(slug) });
    },
  });

  React.useEffect(() => {
    setPages(1);
  }, [category, slug]);

  if (isLoading) return <ProfileSkeleton />;

  if (isError || !artist) {
    return (
      <Container className="py-24">
        <EmptyState
          icon={<UserX />}
          title="We couldn't find that artist."
          description={errorMessage(error)}
          action={
            <Button asChild>
              <Link to="/artists">Back to artists</Link>
            </Button>
          }
        />
      </Container>
    );
  }

  const categories = [
    { value: 'all', label: 'All Works' },
    ...[...new Set((works?.items ?? []).map((work) => work.category))].map((value) => ({
      value,
      label: GALLERY_CATEGORY_LABELS[value as GalleryCategory] ?? value,
    })),
  ];

  /*
    Real metadata and Person schema, now that the profile has actually loaded.
    Until this ran, every photographer page shared a title built from the URL
    slug ("vk — Photographer on ARTINU") and carried no entity markup at all,
    so Google had nothing connecting the page to a named person, their city or
    their work.

    Every field below comes from the profile. Nothing is invented: a
    photographer with no bio, city or links simply contributes fewer fields.
  */
  const artistPath = `/artists/${artist.slug}`;
  const artistLocation = [artist.city, artist.country].filter(Boolean).join(', ');
  const artistMetaDescription =
    (artist.bio?.trim().slice(0, 155) || null) ??
    `Photography by ${artist.name}${artistLocation ? ` from ${artistLocation}` : ''} on ARTINU. ` +
      `Available as framed prints for cafés, restaurants and offices in Bangalore.`;

  const artistJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: {
      '@type': 'Person',
      name: artist.name,
      url: `${SITE_URL}${artistPath}`,
      jobTitle: 'Photographer',
      ...(artist.bio ? { description: artist.bio } : {}),
      ...(artist.avatarUrl ? { image: artist.avatarUrl } : {}),
      ...(artist.genres?.length ? { knowsAbout: artist.genres } : {}),
      ...(artistLocation
        ? { homeLocation: { '@type': 'Place', name: artistLocation } }
        : {}),
      // sameAs is a claim of ownership, so only links the photographer gave us.
      ...(([artist.website, artist.instagram].filter(Boolean) as string[]).length
        ? { sameAs: [artist.website, artist.instagram].filter(Boolean) }
        : {}),
      worksFor: { '@type': 'Organization', name: 'ARTINU', url: SITE_URL },
    },
  };

  const firstName = artist.name.split(' ')[0];
  const shortBio = artist.bio?.slice(0, 180) ?? '';
  const hasMoreBio = (artist.bio?.length ?? 0) > 180;

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: artist.name, text: `${artist.name} on ARTINU`, url });
        return;
      } catch (error) {
        // Dismissed on purpose — copying anyway would override that choice.
        if ((error as Error)?.name === 'AbortError') return;
      }
    }
    await navigator.clipboard.writeText(url);
    toast.success('Link copied.');
  };

  return (
    <>
      <EntityMeta
        title={`${artist.name} — Photographer on ARTINU`}
        description={artistMetaDescription}
        path={artistPath}
        image={artist.coverUrl || artist.avatarUrl}
        imageAlt={`Photography by ${artist.name}`}
        jsonLd={artistJsonLd}
      />
      <Container size="wide" className="pt-8">
        <div className="flex items-center justify-between gap-4">
          <Link
            to="/artists"
            className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" /> Back to Artists
          </Link>
          <Button variant="ghost" size="icon" aria-label="Share profile" onClick={() => void share()}>
            <Share2 />
          </Button>
        </div>
      </Container>

      <Container size="wide" className="pb-10 pt-6">
        <Photo
          src={artist.coverUrl || IMAGES.mountains}
          alt=""
          ratio="aspect-[16/6]"
          priority
          className="rounded-lg"
        />

        <div className="relative -mt-12 px-4 sm:-mt-14 sm:px-8">
          <Avatar
            name={artist.name}
            src={artist.avatarUrl}
            className="size-24 ring-4 ring-canvas sm:size-28"
          />
        </div>

        <div className="mt-5 grid gap-8 px-4 sm:px-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start">
          <div>
            <h1 className="flex items-center gap-2 font-display text-[2rem] leading-tight text-ink">
              {artist.name}
              {artist.verified && <BadgeCheck className="size-6 text-bronze" aria-label="Verified artist" />}
            </h1>
            <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted">
              <MapPin className="size-4 text-bronze" aria-hidden />
              {[artist.city, artist.country].filter(Boolean).join(', ')}
            </p>
            {artist.photographerCode && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-3 py-1 font-mono text-xs tracking-widest text-ink">
                <Fingerprint className="size-3.5 text-bronze" aria-hidden />
                Photographer {artist.photographerCode}
              </p>
            )}

            {artist.bio && (
              <div className="mt-5 max-w-xl">
                <p className="prose-quiet">
                  {bioOpen ? artist.bio : shortBio}
                  {!bioOpen && hasMoreBio && '…'}
                </p>
                {hasMoreBio && (
                  <button
                    type="button"
                    onClick={() => setBioOpen((value) => !value)}
                    aria-expanded={bioOpen}
                    className="mt-2 inline-flex items-center gap-1.5 text-sm text-bronze transition-colors hover:text-bronze-deep"
                  >
                    {bioOpen ? 'Read less' : 'Read more'}
                    <ChevronDown className={cn('size-4 transition-transform', bioOpen && 'rotate-180')} />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <Button
              variant={artist.following ? 'outline' : 'primary'}
              onClick={() =>
                isAuthenticated ? follow.mutate() : navigate(`/signin?next=/artists/${slug}`)
              }
              loading={follow.isPending}
            >
              {artist.following ? 'Following' : 'Follow'}
            </Button>

            <dl className="flex items-center gap-6">
              <Stat label="Photographs" value={formatNumber(artist.artworkCount)} />
              <Stat
                label="Likes"
                value={artist.likes >= 1000 ? `${(artist.likes / 1000).toFixed(1)}K` : formatNumber(artist.likes)}
              />
              <Stat label="Followers" value={formatNumber(artist.followers)} />
              <Stat label="Spaces" value={formatNumber(artist.spacesCount)} />
            </dl>
          </div>
        </div>
      </Container>

      <Container size="wide" className="pb-16">
        <Tabs defaultValue="portfolio">
          <TabsList>
            {/*
              Two tabs, not four (requirements §16). "Collections" only called
              setCategory() — the same thing the portfolio's own filter chips
              do, one click further from the photographs. Achievements moved
              under About: worth reading, not worth a tab.
            */}
            <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
            <TabsTrigger value="about">About</TabsTrigger>
          </TabsList>

          <TabsContent value="portfolio" className="pt-8">
            {categories.length > 2 && (
              <FilterChips options={categories} value={category} onChange={setCategory} className="mb-8" />
            )}

            {loadingWorks ? (
              <ArtworkMasonry>
                {Array.from({ length: 9 }, (_, index) => (
                  <ArtworkCardSkeleton key={index} index={index} />
                ))}
              </ArtworkMasonry>
            ) : works && works.items.length > 0 ? (
              <>
                <ArtworkMasonry>
                  {works.items.map((artwork) => (
                    <ArtworkCard key={artwork.id} artwork={artwork} onShare={photoShare.open} />
                  ))}
                </ArtworkMasonry>
                {works.items.length < works.total && (
                  <div className="mt-10 flex justify-center">
                    <Button variant="outline" onClick={() => setPages((value) => value + 1)}>
                      Load More <ChevronDown className="size-4" />
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <EmptyState title="Nothing published here yet." description="Check back soon." />
            )}
          </TabsContent>

          <TabsContent value="about" className="pt-8">
            <div className="grid gap-10 lg:grid-cols-2">
              <div>
                {/*
                  The bio is not repeated here. It already sits in the header
                  above — always visible, with an expander for longer ones — so
                  printing it again word for word under "About" was the exact
                  duplication §16 asks us to strip out. This panel carries the
                  details the header has no room for.
                */}
                <h2 className="font-display text-xl text-ink">More about {firstName}</h2>

                {artist.genres.length > 0 && (
                  <>
                    <h3 className="mt-6 font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
                      Works in
                    </h3>
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {artist.genres.map((genre) => (
                        <li
                          key={genre}
                          className="rounded-full bg-sand px-3 py-1 text-[0.8125rem] capitalize text-ink-soft"
                        >
                          {genre.replace(/_/g, ' ')}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              <div className="space-y-4">
                <h3 className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
                  Elsewhere
                </h3>
                {artist.website && (
                  <a
                    href={artist.website}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2.5 text-sm text-ink transition-colors hover:text-bronze"
                  >
                    <Globe className="size-4 text-bronze" /> {artist.website}
                  </a>
                )}
                {artist.instagram && (
                  <p className="flex items-center gap-2.5 text-sm text-ink">
                    <Instagram className="size-4 text-bronze" /> {artist.instagram}
                  </p>
                )}
                <p className="pt-4 text-sm text-muted">
                  {firstName}&rsquo;s work currently hangs in {artist.spacesCount}{' '}
                  {artist.spacesCount === 1 ? 'space' : 'spaces'} curated by ARTINU.
                </p>

                {/* Recognition, when there is any — a short list rather than a
                    tab of its own. Hidden entirely when empty, so a newer
                    artist's profile does not read as unfinished. */}
                {artist.achievements && artist.achievements.length > 0 && (
                  <div className="pt-6">
                    <h3 className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-bronze">
                      Recognition
                    </h3>
                    <ul className="mt-3 space-y-3">
                      {artist.achievements.map((achievement) => (
                        <li key={achievement.id} className="flex gap-3">
                          <Award className="mt-0.5 size-4 shrink-0 text-bronze" aria-hidden />
                          <p className="text-sm text-muted">
                            <span className="text-ink">{achievement.title}</span>
                            {achievement.year ? ` · ${achievement.year}` : ''}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>


        </Tabs>
      </Container>

      <ShareSheet artwork={photoShare.artwork} onClose={photoShare.close} />


    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l border-line pl-6 first:border-0 first:pl-0">
      <dd className="font-display text-2xl leading-none text-ink">{value}</dd>
      <dt className="mt-1 text-xs text-muted">{label}</dt>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <Container size="wide" className="py-12">
      <Skeleton className="aspect-[16/6] w-full rounded-lg" />
      <div className="-mt-12 px-8">
        <Skeleton className="size-24 rounded-full" />
      </div>
      <Skeleton className="mt-6 h-9 w-64" />
      <Skeleton className="mt-3 h-4 w-40" />
      <Skeleton className="mt-8 h-10 w-full max-w-md" />
    </Container>
  );
}
