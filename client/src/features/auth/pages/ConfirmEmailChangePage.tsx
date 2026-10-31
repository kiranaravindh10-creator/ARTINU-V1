import { useMutation } from '@tanstack/react-query';
import { Check, Loader2, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthCard, AuthSplit } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api';
import { IMAGES } from '@/lib/images';
import { peopleService } from '@/services/people.service';

/**
 * Where the "Confirm this address" link lands when ARTINU support corrects an
 * account's email. Confirming changes the sign-in address and signs the
 * account out everywhere, so the next step is always "sign in".
 *
 * Runs once on mount, guarded by a ref for the same reason as VerifyEmailPage:
 * the token is single-use, and React's development double-mount would spend it
 * on the first render and report failure on the second.
 */
export default function ConfirmEmailChangePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const confirm = useMutation({ mutationFn: () => peopleService.confirmEmailChange(token) });

  const started = React.useRef(false);
  React.useEffect(() => {
    if (started.current || !token) return;
    started.current = true;
    confirm.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <AuthSplit image={IMAGES.cafeWindow} imageAlt="Sunlight across a framed photograph">
      <div className="mx-auto w-full max-w-md">
        {!token ? (
          <AuthCard title="That link is incomplete" description="It arrived without a confirmation code.">
            <Button asChild className="w-full">
              <Link to="/signin">Go to sign in</Link>
            </Button>
          </AuthCard>
        ) : confirm.isPending || confirm.isIdle ? (
          <AuthCard title="Confirming your new address" description="One moment.">
            <p className="flex items-center gap-2.5 text-sm text-muted">
              <Loader2 className="size-4 animate-spin text-bronze" aria-hidden />
              Checking your confirmation link…
            </p>
          </AuthCard>
        ) : confirm.isSuccess ? (
          <AuthCard title="Address confirmed" description={`You now sign in with ${confirm.data.email}.`}>
            <div className="space-y-4">
              <p className="flex items-start gap-2.5 rounded-md border border-success/30 bg-success-soft px-3.5 py-3 text-sm text-ink-soft">
                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                <span>For your security you have been signed out everywhere. Sign in again with this address.</span>
              </p>
              <Button asChild className="w-full">
                <Link to="/signin">Sign in</Link>
              </Button>
            </div>
          </AuthCard>
        ) : (
          <AuthCard title="That link did not work" description="Confirmation links are single-use and expire after 48 hours.">
            <div className="space-y-4">
              <p className="flex items-start gap-2.5 rounded-md border border-line bg-sand-soft px-3.5 py-3 text-sm text-muted">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                <span>{errorMessage(confirm.error)}</span>
              </p>
              <p className="text-sm text-muted">Ask ARTINU support to send a new link, or sign in with your current address.</p>
              <Button asChild className="w-full">
                <Link to="/signin">Go to sign in</Link>
              </Button>
            </div>
          </AuthCard>
        )}
      </div>
    </AuthSplit>
  );
}
