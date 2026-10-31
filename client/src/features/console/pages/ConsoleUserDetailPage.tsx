import {
  ACCOUNT_TYPE_LABELS,
  ASSISTABLE_ROLES,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatRelative,
  INTERNAL_ROLES,
  ORDER_STATUS_LABELS,
  ROLE_LABELS,
  ROLE_MODULES,
  ROLE_PERMISSIONS,
  ROLES,
} from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, KeyRound, LifeBuoy, ShieldAlert, Trash2, UserRound } from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Block, PageHeader } from '@/components/layout/DashboardShell';
import { AssistUserDialog } from '@/components/support/AssistUserDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { AccessSummary, accountStatus } from '@/features/console/pages/ConsoleUsersPage';
import { errorMessage } from '@/lib/api';
import { usePermissions } from '@/lib/permissions';
import { qk } from '@/lib/query';
import { adminService } from '@/services/admin.service';
import { peopleService } from '@/services/people.service';

const label = 'font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle';

/**
 * One account, everything an administrator may do to it, and what has been
 * done to it already.
 *
 * Each action is only shown to a role that holds its permission, and the
 * server checks again regardless. The ones that change what the account holder
 * experiences - role, suspension, email - ask for a reason, because the
 * reason is what the audit trail and the account holder see.
 */
export default function ConsoleUserDetailPage() {
  const { userId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: me } = useAuth();
  const { can, hasModule } = usePermissions();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.admin.person(userId),
    queryFn: () => peopleService.user(userId),
    enabled: Boolean(userId),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.admin.person(userId) });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'people'] });
  };
  const fail = (mutationError: unknown) => toast.error(errorMessage(mutationError));

  // ── Local form state ─────────────────────────────────────────────────────
  const [fullName, setFullName] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [city, setCity] = React.useState('');
  const [role, setRole] = React.useState('');
  const [roleReason, setRoleReason] = React.useState('');
  const [statusReason, setStatusReason] = React.useState('');
  const [newEmail, setNewEmail] = React.useState('');
  const [emailReason, setEmailReason] = React.useState('');
  const [resetLink, setResetLink] = React.useState<{ link: string; expiresAt: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState('');
  const [assisting, setAssisting] = React.useState(false);

  React.useEffect(() => {
    if (!data) return;
    setFullName(data.profile?.fullName ?? '');
    setDisplayName(data.profile?.displayName ?? '');
    setPhone(data.profile?.phone ?? '');
    setCity(data.profile?.city ?? '');
    setRole(data.user.role);
  }, [data]);

  const saveProfile = useMutation({
    mutationFn: () => peopleService.updateProfile(userId, { fullName, displayName, phone, city }),
    onSuccess: () => {
      toast.success('Profile updated.');
      refresh();
    },
    onError: fail,
  });
  const changeRole = useMutation({
    mutationFn: () => peopleService.changeRole(userId, role, roleReason.trim() || undefined),
    onSuccess: (updated) => {
      toast.success(updated.status === 'pending_ceo_approval' ? 'Role changed - waiting for the CEO to approve IT access.' : 'Role changed.');
      setRoleReason('');
      refresh();
    },
    onError: fail,
  });
  const suspend = useMutation({
    mutationFn: () => peopleService.suspend(userId, statusReason.trim()),
    onSuccess: () => {
      toast.success('Account suspended. They have been told why.');
      setStatusReason('');
      refresh();
    },
    onError: fail,
  });
  const reactivate = useMutation({
    mutationFn: () => peopleService.reactivate(userId, statusReason.trim()),
    onSuccess: () => {
      toast.success('Account restored.');
      setStatusReason('');
      refresh();
    },
    onError: fail,
  });
  const resetEmail = useMutation({
    mutationFn: () => peopleService.passwordReset(userId, 'email'),
    onSuccess: (result) =>
      result.delivered
        ? toast.success('Reset email sent. The link works for one hour.')
        : toast.warning('The reset email was not delivered - no mail provider accepted it. Check System → Email log.'),
    onError: fail,
  });
  const resetLinkMutation = useMutation({
    mutationFn: () => peopleService.passwordReset(userId, 'link'),
    onSuccess: (result) => setResetLink(result.link ? { link: result.link, expiresAt: result.expiresAt } : null),
    onError: fail,
  });
  const forceChange = useMutation({
    mutationFn: () => peopleService.forcePasswordChange(userId),
    onSuccess: () => {
      toast.success('They will be asked for a new password at their next sign-in. Current sessions have ended.');
      refresh();
    },
    onError: fail,
  });
  const revoke = useMutation({
    mutationFn: () => peopleService.revokeSessions(userId),
    onSuccess: () => {
      toast.success('Signed out everywhere.');
      refresh();
    },
    onError: fail,
  });
  const changeEmail = useMutation({
    mutationFn: () => peopleService.changeEmail(userId, newEmail.trim(), emailReason.trim()),
    onSuccess: (result) => {
      toast[result.delivered ? 'success' : 'warning'](
        result.delivered
          ? `Confirmation sent to ${result.pendingEmail}. The address changes once they confirm.`
          : `Not delivered to ${result.pendingEmail} - no mail provider accepted it.`,
      );
      setNewEmail('');
      setEmailReason('');
      refresh();
    },
    onError: fail,
  });
  const resendInvitation = useMutation({
    mutationFn: () => peopleService.resendInvitation(userId),
    onSuccess: (result) => {
      toast[result.delivered ? 'success' : 'warning'](
        result.delivered
          ? 'A new invitation is on its way. Any earlier link no longer works.'
          : 'A new link was made, but the email was not delivered - no mail provider accepted it.',
      );
      refresh();
    },
    onError: fail,
  });
  const approveAccess = useMutation({
    mutationFn: () => peopleService.approve(userId),
    onSuccess: () => {
      toast.success('IT access approved. They can sign in now.');
      refresh();
    },
    onError: fail,
  });
  const deleteUser = useMutation({
    mutationFn: () => adminService.deleteUser(userId),
    onSuccess: (summary) => {
      toast.success(`${summary.email} deleted.`);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'people'] });
      navigate('/console/users');
    },
    onError: fail,
  });

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-80" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  const { user, profile } = data;
  const name = profile?.displayName || profile?.fullName || user.email;
  const state = accountStatus(user.status);
  const self = user.id === me?.id;
  // Mirrors the server rule: only a CEO touches a CEO account.
  const locked = self || (user.role === 'ceo' && me?.role !== 'ceo');
  const internal = (INTERNAL_ROLES as readonly string[]).includes(user.role);
  const assistable =
    can('users.assist') && (ASSISTABLE_ROLES as readonly string[]).includes(user.role) && user.status === 'verified' && !self;
  const roleOptions = ROLES.filter((entry) => entry !== 'ceo' || me?.role === 'ceo');

  return (
    <div>
      <Link
        to="/console/users"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" /> People &amp; access
      </Link>

      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar name={name} src={profile?.avatarUrl} className="size-10" />
            {name}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            {user.email}
            <Badge variant={state.tone}>{state.label}</Badge>
            <Badge variant="outline">{ACCOUNT_TYPE_LABELS[data.accountType]}</Badge>
            <Badge variant="bronze">{ROLE_LABELS[user.role]}</Badge>
            {!user.emailVerified && <Badge variant="warning">Email not verified</Badge>}
          </span>
        }
        actions={
          assistable ? (
            <Button onClick={() => setAssisting(true)}>
              <LifeBuoy /> Assist user
            </Button>
          ) : undefined
        }
      />

      {user.statusReason && user.status !== 'verified' && (
        <p className="mb-8 rounded-md border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
          {state.label}: {user.statusReason}
          {user.statusChangedAt ? ` · ${formatDateTime(user.statusChangedAt)}` : ''}
        </p>
      )}

      <div className="grid gap-10 xl:grid-cols-2">
        {/* ── Sign-in access ────────────────────────────────────────── */}
        <Block label="Sign-in access" hint="Nobody at ARTINU can see or retrieve a password.">
          <AccessSummary access={data.access} />
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <Detail term="Signs in at">
              <span className="font-mono text-xs">{window.location.origin}/signin</span>
            </Detail>
            <Detail term="Lands in">
              {internal
                ? 'The Console'
                : user.role === 'artist'
                  ? 'Their Studio - never the Console'
                  : user.role === 'space_owner'
                    ? 'Their space dashboard'
                    : 'The website'}
            </Detail>
          </dl>
          {data.access.state === 'invited' && (
            <p className="mt-3 text-[0.8125rem] text-muted">
              Waiting for them to choose a password from the email. Nothing to do unless they cannot find it.
            </p>
          )}
          {data.access.state === 'awaiting_approval' && (
            <p className="mt-3 text-[0.8125rem] text-muted">
              IT access granted by someone other than the CEO. They cannot sign in until the CEO approves it.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {can('users.invite') &&
              !locked &&
              (data.access.state === 'invited' || data.access.state === 'invitation_expired') && (
                <Button size="sm" loading={resendInvitation.isPending} onClick={() => resendInvitation.mutate()}>
                  Resend invitation
                </Button>
              )}
            {me?.role === 'ceo' && !self && data.access.state === 'awaiting_approval' && (
              <Button size="sm" loading={approveAccess.isPending} onClick={() => approveAccess.mutate()}>
                Approve IT access
              </Button>
            )}
          </div>
        </Block>

        {/* ── Photographer profile ──────────────────────────────────── */}
        {data.photographer && (
          <Block label="Photographer profile" hint="Belongs to this sign-in - there is never a second one.">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
              <Detail term="Photographer code">
                <span className="font-mono">{data.photographer.photographerCode ?? 'Not assigned yet'}</span>
              </Detail>
              <Detail term="Photographs">{data.photographer.photographs}</Detail>
              <Detail term="Public profile">
                {data.photographer.slug ? (
                  <a
                    href={`/artists/${data.photographer.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-bronze underline-offset-4 hover:underline"
                  >
                    /artists/{data.photographer.slug}
                  </a>
                ) : (
                  'No public address yet'
                )}
              </Detail>
              {hasModule('artists') && (
                <Detail term="Guidelines record">
                  <Link to={`/console/artists/${user.id}/moderation`} className="text-bronze underline-offset-4 hover:underline">
                    Warnings and enforcement
                  </Link>
                </Detail>
              )}
            </dl>
            <p className="mt-3 text-xs text-subtle">
              They manage it from their Studio. If they cannot get in, send a password reset - inviting them again
              would not be allowed, and is never needed.
            </p>
          </Block>
        )}

        {/* ── Account ───────────────────────────────────────────────── */}
        <Block label="Account">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <Detail term="User ID">
              <span className="font-mono text-xs">{user.id}</span>
            </Detail>
            <Detail term="Registered">{formatDate(user.createdAt)}</Detail>
            <Detail term="Last sign-in">
              {data.access.lastSignInAt ? formatRelative(data.access.lastSignInAt) : 'Not since the account was created'}
            </Detail>
            <Detail term="Sessions revoked">{user.sessionsRevokedAt ? formatDateTime(user.sessionsRevokedAt) : '-'}</Detail>
            {data.employee && (
              <Detail term="Employee">
                {data.employee.employeeCode} · {data.employee.jobTitle}
              </Detail>
            )}
            <Detail term="Businesses">
              {[...data.spaces.map((space) => space.name), ...data.clients.map((client) => client.name)].join(', ') || '-'}
            </Detail>
          </dl>
        </Block>

        {/* ── Profile ───────────────────────────────────────────────── */}
        <Block label="Profile" hint={can('users.edit') && !locked ? undefined : 'Read only for your role'}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="full-name" required>
              <Input id="full-name" value={fullName} disabled={!can('users.edit') || locked} onChange={(event) => setFullName(event.target.value)} />
            </Field>
            <Field label="Display name" htmlFor="display-name">
              <Input id="display-name" value={displayName} disabled={!can('users.edit') || locked} onChange={(event) => setDisplayName(event.target.value)} />
            </Field>
            <Field label="Phone" htmlFor="phone">
              <Input id="phone" value={phone} disabled={!can('users.edit') || locked} onChange={(event) => setPhone(event.target.value)} />
            </Field>
            <Field label="City" htmlFor="city">
              <Input id="city" value={city} disabled={!can('users.edit') || locked} onChange={(event) => setCity(event.target.value)} />
            </Field>
          </div>
          {can('users.edit') && !locked && (
            <Button className="mt-4" size="sm" loading={saveProfile.isPending} disabled={!fullName.trim()} onClick={() => saveProfile.mutate()}>
              Save profile
            </Button>
          )}
        </Block>

        {/* ── Access ────────────────────────────────────────────────── */}
        {can('users.change_role') && (
          <Block label="Role and access">
            <Field label="Role" hint={self ? 'You cannot change your own role.' : locked ? 'Only a CEO can change a CEO account.' : undefined}>
              <SimpleSelect
                value={role}
                onValueChange={setRole}
                disabled={locked}
                options={roleOptions.map((entry) => ({ value: entry, label: ROLE_LABELS[entry] }))}
              />
            </Field>
            {(ROLE_MODULES[role] ?? []).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(ROLE_MODULES[role] ?? []).map((module) => (
                  <Badge key={module} variant="outline" className="capitalize">
                    {module}
                  </Badge>
                ))}
              </div>
            )}
            {(ROLE_PERMISSIONS[role] ?? []).length > 0 && (
              <details className="mt-3 text-xs text-muted">
                <summary className="cursor-pointer select-none">
                  Actions this role may take ({(ROLE_PERMISSIONS[role] ?? []).length})
                </summary>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(ROLE_PERMISSIONS[role] ?? []).map((permission) => (
                    <Badge key={permission} variant="outline" className="font-mono text-[0.6875rem]">
                      {permission}
                    </Badge>
                  ))}
                </div>
              </details>
            )}
            {role !== user.role && (
              <>
                {(INTERNAL_ROLES as readonly string[]).includes(role) && (
                  <p className="mt-3 flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    This grants Console access.{role === 'it_team' && me?.role !== 'ceo' ? ' IT access waits for the CEO to approve it.' : ''}
                  </p>
                )}
                <Field label="Reason" htmlFor="role-reason" className="mt-3">
                  <Input id="role-reason" value={roleReason} onChange={(event) => setRoleReason(event.target.value)} placeholder="Joined the operations team" />
                </Field>
                <Button className="mt-3" size="sm" loading={changeRole.isPending} onClick={() => changeRole.mutate()}>
                  Change role to {ROLE_LABELS[role as keyof typeof ROLE_LABELS]}
                </Button>
              </>
            )}
          </Block>
        )}

        {internal && (
          <BranchBlock userId={userId} current={user.branch ?? null} editable={can('branches.assign')} onChanged={refresh} />
        )}

        {/* ── Security ──────────────────────────────────────────────── */}
        {(can('users.reset_password') || can('users.revoke_sessions')) && (
          <Block label="Password and sessions" hint="Nobody at ARTINU can see or retrieve a password.">
            <div className="flex flex-wrap gap-2">
              {can('users.reset_password') && (
                <>
                  <Button size="sm" variant="outline" disabled={locked} loading={resetEmail.isPending} onClick={() => resetEmail.mutate()}>
                    Send reset email
                  </Button>
                  <Button size="sm" variant="outline" disabled={locked} loading={forceChange.isPending} onClick={() => forceChange.mutate()}>
                    Force new password at next sign-in
                  </Button>
                </>
              )}
              {can('users.reset_link') && (
                <Button size="sm" variant="outline" disabled={locked} loading={resetLinkMutation.isPending} onClick={() => resetLinkMutation.mutate()}>
                  <KeyRound /> Generate one-time reset link
                </Button>
              )}
              {can('users.revoke_sessions') && (
                <Button size="sm" variant="outline" disabled={locked} loading={revoke.isPending} onClick={() => revoke.mutate()}>
                  Sign out everywhere
                </Button>
              )}
            </div>
            {resetLink && (
              <div className="mt-4 rounded-md border border-line bg-sand-soft p-3">
                <p className="text-[0.8125rem] text-ink-soft">
                  Single-use, valid until {formatDateTime(resetLink.expiresAt)}. Share it only through a channel you have
                  confirmed belongs to them. It is shown once.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Input readOnly value={resetLink.link} aria-label="Reset link" className="font-mono text-xs" />
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label="Copy reset link"
                    onClick={() => {
                      void navigator.clipboard.writeText(resetLink.link);
                      toast.success('Copied.');
                    }}
                  >
                    <Copy />
                  </Button>
                </div>
              </div>
            )}
          </Block>
        )}

        {/* ── Email ─────────────────────────────────────────────────── */}
        {can('users.change_email') && (
          <Block label="Correct the email address" hint="Changes only after the new address confirms it.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="New email address" htmlFor="new-address">
                <Input id="new-address" type="email" value={newEmail} disabled={locked} onChange={(event) => setNewEmail(event.target.value)} placeholder="name@example.com" />
              </Field>
              <Field label="Reason" htmlFor="email-reason">
                <Input id="email-reason" value={emailReason} disabled={locked} onChange={(event) => setEmailReason(event.target.value)} placeholder="Typo at registration" />
              </Field>
            </div>
            <Button
              className="mt-3"
              size="sm"
              disabled={locked || !newEmail.includes('@') || emailReason.trim().length < 5}
              loading={changeEmail.isPending}
              onClick={() => changeEmail.mutate()}
            >
              Send confirmation to the new address
            </Button>
          </Block>
        )}

        {/* ── Status ────────────────────────────────────────────────── */}
        {can('users.suspend') && user.status !== 'banned' && (
          <Block label="Account status" hint={internal ? 'Staff accounts: CEO only.' : 'They are emailed the reason.'}>
            <Field label="Reason" htmlFor="status-reason" required>
              <Textarea
                id="status-reason"
                rows={2}
                value={statusReason}
                disabled={locked}
                onChange={(event) => setStatusReason(event.target.value)}
                placeholder={user.status === 'suspended' ? 'Issue resolved on a call' : 'Repeated failed payments - pending review'}
              />
            </Field>
            {user.status === 'suspended' ? (
              <Button className="mt-3" size="sm" disabled={locked || statusReason.trim().length < 5} loading={reactivate.isPending} onClick={() => reactivate.mutate()}>
                Reactivate account
              </Button>
            ) : (
              <Button
                className="mt-3"
                size="sm"
                variant="danger"
                disabled={locked || statusReason.trim().length < 5}
                loading={suspend.isPending}
                onClick={() => suspend.mutate()}
              >
                Suspend account
              </Button>
            )}
          </Block>
        )}
      </div>

      {/* ── Orders and payments ─────────────────────────────────────── */}
      <Block label="Orders" className="mt-10">
        {data.orders.length === 0 ? (
          <p className="text-sm text-muted">No orders on this account.</p>
        ) : (
          <Card>
            <CardContent className="p-0 sm:p-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead>Placed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <Link to={`/console/orders/${order.id}`} className="font-mono text-xs text-ink underline-offset-4 hover:underline">
                          {order.reference}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted">{ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] ?? order.status}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(order.total)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(order.money.paid - order.money.refunded)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(order.money.outstanding)}</TableCell>
                      <TableCell className="text-xs text-subtle">{formatDate(order.placedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </Block>

      <Block label="Payments" className="mt-10">
        {data.payments.length === 0 ? (
          <p className="text-sm text-muted">No payments recorded.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {data.payments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="font-mono text-xs text-ink">{payment.reference}</span>
                <span className="text-xs text-muted">
                  {payment.orderReference} · {payment.provider === 'manual' ? 'Recorded by staff' : payment.provider.replace('_', ' ')}
                </span>
                <span className="tabular-nums text-ink">{formatCurrency(payment.amount)}</span>
                <Badge variant={payment.status === 'succeeded' ? 'success' : payment.status === 'failed' ? 'danger' : 'neutral'}>
                  {payment.status.replace(/_/g, ' ')}
                </Badge>
                <span className="text-xs text-subtle">{formatDateTime(payment.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      {/* ── Support sessions and activity ───────────────────────────── */}
      <div className="mt-10 grid gap-10 xl:grid-cols-2">
        <Block label="Support sessions">
          {data.supportSessions.length === 0 ? (
            <p className="text-sm text-muted">Nobody has opened a support session on this account.</p>
          ) : (
            <ul className="space-y-3">
              {data.supportSessions.map((session) => (
                <li key={session.id} className="rounded-md border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-ink">{session.adminEmail}</span>
                    <span className="text-xs text-subtle">{formatDateTime(session.startedAt)}</span>
                  </div>
                  <p className="mt-1 text-[0.8125rem] text-muted">{session.reason}</p>
                  <p className="mt-1.5 text-xs text-subtle">
                    {session.endedAt ? `Ended (${session.endReason ?? 'closed'}) ${formatDateTime(session.endedAt)}` : 'Open'} ·{' '}
                    {session.requestCount} requests · {session.blockedCount} blocked
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Block>

        <Block label="Activity" hint="On this account, and by it">
          {data.activity.length === 0 ? (
            <p className="text-sm text-muted">Nothing recorded yet.</p>
          ) : (
            <ul className="max-h-[28rem] space-y-2.5 overflow-y-auto pr-1">
              {data.activity.map((entry) => (
                <li key={entry.id} className="text-[0.8125rem]">
                  <span className="font-mono text-xs text-ink">{entry.action}</span>
                  <span className="text-subtle"> · {entry.actorEmail ?? 'system'} · {formatDateTime(entry.createdAt)}</span>
                  {typeof entry.meta?.reason === 'string' && <span className="block text-muted">{entry.meta.reason}</span>}
                </li>
              ))}
            </ul>
          )}
        </Block>
      </div>

      {/* ── Delete ──────────────────────────────────────────────────── */}
      {!locked && (
        <Block label="Delete account" className="mt-10">
          <p className="flex items-start gap-2.5 text-sm font-medium text-danger">
            <Trash2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            Permanently removes the account and everything belonging to it.
          </p>
          <p className="mt-1.5 max-w-2xl text-[0.8125rem] leading-relaxed text-muted">
            Profile, photographs and their files, spaces, orders and invoices go with it. This cannot be undone - to
            stop access instead, suspend the account above.
          </p>
          <div className="mt-3 flex max-w-xl flex-wrap items-end gap-3">
            <Field label={`Type ${user.email} to confirm`} htmlFor="confirm-delete" className="min-w-0 flex-1">
              <Input id="confirm-delete" value={confirmDelete} onChange={(event) => setConfirmDelete(event.target.value)} autoComplete="off" />
            </Field>
            <Button
              variant="danger"
              loading={deleteUser.isPending}
              disabled={confirmDelete.trim().toLowerCase() !== user.email.toLowerCase()}
              onClick={() => deleteUser.mutate()}
            >
              Delete permanently
            </Button>
          </div>
        </Block>
      )}

      {data.orders.length === 0 && data.payments.length === 0 && data.activity.length === 0 && (
        <EmptyState icon={<UserRound />} title="A quiet account." description="No orders, payments or recorded activity yet." className="mt-10" />
      )}

      <AssistUserDialog
        open={assisting}
        onOpenChange={setAssisting}
        user={{ id: user.id, email: user.email, name }}
      />
    </div>
  );
}

function Detail({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className={label}>{term}</dt>
      <dd className="mt-1 break-words text-ink-soft">{children}</dd>
    </div>
  );
}

/**
 * The branch a member of staff works in. It decides which orders, expenses and
 * figures they see (the API enforces it on every request); moving someone takes
 * effect at their next click. Customers and photographers have no branch.
 */
function BranchBlock({
  userId,
  current,
  editable,
  onChanged,
}: {
  userId: string;
  current: string | null;
  editable: boolean;
  onChanged: () => void;
}) {
  const { data } = useQuery({ queryKey: ['admin', 'people', 'branches'], queryFn: () => peopleService.branches() });
  const branches = data?.branches ?? [];
  const effective = current ?? branches[0] ?? '';
  const [branch, setBranch] = React.useState('');
  const [reason, setReason] = React.useState('');
  React.useEffect(() => setBranch(effective), [effective]);

  const move = useMutation({
    mutationFn: () => peopleService.changeBranch(userId, branch, reason.trim() || undefined),
    onSuccess: () => {
      toast.success(`Moved to ${branch}.`);
      setReason('');
      onChanged();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Block
      label="Branch"
      hint={editable ? 'Decides which orders, expenses and figures they see.' : 'Read only for your role'}
    >
      <Field label="Works in" hint={current ? undefined : `Not set, so ${effective || 'the first branch'}.`}>
        <SimpleSelect
          value={branch}
          onValueChange={setBranch}
          disabled={!editable || branches.length === 0}
          options={branches.map((name) => ({ value: name, label: name }))}
        />
      </Field>
      {editable && branch && branch !== effective && (
        <>
          <Field label="Reason" htmlFor="branch-reason" className="mt-3">
            <Input id="branch-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Transferred to the new studio" />
          </Field>
          <Button className="mt-3" size="sm" loading={move.isPending} onClick={() => move.mutate()}>
            Move to {branch}
          </Button>
        </>
      )}
    </Block>
  );
}
