import { forgotPasswordSchema, type ForgotPasswordInput } from '@artinu/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AuthCard, AuthFootnote, AuthSplit } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { IMAGES } from '@/lib/images';
import { authService } from '@/services/auth.service';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const [devToken, setDevToken] = React.useState<string | undefined>();

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const request = useMutation({
    mutationFn: (input: ForgotPasswordInput) => authService.forgotPassword(input),
    onSuccess: (result) => {
      setSentTo(getValues('email'));
      setDevToken(result.devToken);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <AuthSplit image={IMAGES.forest} imageAlt="A quiet, fog-covered forest at first light">
      {sentTo ? (
        <AuthCard
          title="Check your inbox"
          description="If that address has an account, a reset link is on its way."
          onBack={() => setSentTo(null)}
        >
          <div className="flex items-start gap-3 rounded-md border border-line bg-canvas-soft p-4">
            <Mail className="mt-0.5 size-4 shrink-0 text-bronze" aria-hidden />
            <p className="text-sm text-muted">
              We sent it to <span className="font-medium text-ink">{sentTo}</span>. The link is good
              for one hour.
            </p>
          </div>

          {devToken && (
            <Button
              variant="outline"
              className="mt-4 w-full"
              onClick={() => navigate(`/reset-password?token=${devToken}`)}
            >
              Open reset link (development)
            </Button>
          )}

          <Button
            variant="ghost"
            className="mt-2 w-full"
            loading={request.isPending}
            onClick={() => request.mutate({ email: sentTo })}
          >
            Send it again
          </Button>
        </AuthCard>
      ) : (
        <AuthCard
          title="Forgot password?"
          description="Enter your email and we'll send you a link to reset your password."
          onBack={() => navigate('/signin')}
          footer={
            <AuthFootnote
              question="Remembered your password?"
              action="Sign In"
              to="/signin"
            />
          }
        >
          <form onSubmit={handleSubmit((values) => request.mutate(values))} className="space-y-4">
            <Field label="Email" htmlFor="email" error={errors.email?.message}>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="Enter your email"
                invalid={!!errors.email}
                {...register('email')}
              />
            </Field>

            <Button type="submit" className="w-full" loading={request.isPending}>
              Send reset link
            </Button>
          </form>
        </AuthCard>
      )}
    </AuthSplit>
  );
}
