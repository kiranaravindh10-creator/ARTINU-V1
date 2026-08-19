import { signUpSchema, type SignUpInput } from '@artinu/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AuthCard, AuthFootnote, AuthSplit } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { DateInput, Input, PasswordInput, PhoneInput } from '@/components/ui/input';
import { PasswordRules } from '@/features/auth/components/AuthBits';
import { useAuth } from '@/contexts/AuthContext';
import { errorMessage } from '@/lib/api';
import { IMAGES } from '@/lib/images';
import { authService } from '@/services/auth.service';

export default function ArtPhilesRegisterPage() {
  const navigate = useNavigate();
  const { setSession } = useAuth();

  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      dateOfBirth: '',
      password: '',
      confirmPassword: '',
      role: 'guest',
      acceptTerms: true,
    },
  });

  const signUp = useMutation({
    mutationFn: (input: SignUpInput) => authService.signUp(input),
    onSuccess: (session) => {
      setSession(session);
      toast.success('Welcome to Artinu!');
      navigate('/', { replace: true });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const passwordValue = form.watch('password');

  return (
    <AuthSplit
      image={IMAGES.camerasAndPrints}
      imageAlt="A beautifully curated gallery wall"
      side="right"
    >
      <div className="mx-auto w-full max-w-md">
        <h1 className="font-display text-[2rem] leading-tight text-ink sm:text-[2.5rem]">
          Become an ArtPhile.
        </h1>
        <p className="prose-quiet mt-4">
          Join a community that celebrates vision and story. Follow artists, curate your favorites, and immerse yourself in the art.
        </p>

        <AuthCard
          title="Create account"
          description="Sign up as an ArtPhile"
          className="mt-8"
          footer={<AuthFootnote question="Already have an account?" action="Sign In" to="/signin" />}
        >
          <form
            onSubmit={form.handleSubmit((values) => signUp.mutate(values))}
            className="space-y-4"
          >
            <Field label="Full Name" htmlFor="fullName" error={form.formState.errors.fullName?.message}>
              <Input
                id="fullName"
                placeholder="Jane Doe"
                invalid={!!form.formState.errors.fullName}
                {...form.register('fullName')}
              />
            </Field>

            <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                invalid={!!form.formState.errors.email}
                {...form.register('email')}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone number" htmlFor="phone" error={form.formState.errors.phone?.message}>
                <PhoneInput
                  id="phone"
                  invalid={!!form.formState.errors.phone}
                  {...form.register('phone')}
                />
              </Field>

              <Field
                label="Date of birth"
                htmlFor="dateOfBirth"
                error={form.formState.errors.dateOfBirth?.message}
              >
                <DateInput
                  id="dateOfBirth"
                  autoComplete="bday"
                  invalid={!!form.formState.errors.dateOfBirth}
                  {...form.register('dateOfBirth')}
                />
              </Field>
            </div>

            <Field label="Password" htmlFor="password" error={form.formState.errors.password?.message}>
              <PasswordInput
                id="password"
                placeholder="Create a password"
                invalid={!!form.formState.errors.password}
                {...form.register('password')}
              />
            </Field>

            <Field
              label="Confirm Password"
              htmlFor="confirmPassword"
              error={form.formState.errors.confirmPassword?.message}
            >
              <PasswordInput
                id="confirmPassword"
                placeholder="Confirm your password"
                invalid={!!form.formState.errors.confirmPassword}
                {...form.register('confirmPassword')}
              />
            </Field>

            {passwordValue && <div className="mb-4"><PasswordRules password={passwordValue} /></div>}

            <div className="flex items-start gap-3 py-2">
              <Checkbox
                id="acceptTerms"
                checked={form.watch('acceptTerms')}
                onCheckedChange={(checked) => form.setValue('acceptTerms', checked as true)}
              />
              <label htmlFor="acceptTerms" className="text-[0.8125rem] leading-snug text-muted">
                I agree to the <Link to="/legal/terms" className="text-bronze hover:underline">Terms of Service</Link> and <Link to="/legal/privacy" className="text-bronze hover:underline">Privacy Policy</Link>.
              </label>
            </div>
            {form.formState.errors.acceptTerms && (
              <p className="text-xs text-danger">{form.formState.errors.acceptTerms.message}</p>
            )}

            <Button type="submit" className="w-full" loading={signUp.isPending}>
              Create account
            </Button>
          </form>
        </AuthCard>
      </div>
    </AuthSplit>
  );
}
