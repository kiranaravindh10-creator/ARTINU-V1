import { CONTACT } from '@artinu/shared';
import { Check, Instagram, Linkedin, Mail } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLink, Container, Section } from '@/components/layout/primitives';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Photo } from '@/components/ui/photo';
import { IMAGES } from '@/lib/images';

/*
  Four steps, no icons.

  This was four lucide glyphs in discs, joined by a dashed connector - the exact
  four-up-with-arrows shape the founder keeps identifying as "looks so AI", and
  it was rendered twice: here and on the application form itself. The form's
  copy is gone; this one is set as what it actually is, a numbered sequence.

  "Grow Together / Connect, collaborate, and create meaningful impact" went with
  the discs. It is four verbs that describe nothing and promise nothing, and it
  was the last step of a list whose other three are concrete events.
*/
const STEPS = [
  {
    title: 'We read it',
    body: 'A person goes through your application and your photographs. Not a filter.',
  },
  {
    title: 'We reply either way',
    body: 'Within seven to ten days, whether the answer is yes or no.',
  },
  {
    title: 'You upload',
    body: 'Your account opens and your photographs go straight into the gallery - no second review.',
  },
  {
    title: 'A wall',
    body: 'When a space picks your work we print it, frame it, hang it, and put your name beside it.',
  },
];

const GRID = [
  IMAGES.street,
  IMAGES.boatLake,
  IMAGES.photographer,
  IMAGES.mountains,
  IMAGES.cameraDesk,
  IMAGES.valley,
];

export default function ApplicationSubmittedPage() {
  const location = useLocation();
  const email = (location.state as { email?: string } | null)?.email;

  return (
    <Section tone="soft" size="compact">
      <Container>
        <Reveal className="rounded-xl bg-sand-soft px-5 py-14 text-center sm:px-10 sm:py-16">
          <div className="relative mx-auto w-fit">
            <span className="flex size-20 items-center justify-center rounded-full bg-bronze-soft text-bronze">
              <Check className="size-9" strokeWidth={1.4} aria-hidden />
            </span>
            {/* Scattered dots, purely atmospheric. */}
            <span className="absolute -left-8 top-2 size-1.5 rounded-full bg-bronze/40" aria-hidden />
            <span className="absolute -right-10 top-6 size-1 rounded-full bg-bronze/50" aria-hidden />
            <span className="absolute -left-12 bottom-3 size-1 rounded-full bg-bronze/30" aria-hidden />
            <span className="absolute -right-6 -top-3 size-1.5 rounded-full bg-bronze/30" aria-hidden />
          </div>

          <p className="eyebrow mt-7">Application submitted</p>
          <h1 className="mx-auto mt-4 max-w-2xl font-display text-[2.25rem] leading-[1.08] text-ink sm:text-[3rem]">
            Thank you for applying to ARTINU.
          </h1>
          <p className="prose-quiet mx-auto mt-5 text-center">
            We&rsquo;ve received your application and our team will review it with care.
            You&rsquo;ll hear from us soon.
          </p>

          <div className="mx-auto mt-8 flex w-fit max-w-full items-center gap-3.5 rounded-lg border border-line bg-surface px-5 py-4 text-left">
            <p className="text-sm text-muted">
              A confirmation email has been sent to
              <br />
              <span className="font-medium text-ink">{email ?? 'the address you gave us'}</span>
            </p>
          </div>

          <div className="mt-9 flex flex-col items-center gap-4">
            <Button shape="pill" size="lg" asChild>
              <Link to="/signin?as=artist">View my application →</Link>
            </Button>
            <ArrowLink to="/">Back to home</ArrowLink>
          </div>
        </Reveal>

        <Reveal delay={0.1} className="mt-8">
          <Photo
            src={IMAGES.cameraDesk}
            alt="A camera, a notebook and prints on a sunlit desk"
            ratio="aspect-[21/9]"
            className="rounded-lg"
          />
        </Reveal>

        {/* ── What happens next ────────────────────────────────────────── */}
        <div className="mt-14 text-center">
          <h2 className="font-display text-[1.5rem] text-ink">What happens next?</h2>

          {/* A real ordered list. The order is the whole content, so it is
              carried by the markup rather than by a dashed line and arrows. */}
          <ol className="mx-auto mt-10 max-w-xl space-y-6 text-left">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-5">
                <span
                  className="mt-0.5 shrink-0 font-display text-2xl leading-none text-bronze/60 tabular-nums"
                  aria-hidden
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0">
                  <span className="block text-[0.9375rem] font-medium text-ink">{step.title}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted">{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        {/* ── Closing panel ────────────────────────────────────────────── */}
        <div className="mt-14 grid overflow-hidden rounded-xl bg-ink lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
          <div className="px-7 py-10 sm:px-9">
            <h2 className="font-display text-xl leading-snug text-canvas sm:text-2xl">
              You&rsquo;re one step closer to being part of something meaningful.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-canvas/55">
              ARTINU is a global community of photographers and storytellers who see the world
              differently.
            </p>
            <Link
              to="/gallery"
              className="mt-6 inline-flex items-center gap-2 font-label text-[0.6875rem] uppercase tracking-[0.14em] text-canvas transition-opacity hover:opacity-70"
            >
              Explore gallery →
            </Link>

            <div className="mt-7 flex items-center gap-2">
              {[
                { href: CONTACT.social.instagram, label: 'Instagram', Icon: Instagram },
                { href: CONTACT.social.linkedin, label: 'LinkedIn', Icon: Linkedin },
              ]
                .filter(({ href }) => Boolean(href))
                .map(({ href, label, Icon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={label}
                    className="flex size-9 items-center justify-center rounded-full border border-canvas/20 text-canvas/60 transition-colors hover:border-canvas/50 hover:text-canvas"
                  >
                    <Icon className="size-4" />
                  </a>
                ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1 p-1">
            {GRID.map((src, index) => (
              <Photo key={index} src={src} alt="" ratio="aspect-[4/3]" />
            ))}
          </div>
        </div>
      </Container>
    </Section>
  );
}
