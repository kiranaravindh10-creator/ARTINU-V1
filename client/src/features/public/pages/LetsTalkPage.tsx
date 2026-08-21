import {
  consultationSchema,
  CONTACT,
  SPACE_TYPE_LABELS,
  SPACE_TYPES,
  type ConsultationInput,
} from '@artinu/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Headphones,
  Mail,
  MessageCircle,
  Phone,
  User,
  Video,
} from 'lucide-react';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { CircleArrowLink, Container, Section } from '@/components/layout/primitives';
import { Reveal } from '@/components/motion/reveal';
import { Typewriter } from '@/components/motion/typewriter';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { LocationInput } from '@/components/ui/location-input';
import { Photo } from '@/components/ui/photo';
import { SimpleSelect } from '@/components/ui/select';
import { errorMessage } from '@/lib/api';
import { IMAGES } from '@/lib/images';
import { publicService } from '@/services/public.service';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const toKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/*
  Four things that actually happen, rather than four qualities.

  This read "Personalized Guidance · Expert Insights · Tailored Recommendations
  · Seamless Experience", with bodies to match ("From concept to execution,
  we've got you"). Every line could have sat on any company's website, which is
  the tell — a space owner deciding whether to give up forty minutes learns
  nothing from it. These say what the visit is.
*/
/*
  Four reasons, no glyphs.

  A lightbulb for "A proposal, not a catalogue" and a sparkle for "One team,
  start to finish" were decoration standing in for meaning, and a row of four
  outlined discs is the single most recognisable tell of a generated feature
  grid. The headings say it; the discs only said it again, less clearly.
*/
const WHY = [
  {
    title: 'Forty minutes, in the room',
    body: 'We look at your light through the day, your wall colours, how people move through the space.',
  },
  {
    title: 'A proposal, not a catalogue',
    body: 'You get photographs chosen for your walls, not a gallery to scroll through.',
  },
  {
    title: 'One team, start to finish',
    body: 'The people who read the room are the ones who print, frame and hang the work.',
  },
  { title: 'Nothing to sign', body: 'The consultation is free, and it can end there.' },
];

/**
 * The hero answers back when you pick a space type — the headline, the sentence
 * under it and the photograph all change to the room being talked about, so the
 * page is about *your* space from the first line rather than a generic one.
 *
 * `headline` is split into lines so the display type breaks where it is meant
 * to rather than wherever the column happens to run out.
 */
interface SpaceHero {
  headline: string[];
  blurb: string;
  image: string;
  alt: string;
}

const DEFAULT_HERO: SpaceHero = {
  headline: ['Let’s bring', 'your space', 'to life.'],
  blurb:
    'Tell us about your space and your vision. We’ll schedule a personalized consultation to understand your needs better.',
  image: IMAGES.cafeWindow,
  alt: 'A framed photograph beside a sunlit café window',
};

const SPACE_HEROES: Partial<Record<(typeof SPACE_TYPES)[number], SpaceHero>> = {
  cafe: {
    headline: ['Let’s bring', 'your space', 'to life.'],
    blurb:
      'Long walls, long stays, regulars who notice. Tell us about your café and we’ll bring photography that rewards a second look on the fourth visit.',
    image: IMAGES.cafeInterior,
    alt: 'Café interior with framed photographs above the counter seating',
  },
  office: {
    headline: ['Let’s bring', 'your space', 'to your office.'],
    blurb:
      'Meeting rooms and quiet corners that should not feel like an airport lounge. Tell us about your office and we’ll propose work that holds a room without shouting in it.',
    image: IMAGES.officeDesk,
    alt: 'Open-plan office wall with framed photography beside the desks',
  },
  home_decor: {
    headline: ['Let’s bring', 'ARTINU into', 'your home.'],
    blurb:
      'Photography chosen for the room you actually live in — your light, your wall colours, your ceiling heights. Printed, framed and hung by us, and changed for new work whenever the room starts to feel settled.',
    image: IMAGES.home_decor,
    alt: 'A bright living room with seating and soft daylight',
  },
};

const heroFor = (type: string | undefined): SpaceHero =>
  (type && SPACE_HEROES[type as (typeof SPACE_TYPES)[number]]) || DEFAULT_HERO;

export default function LetsTalkPage() {
  const [params] = useSearchParams();
  const presetType = params.get('type');

  const [month, setMonth] = React.useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [booked, setBooked] = React.useState<ConsultationInput | null>(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ConsultationInput>({
    resolver: zodResolver(consultationSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      spaceType: (SPACE_TYPES as readonly string[]).includes(presetType ?? '')
        ? (presetType as ConsultationInput['spaceType'])
        : undefined,
      location: '',
      message: '',
      mode: 'video',
      preferredDate: '',
      preferredSlot: '',
    },
  });

  const selectedDate = watch('preferredDate');
  const selectedSlot = watch('preferredSlot');
  const mode = watch('mode');
  const spaceType = watch('spaceType');

  // Follows the select immediately, and honours ?type= on first paint.
  const hero = heroFor(spaceType);

  const queryClient = useQueryClient();

  const { data: availability } = useQuery({
    queryKey: ['consultation-slots', selectedDate],
    queryFn: () => publicService.slots(selectedDate),
    enabled: Boolean(selectedDate),
    // The server is the authority on what is still free; don't serve a stale
    // calendar from cache when someone comes back to the tab.
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  // Only one consultation runs at a time, so a slot taken anywhere — another
  // visitor, another space type, the console — has to disappear here too. The
  // server pushes the booking and we refetch the day being looked at.
  React.useEffect(() => {
    const base = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/+$/, '');
    const source = new EventSource(`${base}/events/content`);

    const onBooked = () => {
      void queryClient.invalidateQueries({ queryKey: ['consultation-slots'] });
    };

    source.addEventListener('consultation-booked', onBooked);
    // A dropped stream must not leave the calendar showing slots that are gone.
    source.onerror = () => source.close();

    return () => {
      source.removeEventListener('consultation-booked', onBooked);
      source.close();
    };
  }, [queryClient]);

  const book = useMutation({
    mutationFn: (input: ConsultationInput) => publicService.bookConsultation(input),
    onSuccess: (_result, input) => {
      setBooked(input);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      // Most likely cause is the slot having gone in the meantime — pull the
      // fresh calendar so the visitor can see what is actually still open
      // instead of clicking the same dead time again.
      void queryClient.invalidateQueries({ queryKey: ['consultation-slots'] });
      setValue('preferredSlot', '');
    },
  });

  // ── Calendar grid, Monday-first, with adjacent months greyed out ──────────
  const days = React.useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - offset);

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [month]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (booked) {
    return <BookingConfirmation booking={booked} />;
  }

  return (
    <>
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="grid items-stretch lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="flex flex-col justify-center px-5 py-14 sm:px-8 lg:py-20 lg:pl-12 lg:pr-16">
          <Reveal>
            <p className="eyebrow">Book a consultation</p>
            <Typewriter as="h1" className="mt-5 font-display text-[2.5rem] leading-[1.05] text-ink sm:text-[3.25rem]">
              {hero.headline.map((line, index) => (
                <React.Fragment key={line}>
                  {index > 0 && <br />}
                  {line}
                </React.Fragment>
              ))}
            </Typewriter>
            <span className="rule mt-7" />
            <p className="prose-quiet mt-7 max-w-sm">{hero.blurb}</p>
            <CircleArrowLink to="#form" direction="down" className="mt-9">
              What to expect
            </CircleArrowLink>
          </Reveal>
        </div>

        {/*
          Keyed on the image so React swaps the element rather than mutating the
          src — that lets the fade actually run when the space type changes.
        */}
        <Photo
          key={hero.image}
          src={hero.image}
          alt={hero.alt}
          priority
          className="min-h-[240px] animate-fade-in lg:min-h-[30rem]"
        />
      </section>

      {/* ── The form ───────────────────────────────────────────────────── */}
      <Section id="form" size="compact">
        <Container>
          <form
            onSubmit={handleSubmit((values) => book.mutate(values))}
            className="grid overflow-hidden rounded-xl border border-line bg-surface shadow-card lg:grid-cols-2"
          >
            {/* Left: about your space */}
            <div className="space-y-5 p-6 sm:p-9">
              <h2 className="font-display text-xl text-ink">Tell us about your space</h2>

              <Field label="Your Name" htmlFor="name" required error={errors.name?.message}>
                <Input id="name" placeholder="Full name" invalid={!!errors.name} {...register('name')} />
              </Field>

              <Field label="Email Address" htmlFor="email" required error={errors.email?.message}>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  invalid={!!errors.email}
                  {...register('email')}
                />
              </Field>

              <Field label="Phone Number" htmlFor="phone" required error={errors.phone?.message}>
                <div className="flex gap-2">
                  <span className="flex h-11 shrink-0 items-center rounded-md border border-line bg-sand-soft px-3 text-sm text-muted">
                    +91
                  </span>
                  <Input
                    id="phone"
                    placeholder="98765 43210"
                    invalid={!!errors.phone}
                    {...register('phone')}
                  />
                </div>
              </Field>

              <Field label="Type of Space" required error={errors.spaceType?.message}>
                <Controller
                  control={control}
                  name="spaceType"
                  render={({ field }) => (
                    <SimpleSelect
                      value={field.value}
                      onValueChange={field.onChange}
                      invalid={!!errors.spaceType}
                      placeholder="Select space type"
                      options={SPACE_TYPES.map((type) => ({
                        value: type,
                        label: SPACE_TYPE_LABELS[type],
                      }))}
                    />
                  )}
                />
              </Field>

              <Field label="Location" htmlFor="location" required error={errors.location?.message}>
            <Controller
              name="location"
              control={control}
              render={({ field }) => (
                <LocationInput
                  id="location"
                  name={field.name}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="Start typing your city or area"
                  invalid={!!errors.location}
                />
              )}
            />
              </Field>

              <Field label="Tell us more about your space" htmlFor="message" error={errors.message?.message}>
                <Textarea
                  id="message"
                  rows={4}
                  placeholder="Share details about your space, size, usage, ambience or anything you'd like us to know."
                  {...register('message')}
                />
              </Field>

              <Field label="Preferred Consultation Mode" error={errors.mode?.message}>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: 'video', label: 'Video Call', icon: Video },
                    { value: 'in_person', label: 'In-Person', icon: User },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setValue('mode', option.value as 'video' | 'in_person')}
                      aria-pressed={mode === option.value}
                      className={cn(
                        'flex items-center justify-center gap-2 rounded-md border px-4 py-3 text-sm transition-all',
                        mode === option.value
                          ? 'border-ink bg-sand text-ink'
                          : 'border-line text-muted hover:border-line-strong hover:text-ink',
                      )}
                    >
                      <option.icon className="size-4" aria-hidden />
                      {option.label}
                    </button>
                  ))}
                </div>
              </Field>

              <Button
                type="submit"
                shape="pill"
                size="lg"
                loading={isSubmitting || book.isPending}
                className="mt-2 w-full sm:w-auto"
              >
                Book my consultation
              </Button>
            </div>

            {/* Right: date and time */}
            <div className="space-y-5 border-t border-line p-6 sm:p-9 lg:border-l lg:border-t-0">
              <h2 className="font-display text-xl text-ink">Pick a date &amp; time</h2>

              <div>
                <div className="flex items-center justify-between">
                  <p className="font-display text-lg text-ink">
                    {MONTHS[month.getMonth()]} {month.getFullYear()}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Previous month"
                      onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                    >
                      <ChevronLeft />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Next month"
                      onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                    >
                      <ChevronRight />
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-7 gap-1 text-center">
                  {WEEKDAYS.map((day) => (
                    <span
                      key={day}
                      className="pb-2 font-label text-[0.625rem] uppercase tracking-[0.12em] text-subtle"
                    >
                      {day}
                    </span>
                  ))}

                  {days.map((date) => {
                    const key = toKey(date);
                    const outside = date.getMonth() !== month.getMonth();
                    const past = date < today;
                    const selected = selectedDate === key;

                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={past}
                        aria-pressed={selected}
                        onClick={() => {
                          setValue('preferredDate', key, { shouldValidate: true });
                          setValue('preferredSlot', '');
                        }}
                        className={cn(
                          'mx-auto flex size-9 items-center justify-center rounded-full text-sm transition-colors',
                          selected && 'bg-ink text-canvas',
                          !selected && !past && !outside && 'text-ink hover:bg-sand',
                          outside && !selected && 'text-subtle/50',
                          past && 'cursor-not-allowed text-subtle/40',
                        )}
                      >
                        {date.getDate()}
                      </button>
                    );
                  })}
                </div>
                {errors.preferredDate && (
                  <p className="mt-2 text-xs text-danger">{errors.preferredDate.message}</p>
                )}
              </div>

              <div>
                <p className="text-sm font-medium text-ink-soft">Available Time Slots</p>

                {!selectedDate ? (
                  <p className="mt-3 text-sm text-subtle">Pick a date to see what&rsquo;s open.</p>
                ) : (
                  <>
                    {availability?.reason && (
                      <p className="mt-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
                        {availability.reason}
                      </p>
                    )}
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {(availability?.slots ?? []).map((slot) => {
                        const selected = selectedSlot === slot.time;
                        return (
                          <button
                            key={slot.time}
                            type="button"
                            disabled={!slot.available}
                            aria-pressed={selected}
                            onClick={() => setValue('preferredSlot', slot.time, { shouldValidate: true })}
                            className={cn(
                              'rounded-md border px-3 py-2.5 text-sm transition-all',
                              selected && 'border-ink bg-ink text-canvas',
                              !selected && slot.available && 'border-line text-ink hover:border-ink',
                              !slot.available && 'cursor-not-allowed border-line text-subtle line-through',
                            )}
                          >
                            {slot.time}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
                {errors.preferredSlot && (
                  <p className="mt-2 text-xs text-danger">{errors.preferredSlot.message}</p>
                )}
              </div>
            </div>
          </form>
        </Container>
      </Section>

      {/* ── Reassurance strip ──────────────────────────────────────────── */}
      <Section size="compact" className="pt-0">
        <Container>
          <div className="grid gap-8 rounded-lg bg-sand px-6 py-8 sm:grid-cols-2 sm:px-10">
            <div className="flex items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line-strong text-bronze">
                <CalendarDays className="size-5" aria-hidden />
              </span>
              <div>
                <h3 className="font-display text-lg text-ink">What happens next?</h3>
                <p className="mt-1 text-sm text-muted">
                  Once you book, we&rsquo;ll confirm your consultation and send you all the details
                  via email.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 sm:border-l sm:border-line-strong sm:pl-10">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line-strong text-bronze">
                <Headphones className="size-5" aria-hidden />
              </span>
              <div>
                <h3 className="font-display text-lg text-ink">Need help?</h3>
                <p className="mt-1 text-sm text-muted">
                  Reach out to us at{' '}
                  <a href={`mailto:${CONTACT.email}`} className="text-bronze underline-offset-4 hover:underline">
                    {CONTACT.email}
                  </a>
                </p>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* ── Why consult ────────────────────────────────────────────────── */}
      <Section size="compact" className="pt-0">
        <Container>
          {/*
            The photograph behind this panel is gone too. It sat at 15% opacity
            under four columns of text — enough for a cup of coffee to be clearly
            readable through the words without ever being looked at, which cost
            the copy contrast and bought atmosphere nobody asked for. Ink on its
            own is the quieter closing note, and the text now has the panel to
            itself.

            The dividers moved from `lg:border-l` to a rule above each column for
            the same reason as the other four-column rows: a left border only
            separates them at the large breakpoint, so on a tablet the four ran
            together as one block.
          */}
          <div className="rounded-xl bg-ink px-6 py-10 text-canvas sm:px-10">
            <h2 className="font-display text-2xl text-canvas">Why consult with ARTINU?</h2>
            <div className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
              {WHY.map((item) => (
                <div key={item.title} className="border-t border-canvas/20 pt-5">
                  <h3 className="font-display text-lg text-canvas">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-canvas/60">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </Section>

      <ContactBlock />
    </>
  );
}

function ContactBlock() {
  const whatsapp = `https://wa.me/${CONTACT.phoneRaw}?text=${encodeURIComponent(
    "Hi ARTINU — I'd like to book a consultation for my space.",
  )}`;

  return (
    <Section size="compact" className="pt-0">
      <Container>
        <div className="grid gap-8 rounded-xl border border-line bg-surface p-8 sm:grid-cols-3 sm:p-10">
          <div>
            <h3 className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-bronze">
              Talk to us
            </h3>
            <a
              href={`tel:${CONTACT.phoneRaw}`}
              className="mt-4 flex items-center gap-2.5 text-sm text-ink transition-colors hover:text-bronze"
            >
              <Phone className="size-4 text-bronze" aria-hidden /> {CONTACT.phone}
            </a>
            <a
              href={`mailto:${CONTACT.email}`}
              className="mt-2.5 flex items-center gap-2.5 text-sm text-ink transition-colors hover:text-bronze"
            >
              <Mail className="size-4 text-bronze" aria-hidden /> {CONTACT.email}
            </a>
            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-line-strong px-4 py-2 font-label text-[0.6875rem] uppercase tracking-[0.14em] text-ink transition-colors hover:bg-sand-soft"
            >
              <MessageCircle className="size-3.5 text-bronze" aria-hidden /> Chat on WhatsApp
            </a>
          </div>

          {/*
            The "Studio" column is gone.

            It printed a street address ARTINU does not publish, followed by
            "Map directions coming soon." — a promise of directions to a place
            with no address. Consultations happen at the client's space, which
            is what the form beside this actually books.
          */}

          <div>
            <h3 className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-bronze">
              Working hours
            </h3>
            <dl className="mt-4 space-y-2 text-sm">
              {CONTACT.hours.map((entry) => (
                <div key={entry.days} className="flex justify-between gap-4">
                  <dt className="text-muted">{entry.days}</dt>
                  <dd className="text-ink">{entry.time}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Container>
    </Section>
  );
}

function BookingConfirmation({ booking }: { booking: ConsultationInput }) {
  return (
    <>
      <Section>
        <Container size="narrow">
          <div className="rounded-xl border border-line bg-surface p-8 text-center shadow-card sm:p-14">
            <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-bronze-soft text-bronze">
              <Check className="size-7" strokeWidth={1.6} aria-hidden />
            </span>
            <p className="eyebrow mt-6">Consultation booked</p>
            <h1 className="mt-4 font-display text-[2rem] leading-tight text-ink sm:text-[2.5rem]">
              We&rsquo;ll see you then.
            </h1>
            <p className="prose-quiet mx-auto mt-4">
              Thanks, {booking.name.split(' ')[0]}. Your consultation is booked for{' '}
              <strong className="text-ink">{booking.preferredDate}</strong> at{' '}
              <strong className="text-ink">{booking.preferredSlot}</strong>,{' '}
              {booking.mode === 'video' ? 'over a video call' : 'at your space'}.
            </p>

            <div className="mx-auto mt-8 max-w-md rounded-lg border border-line bg-canvas-soft p-5 text-left">
              <h2 className="text-sm font-medium text-ink">What happens next</h2>
              <ol className="mt-3 space-y-2 text-sm text-muted">
                <li>1. We confirm the slot by email — check {booking.email}.</li>
                <li>2. A curator reviews your space details before the call.</li>
                <li>3. We bring a first collection idea to the conversation.</li>
              </ol>
            </div>

            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link to="/gallery">Explore the gallery</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/">Back to home</Link>
              </Button>
            </div>
          </div>
        </Container>
      </Section>
      <ContactBlock />
    </>
  );
}
