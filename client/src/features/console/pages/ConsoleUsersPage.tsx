import {
  ACCESS_STATE_LABELS,
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  ASSISTABLE_ROLES,
  formatDate,
  formatRelative,
  ROLE_LABELS,
  ROLES,
  USER_STATUSES,
  type AccountAccess,
} from '@artinu/shared';
import { useQuery } from '@tanstack/react-query';
import { Camera, ChevronLeft, ChevronRight, LifeBuoy, Search, UserPlus, UserRound } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/DashboardShell';
import { AssistUserDialog } from '@/components/support/AssistUserDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import { Field } from '@/components/ui/field';
import { DateInput, Input } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InviteAccessDialog } from '@/features/console/components/InviteAccessDialog';
import { SubNav } from '@/features/console/components/SubNav';
import { usePermissions } from '@/lib/permissions';
import { qk } from '@/lib/query';
import { peopleService, type ManagedUser } from '@/services/people.service';

const ROLE_BADGE: Record<string, 'neutral' | 'bronze' | 'info' | 'success'> = {
  ceo: 'bronze',
  manager: 'bronze',
  accounts: 'bronze',
  operations: 'bronze',
  it_team: 'bronze',
  artist: 'info',
  space_owner: 'success',
  guest: 'neutral',
};

/** The four states People & access speaks in, mapped from the stored ones. */
export function accountStatus(status: string): { label: string; tone: 'success' | 'danger' | 'warning' | 'neutral' } {
  if (status === 'verified') return { label: 'Active', tone: 'success' };
  if (status === 'suspended') return { label: 'Suspended', tone: 'danger' };
  if (status === 'banned') return { label: 'Disabled', tone: 'neutral' };
  return { label: 'Pending', tone: 'warning' };
}

const STATUS_FILTER: Record<string, string> = {
  verified: 'Active',
  suspended: 'Suspended',
  banned: 'Disabled',
  pending_verification: 'Pending - email',
  pending_ceo_approval: 'Pending - CEO approval',
};

const PAGE_SIZE = 25;

/** The sign-in states in People & access's own colours. */
const ACCESS_TONE: Record<AccountAccess['state'], 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  active: 'success',
  invited: 'info',
  invitation_expired: 'warning',
  awaiting_approval: 'warning',
  blocked: 'danger',
};

/** Where an account stands on signing in, in one line. */
export function AccessSummary({ access }: { access: AccountAccess }) {
  const detail =
    access.state === 'invited' && access.inviteExpiresAt
      ? `Link valid until ${formatDate(access.inviteExpiresAt)}`
      : access.state === 'invitation_expired' && access.inviteSentAt
        ? `Sent ${formatDate(access.inviteSentAt)}, never used`
        : access.lastSignInAt
          ? `Signed in ${formatRelative(access.lastSignInAt)}`
          : 'Not signed in since created';
  return (
    <span className="flex flex-col items-start gap-1">
      <Badge variant={ACCESS_TONE[access.state]}>{ACCESS_STATE_LABELS[access.state]}</Badge>
      <span className="text-[0.6875rem] text-subtle">{detail}</span>
    </span>
  );
}

/** The quick views, each a preset of the filters below. */
const VIEWS = [
  { key: 'all', label: 'Everyone', type: 'all', role: 'all' },
  { key: 'photographers', label: 'Photographers', type: 'all', role: 'artist' },
  { key: 'staff', label: 'Staff', type: 'staff', role: 'all' },
  { key: 'customers', label: 'Customers', type: 'customer', role: 'all' },
] as const;

/**
 * Administration → People & access → User Management.
 *
 * One table for every account - customers, photographers and staff -
 * searchable by name, email, id or business, and filterable the ways support
 * actually looks for someone. Photographers and staff are given access from
 * here: "Invite photographer" and "Create staff account" both make an account
 * in the right role and email a single-use link to choose a password. Each row
 * opens the full record - sign-in state, role, password reset, suspension;
 * "Assist" opens an audited support session from right here.
 */
export default function ConsoleUsersPage() {
  const { can } = usePermissions();
  const [inviting, setInviting] = React.useState<'photographer' | 'staff' | null>(null);

  const [q, setQ] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [type, setType] = React.useState('all');
  const [role, setRole] = React.useState('all');
  const [status, setStatus] = React.useState('all');
  const [verified, setVerified] = React.useState('all');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [assisting, setAssisting] = React.useState<ManagedUser | null>(null);

  // Any change of filter starts again from the first page.
  React.useEffect(() => setPage(1), [search, type, role, status, verified, from, to]);

  const params = {
    q: search || undefined,
    type,
    role,
    status,
    verified,
    from: from || undefined,
    to: to || undefined,
    page,
    pageSize: PAGE_SIZE,
  };

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: qk.admin.people(params),
    queryFn: () => peopleService.users(params),
    placeholderData: (previous) => previous,
  });

  const view = VIEWS.find((entry) => entry.type === type && entry.role === role)?.key ?? null;
  const filtered = search || type !== 'all' || role !== 'all' || status !== 'all' || verified !== 'all' || from || to;
  const clearFilters = () => {
    setQ('');
    setSearch('');
    setType('all');
    setRole('all');
    setStatus('all');
    setVerified('all');
    setFrom('');
    setTo('');
  };

  return (
    <div>
      <PageHeader
        title="People &amp; access"
        description="Every account - customers, photographers and staff - who can sign in, and what each can reach."
        actions={
          can('users.invite') ? (
            <>
              <Button variant="outline" onClick={() => setInviting('photographer')}>
                <Camera /> Invite photographer
              </Button>
              <Button onClick={() => setInviting('staff')}>
                <UserPlus /> Create staff account
              </Button>
            </>
          ) : undefined
        }
      />

      <SubNav
        items={[
          { to: '/console/users', label: 'Accounts', end: true },
          { to: '/console/users/employees', label: 'Employees' },
          { to: '/console/users/audit', label: 'Audit log' },
        ]}
      />

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Show">
        {VIEWS.map((entry) => (
          <Button
            key={entry.key}
            size="sm"
            variant={view === entry.key ? 'primary' : 'outline'}
            aria-pressed={view === entry.key}
            onClick={() => {
              setType(entry.type);
              setRole(entry.role);
            }}
          >
            {entry.label}
          </Button>
        ))}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]">
        <form
          className="min-w-0 sm:col-span-2 lg:col-span-1"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(q.trim());
          }}
        >
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Name, email, user ID or business…"
            icon={<Search />}
            aria-label="Search users"
          />
        </form>
        <SimpleSelect
          value={type}
          onValueChange={setType}
          className="h-11"
          options={[
            { value: 'all', label: 'All account types' },
            { value: 'staff', label: 'Staff (every Console role)' },
            ...ACCOUNT_TYPES.map((entry) => ({ value: entry, label: ACCOUNT_TYPE_LABELS[entry] })),
          ]}
        />
        <SimpleSelect
          value={role}
          onValueChange={setRole}
          className="h-11"
          options={[{ value: 'all', label: 'All roles' }, ...ROLES.map((entry) => ({ value: entry, label: ROLE_LABELS[entry] }))]}
        />
        <SimpleSelect
          value={status}
          onValueChange={setStatus}
          className="h-11"
          options={[
            { value: 'all', label: 'All statuses' },
            ...USER_STATUSES.map((entry) => ({ value: entry, label: STATUS_FILTER[entry] ?? entry })),
          ]}
        />
        <SimpleSelect
          value={verified}
          onValueChange={setVerified}
          className="h-11"
          options={[
            { value: 'all', label: 'Email: any' },
            { value: 'yes', label: 'Email verified' },
            { value: 'no', label: 'Email not verified' },
          ]}
        />
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <Field label="Registered from" htmlFor="registered-from" className="w-44">
          <DateInput id="registered-from" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field label="Registered to" htmlFor="registered-to" className="w-44">
          <DateInput id="registered-to" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
        </Field>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="mb-1">
            Clear filters
          </Button>
        )}
        {data && (
          <p className="mb-2.5 ml-auto text-xs text-subtle" aria-live="polite">
            {data.total} account{data.total === 1 ? '' : 's'}
          </p>
        )}
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Skeleton className="h-96 w-full rounded-lg" />
      ) : data && data.items.length > 0 ? (
        <Card>
          <CardContent className="p-0 sm:p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Type &amp; role</TableHead>
                  <TableHead>Sign-in</TableHead>
                  <TableHead>Photographer profile / business</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
                {data.items.map((entry) => {
                  const state = accountStatus(entry.status);
                  const name = entry.profile?.displayName || entry.profile?.fullName || entry.email;
                  const assistable =
                    can('users.assist') &&
                    (ASSISTABLE_ROLES as readonly string[]).includes(entry.role) &&
                    entry.status === 'verified';
                  return (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <Link to={`/console/users/${entry.id}`} className="group flex items-center gap-3">
                          <Avatar name={name} src={entry.profile?.avatarUrl} className="size-8" />
                          <span className="min-w-0">
                            <span className="block truncate text-ink group-hover:underline">{name}</span>
                            <span className="block truncate text-xs text-subtle">{entry.email}</span>
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className="block text-xs text-muted">{ACCOUNT_TYPE_LABELS[entry.accountType]}</span>
                        <Badge variant={ROLE_BADGE[entry.role] ?? 'neutral'} className="mt-1">
                          {ROLE_LABELS[entry.role]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <AccessSummary access={entry.access} />
                      </TableCell>
                      <TableCell className="max-w-[12rem] text-xs text-muted">
                        {entry.photographer ? (
                          <span className="block">
                            <span className="font-mono text-ink">{entry.photographer.photographerCode ?? 'No code yet'}</span>
                            {' · '}
                            {entry.photographer.photographs} photo{entry.photographer.photographs === 1 ? '' : 's'}
                            {entry.photographer.slug && (
                              <a
                                href={`/artists/${entry.photographer.slug}`}
                                target="_blank"
                                rel="noreferrer"
                                className="block text-bronze underline-offset-4 hover:underline"
                              >
                                Public profile
                              </a>
                            )}
                          </span>
                        ) : (
                          <span className="block truncate" title={entry.businesses.join(', ')}>
                            {entry.businesses.length ? entry.businesses.join(', ') : '-'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-subtle">{formatDate(entry.createdAt)}</TableCell>
                      <TableCell>
                        <Badge variant={state.tone}>{state.label}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted">{entry.emailVerified ? 'Verified' : 'Not verified'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          {assistable && (
                            <Button size="sm" variant="outline" onClick={() => setAssisting(entry)}>
                              <LifeBuoy /> Assist user
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" asChild>
                            <Link to={`/console/users/${entry.id}`}>Manage access</Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={<UserRound />}
          title="No accounts match those filters."
          description="Try a shorter search, or clear the filters."
          action={
            filtered ? (
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      )}

      {data && data.totalPages > 1 && (
        <nav className="mt-5 flex items-center justify-end gap-3" aria-label="Pagination">
          <span className="text-xs text-subtle">
            Page {data.page} of {data.totalPages}
          </span>
          <Button
            size="icon"
            variant="outline"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            <ChevronLeft />
          </Button>
          <Button
            size="icon"
            variant="outline"
            aria-label="Next page"
            disabled={page >= data.totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            <ChevronRight />
          </Button>
        </nav>
      )}

      <AssistUserDialog
        open={Boolean(assisting)}
        onOpenChange={(open) => !open && setAssisting(null)}
        user={
          assisting
            ? {
                id: assisting.id,
                email: assisting.email,
                name: assisting.profile?.displayName || assisting.profile?.fullName || assisting.email,
              }
            : null
        }
      />

      <InviteAccessDialog
        kind={inviting ?? 'photographer'}
        open={Boolean(inviting)}
        onOpenChange={(open) => !open && setInviting(null)}
      />
    </div>
  );
}
