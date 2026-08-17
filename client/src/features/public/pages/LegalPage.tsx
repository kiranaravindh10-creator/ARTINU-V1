import { CONTACT, MIN_ORDER_QUANTITY } from '@artinu/shared';
import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import { Container, Section } from '@/components/layout/primitives';
import { cn } from '@/lib/utils';

interface LegalSection {
  id: string;
  title: string;
  paragraphs: string[];
}

interface LegalDocument {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}

const UPDATED = '1 July 2026';

/**
 * Real policy copy for an Indian art-rental business. It describes what this
 * product actually does — rental and rotation, a refundable deposit, artist
 * licensing — rather than generic boilerplate.
 */
const DOCUMENTS: Record<string, LegalDocument> = {
  privacy: {
    title: 'Privacy Policy',
    updated: UPDATED,
    intro:
      'This policy explains what ARTINU collects, why we collect it, who processes it on our behalf, and what you can ask us to do with it.',
    sections: [
      {
        id: 'what-we-collect',
        title: '1. What we collect',
        paragraphs: [
          'When you create an account we collect your name, email address and password. Passwords are stored only as a bcrypt hash — we cannot read them, and neither can anyone who obtains a copy of our database.',
          'If you register a space, we collect its name, type, address, contact details and the interior notes you give us (wall colour, lighting, theme). We use those notes solely to curate photographs that suit the room.',
          'If you join as an artist, we collect your profile, the photographs you upload and the metadata attached to them — title, description, tags, capture location and date. Uploaded photographs are stored in our object storage and are visible to our curation team before they are published.',
          'When you place an order we record the order, the frames configured, the amounts charged and the payment reference returned by the payment provider. We never see or store your card number, UPI PIN or bank credentials.',
        ],
      },
      {
        id: 'why',
        title: '2. Why we use it',
        paragraphs: [
          'To operate the service: signing you in, curating and printing your collection, scheduling installation, issuing invoices and paying artists.',
          'To tell you things you need to know: order and payment confirmations, installation dates, rotation reminders and moderation decisions. Every one of these also appears inside the product, so email is never the only place an important event exists.',
          'To improve the service in aggregate — for example, understanding which categories of photograph suit which kind of space. This analysis is done on aggregate counts, not on individual browsing histories.',
        ],
      },
      {
        id: 'processors',
        title: '3. Who processes your data',
        paragraphs: [
          'Supabase provides our database, authentication and file storage. Data is held in the region configured for our project and is subject to Supabase’s own security commitments.',
          'Email is delivered through our SMTP provider. Payments are processed by our payment provider; ARTINU receives a reference and a status, never your payment credentials.',
          'We do not sell personal data, and we do not share it with advertisers or data brokers.',
        ],
      },
      {
        id: 'cookies',
        title: '4. Cookies and local storage',
        paragraphs: [
          'We use a small number of first-party storage keys, all functional: your session token, your cart, and your cookie preference. We do not use third-party advertising or cross-site tracking cookies. The Cookie Policy lists each key by name.',
        ],
      },
      {
        id: 'retention',
        title: '5. How long we keep it',
        paragraphs: [
          'Account and profile data is kept while your account is open. Orders, invoices and tax records are kept for eight years, as required under Indian tax law, even if you close your account.',
          'Photographs you upload are kept while they are part of a live or past collection. Rejected uploads are removed within 90 days.',
        ],
      },
      {
        id: 'your-rights',
        title: '6. Your rights',
        paragraphs: [
          `You can ask us for a copy of the personal data we hold about you, ask us to correct it, or ask us to delete it where we are not legally required to keep it. Write to ${CONTACT.email} and we will respond within 30 days.`,
          'You can update most of your data yourself from your profile page at any time.',
        ],
      },
      {
        id: 'security',
        title: '7. Security',
        paragraphs: [
          'Access to the production database is limited to the ARTINU engineering team. Every privileged action in the internal console is written to an append-only audit log with the actor, the action and the time.',
          'If a breach ever affects your data, we will tell you and the relevant authority without undue delay, and we will tell you what we know rather than waiting until we know everything.',
        ],
      },
      {
        id: 'contact-privacy',
        title: '8. Contact',
        paragraphs: [
          `Questions about this policy go to ${CONTACT.email}, or by post to ${CONTACT.address.line1}, ${CONTACT.address.line2}, ${CONTACT.address.city} ${CONTACT.address.pin}.`,
        ],
      },
    ],
  },

  terms: {
    title: 'Terms & Conditions',
    updated: UPDATED,
    intro:
      'These terms govern your use of ARTINU — the website, the artist workspace and the rental of framed photographic works.',
    sections: [
      {
        id: 'model',
        title: '1. What ARTINU provides',
        paragraphs: [
          'ARTINU ARTINUs, prints, frames, installs and periodically rotates photographic works in your space. This is a rental and service arrangement, not a sale of artwork.',
          'Unless a separate written agreement says otherwise, the framed works remain the property of ARTINU at all times. You are renting their presence in your space, together with the curation, installation and rotation service around them.',
        ],
      },
      {
        id: 'orders',
        title: '2. Orders and minimums',
        paragraphs: [
          `A collection order is for a minimum of ${MIN_ORDER_QUANTITY} frames. Prices shown at checkout are inclusive of the frame, the print and the artwork licence, and exclusive of GST, delivery and installation, which are itemised separately before you pay.`,
          `GST is charged at 18% on goods and services. The refundable security deposit, where applicable, is not a taxable supply and is shown separately.`,
          'An order is confirmed when payment is verified. Production begins shortly after confirmation.',
        ],
      },
      {
        id: 'space-obligations',
        title: '3. Your obligations as a space',
        paragraphs: [
          'You will provide safe access for our installation team at the agreed time, and a wall suitable for hanging the works.',
          'You will keep the works in the condition in which they were installed, indoors, away from direct water and direct sunlight, and will not modify, reframe, paint over or relocate them without telling us.',
          'You will tell us promptly if a work is damaged, or if the space is being sold, closed or refurbished.',
        ],
      },
      {
        id: 'damage',
        title: '4. Damage and the security deposit',
        paragraphs: [
          `Where a security deposit applies, it is fully refundable at the end of the arrangement, less the cost of repairing or replacing any work damaged beyond normal wear.`,
          'Normal wear — slight fading, small scuffs to the frame — is expected and is not charged for. Deliberate damage, water damage, theft and loss are chargeable at the replacement cost of the affected work.',
        ],
      },
      {
        id: 'rotation',
        title: '5. Rotation',
        paragraphs: [
          'Rotation happens at the cadence you choose, every one to three months. We propose a new collection, you approve it, and we schedule the swap.',
          'If you ask for changes to a proposed collection we will re-ARTINU it. If you do not respond to a rotation proposal, the current collection simply stays up — nothing is changed on your walls without your approval.',
        ],
      },
      {
        id: 'artists',
        title: '6. Artists and licensing',
        paragraphs: [
          'Photographers retain full copyright in their work. By publishing on ARTINU, an artist grants ARTINU a non-exclusive licence to print, frame, install and display their photographs in subscribing spaces, and to show them in the ARTINU gallery.',
          'Artists must upload only their own work. AI-generated imagery, and work an artist does not hold the rights to, will be rejected.',
        ],
      },
      {
        id: 'prohibited',
        title: '7. Prohibited use',
        paragraphs: [
          'You may not reproduce, photograph for commercial resale, scan, or create derivative works from the photographs installed in your space.',
          'You may not use the ARTINU platform to upload unlawful, hateful or explicit material, to impersonate another person, or to attempt to gain access to accounts or data that are not yours.',
        ],
      },
      {
        id: 'liability',
        title: '8. Liability',
        paragraphs: [
          'ARTINU’s total liability in connection with the service is limited to the amounts you have paid us in the twelve months preceding the claim. Nothing in these terms limits liability for death, personal injury or fraud.',
        ],
      },
      {
        id: 'law',
        title: '9. Governing law',
        paragraphs: [
          'These terms are governed by the laws of India. The courts at Bengaluru, Karnataka have exclusive jurisdiction over any dispute arising from them.',
        ],
      },
    ],
  },

  refund: {
    title: 'Refund Policy',
    updated: UPDATED,
    intro:
      'What happens when a payment fails, when you change your mind, and when something arrives damaged.',
    sections: [
      {
        id: 'failed',
        title: '1. Failed and incomplete payments',
        paragraphs: [
          'If a payment cannot be verified, no order is confirmed and no money is captured. Your order stays open and you can retry payment with a fresh QR code at any time from your order page.',
          'If money has left your account but the order still shows as unpaid — which can happen if a bank confirmation is delayed — contact us with the UTR reference. We will reconcile it within two working days and either confirm the order or return the amount.',
        ],
      },
      {
        id: 'cancellation',
        title: '2. Cancelling an order',
        paragraphs: [
          'You can cancel free of charge at any time before printing begins. The full amount, including GST, delivery and any deposit, is returned to the original payment method.',
          'Once printing has begun the photographs are produced specifically for your space and the print and frame cost is no longer refundable. You can still cancel, and we will refund the delivery, installation and deposit portions in full.',
          'To cancel after production has started, contact support — an internal team member has to review it, because there is a printed photograph and a cut frame on the other side of the request.',
        ],
      },
      {
        id: 'damaged',
        title: '3. Damaged or incorrect on arrival',
        paragraphs: [
          'If a work arrives damaged, or is not what you configured, tell us within seven days of installation. We will replace it at no cost, and the replacement is prioritised in the next production run.',
          'We would rather replace a piece than argue about it. Photographs of the damage help, but we will not make you prove it.',
        ],
      },
      {
        id: 'deposit',
        title: '4. Returning the security deposit',
        paragraphs: [
          'When an arrangement ends and the works have been collected, the security deposit is returned within fourteen working days, less any agreed deduction for damage.',
          'We will always tell you the deduction, and why, before we make it.',
        ],
      },
      {
        id: 'how',
        title: '5. How refunds reach you',
        paragraphs: [
          'Refunds are made to the original payment method. UPI refunds typically settle within three to five working days; card refunds can take up to ten, depending on your bank.',
          `If you have not seen a refund after that window, email ${CONTACT.email} with your order reference and we will chase it with the provider on your behalf.`,
        ],
      },
    ],
  },

  cookies: {
    title: 'Cookie Policy',
    updated: UPDATED,
    intro:
      'ARTINU uses very little browser storage, and all of it is functional. This page names every key we set.',
    sections: [
      {
        id: 'what',
        title: '1. What we store',
        paragraphs: [
          '`ARTINU.token` — your signed session token, held in localStorage. It is what keeps you signed in between visits. Removing it signs you out.',
          '`ARTINU.cart.v1` — the contents of your cart before checkout, held in localStorage so a refresh does not lose your selections. It never leaves your browser until you place the order.',
          '`ARTINU.cookie-consent` — your answer to the cookie banner, so we stop asking.',
        ],
      },
      {
        id: 'not',
        title: '2. What we do not use',
        paragraphs: [
          'No advertising cookies. No cross-site tracking pixels. No third-party analytics that profile you as an individual across the web.',
          'Images are served from a public image host; those requests carry no identifying cookie from us.',
        ],
      },
      {
        id: 'control',
        title: '3. Staying in control',
        paragraphs: [
          'You can clear these keys at any time from your browser settings. Clearing them signs you out and empties your cart; nothing else is affected.',
          'Because all three keys are strictly functional, declining the banner does not disable them — without the session key you could not sign in at all. It records that we should not add anything beyond the essentials later.',
        ],
      },
    ],
  },

  community: {
    title: 'Community Guidelines',
    updated: UPDATED,
    intro: 'Welcome to the ARTINU community. Please respect the following guidelines.',
    sections: [
      {
        id: 'placeholder',
        title: '1. Guidelines',
        paragraphs: [
          'Placeholder content for community guidelines.',
        ],
      },
    ],
  },
};

export default function LegalPage() {
  const { document: slug = '' } = useParams();
  const doc = DOCUMENTS[slug];
  const [active, setActive] = React.useState<string>('');

  React.useEffect(() => {
    if (!doc) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-96px 0px -70% 0px', threshold: 0 },
    );

    for (const section of doc.sections) {
      const node = window.document.getElementById(section.id);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [doc]);

  if (!doc) {
    return (
      <Section>
        <Container size="prose">
          <p className="eyebrow">Legal</p>
          <h1 className="mt-4 font-display text-4xl text-ink">We don&rsquo;t have that document.</h1>
          <p className="prose-quiet mt-4">These are the ones we do have:</p>
          <ul className="mt-6 space-y-2">
            {Object.entries(DOCUMENTS).map(([key, entry]) => (
              <li key={key}>
                <Link to={`/legal/${key}`} className="text-bronze underline-offset-4 hover:underline">
                  {entry.title}
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </Section>
    );
  }

  return (
    <Section>
      <Container>
        <div className="grid gap-12 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-16">
          <aside className="hidden lg:block">
            <nav className="sticky top-24" aria-label="On this page">
              <p className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
                On this page
              </p>
              <ul className="mt-4 space-y-2">
                {doc.sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className={cn(
                        'block border-l-2 py-0.5 pl-3 text-[0.8125rem] transition-colors',
                        active === section.id
                          ? 'border-bronze font-medium text-ink'
                          : 'border-line text-muted hover:border-line-strong hover:text-ink',
                      )}
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <article className="min-w-0 max-w-2xl">
            <p className="eyebrow">Legal</p>
            <h1 className="mt-4 font-display text-[2.25rem] leading-tight text-ink sm:text-[2.75rem]">
              {doc.title}
            </h1>
            <p className="mt-3 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-subtle">
              Last updated {doc.updated}
            </p>
            <p className="prose-quiet mt-6 border-b border-line pb-8">{doc.intro}</p>

            {doc.sections.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-28 pt-10">
                <h2 className="font-display text-xl text-ink">{section.title}</h2>
                {section.paragraphs.map((paragraph, index) => (
                  <p key={index} className="prose-quiet mt-3 max-w-none">
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}

            <div className="mt-14 rounded-lg bg-sand-soft p-6">
              <p className="text-sm text-muted">
                Something here unclear? Write to{' '}
                <a href={`mailto:${CONTACT.email}`} className="text-bronze underline-offset-4 hover:underline">
                  {CONTACT.email}
                </a>{' '}
                and a person will answer.
              </p>
            </div>
          </article>
        </div>
      </Container>
    </Section>
  );
}
