import {
  artistApplicationSchema,
  ART_STYLE_LABELS,
  ART_STYLES,
  CONTACT,
  REFERRAL_SOURCE_LABELS,
  REFERRAL_SOURCES,
  type ArtistApplicationInput,
} from '@artinu/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowRight,
  Camera,
  Check,
  Globe,
  Instagram,
  Lightbulb,
  Lock,
  Mail,
  MapPin,
  Upload,
  User,
  X,
} from 'lucide-react';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Container, Section } from '@/components/layout/primitives';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CharCount, Field, Label } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { LocationInput } from '@/components/ui/location-input';
import { Photo } from '@/components/ui/photo';
import { SimpleSelect } from '@/components/ui/select';
import { errorMessage } from '@/lib/api';
import { IMAGES } from '@/lib/images';
import { publicService } from '@/services/public.service';
import { fileToImageDataUrl, formatBytes } from '@/lib/utils';
import { cn } from '@/lib/utils';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MIN_PHOTOS = 6;
const MAX_PHOTOS = 15;

/*
  NEXT_STEPS lived here - the four-icon "what happens next" row. The section it
  fed is gone (the page you land on after submitting says the same thing), so
  the data and the StepIcon import went with it.
*/

const TIPS = [
  'Share your best and most recent work.',
  'Tell your story and what drives you.',
  'Be honest, authentic, and passionate.',
];

interface Upload {
  name: string;
  size: number;
  dataUrl: string;
}

export default function ApplyPage() {
  const navigate = useNavigate();
  const [uploads, setUploads] = React.useState<Upload[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ArtistApplicationInput>({
    resolver: zodResolver(artistApplicationSchema),
    defaultValues: {
      fullName: '',
      email: '',
      location: '',
      website: '',
      instagram: '',
      journey: '',
      genres: [],
      goals: '',
      referral: '',
      portfolioUrls: [],
      acceptTerms: undefined as never,
    },
  });

  const genres = watch('genres') ?? [];
  const journey = watch('journey') ?? '';
  const goals = watch('goals') ?? '';
  const acceptTerms = watch('acceptTerms');

  const apply = useMutation({
    mutationFn: (input: ArtistApplicationInput) => publicService.apply(input),
    onSuccess: (_result, input) => {
      navigate('/join/submitted', { state: { email: input.email } });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const addFiles = async (files: FileList | File[]) => {
    const accepted: Upload[] = [];

    for (const file of Array.from(files)) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
        toast.error(`${file.name} is not a JPG, PNG or WebP.`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`${file.name} is ${formatBytes(file.size)} - the limit is 10 MB.`);
        continue;
      }
      if (uploads.length + accepted.length >= MAX_PHOTOS) {
        toast.error(`You can upload up to ${MAX_PHOTOS} photographs.`);
        break;
      }
      accepted.push({ name: file.name, size: file.size, dataUrl: await fileToImageDataUrl(file) });
    }

    if (accepted.length === 0) return;
    const next = [...uploads, ...accepted];
    setUploads(next);
    setValue(
      'portfolioUrls',
      next.map((upload) => upload.dataUrl),
      { shouldValidate: true },
    );
  };

  const removeUpload = (index: number) => {
    const next = uploads.filter((_, position) => position !== index);
    setUploads(next);
    setValue(
      'portfolioUrls',
      next.map((upload) => upload.dataUrl),
      { shouldValidate: true },
    );
  };

  const toggleGenre = (value: string) => {
    const next = genres.includes(value)
      ? genres.filter((genre) => genre !== value)
      : genres.length >= 3
        ? genres
        : [...genres, value];

    if (next === genres && !genres.includes(value)) {
      toast('You can choose up to three genres.');
      return;
    }
    setValue('genres', next, { shouldValidate: true });
  };

  const errorList = Object.entries(errors)
    .map(([field, error]) => (error?.message ? { field, message: String(error.message) } : null))
    .filter(Boolean) as { field: string; message: string }[];

  return (
    <>
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="grid items-stretch lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col justify-center px-5 py-14 sm:px-8 lg:py-20 lg:pl-12 lg:pr-16">
          <Reveal>
            <p className="eyebrow">Apply to join</p>
            <h1 className="mt-5 font-display text-[2.5rem] leading-[1.05] text-ink sm:text-[3rem]">
              Your vision.
              <br />
              Our community.
            </h1>
            <span className="rule mt-7" />
            <p className="prose-quiet mt-7 max-w-sm">
              ARTINU is a platform for photographers and visual storytellers. Apply to become a part
              of our global artist community.
            </p>

            <Button shape="pill" size="lg" asChild className="mt-9 w-fit">
              <a href="#application">Start your application →</a>
            </Button>

            <p className="mt-6 flex items-start gap-2.5 text-xs leading-relaxed text-muted">
              <Lock className="mt-0.5 size-3.5 shrink-0 text-bronze" aria-hidden />
              Secure. Private. Only our team can review your application.
            </p>
          </Reveal>
        </div>

        <Photo
          src={IMAGES.prints}
          alt="Printed photographs beside a camera and a notebook"
          priority
          className="min-h-[240px] lg:min-h-[30rem]"
        />
      </section>

      {/* ── Application ────────────────────────────────────────────────── */}
      <Section id="application" size="compact">
        <Container>
          <form onSubmit={handleSubmit((values) => apply.mutate(values))}>
            <div className="grid overflow-hidden rounded-xl border border-line bg-surface shadow-card lg:grid-cols-3">
              {/* 1 · Your information */}
              <div className="space-y-5 p-6 sm:p-8">
                <h2 className="font-display text-lg text-ink">1. Your Information</h2>

                <Field label="Full Name" htmlFor="fullName" required error={errors.fullName?.message}>
                  <Input
                    id="fullName"
                    icon={<User />}
                    placeholder="Enter your full name"
                    invalid={!!errors.fullName}
                    {...register('fullName')}
                  />
                </Field>

                <Field label="Email Address" htmlFor="email" required error={errors.email?.message}>
                  <Input
                    id="email"
                    type="email"
                    icon={<Mail />}
                    placeholder="Enter your email"
                    invalid={!!errors.email}
                    {...register('email')}
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
                    placeholder="Start typing your city"
                    invalid={!!errors.location}
                  />
                )}
              />
                </Field>

                <Field label="Website / Portfolio" htmlFor="website" hint="Optional" error={errors.website?.message}>
                  <Input
                    id="website"
                    icon={<Globe />}
                    placeholder="https://yourportfolio.com"
                    {...register('website')}
                  />
                </Field>

                <Field label="Instagram Handle" htmlFor="instagram" hint="Optional">
                  <Input
                    id="instagram"
                    icon={<Instagram />}
                    placeholder="@yourusername"
                    {...register('instagram')}
                  />
                </Field>
              </div>

              {/* 2 · About you */}
              <div className="space-y-5 border-t border-line p-6 sm:p-8 lg:border-l lg:border-t-0">
                <h2 className="font-display text-lg text-ink">2. About You</h2>

                <Field
                  label="Tell us about your photography journey"
                  htmlFor="journey"
                  required
                  error={errors.journey?.message}
                  aside={<CharCount value={journey} max={1000} />}
                >
                  <Textarea
                    id="journey"
                    rows={5}
                    placeholder="Your story, inspiration, and journey…"
                    invalid={!!errors.journey}
                    {...register('journey')}
                  />
                </Field>

                <div>
                  <Label required>Photography Genres (Select up to 3)</Label>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {ART_STYLES.map((style) => {
                      const active = genres.includes(style);
                      return (
                        <button
                          key={style}
                          type="button"
                          onClick={() => toggleGenre(style)}
                          aria-pressed={active}
                          className={cn(
                            'rounded-full border px-3 py-1.5 text-[0.8125rem] transition-all',
                            active
                              ? 'border-bronze bg-bronze-soft text-bronze-deep'
                              : 'border-line text-muted hover:border-line-strong hover:text-ink',
                          )}
                        >
                          {ART_STYLE_LABELS[style]}
                          {active && <X className="ml-1.5 inline size-3" aria-hidden />}
                        </button>
                      );
                    })}
                  </div>
                  {errors.genres && <p className="mt-2 text-xs text-danger">{errors.genres.message}</p>}
                </div>

                <Field
                  label="What do you hope to achieve with ARTINU?"
                  htmlFor="goals"
                  aside={<CharCount value={goals} max={500} />}
                >
                  <Textarea
                    id="goals"
                    rows={3}
                    placeholder="Your goals and expectations…"
                    {...register('goals')}
                  />
                </Field>

                <Field label="How did you hear about ARTINU?">
                  <Controller
                    control={control}
                    name="referral"
                    render={({ field }) => (
                      <SimpleSelect
                        value={field.value ?? undefined}
                        onValueChange={field.onChange}
                        placeholder="Select an option"
                        options={REFERRAL_SOURCES.map((source) => ({
                          value: source,
                          label: REFERRAL_SOURCE_LABELS[source],
                        }))}
                      />
                    )}
                  />
                </Field>
              </div>

              {/* 3 · Your work */}
              <div className="space-y-4 border-t border-line p-6 sm:p-8 lg:border-l lg:border-t-0">
                <h2 className="font-display text-lg text-ink">3. Your Work</h2>
                <Label required>Show us your best work</Label>

                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    void addFiles(event.dataTransfer.files);
                  }}
                  className={cn(
                    'rounded-lg border border-dashed p-8 text-center transition-colors',
                    dragging ? 'border-bronze bg-bronze-soft/40' : 'border-line-strong bg-canvas-soft',
                  )}
                >
                  <Upload className="mx-auto size-6 text-bronze" strokeWidth={1.5} aria-hidden />
                  <p className="mt-3 text-sm text-ink">
                    Drag &amp; drop your photos here
                    <br />
                    or{' '}
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="text-bronze underline-offset-4 hover:underline"
                    >
                      click to browse
                    </button>
                  </p>
                  <p className="mt-4 text-xs text-subtle">
                    Upload {MIN_PHOTOS} - {MAX_PHOTOS} images
                    <br />
                    (JPG, PNG - Max 10MB each)
                  </p>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                    multiple
                    className="sr-only"
                    onChange={(event) => {
                      if (event.target.files) void addFiles(event.target.files);
                      event.target.value = '';
                    }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className={cn(uploads.length < MIN_PHOTOS ? 'text-subtle' : 'text-success')}>
                    {uploads.length} of {MAX_PHOTOS} added
                  </span>
                  {uploads.length < MIN_PHOTOS && (
                    <span className="text-subtle">{MIN_PHOTOS - uploads.length} more needed</span>
                  )}
                </div>

                {uploads.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {uploads.map((upload, index) => (
                      <div key={upload.dataUrl.slice(-24)} className="group relative">
                        <Photo src={upload.dataUrl} alt={upload.name} ratio="aspect-square" className="rounded-sm" />
                        <button
                          type="button"
                          onClick={() => removeUpload(index)}
                          aria-label={`Remove ${upload.name}`}
                          className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-ink/80 text-canvas opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {errors.portfolioUrls && (
                  <p className="text-xs text-danger">{errors.portfolioUrls.message}</p>
                )}

                <div className="flex gap-3 rounded-md bg-bronze-soft/60 p-4">
                  <Lightbulb className="size-4 shrink-0 text-bronze" aria-hidden />
                  <div>
                    <p className="text-sm font-medium text-ink">Quality over quantity.</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">
                      We&rsquo;d love to see a range of your best work.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 4 · Terms */}
            <div className="mt-4 rounded-xl border border-line bg-canvas-soft p-6 sm:p-7">
              <h2 className="font-display text-lg text-ink">4. Terms &amp; Confirmation</h2>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-5">
                <label className="flex max-w-2xl cursor-pointer items-start gap-3 text-sm text-muted">
                  <Checkbox
                    checked={acceptTerms === true}
                    onCheckedChange={(value) =>
                      setValue('acceptTerms', (value === true) as never, { shouldValidate: true })
                    }
                    className="mt-0.5"
                  />
                  <span>
                    I confirm that all the information provided is accurate and I agree to
                    ARTINU&rsquo;s{' '}
                    <Link to="/legal/terms" className="text-bronze underline underline-offset-4">
                      Terms of Use
                    </Link>{' '}
                    and{' '}
                    <Link to="/legal/privacy" className="text-bronze underline underline-offset-4">
                      Privacy Policy
                    </Link>
                    .
                  </span>
                </label>

                <Button type="submit" size="lg" loading={isSubmitting || apply.isPending}>
                  Submit application <ArrowRight className="size-4" />
                </Button>
              </div>

              {errors.acceptTerms && (
                <p className="mt-2 text-xs text-danger">{errors.acceptTerms.message}</p>
              )}

              {errorList.length > 1 && (
                <div className="mt-5 rounded-md border border-danger/30 bg-danger-soft p-4">
                  <p className="text-sm font-medium text-danger">
                    Please fix {errorList.length} things before submitting:
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-danger">
                    {errorList.map((entry) => (
                      <li key={entry.field}>· {entry.message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </form>
        </Container>
      </Section>

      {/*
        "What happens next?" used to sit here as well.

        It was the same four steps, the same four lucide glyphs in the same
        discs, with arrows between them - and the page you land on the instant
        you press submit shows it again, word for word. Two identical process
        diagrams either side of one button.

        It belongs on the page AFTER applying, which is when someone actually
        wants to know what happens next, so that is the only place it survives.
        See ApplicationSubmittedPage.
      */}

      {/* ── Help band ──────────────────────────────────────────────────── */}
      <Section size="compact" className="pt-0">
        <Container>
          <div className="grid gap-8 rounded-xl bg-ink px-6 py-9 text-canvas sm:px-10 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
            <div className="flex items-start gap-4">
              <div>
                <h3 className="font-display text-lg text-canvas">Need help?</h3>
                <p className="mt-1 text-sm text-canvas/55">We&rsquo;re here for you.</p>
                {/* Was hello@ARTINU.space - a domain ARTINU does not own. */}
                <a
                  href={`mailto:${CONTACT.email}`}
                  className="text-sm text-canvas/80 hover:underline"
                >
                  {CONTACT.email}
                </a>
              </div>
            </div>

            <div className="lg:border-x lg:border-canvas/15 lg:px-10">
              <h3 className="font-display text-lg text-canvas">Tips for a strong application</h3>
              <ul className="mt-3 space-y-2">
                {TIPS.map((tip) => (
                  <li key={tip} className="flex items-center gap-2.5 text-sm text-canvas/65">
                    <Check className="size-3.5 shrink-0 text-bronze-light" aria-hidden />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center gap-4 rounded-lg border border-canvas/20 p-5">
              <Camera className="size-5 shrink-0 text-bronze-light" aria-hidden />
              <p className="font-display text-lg leading-snug text-canvas">
                Every artist has a story.
                <br />
                We can&rsquo;t wait to see yours.
              </p>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
