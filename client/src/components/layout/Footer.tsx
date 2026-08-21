import { CONTACT } from '@artinu/shared';
import { Instagram, Linkedin, Mail, MessageCircle, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/layout/Logo';
import { Container } from '@/components/layout/primitives';

const COLUMNS = [
  {
    title: 'Explore',
    links: [
      { to: '/gallery', label: 'Gallery' },
      { to: '/artists', label: 'Artists' },
      { to: '/spaces', label: 'Spaces' },
      { to: '/about', label: 'About Us' },
      { to: '/help', label: 'Help & Support' },
    ],
  },
  {
    title: 'For Spaces',
    links: [
      { to: '/lets-talk', label: 'Book a Consultation' },
      { to: '/spaces#how-it-works', label: 'How It Works' },
      { to: '/signin?as=space', label: 'Space Sign In' },
    ],
  },
  {
    /*
      "Join" was reachable from exactly one link, at the foot of the Artists
      page, and from nowhere else — not the nav, not here. This column offered
      a photographer who had just decided they wanted in a single option: sign
      in to the account they do not have yet.

      Giving photographers somewhere to be seen is the product, so the way in
      belongs in the footer of every page, above the sign-in link rather than
      after it.
    */
    title: 'For Artists',
    links: [
      { to: '/join', label: 'Join as an Artist' },
      { to: '/gallery', label: 'Browse the Gallery' },
      { to: '/signin?as=artist', label: 'Artist Sign In' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { to: '/legal/privacy', label: 'Privacy Policy' },
      { to: '/legal/terms', label: 'Terms & Conditions' },
      { to: '/legal/community', label: 'Community Guidelines' },
    ],
  },
];

/**
 * Only the channels ARTINU actually publishes on. A link with no destination
 * configured is dropped rather than rendered dead, so the row never contains a
 * button that looks live and goes nowhere.
 */
const SOCIAL = [
  { href: CONTACT.social.instagram, label: 'Instagram', Icon: Instagram },
  { href: CONTACT.social.linkedin, label: 'LinkedIn', Icon: Linkedin },
].filter((entry) => Boolean(entry.href));

export function Footer() {
  const whatsapp = `https://wa.me/${CONTACT.phoneRaw}?text=${encodeURIComponent(
    "Hi ARTINU, I'd like to know more about art for my space.",
  )}`;

  return (
    <footer className="bg-ink text-canvas">
      <Container className="py-16 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_2fr]">
          <div className="flex flex-col gap-6">
            <Logo invert size="large" />
            <p className="max-w-sm text-sm leading-relaxed text-canvas/60">
              Photography on rotation for real spaces. We curate, frame, install and refresh so
              your walls stay alive and your artists stay seen.
            </p>

            <div className="flex flex-col gap-2.5 text-sm text-canvas/70">
              <a
                href={`tel:${CONTACT.phoneRaw}`}
                className="inline-flex items-center gap-2.5 transition-colors hover:text-canvas"
              >
                <Phone className="size-4 text-bronze-light" aria-hidden />
                {CONTACT.phone}
              </a>
              <a
                href={`mailto:${CONTACT.email}`}
                className="inline-flex items-center gap-2.5 transition-colors hover:text-canvas"
              >
                <Mail className="size-4 text-bronze-light" aria-hidden />
                {CONTACT.email}
              </a>

            </div>

            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-2 rounded-full border border-canvas/20 px-4 py-2 font-label text-[0.6875rem] uppercase tracking-[0.14em] text-canvas transition-colors hover:border-canvas/50 hover:bg-canvas/5"
            >
              <MessageCircle className="size-3.5 text-bronze-light" aria-hidden />
              Chat on WhatsApp
            </a>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {COLUMNS.map((column) => (
              <div key={column.title}>
                <h3 className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-bronze-light">
                  {column.title}
                </h3>
                <ul className="mt-4 flex flex-col gap-2.5">
                  {column.links.map((link) => (
                    <li key={link.to + link.label}>
                      <Link
                        to={link.to}
                        className="text-sm text-canvas/60 transition-colors hover:text-canvas"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 border-t border-canvas/10 pt-6">
          <div className="flex flex-col-reverse items-start justify-between gap-5 sm:flex-row sm:items-center">
            <p className="font-label text-[0.625rem] uppercase tracking-[0.14em] text-canvas/40">
              © {new Date().getFullYear()} ARTINU
            </p>

            <div className="flex items-center gap-4">
              <span className="hidden font-label text-[0.625rem] uppercase tracking-[0.14em] text-canvas/40 sm:inline">
                {CONTACT.hours[0]?.days} · {CONTACT.hours[0]?.time}
              </span>
              <div className="flex items-center gap-1.5">
                {SOCIAL.map(({ href, label, Icon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={label}
                    className="flex size-9 items-center justify-center rounded-full border border-canvas/15 text-canvas/60 transition-colors hover:border-canvas/40 hover:text-canvas"
                  >
                    <Icon className="size-4" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Container>
    </footer>
  );
}
