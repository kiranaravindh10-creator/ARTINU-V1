import {
  ArrowRight,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  Globe,
  Mail,
  Sparkles,
  TrendingUp,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Container, Section, StepIcon } from '@/components/layout/primitives';
import { Reveal, Stagger, StaggerItem } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/display';
import { Photo } from '@/components/ui/photo';
import { IMAGES } from '@/lib/images';
import { catalogService } from '@/services/catalog.service';
import { cn } from '@/lib/utils';

const BENEFITS = [
  {
    icon: Globe,
    title: 'Get Discovered',
    body: 'Showcase your work to a growing network of creators, brands, and space owners.',
  },
  {
    icon: Users,
    title: 'Meaningful Connections',
    body: 'Collaborate with like-minded photographers and creative professionals.',
  },
  {
    icon: CalendarCheck,
    title: 'Exclusive Opportunities',
    body: 'Access curated projects, shooting opportunities, and partner collaborations.',
  },
  {
    icon: TrendingUp,
    title: 'Grow Together',
    body: 'Learn, get inspired, and grow your craft in a supportive creative community.',
  },
];

const WHO = [
  'Professional photographers',
  'Emerging & aspiring photographers',
  'Visual storytellers & creative makers',
  'Photography students & enthusiasts',
];

const GUIDELINES = [
  'Upload only work you shot yourself. You keep your copyright — always.',
  'No AI-generated or heavily synthesised imagery. Our audience is looking at real places.',
  'Keep metadata acARTINU: where it was taken, and roughly when.',
  'Nothing hateful, explicit or exploitative. Spaces are public places.',
  'Quality over quantity — six strong photographs beat thirty average ones.',
];

const STEPS = [
  { icon: UserPlus, title: 'Create Your Profile', body: 'Tell us about you and your photography journey.' },
  { icon: Upload, title: 'Showcase Your Work', body: 'Upload your best work and share your vision.' },
  { icon: Check, title: 'Our Team Reviews', body: 'We review your application and get back to you.' },
  { icon: Sparkles, title: 'Welcome to ARTINU', body: 'Start connecting, collaborating and creating together.' },
];

export default function JoinPage() {
  const [guidelinesOpen, setGuidelinesOpen] = React.useState(false);

  return (
    <>
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="grid items-stretch lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col justify-center px-5 py-14 sm:px-8 lg:py-20 lg:pl-12 lg:pr-16">
          <Reveal>
            <p className="eyebrow">A community for visionaries.</p>
            <h1 className="mt-5 font-display text-[2.5rem] leading-[1.05] text-ink sm:text-[3.25rem]">
              Join our
              <br />
              artist
              <br />
              community.
            </h1>
            <span className="rule mt-7" />
            <p className="prose-quiet mt-7 max-w-sm">
              Connect. Collaborate. Get discovered. ARTINU is where photographers and spaces come
              together to create meaningful stories.
            </p>

            <Button shape="pill" size="lg" asChild className="mt-9 w-fit">
              <Link to="/join/apply">Apply to join →</Link>
            </Button>

            <CommunityProof />
          </Reveal>
        </div>

        <Photo
          src={IMAGES.cameraDesk}
          alt="A framed print, a camera and prints on a sunlit desk"
          priority
          className="min-h-[240px] lg:min-h-[32rem]"
        />
      </section>

      {/* ── Why join ───────────────────────────────────────────────────── */}
      <Section size="compact">
        <Container>
          <h2 className="font-display text-[1.75rem] leading-tight text-ink sm:text-[2rem]">
            Why join ARTINU?
          </h2>

          <Stagger className="mt-10 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {BENEFITS.map((benefit, index) => (
              <StaggerItem
                key={benefit.title}
                className={cn('lg:pl-10', index > 0 && 'lg:border-l lg:border-line')}
              >
                <StepIcon>
                  <benefit.icon aria-hidden />
                </StepIcon>
                <h3 className="mt-5 font-display text-lg text-ink">{benefit.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{benefit.body}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </Container>
      </Section>

      {/* ── Who can join ───────────────────────────────────────────────── */}
      <Section id="guidelines" size="compact" className="pt-0">
        <Container>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
            <div className="rounded-xl bg-sand-soft p-7 sm:p-9">
              <h2 className="font-display text-[1.5rem] text-ink">Who can join?</h2>
              <ul className="mt-6 space-y-3.5">
                {WHO.map((entry) => (
                  <li key={entry} className="flex items-center gap-3 text-sm text-ink-soft">
                    <CheckCircle2 className="size-5 shrink-0 text-bronze" strokeWidth={1.5} aria-hidden />
                    {entry}
                  </li>
                ))}
              </ul>

              <hr className="my-7 border-line" />

              <p className="text-sm text-muted">All styles. All stories. All are welcome.</p>

              <button
                type="button"
                onClick={() => setGuidelinesOpen((value) => !value)}
                aria-expanded={guidelinesOpen}
                className="mt-4 inline-flex items-center gap-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-ink transition-colors hover:text-bronze"
              >
                See community guidelines
                <ChevronDown
                  className={cn('size-3.5 transition-transform', guidelinesOpen && 'rotate-180')}
                />
              </button>

              {guidelinesOpen && (
                <ul className="mt-4 space-y-2.5 border-t border-line pt-4">
                  {GUIDELINES.map((guideline) => (
                    <li key={guideline} className="flex gap-2.5 text-sm leading-relaxed text-muted">
                      <span className="mt-2 size-1 shrink-0 rounded-full bg-bronze" aria-hidden />
                      {guideline}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid grid-cols-3 grid-rows-2 gap-3">
              <Photo src={IMAGES.mountains} alt="" className="row-span-2 h-full" />
              <Photo src={IMAGES.darkroom} alt="" className="col-span-2 h-full" />
              <Photo src={IMAGES.street} alt="" className="h-full" />
              <Photo src={IMAGES.photographerField} alt="" className="h-full" />
            </div>
          </div>
        </Container>
      </Section>

      {/* ── How it works ───────────────────────────────────────────────── */}
      <Section size="compact" className="pt-0">
        <Container>
          <div className="rounded-xl bg-sand-soft px-6 py-10 sm:px-10">
            <h2 className="font-display text-[1.5rem] text-ink">How it works</h2>

            <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <div key={step.title} className="relative flex gap-4">
                  <StepIcon className="shrink-0 bg-canvas">
                    <step.icon aria-hidden />
                  </StepIcon>
                  <div>
                    <h3 className="text-sm font-medium text-ink">
                      {index + 1}. {step.title}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{step.body}</p>
                  </div>
                  {index < STEPS.length - 1 && (
                    <ArrowRight
                      className="absolute -right-4 top-4 hidden size-4 text-line-strong lg:block"
                      aria-hidden
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </Container>
      </Section>

      {/* ── Closing band ───────────────────────────────────────────────── */}
      <Section size="compact" className="pt-0">
        <Container>
          <div className="grid gap-8 rounded-xl bg-ink px-6 py-10 text-canvas sm:px-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
            <div className="flex items-start gap-4 lg:border-r lg:border-canvas/15 lg:pr-10">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-canvas/25 text-bronze-light">
                <Mail className="size-4" aria-hidden />
              </span>
              <div>
                <h3 className="font-display text-lg text-canvas">Have questions?</h3>
                <p className="mt-1 text-sm text-canvas/55">We&rsquo;re here to help.</p>
                <a
                  href="mailto:hello@ARTINU.space"
                  className="text-sm text-canvas/80 underline-offset-4 hover:underline"
                >
                  hello@ARTINU.space
                </a>
              </div>
            </div>

            <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
              <div>
                <h3 className="font-display text-xl text-canvas sm:text-2xl">
                  Ready to be part of something special?
                </h3>
                <p className="mt-1.5 max-w-md text-sm text-canvas/55">
                  Join a global community that celebrates photography and the spaces that inspire it.
                </p>
              </div>
              <Button variant="light" shape="pill" asChild className="shrink-0">
                <Link to="/join/apply">Apply to join</Link>
              </Button>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}


/**
 * Real photographers, real count.
 *
 * This previously showed four randomly-seeded stock portraits above the line
 * "2,500+ photographers are already part of ARTINU". Both were invented — the
 * faces belonged to nobody on the platform and the number was off by two
 * orders of magnitude. A photographer deciding whether to trust us with their
 * work is exactly the wrong person to show a fabricated number to.
 *
 * It now shows the artists who have actually joined. While the count is small
 * the wording carries no number at all rather than advertising a weakness, and
 * the whole block hides itself if the roster is empty or the request fails.
 */
function CommunityProof() {
  const { data } = useQuery({
    queryKey: ['join', 'community-proof'],
    queryFn: () => catalogService.artists({ pageSize: 4 }),
    staleTime: 5 * 60 * 1000,
  });

  const artists = data?.items ?? [];
  const total = data?.total ?? 0;
  if (artists.length === 0) return null;

  return (
    <div className="mt-7 flex items-center gap-3">
      <div className="flex -space-x-2.5">
        {artists.map((artist) => (
          <Avatar
            key={artist.id}
            src={artist.avatarUrl ?? undefined}
            name={artist.name}
            className="size-8 ring-2 ring-canvas"
          />
        ))}
      </div>
      <p className="text-xs text-muted">
        {total >= 25
          ? `${total} photographers are already part of ARTINU`
          : 'Join the photographers already showing work through ARTINU'}
      </p>
    </div>
  );
}
