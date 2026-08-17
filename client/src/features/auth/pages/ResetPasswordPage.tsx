import { resetPasswordSchema, type ResetPasswordInput } from '@artinu/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AuthCard, AuthSplit } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/input';
import { PasswordRules } from '@/features/auth/components/AuthBits';
import { errorMessage } from '@/lib/api';
import { IMAGES } from '@/lib/images';
import { authService } from '@/services/auth.service';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: '', confirmPassword: '' },
  });

  const reset = useMutation({
    mutationFn: (input: ResetPasswordInput) => authService.resetPassword(input),
    onSuccess: () => {
      toast.success('Your password has been updated. Sign in with it now.');
      navigate('/signin', { replace: true });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (!token) {
    return (
      <AuthSplit image={IMAGES.forest} imageAlt="A quiet, fog-covered forest at first light">
        <AuthCard
          title="That link is incomplete"
          description="Reset links expire after an hour and can only be used once."
        >
          <div className="flex items-start gap-3 rounded-md border border-warning/30 bg-warning-soft p-4">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <p className="text-sm text-warning">
              We couldn&rsquo;t read a reset token from this address. Ask for a fresh link and try
              again.
            </p>
          </div>
          <Button asChild className="mt-5 w-full">
            <Link to="/forgot-password">Request a new link</Link>
          </Button>
        </AuthCard>
      </AuthSplit>
    );
  }

  return (
    <AuthSplit image={IMAGES.forest} imageAlt="A quiet, fog-covered forest at first light">
      <AuthCard title="Set a new password" description="Choose something you haven't used here before.">
        <form onSubmit={handleSubmit((values) => reset.mutate(values))} className="space-y-4">
          <input type="hidden" {...register('token')} />

          <Field label="New password" htmlFor="password" error={errors.password?.message}>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              placeholder="Create a password"
              invalid={!!errors.password}
              {...register('password')}
            />
            <PasswordRules password={watch('password')} />
          </Field>

          <Field
            label="Confirm password"
            htmlFor="confirmPassword"
            error={errors.confirmPassword?.message}
          >
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              placeholder="Repeat your password"
              invalid={!!errors.confirmPassword}
              {...register('confirmPassword')}
            />
          </Field>

          <Button type="submit" className="w-full" loading={reset.isPending}>
            Update password
          </Button>
        </form>
      </AuthCard>
    </AuthSplit>
  );
}
