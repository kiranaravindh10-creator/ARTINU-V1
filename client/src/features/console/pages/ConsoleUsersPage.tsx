import {
  formatDate,
  formatRelative,
  INTERNAL_ROLES,
  ROLE_LABELS,
  ROLE_MODULES,
  ROLES,
  USER_STATUSES,
  type Role,
} from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Phone, Plus, Search, ShieldAlert, Trash2, UserRound } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/DashboardShell';
import { SubNav } from '@/features/console/components/SubNav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { SimpleSelect } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { errorMessage } from '@/lib/api';
import { qk } from '@/lib/query';
import { adminService, type AdminUser } from '@/services/admin.service';

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

/**
 * THE REGISTERED MOBILE NUMBER.
 *
 * ── Why this needed adding at all ───────────────────────────────────────────
 *
 * The number was never missing. Artist sign-up asks for it (registerStep1Schema
 * → `phone`), the handler writes it to `profiles.phone`, and `/admin/users`
 * has always returned the whole profile alongside the account — so it was
 * already arriving in this page's response and simply was not being drawn.
 * Thirty-one of the thirty-four artists on production have one stored.
 *
 * What made it look absent is that the obvious place to go looking — Console →
 * Artists → Applications — renders an APPLICATION, and the application form
 * has no phone field and the `applications` table has no phone column. Somebody
 * accepted from an application therefore has no number until they fill their
 * own profile in. Two different records, only one of which ever had a number.
 *
 * ── Why it is safe here specifically ────────────────────────────────────────
 *
 * This screen is inside the `users` module, which ROLE_MODULES grants to the
 * CEO and the IT team and to nobody else — not the manager, not accounts, not
 * operations. `/admin/users` makes the same check with `requireModule('users')`
 * server-side, so the number is not merely hidden from other roles, it is never
 * sent to them. It is deliberately NOT added to Console → Artists, which is the
 * `artists` module and which the manager also holds.
 */
function MobileNumber({ phone, className }: { phone?: string | null; className?: string }) {
  const [copied, setCopied] = React.useState(false);

  if (!phone) {
    // Never "null", "undefined" or "N/A" — an account that never gave a number
    // is a fact about the account, not an error.
    return <span className={cn('text-xs text-subtle', className)}>No number given</span>;
  }

  const copy = async () => {
    try {
      // The stored value, exactly. Nothing is reformatted on the way out.
      await navigator.clipboard.writeText(phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard is blocked over plain http and in some embedded browsers.
      // The number is selectable text either way, so this fails quietly.
      toast.error('Could not copy - select the number instead.');
    }
  };

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <Phone className="size-3.5 shrink-0 text-subtle" aria-hidden />
      {/* `tel:` so it dials from a phone and is one tap on the console's mobile view. */}
      <a href={`tel:${phone}`} className="tabular-nums text-ink hover:text-bronze">
        {phone}
      </a>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copied' : 'Copy mobile number'}
        className="shrink-0 rounded p-0.5 text-subtle transition-colors hover:text-ink"
      >
        {copied ? (
          <Check className="size-3.5 text-success" aria-hidden />
        ) : (
          <Copy className="size-3.5" aria-hidden />
        )}
      </button>
    </span>
  );
}

export default function ConsoleUsersPage() {
  const queryClient = useQueryClient();
  const { user: me } = useAuth();

  const [q, setQ] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [role, setRole] = React.useState('all');
  const [status, setStatus] = React.useState('all');
  const [editing, setEditing] = React.useState<AdminUser | null>(null);
  const [nextRole, setNextRole] = React.useState<string>('');
  const [nextStatus, setNextStatus] = React.useState<string>('');
  /** Must equal the target's email before deletion is allowed. */
  const [confirmEmail, setConfirmEmail] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [newEmail, setNewEmail] = React.useState('');
  const [newFullName, setNewFullName] = React.useState('');
  const [newRole, setNewRole] = React.useState<string>('guest');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.admin.users({ q: search, role, status }),
    queryFn: () =>
      adminService.users({
        q: search || undefined,
        role: role === 'all' ? undefined : role,
        status: status === 'all' ? undefined : status,
        pageSize: 100,
      }),
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { role?: string; status?: string } }) =>
      adminService.updateUser(id, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setEditing(null);
      toast.success('Account updated');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const createUser = useMutation({
    mutationFn: (input: { email: string; role: string; fullName?: string }) =>
      adminService.createUser(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setCreating(false);
      setNewEmail('');
      setNewFullName('');
      setNewRole('guest');
      toast.success('Employee account created - they will receive a sign-in link');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  /**
   * Permanent deletion. The typed-email confirmation below is the only thing
   * between a mis-click and an account that cannot be brought back, so the
   * mutation deliberately has no "are you sure?" of its own — the button is
   * not reachable until the address matches.
   */
  const deleteUser = useMutation({
    mutationFn: (id: string) => adminService.deleteUser(id),
    onSuccess: (summary) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setEditing(null);
      setConfirmEmail('');
      const removed = [
        summary.artworks && `${summary.artworks} artworks`,
        summary.spaces && `${summary.spaces} spaces`,
        summary.orders && `${summary.orders} orders`,
        summary.invoices && `${summary.invoices} invoices`,
      ]
        .filter(Boolean)
        .join(', ');
      toast.success(
        `${summary.email} deleted${removed ? ` - along with ${removed}` : ''}`,
      );
      if (summary.filesFailed > 0) {
        toast.warning(`${summary.filesFailed} stored file(s) could not be removed. See the server log.`);
      }
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const openEditor = (user: AdminUser) => {
    setEditing(user);
    setNextRole(user.role);
    setNextStatus(user.status);
    setConfirmEmail('');
  };

  const grantsInternal =
    editing &&
    nextRole !== editing.role &&
    (INTERNAL_ROLES as readonly string[]).includes(nextRole);

  return (
    <div>
      <PageHeader title="Users &amp; roles" description="Who can reach what." />

      <SubNav
        items={[
          { to: '/console/users', label: 'People', end: true },
          { to: '/console/users/audit', label: 'Audit log' },
        ]}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <form
          className="min-w-0 flex-1 max-w-sm"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(q);
          }}
        >
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search by name or email…"
            icon={<Search />}
            aria-label="Search users"
          />
        </form>

        <SimpleSelect
          value={role}
          onValueChange={setRole}
          className="h-11 w-44"
          options={[
            { value: 'all', label: 'All roles' },
            ...ROLES.map((entry) => ({ value: entry, label: ROLE_LABELS[entry] })),
          ]}
        />

        <SimpleSelect
          value={status}
          onValueChange={setStatus}
          className="h-11 w-48"
          options={[
            { value: 'all', label: 'All statuses' },
            ...USER_STATUSES.map((entry) => ({
              value: entry,
              label: entry.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
            })),
          ]}
        />

        <Button onClick={() => setCreating(true)} className="ml-auto">
          <UserRound className="size-4 mr-2" /> Add employee
        </Button>
      </div>

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
                  <TableHead>Account</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Verified</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <span className="flex items-center gap-3">
                        <Avatar
                          name={entry.profile?.fullName ?? entry.email}
                          src={entry.profile?.avatarUrl}
                          className="size-8"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-ink">
                            {entry.profile?.fullName ?? '-'}
                          </span>
                          <span className="block truncate text-xs text-subtle">{entry.email}</span>
                          {/*
                            Under the email rather than in a column of its own:
                            the number is what somebody opens this page to find,
                            and a seventh column would have pushed the table into
                            horizontal scrolling on a laptop to show it.
                          */}
                          <MobileNumber phone={entry.profile?.phone} className="mt-0.5 text-xs" />
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ROLE_BADGE[entry.role] ?? 'neutral'}>
                        {ROLE_LABELS[entry.role]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={entry.status === 'verified' ? 'success' : entry.status === 'suspended' ? 'danger' : 'warning'}>
                        {entry.status.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted">
                      {entry.emailVerified ? 'Yes' : 'No'}
                    </TableCell>
                    <TableCell className="text-xs text-subtle">
                      {formatDate(entry.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs text-subtle">
                      {entry.lastLoginAt ? formatRelative(entry.lastLoginAt) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEditor(entry)}>
                        Manage
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState icon={<UserRound />} title="No accounts match those filters." />
      )}

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage access</DialogTitle>
            <DialogDescription>
              {editing?.profile?.fullName ?? editing?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/*
              Contact first, above role and status.

              Somebody opening this dialog is usually trying to reach the person,
              not change their permissions — so the number sits at the top where
              it is read at a glance rather than below two dropdowns.
            */}
            <div className="rounded-lg border border-line bg-canvas-soft px-4 py-3">
              <p className="font-label text-[0.625rem] uppercase tracking-[0.14em] text-subtle">
                Mobile
              </p>
              <MobileNumber phone={editing?.profile?.phone} className="mt-1 text-sm" />
              <p className="mt-1 truncate text-xs text-subtle">{editing?.email}</p>
            </div>

            <Field
              label="Role"
              hint={
                editing?.id === me?.id
                  ? 'You cannot change your own role.'
                  : undefined
              }
            >
              <SimpleSelect
                value={nextRole}
                onValueChange={setNextRole}
                disabled={editing?.id === me?.id}
                options={ROLES.map((entry) => ({ value: entry, label: ROLE_LABELS[entry] }))}
              />
            </Field>

            {/* Show exactly what the chosen role can reach. */}
            {(ROLE_MODULES[nextRole] ?? []).length > 0 && (
              <div className="rounded-md bg-sand-soft p-3">
                <p className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
                  This role can reach
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(ROLE_MODULES[nextRole] ?? []).map((module) => (
                    <Badge key={module} variant="outline" className="capitalize">
                      {module}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Field label="Status">
              <SimpleSelect
                value={nextStatus}
                onValueChange={setNextStatus}
                options={USER_STATUSES.map((entry) => ({
                  value: entry,
                  label: entry.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
                }))}
              />
            </Field>

            {grantsInternal && (
              <p className="flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                This grants internal ARTINU Console access. Make sure that&rsquo;s intended.
              </p>
            )}

            {/*
              Delete account. Below role and status, separated by a rule, and
              gated behind typing the address: this is the one control here that
              cannot be undone by setting the field back.
            */}
            {editing?.id !== me?.id && (
              <div className="mt-2 border-t border-line pt-4">
                <p className="flex items-start gap-2.5 text-sm font-medium text-danger">
                  <Trash2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Delete this account
                </p>
                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">
                  Permanently removes the account and everything belonging to it - profile,
                  photographs and their files, spaces, orders and invoices. This cannot be
                  undone. To suspend access instead, set the status to{' '}
                  <span className="font-medium">suspended</span> above.
                </p>

                <Field
                  label={`Type ${editing?.email} to confirm`}
                  htmlFor="confirm-delete"
                  className="mt-3"
                >
                  <Input
                    id="confirm-delete"
                    value={confirmEmail}
                    onChange={(event) => setConfirmEmail(event.target.value)}
                    placeholder={editing?.email}
                    autoComplete="off"
                  />
                </Field>

                <Button
                  variant="danger"
                  className="mt-3 w-full"
                  loading={deleteUser.isPending}
                  disabled={confirmEmail.trim().toLowerCase() !== editing?.email.toLowerCase()}
                  onClick={() => deleteUser.mutate(editing!.id)}
                >
                  Delete account permanently
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              loading={update.isPending}
              disabled={nextRole === editing?.role && nextStatus === editing?.status}
              onClick={() =>
                update.mutate({
                  id: editing!.id,
                  patch: {
                    role: nextRole !== editing!.role ? nextRole : undefined,
                    status: nextStatus !== editing!.status ? nextStatus : undefined,
                  },
                })
              }
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create employee dialog ────────────────────────────────────────────── */}
      <Dialog open={creating} onOpenChange={(open) => !open && setCreating(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add new employee</DialogTitle>
            <DialogDescription>
              Enter their email and choose their access level. They'll receive a sign-in link.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label="Email" required>
              <Input
                type="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                placeholder="name@company.com"
                autoFocus
              />
            </Field>

            <Field label="Full name (optional)">
              <Input
                value={newFullName}
                onChange={(event) => setNewFullName(event.target.value)}
                placeholder="John Doe"
              />
            </Field>

            <Field label="Role" hint="This determines what they can access in the Console.">
              <SimpleSelect
                value={newRole}
                onValueChange={setNewRole}
                options={ROLES.map((entry) => ({ value: entry, label: ROLE_LABELS[entry] }))}
              />
            </Field>

            {(ROLE_MODULES[newRole] ?? []).length > 0 && (
              <div className="rounded-md bg-sand-soft p-3">
                <p className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
                  This role can reach
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(ROLE_MODULES[newRole] ?? []).map((module) => (
                    <Badge key={module} variant="outline" className="capitalize">
                      {module}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {(INTERNAL_ROLES as readonly string[]).includes(newRole) && (
              <p className="flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                This grants internal ARTINU Console access. Make sure that&rsquo;s intended.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              loading={createUser.isPending}
              disabled={!newEmail || createUser.isPending}
              onClick={() =>
                createUser.mutate({
                  email: newEmail,
                  role: newRole,
                  fullName: newFullName || undefined,
                })
              }
            >
              Create account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
