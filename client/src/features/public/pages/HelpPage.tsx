import { CONTACT } from '@artinu/shared';
import * as React from 'react';
import { Container, Section } from '@/components/layout/primitives';

export default function HelpPage() {
  return (
    <Section>
      <Container size="prose">
        <p className="eyebrow">Help & Support</p>
        <h1 className="mt-4 font-display text-[2.25rem] leading-tight text-ink sm:text-[2.75rem]">
          Get in touch for any inquiries.
        </h1>
        <p className="prose-quiet mt-6 border-b border-line pb-8">
          Whether you need help with an order, have a question about our services, or want to report an issue, our team is here to assist you.
        </p>

        <section className="pt-10">
          <h2 className="font-display text-xl text-ink">Contact Details</h2>
          <div className="mt-6 flex flex-col gap-4 text-muted">
            <p>
              <strong className="text-ink">Phone:</strong> {CONTACT.phone}
            </p>
            <p>
              <strong className="text-ink">Email:</strong>{' '}
              <a href={`mailto:${CONTACT.email}`} className="text-bronze hover:underline">
                {CONTACT.email}
              </a>
            </p>
            <div>
              <strong className="text-ink">Operating Hours:</strong>
              <ul className="mt-2 list-disc pl-5">
                {CONTACT.hours.map((h, i) => (
                  <li key={i}>{h.days}: {h.time}</li>
                ))}
              </ul>
            </div>
            <p>
              <strong className="text-ink">Address:</strong><br />
              {CONTACT.address.line1}<br />
              {CONTACT.address.line2 && <>{CONTACT.address.line2}<br /></>}
              {CONTACT.address.city}, {CONTACT.address.state} {CONTACT.address.pin}
            </p>
          </div>
        </section>
      </Container>
    </Section>
  );
}
