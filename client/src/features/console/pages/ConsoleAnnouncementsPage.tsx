import { ANNOUNCEMENT_LIMITS, formatDateTime, type AnnouncementAudience } from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Send, UserRound } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/display';
import { CharCount, Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/select';
import { SegmentedList, SegmentedTrigger, Tabs } from '@/components/ui/tabs';
import { errorMessage } from '@/lib/api';
import { announcementService } from '@/services/announcement.service';

/**
 * Console → Notifications.
 *
 * Reachable by the CEO, the manager and the IT team — the `announcements`
 * module, which no other role holds.
 *
 * The screen is built around one fact: a notification cannot be recalled. So the
 * recipient count is shown next to the audience *before* sending, the send goes
 * through a confirmation naming the audience and the number, and every send is
 * listed underneath with who sent it. Nothing here is undoable, so everything
 * here is deliberate.
 */
export default function ConsoleAnnouncementsPage() {
  const queryClient = useQueryClient();

  const [mode, setMode] = React.useState<'audience' | 'direct'>('audience');
  const [audience, setAudience] = React.useState<AnnouncementAudience>('artist');
  const [email, setEmail] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [link, setLink] = React.useState('');
  const [confirming, setConfirming] = React.useState(false);

  const { data: audiences, isLoading: loadingAudiences } = useQuery({
    queryKey: ['announcements', 'audiences'],
    queryFn: () => announcementService.audiences(),
    staleTime: 60 * 1000,
  });

  const { data: history } = useQuery({
    queryKey: ['announcements', 'history'],
    queryFn: () => announcementService.history(),
  });

  const selected = audiences?.find((entry) => entry.value === audience);
  const reach = mode === 'direct' ? 1 : (selected?.recipients ?? 0);

  const reset = () => {
    setTitle('');
    setBody('');
    setLink('');
    setEmail('');
  };

  const send = useMutation({
    mutationFn: () => {
      const shared = { title: title.trim(), body: body.trim(), link: link.trim() || undefined };
      return mode === 'direct'
        ? announcementService.sendDirect({ ...shared, email: email.trim() })
        : announcementService.send({ ...shared, audience });
    },
    onSuccess: (result) => {
      setConfirming(false);
      reset();
      void queryClient.invalidateQueries({ queryKey: ['announcements', 'history'] });
      toast.success(
        result.sent === 1
          ? `Sent to ${result.audienceLabel}`
          : `Sent to ${result.sent} accounts - ${result.audienceLabel}`,
      );
    },
    onError: (error) => {
      setConfirming(false);
      toast.error(errorMessage(error));
    },
  });

  const titleOk = title.trim().length >= ANNOUNCEMENT_LIMITS.title.min;
  const bodyOk = body.trim().length >= ANNOUNCEMENT_LIMITS.body.min;
  const targetOk = mode === 'direct' ? /.+@.+\..+/.test(email.trim()) : reach > 0;
  const ready = titleOk && bodyOk && targetOk && !send.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Send a notification to an audience, or to one account. It appears in their notification bell the next time they open the site."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Compose</CardTitle>
            <CardDescription>
              This cannot be recalled once sent, so check the audience and the count before you
              send it.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            <Tabs
              value={mode}
              onValueChange={(next) => setMode(next as 'audience' | 'direct')}
            >
              <SegmentedList>
                <SegmentedTrigger value="audience">
                  <Megaphone className="mr-1.5 inline size-3.5" aria-hidden /> An audience
                </SegmentedTrigger>
                <SegmentedTrigger value="direct">
                  <UserRound className="mr-1.5 inline size-3.5" aria-hidden /> One account
                </SegmentedTrigger>
              </SegmentedList>
            </Tabs>

            {mode === 'audience' ? (
              <Field
                label="Send to"
                htmlFor="audience"
                hint={
                  loadingAudiences
                    ? 'Counting accounts…'
                    : reach === 0
                      ? 'There are no active accounts in this audience.'
                      : `${reach} active ${reach === 1 ? 'account' : 'accounts'} will receive this.`
                }
              >
                {loadingAudiences ? (
                  <Skeleton className="h-11 w-full rounded-md" />
                ) : (
                  <SimpleSelect
                    id="audience"
                    value={audience}
                    onValueChange={(value) => setAudience(value as AnnouncementAudience)}
                    options={(audiences ?? []).map((entry) => ({
                      value: entry.value,
                      // The count belongs in the option itself — picking the
                      // audience and knowing its size is one decision.
                      label: `${entry.label} - ${entry.recipients}`,
                    }))}
                  />
                )}
              </Field>
            ) : (
              <Field
                label="Account email"
                htmlFor="email"
                hint="The address the account is registered to."
              >
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                />
              </Field>
            )}

            <Field
              label="Title"
              htmlFor="title"
              aside={<CharCount value={title} max={ANNOUNCEMENT_LIMITS.title.max} />}
            >
              <Input
                id="title"
                value={title}
                maxLength={ANNOUNCEMENT_LIMITS.title.max}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Your photograph is going up at a new space"
              />
            </Field>

            <Field
              label="Message"
              htmlFor="body"
              aside={<CharCount value={body} max={ANNOUNCEMENT_LIMITS.body.max} />}
            >
              <Textarea
                id="body"
                rows={5}
                value={body}
                maxLength={ANNOUNCEMENT_LIMITS.body.max}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Write it the way you would say it. This is what they read in the bell."
              />
            </Field>

            <Field
              label="Link"
              htmlFor="link"
              hint="Optional. A path inside the site - /studio/portfolio - so the notification can be acted on."
            >
              <Input
                id="link"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder="/studio/portfolio"
              />
            </Field>

            <div className="flex flex-wrap items-center gap-3 border-t border-line-soft pt-5">
              <Button disabled={!ready} onClick={() => setConfirming(true)}>
                <Send /> Send
              </Button>
              {(title || body || link || email) && (
                <Button variant="ghost" onClick={reset} disabled={send.isPending}>
                  Clear
                </Button>
              )}
              <p className="ml-auto text-xs text-subtle">In-app only - no email is sent.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Already sent</CardTitle>
            <CardDescription>
              Every notification sent from here, with who sent it. Read from the audit log.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {history === undefined ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="h-14 w-full rounded-md" />
                ))}
              </div>
            ) : history.length === 0 ? (
              <p className="rounded-md border border-dashed border-line-strong bg-sand-soft px-4 py-8 text-center text-sm text-muted">
                Nothing has been sent yet.
              </p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {history.map((entry) => (
                  <li key={entry.id} className="py-3">
                    <p className="text-sm font-medium text-ink">{entry.title}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {entry.recipients} {entry.recipients === 1 ? 'recipient' : 'recipients'}
                      {entry.audience ? ` · ${entry.audience}` : ''}
                    </p>
                    <p className="mt-0.5 text-xs text-subtle">
                      {formatDateTime(entry.at)}
                      {entry.by ? ` · ${entry.by}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/*
        The confirmation names the audience and the number. A dialog that only
        said "Are you sure?" would add a click without adding a decision.
      */}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Send to {mode === 'direct' ? email.trim() : (selected?.label ?? 'this audience')}?
            </DialogTitle>
            <DialogDescription>
              {mode === 'direct'
                ? 'This goes to that one account.'
                : `This goes to ${reach} ${reach === 1 ? 'account' : 'accounts'} and cannot be recalled.`}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-line bg-sand-soft px-4 py-3">
            <p className="text-sm font-medium text-ink">{title.trim()}</p>
            <p className="mt-1 whitespace-pre-line text-sm text-muted">{body.trim()}</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={send.isPending}>
              Back
            </Button>
            <Button loading={send.isPending} onClick={() => send.mutate()}>
              <Send /> Send now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
