import {
  ANNOUNCEMENT_AUDIENCE_LABELS,
  ANNOUNCEMENT_AUDIENCES,
  announcementSchema,
  type AnnouncementInput,
} from '@artinu/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Megaphone, Send, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/select';
import { errorMessage } from '@/lib/api';
import { notificationService } from '@/services/notification.service';

/**
 * Send one notification to every artist, every space owner, or both.
 *
 * ── Where this came from ────────────────────────────────────────────────────
 *
 * The 20 Aug review: "Manager, IT and ceo should have an access to send
 * notifications to artists and all other accounts respectively."
 *
 * ── Why it lives under Content ──────────────────────────────────────────────
 *
 * `ROLE_MODULES` already decides who sees what, and `content` is the only
 * module those three roles share — manager cannot reach `system` or `users`,
 * accounts and operations cannot reach `content`. Putting the screen here means
 * the three roles named in the review can use it and nobody else can, without
 * inventing a permission.
 *
 * ── Why there is a confirmation step ────────────────────────────────────────
 *
 * Everything else in the console edits one row. This writes a message into the
 * notification bell of every account on the platform at once, and there is no
 * unsend. The dialog exists so that reaching that outcome takes two deliberate
 * actions and shows the audience in words before the second one.
 */
export default function ConsoleAnnouncementsPage() {
  const [confirming, setConfirming] = React.useState<AnnouncementInput | null>(null);
  const [lastResult, setLastResult] = React.useState<{ sent: number; audience: string } | null>(
    null,
  );

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors },
  } = useForm<AnnouncementInput>({
    resolver: zodResolver(announcementSchema),
    defaultValues: { audience: 'artists', title: '', body: '', link: '' },
  });

  const send = useMutation({
    mutationFn: (input: AnnouncementInput) => notificationService.announce(input),
    onSuccess: (result) => {
      setLastResult(result);
      setConfirming(null);
      reset({ audience: 'artists', title: '', body: '', link: '' });
      toast.success(
        result.sent === 0
          ? 'Nobody in that audience yet — nothing was sent.'
          : `Sent to ${result.sent} ${result.sent === 1 ? 'account' : 'accounts'}.`,
      );
    },
    onError: (error) => {
      setConfirming(null);
      toast.error(errorMessage(error));
    },
  });

  const audience = watch('audience');
  const title = watch('title');
  const body = watch('body');

  return (
    <div>
      <PageHeader
        icon={Megaphone}
        title="Announcements"
        description="Send one notification to every artist or space owner. It appears in their notification bell."
      />

      {/* No SubNav strip. The other two Content screens do not use one, and the
          sidebar already lists all three as separate destinations — adding it
          on this page alone would be a navigation pattern that exists once. */}

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section>
          <form
            onSubmit={handleSubmit((values) => setConfirming(values))}
            className="space-y-4"
          >
            <Field label="Send to" error={errors.audience?.message} required>
              <Controller
                control={control}
                name="audience"
                render={({ field }) => (
                  <SimpleSelect
                    value={field.value}
                    onValueChange={field.onChange}
                    options={ANNOUNCEMENT_AUDIENCES.map((value) => ({
                      value,
                      label: ANNOUNCEMENT_AUDIENCE_LABELS[value],
                    }))}
                  />
                )}
              />
            </Field>

            <Field label="Subject" htmlFor="title" required error={errors.title?.message}>
              <Input
                id="title"
                placeholder="A short line — this is the bold text in the bell"
                maxLength={120}
                invalid={!!errors.title}
                {...register('title')}
              />
            </Field>

            <Field label="Message" htmlFor="body" required error={errors.body?.message}>
              <Textarea
                id="body"
                rows={6}
                maxLength={1000}
                placeholder="What you want them to know."
                invalid={!!errors.body}
                {...register('body')}
              />
            </Field>

            <Field
              label="Link"
              htmlFor="link"
              error={errors.link?.message}
              hint="Optional. A path on ARTINU, e.g. /studio/upload — not a full web address."
            >
              <Input
                id="link"
                placeholder="/gallery"
                invalid={!!errors.link}
                {...register('link')}
              />
            </Field>

            <Button type="submit" loading={send.isPending}>
              <Send /> Review and send
            </Button>
          </form>
        </section>

        {/*
          What the recipient will see, rendered from the same fields rather than
          described in help text. An announcement cannot be recalled, so the
          most useful thing this screen can do is show the message the way it
          will actually arrive.
        */}
        <aside>
          <h2 className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-bronze">
            Preview
          </h2>
          <div className="mt-4 rounded-lg border border-line bg-canvas p-5">
            <div className="flex gap-3">
              <span
                className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-bronze-soft text-bronze"
                aria-hidden
              >
                <Megaphone className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {title.trim() || 'Your subject line'}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted">
                  {body.trim() || 'Your message will appear here.'}
                </p>
                <p className="mt-2 font-label text-[0.625rem] uppercase tracking-[0.14em] text-subtle">
                  Just now
                </p>
              </div>
            </div>
          </div>

          <p className="mt-4 text-sm text-muted">
            Going to <span className="font-medium text-ink">{ANNOUNCEMENT_AUDIENCE_LABELS[audience]}</span>.
            Suspended accounts are skipped.
          </p>

          {lastResult && (
            <p className="mt-3 text-sm text-success">
              Last announcement reached {lastResult.sent}{' '}
              {lastResult.sent === 1 ? 'account' : 'accounts'}.
            </p>
          )}
        </aside>
      </div>

      <Dialog open={Boolean(confirming)} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send this to {confirming ? ANNOUNCEMENT_AUDIENCE_LABELS[confirming.audience].toLowerCase() : ''}?</DialogTitle>
            <DialogDescription>
              It lands in the notification bell of every account in that audience. There is no
              way to unsend it.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-3 rounded-md border border-warning/30 bg-warning-soft p-4">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <p className="text-sm text-warning">
              &ldquo;{confirming?.title}&rdquo;
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Back to editing
            </Button>
            <Button
              loading={send.isPending}
              onClick={() => confirming && send.mutate(confirming)}
            >
              <Send /> Send it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
