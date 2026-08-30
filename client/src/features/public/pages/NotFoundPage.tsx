import { ArrowLink, Container, Section } from '@/components/layout/primitives';
import { Photo } from '@/components/ui/photo';
import { IMAGES } from '@/lib/images';

export default function NotFoundPage() {
  return (
    <Section>
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="eyebrow">404</p>
            <h1 className="mt-5 font-display text-[2.5rem] leading-tight text-ink sm:text-[3rem]">
              That page has moved on.
            </h1>
            <p className="prose-quiet mt-5">
              Like the work on our walls, some things rotate. The page you were looking for
              isn&rsquo;t here any more - but there is plenty else worth seeing.
            </p>

            <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:gap-8">
              <ArrowLink to="/">Back to home</ArrowLink>
              <ArrowLink to="/gallery">Browse the gallery</ArrowLink>
              <ArrowLink to="/lets-talk">Let&rsquo;s talk</ArrowLink>
            </div>
          </div>

          <Photo
            src={IMAGES.forest}
            alt="A misty landscape at first light"
            ratio="aspect-[4/3]"
            className="rounded-lg"
          />
        </div>
      </Container>
    </Section>
  );
}
