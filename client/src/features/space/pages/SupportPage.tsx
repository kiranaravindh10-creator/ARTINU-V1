import { CONTACT, formatDateTime, supportTicketSchema, type SupportTicketInput } from '@artinu/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LifeBuoy, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { PanelHeader } from '@/components/layout/DashboardShell';
import { Status, type StatusTone } from '@/components/layout/panel';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/select';
import { errorMessage } from '@/lib/api';
import { qk } from '@/lib/query';
import { publicService } from '@/services/public.service';

const CATEGORIES = [
  { value: 'order', label: 'An order' },
  { value: 'installation', label: 'Installation' },
  { value: 'billing', label: 'Billing or invoices' },
  { value: 'account', label: 'My account' },
  { value: 'other', label: 'Something else' },
];

const STATUS_BADGE = { open: 'warning', in_progress: 'info', resolved: 'success' } as const;

export default function SupportPage() {
  const location = useLocation();
  const prefill = (location.state as { subject?: string } | null)?.subject;
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<SupportTicketInput>({
    resolver: zodResolver(supportTicketSchema),
    defaultValues: { subject: prefill ?? '', category: 'order', message: '' },
  });

  const { data: tickets, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.supportTickets,
    queryFn: () => publicService.tickets(),
  });

  const create = useMutation({
    mutationFn: (input: SupportTicketInput) => publicService.createTicket(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.supportTickets });
      reset({ subject: '', category: 'order', message: '' });
      toast.success('We have your request — someone will be in touch shortly.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const whatsapp = `https://wa.me/${CONTACT.phoneRaw}?text=${encodeURIComponent(
    'Hi ARTINU — I need help with my space.',
  )}`;

  return (
    <div>
      <PanelHeader title="Support" description="Tell us what's happening and a person will answer." />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section>
          <h2 className="border-b border-line pb-2.5 font-display text-xl leading-none text-ink">
            How can we help?
          </h2>
          <div className="pt-6">
            <form onSubmit={handleSubmit((values) => create.mutate(values))} className="space-y-4">
              <Field label="Subject" htmlFor="subject" required error={errors.subject?.message}>
                <Input
                  id="subject"
                  placeholder="A short summary"
                  invalid={!!errors.subject}
                  {...register('subject')}
                />
              </Field>

              <Field label="What's this about?" error={errors.category?.message}>
                <Controller
                  control={control}
                  name="category"
                  render={({ field }) => (
                    <SimpleSelect
                      value={field.value}
                      onValueChange={field.onChange}
                      options={CATEGORIES}
                    />
                  )}
                />
              </Field>

              <Field label="Message" htmlFor="message" required error={errors.message?.message}>
                <Textarea
                  id="message"
                  rows={6}
                  placeholder="Tell us what happened, and what you'd like us to do."
                  invalid={!!errors.message}
                  {...register('message')}
                />
              </Field>

              <Button type="submit" loading={create.isPending}>
                Send request
              </Button>
            </form>
          </div>
        </section>

        <section>
          <h2 className="border-b border-line pb-2.5 font-display text-xl leading-none text-ink">
            Talk to us directly
          </h2>
          <div className="space-y-3 pt-6">
            <a
              href={`tel:${CONTACT.phoneRaw}`}
              className="flex items-center gap-2.5 text-sm text-ink transition-colors hover:text-bronze"
            >
              <Phone className="size-4 text-bronze" aria-hidden /> {CONTACT.phone}
            </a>
            <a
              href={`mailto:${CONTACT.supportEmail}`}
              className="flex items-center gap-2.5 text-sm text-ink transition-colors hover:text-bronze"
            >
              <Mail className="size-4 text-bronze" aria-hidden /> {CONTACT.supportEmail}
            </a>
            <p className="flex items-start gap-2.5 text-sm leading-relaxed text-muted">
              <MapPin className="mt-0.5 size-4 shrink-0 text-bronze" aria-hidden />
              <span>
                {CONTACT.address.line1}
                <br />
                {CONTACT.address.city} {CONTACT.address.pin}
              </span>
            </p>

            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-line-strong px-4 py-2 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-ink transition-colors hover:bg-sand-soft"
            >
              <MessageCircle className="size-3.5 text-bronze" aria-hidden /> Chat on WhatsApp
            </a>

            <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
              {CONTACT.hours.map((entry) => (
                <div key={entry.days} className="flex justify-between gap-4">
                  <dt className="text-muted">{entry.days}</dt>
                  <dd className="text-ink">{entry.time}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </div>

      <section className="mt-8">
        <h2 className="font-display text-xl text-ink">Your requests</h2>

        {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
          <Skeleton className="mt-4 h-40 w-full rounded-lg" />
        ) : tickets && tickets.length > 0 ? (
          <ul className="mt-4 space-y-3">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <div className="border-b border-line-soft py-5 first:pt-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">{ticket.subject}</p>
                        <p className="text-xs text-subtle">
                          {formatDateTime(ticket.createdAt)} · {ticket.category}
                        </p>
                      </div>
                      <Status tone={STATUS_BADGE[ticket.status]}>
                        {ticket.status === 'in_progress'
                          ? 'In progress'
                          : ticket.status === 'resolved'
                            ? 'Resolved'
                            : 'Open'}
                      </Status>
                    </div>

                    <p className="mt-3 text-sm leading-relaxed text-muted">{ticket.message}</p>

                    {ticket.reply && (
                      <div className="mt-4 rounded-md border-l-2 border-bronze bg-sand-soft p-3">
                        <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-bronze">
                          ARTINU
                        </p>
                        <p className="mt-1 text-sm text-ink-soft">{ticket.reply}</p>
                      </div>
                    )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4">
            <EmptyState
              icon={<LifeBuoy />}
              title="No open requests."
              description="Anything you send us will appear here with its status."
            />
          </div>
        )}
      </section>
    </div>
  );
}
