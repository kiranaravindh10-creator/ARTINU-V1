import { formatDateTime, formatRelative } from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info, Mails, RefreshCw, Search, Send, Trash2, UserRound } from 'lucide-react';
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
import { EmptyState, Skeleton } from '@/components/ui/display';
import { Input } from '@/components/ui/input';
import { StatGrid, StatTile } from '@/components/ui/stat';
import { errorMessage } from '@/lib/api';
import { adminService } from '@/services/admin.service';
import { cn } from '@/lib/utils';

/**
 * Every message the app has sent, with the rendered body.
 *
 * Without a mail provider configured there is otherwise no way to check that a
 * consultation confirmation or a moderation decision actually fired, or to see
 * how it reads. Once SMTP is live this stays useful as a delivery log.
 */
export default function ConsoleMailPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState('');
  const [actor, setActor] = React.useState('');
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [testOpen, setTestOpen] = React.useState(false);
  const [testTo, setTestTo] = React.useState('');

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'mail', search, actor],
    queryFn: () =>
      adminService.mailbox({
        ...(search ? { to: search } : {}),
        ...(actor ? { actor } : {}),
      }),
    refetchInterval: 15_000,
  });

  const { data: openMail } = useQuery({
    queryKey: ['admin', 'mail', openId],
    queryFn: () => adminService.mail(openId!),
    enabled: Boolean(openId),
  });

  const sendTest = useMutation({
    mutationFn: (to: string) => adminService.sendTestMail(to),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'mail'] });
      setTestOpen(false);
      if (result.delivered) toast.success(result.message);
      else toast.warning(result.message);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const clear = useMutation({
    mutationFn: () => adminService.clearMailbox(),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'mail'] });
      setConfirmClear(false);
      toast.success(`Cleared ${result.cleared} message${result.cleared === 1 ? '' : 's'}`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div>
      <PageHeader
        eyebrow="System"
        title="Email log"
        description="Every message ARTINU has sent, and exactly how it looked."
        actions={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setTestOpen(true)}>
              <Send /> Send a test
            </Button>
            <Button variant="outline" size="sm" onClick={() => void refetch()} loading={isFetching}>
              <RefreshCw /> Refresh
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmClear(true)}
              disabled={!data?.captured}
            >
              <Trash2 /> Clear
            </Button>
          </div>
        }
      />

      <SubNav
        items={[
          { to: '/console/system', label: 'Health', end: true },
          { to: '/console/system/mail', label: 'Email log' },
        ]}
      />

      {data && !data.smtpConfigured && (
        <div className="mb-6 flex gap-3 rounded-lg border border-warning/30 bg-warning-soft p-4">
          <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <div className="text-sm text-warning">
            <p className="font-medium">No mail provider is configured.</p>
            <p className="mt-0.5 leading-relaxed">
              Nothing is actually being delivered — messages are captured here instead so every flow
              stays verifiable. Set <code className="font-mono text-xs">SMTP_HOST</code> and{' '}
              <code className="font-mono text-xs">SMTP_USER</code> in <code className="font-mono text-xs">.env</code>{' '}
              to send for real.
            </p>
          </div>
        </div>
      )}

      <StatGrid columns={3} className="mb-6">
        <StatTile label="Captured" value={data?.captured ?? 0} icon={Mails} />
        <StatTile
          label="Delivered"
          value={data?.delivered ?? 0}
          hint={data?.smtpConfigured ? 'Accepted by the provider' : 'Needs SMTP'}
        />
        <StatTile
          label="Last sent"
          value={data?.lastSentAt ? formatRelative(data.lastSentAt) : '—'}
          format="raw"
        />
      </StatGrid>

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter by recipient…"
          icon={<Search />}
          aria-label="Filter by recipient"
          className="max-w-xs"
        />
        <Input
          value={actor}
          onChange={(event) => setActor(event.target.value)}
          placeholder="Filter by who triggered it…"
          icon={<UserRound />}
          aria-label="Filter by the account that triggered it"
          className="max-w-xs"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-line">
              {data.items.map((mail) => (
                <li key={mail.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(mail.id)}
                    className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-sand-soft"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{mail.subject}</p>
                      <p className="truncate text-xs text-muted">
                        to {mail.to} · {formatDateTime(mail.sentAt)}
                      </p>
                      <p className="truncate text-xs text-subtle">
                        {mail.triggeredBy
                          ? `triggered by ${mail.triggeredBy.email} (${mail.triggeredBy.role.replace('_', ' ')})`
                          : 'triggered by a public action'}
                        {mail.trigger ? ` · ${mail.trigger}` : ''}
                      </p>
                    </div>
                    <Badge variant={mail.delivered ? 'success' : 'neutral'}>
                      {mail.delivered ? 'Sent' : 'Captured'}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={<Mails />}
          title={search ? 'Nothing to that address.' : 'No email yet.'}
          description={
            search
              ? 'Try a different recipient.'
              : 'Book a consultation, upload a photograph or approve one — the message will appear here.'
          }
        />
      )}

      {/* Reading pane */}
      <Dialog open={Boolean(openId)} onOpenChange={(open) => !open && setOpenId(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{openMail?.subject ?? 'Loading…'}</DialogTitle>
            <DialogDescription>
              {openMail ? (
                <>
                  To {openMail.to} · {formatDateTime(openMail.sentAt)}
                  <br />
                  {openMail.triggeredBy
                    ? `Triggered by ${openMail.triggeredBy.email} (${openMail.triggeredBy.role.replace('_', ' ')})`
                    : 'Triggered by a public action — no signed-in account'}
                  {openMail.trigger ? ` · ${openMail.trigger}` : ''}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          {openMail ? (
            <div className="overflow-hidden rounded-md border border-line">
              {/* srcDoc keeps the email body sandboxed from the console itself. */}
              <iframe
                title={`Email: ${openMail.subject}`}
                srcDoc={openMail.html}
                sandbox=""
                className="h-[28rem] w-full bg-white"
              />
            </div>
          ) : (
            <Skeleton className="h-96 w-full" />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Send a test email</DialogTitle>
            <DialogDescription>
              {data?.smtpConfigured
                ? 'This goes through your configured provider — check the inbox, and the spam folder.'
                : 'No provider is configured, so this will be captured here rather than delivered.'}
            </DialogDescription>
          </DialogHeader>

          <Input
            type="email"
            value={testTo}
            onChange={(event) => setTestTo(event.target.value)}
            placeholder="you@example.com"
            aria-label="Send the test to"
          />

          <DialogFooter>
            <Button variant="ghost" onClick={() => setTestOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={sendTest.isPending}
              disabled={!testTo.includes('@')}
              onClick={() => sendTest.mutate(testTo)}
            >
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Clear the email log?</DialogTitle>
            <DialogDescription>
              This removes all {data?.captured ?? 0} captured messages. It does not affect anything
              already delivered.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              Keep them
            </Button>
            <Button variant="danger" loading={clear.isPending} onClick={() => clear.mutate()}>
              Clear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
