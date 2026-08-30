import { useMutation } from '@tanstack/react-query';
import { Check, Loader2, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AuthCard, AuthSplit } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/button';
import { homePathForRole, useAuth } from '@/contexts/AuthContext';
import { errorMessage } from '@/lib/api';
import { IMAGES } from '@/lib/images';
import { authService } from '@/services/auth.service';

/**
 * The page the "Confirm email" button in the verification email lands on.
 *
 * It did not exist. `sendVerificationEmail` has always linked to
 * `/verify-email?token=…`, the API has always had `POST /auth/verify-email`, and
 * `authService.verifyEmail` has always been there to call it — but no route was
 * ever registered for that path, so every verification email ever sent landed on
 * the 404 page. The address bar showed the token; nothing consumed it.
 *
 * Verification runs once on mount rather than behind a button. The reader has
 * already expressed intent by clicking through from their inbox; asking them to
 * confirm that they meant to confirm is a click that carries no decision.
 */
export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { setSession, user } = useAuth();

  const verify = useMutation({
    mutationFn: () => authService.verifyEmail(token),
    onSuccess: (session) => {
      setSession(session);
      toast.success('Email confirmed.');
    },
  });

  /*
    Fired once, guarded by a ref.

    Without the guard React's development double-mount would spend the token on
    the first render and then report "this link has expired" on the second — the
    token is single-use, so the second call legitimately fails and the reader
    would see the failure, not the success.
  */
  const started = React.useRef(false);
  React.useEffect(() => {
    if (started.current || !token) return;
    started.current = true;
    verify.mutate();
    // `verify` is a stable mutation object; re-running on its identity would
    // defeat the guard's purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const home = homePathForRole(user?.role);

  return (
    <AuthSplit image={IMAGES.cafeWindow} imageAlt="Sunlight across a framed photograph">
      <div className="mx-auto w-full max-w-md">
        {!token ? (
          <AuthCard
            title="That link is incomplete"
            description="It arrived without a confirmation code."
          >
            <div className="space-y-4">
              <p className="flex items-start gap-2.5 rounded-md border border-line bg-sand-soft px-3.5 py-3 text-sm text-muted">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                <span>
                  Open the link from your email directly rather than copying part of it. If it
                  keeps failing, request a new one below.
                </span>
              </p>
              <Button asChild className="w-full">
                <Link to="/signin">Go to sign in</Link>
              </Button>
            </div>
          </AuthCard>
        ) : verify.isPending ? (
          <AuthCard title="Confirming your email" description="One moment.">
            <p className="flex items-center gap-2.5 text-sm text-muted">
              <Loader2 className="size-4 animate-spin text-bronze" aria-hidden />
              Checking your confirmation link…
            </p>
          </AuthCard>
        ) : verify.isSuccess ? (
          <AuthCard
            title="Email confirmed"
            description="Your address is verified and you are signed in."
          >
            <div className="space-y-4">
              <p className="flex items-start gap-2.5 rounded-md border border-success/30 bg-success-soft px-3.5 py-3 text-sm text-ink-soft">
                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                <span>That is everything - nothing else needs doing.</span>
              </p>
              <Button asChild className="w-full">
                <Link to={home}>
                  {home === '/' ? 'Start browsing' : 'Go to your dashboard'}
                </Link>
              </Button>
            </div>
          </AuthCard>
        ) : (
          <AuthCard
            title="That link did not work"
            description="Confirmation links are single-use and expire."
          >
            <div className="space-y-4">
              <p className="flex items-start gap-2.5 rounded-md border border-line bg-sand-soft px-3.5 py-3 text-sm text-muted">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                <span>{errorMessage(verify.error)}</span>
              </p>
              <p className="text-sm text-muted">
                If you have already confirmed this address, you can simply sign in. Otherwise
                request a fresh link from your account settings.
              </p>
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
