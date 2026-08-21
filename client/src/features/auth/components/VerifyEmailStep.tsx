import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Mail } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { errorMessage } from '@/lib/api';
import { verificationService } from '@/services/moderation.service';

/**
 * The 6-digit email verification step.
 *
 * ── What it does not do ─────────────────────────────────────────────────────
 *
 * It never sees the code. The code exists in the email and in a hash on the
 * server; this component sends what the person typed and is told yes or no.
 * There is no "dev code" shortcut here and no way to read it from the client.
 *
 * ── Sending ─────────────────────────────────────────────────────────────────
 *
 * Registration has already sent one, so this does not send another on mount —
 * that would immediately trip the server's 60-second cooldown and show an error
 * to somebody who has done nothing wrong. It asks for a `challengeId` on first
 * render only if one was not handed in.
 */
export function VerifyEmailStep({
  challengeId: initialChallengeId,
  sentTo,
  onVerified,
  onSkip,
}: {
  /** From registration, when it managed to send one. */
  challengeId?: string | null;
  sentTo?: string | null;
  onVerified?: () => void;
  /** Omit to make verification the only way forward. */
  onSkip?: () => void;
}) {
  const { setSession, user } = useAuth();

  const [challengeId, setChallengeId] = React.useState(initialChallengeId ?? null);
  const [maskedAddress, setMaskedAddress] = React.useState(sentTo ?? null);
  const [code, setCode] = React.useState('');
  const [cooldown, setCooldown] = React.useState(0);

  // Counts down the resend button so the cooldown is visible rather than being
  // discovered by pressing it and getting an error.
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const send = useMutation({
    mutationFn: () => verificationService.send(),
    onSuccess: (issued) => {
      setChallengeId(issued.challengeId);
      setMaskedAddress(issued.sentTo);
      setCooldown(60);
      toast.success('A new code is on its way.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const confirm = useMutation({
    mutationFn: () => verificationService.confirm(challengeId!, code.trim()),
    onSuccess: (session) => {
      // A fresh session, so `emailVerified` — and the badge that reads it —
      // update everywhere without a reload.
      setSession(session);
      toast.success('Your email address is verified.');
      onVerified?.();
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      setCode('');
    },
  });

  // No challenge yet (registration could not send one) — ask for the first code.
  React.useEffect(() => {
    if (!challengeId && !send.isPending && cooldown === 0) send.mutate();
    // Deliberately once: this is the "we have nothing to verify against" case.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = /^\d{6}$/.test(code.trim()) && Boolean(challengeId);

  return (
    <div className="mx-auto w-full max-w-md">
      <span className="flex size-11 items-center justify-center rounded-full bg-bronze-soft text-bronze">
        <Mail className="size-5" aria-hidden />
      </span>

      <h1 className="mt-5 font-display text-[1.75rem] leading-tight text-ink">
        Verify your email
      </h1>
      <p className="prose-quiet mt-3">
        We&rsquo;ve sent a 6-digit verification code to{' '}
        <span className="font-medium text-ink">{maskedAddress ?? user?.email ?? 'your email address'}</span>.
        It expires in 10 minutes.
      </p>

      <form
        className="mt-7 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) confirm.mutate();
        }}
      >
        <Field label="Verification code" htmlFor="verification-code">
          <Input
            id="verification-code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            aria-describedby="verification-help"
            className="text-center font-mono text-xl tracking-[0.4em]"
          />
        </Field>

        <Button type="submit" className="w-full" loading={confirm.isPending} disabled={!ready}>
          Verify email
        </Button>
      </form>

      <div className="mt-5 flex items-center justify-between gap-4">
        <p id="verification-help" className="text-xs text-subtle">
          Didn&rsquo;t get it? Check your spam folder.
        </p>
        <Button
          variant="ghost"
          size="sm"
          loading={send.isPending}
          disabled={cooldown > 0}
          onClick={() => send.mutate()}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
        </Button>
      </div>

      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="mt-8 text-sm text-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink"
        >
          I&rsquo;ll do this later
        </button>
      )}
    </div>
  );
}

/** The tick, wherever a verified address should be shown. */
export function VerifiedBadge({ verified }: { verified: boolean }) {
  if (!verified) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-bronze"
      title="Email address verified"
    >
      <CheckCircle2 className="size-4" aria-hidden />
      <span className="sr-only">Verified</span>
    </span>
  );
}
