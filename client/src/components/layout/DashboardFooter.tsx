import { CONTACT } from '@artinu/shared';
import { Mail, MessageCircle, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * The footer for a signed-in dashboard.
 *
 * The space owner's screens ended at the last card, on the same paper as the
 * card, with nothing telling you the page had finished. Worse, it left a space
 * owner mid-order with no way to ask a question: the phone number, the email and
 * the WhatsApp button all lived on the public marketing footer, which you only
 * see if you sign out.
 *
 * So this is not the marketing footer moved indoors. It carries the three things
 * that matter to someone who is already a customer - where to go next, how to
 * reach a human, and the reassurance that a human exists - and nothing else. No
 * legal column, no social row, no sitemap.
 */
export function DashboardFooter({
  links,
  note,
}: {
  /** Where to go next from here. Keep it to three or four. */
  links?: { to: string; label: string }[];
  /** One line of context for this area, if it earns its place. */
  note?: string;
}) {
  const whatsapp = `https://wa.me/${CONTACT.phoneRaw}?text=${encodeURIComponent(
    'Hi ARTINU - I have a question about my order.',
  )}`;

  return (
    <footer className="mt-12 border-t border-line bg-canvas-soft">
      <div className="dash-panel">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
              Any questions?
            </p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
              {note ??
                'Call or message us about anything - a photograph you cannot find, a rotation date that does not suit you, or an invoice that needs changing.'}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2.5 text-sm">
              <a
                href={`tel:${CONTACT.phoneRaw}`}
                className="inline-flex items-center gap-2 text-ink transition-opacity hover:opacity-70"
              >
                <Phone className="size-4 text-bronze" aria-hidden />
                {CONTACT.phone}
              </a>
              <a
                href={whatsapp}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-ink transition-opacity hover:opacity-70"
              >
                <MessageCircle className="size-4 text-bronze" aria-hidden />
                WhatsApp
              </a>
              <a
                href={`mailto:${CONTACT.supportEmail}`}
                className="inline-flex items-center gap-2 text-ink transition-opacity hover:opacity-70"
              >
                <Mail className="size-4 text-bronze" aria-hidden />
                {CONTACT.supportEmail}
              </a>
            </div>
          </div>

          {links && links.length > 0 && (
            <nav aria-label="More in this area" className="shrink-0">
              <p className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
                Where next
              </p>
              <ul className="mt-3 space-y-2">
                {links.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="text-sm text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>

        <p className="mt-8 border-t border-line-soft pt-5 text-xs text-subtle">
          ARTINU · Photography on rotation for real spaces.
        </p>
      </div>
    </footer>
  );
}
