import { useQuery } from '@tanstack/react-query';
import { Loader2, Mail, Phone, Search, UserRound } from 'lucide-react';
import * as React from 'react';
import { PageHeader } from '@/components/layout/DashboardShell';
import { Avatar } from '@/components/ui/display';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@artinu/shared';
import { adminService, type AdminUser } from '@/services/admin.service';
import { errorMessage } from '@/lib/api';

/**
 * REGISTERED ARTISTS — what each photographer actually told us at sign-up.
 *
 * ── Why this is separate from Console → Artists ─────────────────────────────
 *
 * They answer different questions for different people.
 *
 * Console → Artists is a CURATION screen: it lists photographers by how much
 * work they have, with their portfolios, for deciding what to place on a wall.
 * It is backed by `/admin/artists`, which returns the PUBLIC artist shape — the
 * same object the public /artists page renders — so it carries no email, no
 * phone and no date of birth. That is correct for what it does, and it is why
 * it cannot answer "what number did this person register with".
 *
 * This screen is the REGISTRATION RECORD. It is backed by `/admin/users`, which
 * returns the account plus its profile, and which is gated on the `users`
 * module — held by the CEO and the IT team, and by nobody else. Console →
 * Artists is gated on `artists`, which the manager also holds; putting contact
 * details there would have widened who can read them.
 *
 * ── No new data, no new table ───────────────────────────────────────────────
 *
 * Every field below is already stored and already returned by an endpoint that
 * already exists. Nothing is copied, duplicated or re-keyed: this is a view of
 * the live `users` + `profiles` rows, filtered to `role=artist`.
 */

/** Age from a stored YYYY-MM-DD, so a birthday is useful without doing sums. */
function ageFrom(dateOfBirth: string | null | undefined): number | null {
  if (!dateOfBirth) return null;
  const born = new Date(dateOfBirth);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const monthDiff = now.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < born.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

const STATUS_STYLE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  verified: 'success',
  pending_verification: 'warning',
  suspended: 'danger',
  banned: 'danger',
};

function ArtistRow({ entry }: { entry: AdminUser }) {
  const profile = entry.profile;
  const age = ageFrom(profile?.dateOfBirth);
  const place = [profile?.city, profile?.country].filter(Boolean).join(', ');

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar name={profile?.fullName ?? entry.email} src={profile?.avatarUrl} />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{profile?.fullName ?? '-'}</p>
            {/* The professional name they registered under, when it differs. */}
            {profile?.displayName && profile.displayName !== profile.fullName && (
              <p className="truncate text-xs text-subtle">{profile.displayName}</p>
            )}
            {place && <p className="truncate text-xs text-subtle">{place}</p>}
          </div>
        </div>
      </TableCell>

      <TableCell>
        {/* mailto/tel so a CEO can act on the record rather than retype it. */}
        <a
          href={`mailto:${entry.email}`}
          className="flex items-center gap-1.5 text-[0.8125rem] text-ink hover:text-bronze"
        >
          <Mail className="size-3.5 shrink-0 text-subtle" aria-hidden />
          <span className="truncate">{entry.email}</span>
        </a>
        {profile?.phone ? (
          <a
            href={`tel:${profile.phone}`}
            className="mt-1 flex items-center gap-1.5 text-[0.8125rem] text-ink hover:text-bronze"
          >
            <Phone className="size-3.5 shrink-0 text-subtle" aria-hidden />
            {profile.phone}
          </a>
        ) : (
          <p className="mt-1 text-xs text-subtle">No number given</p>
        )}
      </TableCell>

      <TableCell>
        {profile?.dateOfBirth ? (
          <>
            <p className="text-[0.8125rem] text-ink">{formatDate(profile.dateOfBirth)}</p>
            {age !== null && <p className="text-xs text-subtle">{age} years</p>}
          </>
        ) : (
          /*
            Not every artist has one. `dateOfBirth` was added to registration
            after the first accounts existed, so an empty cell here is an older
            record rather than a missing value somebody should chase.
          */
          <span className="text-xs text-subtle">—</span>
        )}
      </TableCell>

      <TableCell>
        <p className="text-[0.8125rem] text-ink">{formatDate(entry.createdAt)}</p>
        {entry.lastLoginAt && (
          <p className="text-xs text-subtle">Last in {formatDate(entry.lastLoginAt)}</p>
        )}
      </TableCell>

      <TableCell>
        <Badge variant={STATUS_STYLE[entry.status] ?? 'neutral'}>
          {entry.status.replace(/_/g, ' ')}
        </Badge>
        {!entry.emailVerified && (
          <p className="mt-1 text-xs text-warning">Email unverified</p>
        )}
      </TableCell>
    </TableRow>
  );
}

export default function ConsoleRegisteredArtistsPage() {
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('all');

  /*
    `role: 'artist'` is applied by the SERVER, not by filtering a full user list
    in the browser. Requirements §11 rules out client-side filtering of
    sensitive data for exactly this reason: a filtered-in-the-browser list still
    sent every staff and space-owner record down the wire, where anyone can read
    it in the network tab.
  */
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['console', 'registered-artists', search, status],
    queryFn: () =>
      adminService.users({
        role: 'artist',
        status: status === 'all' ? undefined : status,
        q: search || undefined,
        pageSize: 100,
      }),
  });

  const artists = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Registered artists"
        description="What each photographer gave us when they signed up. Visible to the CEO and the IT team only."
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, email or phone number"
            className="pl-10"
            aria-label="Search registered artists"
          />
        </div>
        <SimpleSelect
          value={status}
          onValueChange={setStatus}
          className="w-48"
          options={[
            { value: 'all', label: 'All statuses' },
            { value: 'verified', label: 'Verified' },
            { value: 'pending_verification', label: 'Pending verification' },
            { value: 'suspended', label: 'Suspended' },
          ]}
        />
      </div>

      {isLoading && (
        <div className="flex items-center gap-2.5 py-12 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading registered artists…
        </div>
      )}

      {isError && (
        <p className="rounded-lg border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
          {errorMessage(error)}
        </p>
      )}

      {data && artists.length === 0 && (
        <div className="rounded-lg border border-dashed border-line-strong p-10 text-center">
          <UserRound className="mx-auto size-6 text-subtle" aria-hidden />
          <p className="mt-3 font-display text-xl text-ink">No artists match</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
            {search || status !== 'all'
              ? 'Try a different search or status.'
              : 'Nobody has registered as an artist yet.'}
          </p>
        </div>
      )}

      {artists.length > 0 && (
        <>
          <p className="mb-3 text-xs text-subtle">
            {artists.length} artist{artists.length === 1 ? '' : 's'}
            {data && data.total > artists.length && ` of ${data.total}`}
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Artist</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Date of birth</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {artists.map((entry) => (
                  <ArtistRow key={entry.id} entry={entry} />
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
