import { RotateCw } from 'lucide-react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';
import { Logo } from '@/components/layout/Logo';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/layout/primitives';

/** Shown while a route chunk loads. Deliberately quiet — no spinner flash. */
export function RouteFallback() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center" role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <span className="size-1.5 animate-pulse rounded-full bg-bronze" aria-hidden />
    </div>
  );
}

/** Anything a route throws lands here rather than a white screen. */
export function RouteError() {
  const error = useRouteError();

  const status = isRouteErrorResponse(error) ? error.status : null;
  const title =
    status === 404 ? 'We could not find that page.' : 'Something went wrong on our side.';
  const detail =
    error instanceof Error
      ? error.message
      : isRouteErrorResponse(error)
        ? error.statusText
        : 'An unexpected error interrupted this page.';

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <Container className="py-8">
        <Logo />
      </Container>
      <Container className="flex flex-1 flex-col items-start justify-center gap-5 pb-24">
        <p className="eyebrow">{status ? `Error ${status}` : 'Error'}</p>
        <h1 className="max-w-2xl font-display text-4xl leading-[1.1] text-ink sm:text-5xl">
          {title}
        </h1>
        <p className="prose-quiet">{detail}</p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button onClick={() => window.location.reload()}>
            <RotateCw /> Try again
          </Button>
          <Button variant="outline" asChild>
            <Link to="/">Back to home</Link>
          </Button>
        </div>
      </Container>
    </div>
  );
}
