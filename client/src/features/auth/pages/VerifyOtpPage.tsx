import { OTP } from '@artinu/shared';
import { useMutation } from '@tanstack/react-query';
import * as React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AuthCard, AuthSplit } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/button';
import { DiamondOtpInput, useCountdown } from '@/features/auth/components/AuthBits';
import { homePathForRole, useAuth } from '@/contexts/AuthContext';
import { errorMessage } from '@/lib/api';
import { IMAGES } from '@/lib/images';
import { authService, type OtpChallenge } from '@/services/auth.service';
import { cn } from '@/lib/utils';

function readChallenge(state: unknown): OtpChallenge | null {
  const fromState = (state as { challenge?: OtpChallenge } | null)?.challenge;
  if (fromState) return fromState;

  try {
    const stored = sessionStorage.getItem('ARTINU.challenge');
    return stored ? (JSON.parse(stored) as OtpChallenge) : null;
  } catch {
    return null;
  }
}

export default function VerifyOtpPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { setSession } = useAuth();
  
  const searchParams = new URLSearchParams(location.search);
  const nextRoute = searchParams.get('next');

  const [challenge, setChallenge] = React.useState<OtpChallenge | null>(() =>
    readChallenge(location.state),
  );
  const [code, setCode] = React.useState('');
  const [invalid, setInvalid] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);

  const countdown = useCountdown(challenge?.expiresAt);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const verify = useMutation({
    mutationFn: (value: string) =>
      authService.verifyOtp({ challengeId: challenge!.challengeId, code: value }),
    onSuccess: (session) => {
      sessionStorage.removeItem('ARTINU.challenge');
      setSession(session);
      toast.success('Signed in');
      navigate(nextRoute || homePathForRole(session.user.role), { replace: true });
    },
    onError: (error) => {
      setInvalid(true);
      setCode('');
      toast.error(errorMessage(error));
    },
  });

  const resend = useMutation({
    mutationFn: () => authService.resendOtp(challenge!.challengeId),
    onSuccess: (next) => {
      setChallenge(next);
      sessionStorage.setItem('ARTINU.challenge', JSON.stringify(next));
      setCode('');
      setInvalid(false);
      setCooldown(OTP.RESEND_COOLDOWN_SECONDS);
      toast.success('A new code is on its way');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (!challenge) {
    return (
      <AuthSplit image={IMAGES.prints} imageAlt="Studio">
        <AuthCard
          title="That sign-in has expired"
          description="Start again and we'll send you a fresh code."
        >
          <Button asChild className="w-full">
            <Link to="/signin">Back to sign in</Link>
          </Button>
        </AuthCard>
      </AuthSplit>
    );
  }

  return (
    <AuthSplit image={IMAGES.prints} imageAlt="Studio">
      <AuthCard
        title="Verify it&rsquo;s you"
        onBack={() => navigate('/signin')}
        description={
          <>
            Enter the {OTP.LENGTH}-digit code sent to{' '}
            <span className="font-medium text-ink">{challenge.sentTo}</span>{' '}
            <Link to="/signin" className="font-medium text-bronze underline-offset-4 hover:underline">
              Change
            </Link>
          </>
        }
      >
        <DiamondOtpInput
          value={code}
          onChange={(value) => {
            setCode(value);
            setInvalid(false);
          }}
          onComplete={(value) => verify.mutate(value)}
          disabled={verify.isPending || countdown.expired}
          invalid={invalid}
        />

        <p
          className={cn(
            'mt-4 text-sm',
            countdown.expired ? 'text-danger' : countdown.remaining < 20 ? 'text-warning' : 'text-muted',
          )}
        >
          {countdown.expired ? 'That code has expired.' : `Code expires in ${countdown.label}`}
        </p>

        {challenge.devCode && (
          <p className="mt-3 rounded-md border border-dashed border-bronze/50 bg-bronze-soft/50 px-3 py-2 font-mono text-xs text-bronze-deep">
            Development code: {challenge.devCode}
          </p>
        )}

        <p className="mt-4 text-sm text-muted">
          Didn&rsquo;t receive the code?{' '}
          <button
            type="button"
            disabled={cooldown > 0 || resend.isPending}
            onClick={() => resend.mutate()}
            className="text-bronze underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-subtle disabled:no-underline"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend'}
          </button>
        </p>

        <Button
          className="mt-6 w-full"
          loading={verify.isPending}
          disabled={code.length < OTP.LENGTH || countdown.expired}
          onClick={() => verify.mutate(code)}
        >
          Verify &amp; Continue
        </Button>
      </AuthCard>
    </AuthSplit>
  );
}
