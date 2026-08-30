import { formatCurrency, formatNumber, type PublicArtist } from '@artinu/shared';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Search, Users } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/DashboardShell';
import { SubNav } from '@/features/console/components/SubNav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Sheet, SheetContent } from '@/components/ui/dialog';
import { Avatar, EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import { Input } from '@/components/ui/input';
import { Photo } from '@/components/ui/photo';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { qk } from '@/lib/query';
import { adminService } from '@/services/admin.service';
import { catalogService } from '@/services/catalog.service';

export default function ConsoleArtistsPage() {
  const [q, setQ] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [selected, setSelected] = React.useState<PublicArtist | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.admin.artists({ q: search }),
    queryFn: () => adminService.artists({ q: search || undefined, pageSize: 60 }),
  });

  return (
    <div>
      <PageHeader title="Artists" description="Everyone publishing on ARTINU." />

      <SubNav
        items={[
          { to: '/console/artists', label: 'Artists', end: true },
          { to: '/console/artists/applications', label: 'Applications' },
        ]}
      />

      <form
        className="mb-6 max-w-sm"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(q);
        }}
      >
        <Input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search by name, city or genre…"
          icon={<Search />}
          aria-label="Search artists"
        />
      </form>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Skeleton className="h-72 w-full rounded-lg" />
      ) : data && data.items.length > 0 ? (
        <Card>
          <CardContent className="p-0 sm:p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Artist</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Genres</TableHead>
                  <TableHead className="text-right">Works</TableHead>
                  <TableHead className="text-right">Likes</TableHead>
                  <TableHead className="text-right">Spaces</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((artist) => (
                  <TableRow key={artist.id}>
                    <TableCell>
                      <span className="flex items-center gap-3">
                        <Avatar name={artist.name} src={artist.avatarUrl} className="size-8" />
                        <span className="flex items-center gap-1.5 text-ink">
                          {artist.name}
                          {artist.verified && (
                            <BadgeCheck className="size-3.5 text-bronze" aria-label="Verified" />
                          )}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted">{artist.city ?? '-'}</TableCell>
                    <TableCell className="max-w-[12rem] truncate text-xs capitalize text-muted">
                      {artist.genres.map((genre) => genre.replace(/_/g, ' ')).join(', ') || '-'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{artist.artworkCount}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(artist.likes)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{artist.spacesCount}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setSelected(artist)}>
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState icon={<Users />} title="No artists match that search." />
      )}

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="max-w-md">
          {selected && <ArtistDetail artist={selected} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ArtistDetail({ artist }: { artist: PublicArtist }) {
  const { data: works } = useQuery({
    queryKey: [...qk.artist(artist.slug), 'admin-works'],
    queryFn: () => catalogService.artistArtworks(artist.slug, { pageSize: 9 }),
  });

  return (
    <div>
      <div className="flex items-center gap-4">
        <Avatar name={artist.name} src={artist.avatarUrl} className="size-16" />
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 font-display text-xl text-ink">
            {artist.name}
            {artist.verified && <BadgeCheck className="size-4 text-bronze" />}
          </h2>
          <p className="text-sm text-muted">
            {[artist.city, artist.country].filter(Boolean).join(', ')}
          </p>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-3 rounded-md bg-sand-soft p-4 text-center">
        <div>
          <dd className="font-display text-xl text-ink">{artist.artworkCount}</dd>
          <dt className="text-xs text-subtle">Works</dt>
        </div>
        <div>
          <dd className="font-display text-xl text-ink">{formatNumber(artist.likes)}</dd>
          <dt className="text-xs text-subtle">Likes</dt>
        </div>
        <div>
          <dd className="font-display text-xl text-ink">{artist.spacesCount}</dd>
          <dt className="text-xs text-subtle">Spaces</dt>
        </div>
      </dl>

      {artist.bio && <p className="mt-5 text-sm leading-relaxed text-muted">{artist.bio}</p>}

      {artist.genres.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {artist.genres.map((genre) => (
            <Badge key={genre} variant="bronze" className="capitalize">
              {genre.replace(/_/g, ' ')}
            </Badge>
          ))}
        </div>
      )}

      <h3 className="mt-6 font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
        Recent work
      </h3>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {works?.items.map((artwork) => (
          <Photo
            key={artwork.id}
            src={artwork.thumbnailUrl}
            alt={artwork.title}
            ratio="aspect-square"
            className="rounded-sm"
          />
        ))}
      </div>

      <Button variant="outline" className="mt-6 w-full" asChild>
        <Link to={`/artists/${artist.slug}`}>View public profile</Link>
      </Button>
    </div>
  );
}
