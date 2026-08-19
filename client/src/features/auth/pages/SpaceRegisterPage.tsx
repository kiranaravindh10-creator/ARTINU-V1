import {
  SPACE_TYPE_LABELS,
  SPACE_TYPES,
  spaceOwnerRegistrationSchema,
  type SpaceOwnerRegistrationInput,
} from '@artinu/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AuthCard, AuthFootnote, AuthSplit, StepRail } from '@/components/layout/AuthLayout';
import { Logo } from '@/components/layout/Logo';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { DateInput, Input, PhoneInput } from '@/components/ui/input';
import { Photo } from '@/components/ui/photo';
import { SimpleSelect } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { errorMessage } from '@/lib/api';
import { IMAGES } from '@/lib/images';
import { authService, type IssuedSession } from '@/services/auth.service';

const TOTAL_STEPS = 2;

export default function SpaceRegisterPage() {
  const { setSession } = useAuth();
  const [step, setStep] = React.useState(1);
  const [issued, setIssued] = React.useState<IssuedSession['credentials'] | null>(null);
  const [copied, setCopied] = React.useState(false);

  const {
    register,
    handleSubmit,
    control,
    watch,
    trigger,
    setValue,
    formState: { errors },
  } = useForm<SpaceOwnerRegistrationInput>({
    resolver: zodResolver(spaceOwnerRegistrationSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      dateOfBirth: '',
      spaceName: '',
      city: '',
      acceptTerms: undefined as never,
    },
  });

  const create = useMutation({
    mutationFn: (input: SpaceOwnerRegistrationInput) => authService.registerSpaceOwner(input),
    onSuccess: (session) => {
      setSession(session);
      setIssued(session.credentials ?? { spaceCode: null, email: '', password: '' });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  /**
   * The hand-over screen. Requirements §1: ARTINU generates the ID and the
   * password, so this is the one moment the owner ever sees the password —
   * it is not emailed, and the server did not keep the plaintext. Hence the
   * copy button and the blunt warning rather than a cheerful "you're all set".
   */
  if (issued) {
    return (
      <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-ink px-6 py-16 text-center">
        <Photo src={IMAGES.cafeInterior} alt="" className="absolute inset-0 opacity-25" />
        <div className="relative w-full max-w-md">
          <Logo invert asLink={false} className="mx-auto" />
          <span className="mx-auto mt-8 flex size-14 items-center justify-center rounded-full border border-bronze-light/60 text-bronze-light">
            <Check className="size-7" strokeWidth={1.4} aria-hidden />
          </span>
          <h1 className="mt-6 font-display text-[1.75rem] leading-tight text-canvas sm:text-[2.25rem]">
            Welcome to ARTINU.
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm text-canvas/60">
            These are your sign-in details. Write them down now — we don&rsquo;t email passwords,
            and this is the only time this one is shown.
          </p>

          <dl className="mt-7 space-y-px overflow-hidden rounded-md border border-canvas/15 text-left">
            {issued.spaceCode && (
              <div className="flex items-baseline justify-between gap-4 bg-canvas/[0.06] px-4 py-3">
                <dt className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-canvas/50">
                  Space ID
                </dt>
                <dd className="font-mono text-sm text-bronze-light">{issued.spaceCode}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-4 bg-canvas/[0.06] px-4 py-3">
              <dt className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-canvas/50">
                Sign in with
              </dt>
              <dd className="min-w-0 truncate text-sm text-canvas">{issued.email}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 bg-canvas/[0.06] px-4 py-3">
              <dt className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-canvas/50">
                Password
              </dt>
              <dd className="font-mono text-base tracking-wider text-bronze-light">
                {issued.password}
              </dd>
            </div>
          </dl>

          <Button
            variant="outline"
            shape="pill"
            className="mt-4 w-full border-canvas/25 text-canvas hover:bg-canvas/10"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(
                  [
                    issued.spaceCode && `ARTINU Space ID: ${issued.spaceCode}`,
                    `Email: ${issued.email}`,
                    `Password: ${issued.password}`,
                  ]
                    .filter(Boolean)
                    .join('\n'),
                )
                .then(
                  () => {
                    setCopied(true);
                    toast.success('Copied. Keep it somewhere safe.');
                  },
                  () => toast.error('Could not copy — please write the details down.'),
                );
            }}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? 'Copied' : 'Copy my details'}
          </Button>

          <p className="mt-5 text-xs leading-relaxed text-canvas/45">
            You&rsquo;ll be asked to choose your own password the first time you sign in.
          </p>

          <Button variant="light" shape="pill" size="lg" asChild className="mt-6">
            <Link to="/space/register-space">Go to dashboard →</Link>
          </Button>
        </div>
      </div>
    );
  }

  const goToStepTwo = async () => {
    const valid = await trigger(['fullName', 'email', 'phone', 'dateOfBirth']);
    if (valid) setStep(2);
  };

  return (
    <AuthSplit image={IMAGES.cafeInterior} imageAlt="A framed photograph on a warm café wall">
      <div className="mx-auto w-full max-w-md">
        <h1 className="font-display text-[2rem] leading-tight text-ink sm:text-[2.5rem]">
          Bring your walls to life.
        </h1>
        <p className="prose-quiet mt-4">
          Create your space account and start browsing collections curated for rooms like yours.
        </p>
      </div>

      <form onSubmit={handleSubmit((values) => create.mutate(values))} className="mx-auto mt-8 w-full max-w-md">
        <StepRail current={step} total={TOTAL_STEPS} />

        {step === 1 ? (
          <AuthCard
            title="Create your account"
            description="Let's start with the basics."
            step={{ current: 1, total: TOTAL_STEPS }}
            footer={
              <AuthFootnote question="Already have an account?" action="Sign In" to="/signin?as=space" />
            }
          >
            <div className="space-y-4">
              <Field label="Full name" htmlFor="fullName" error={errors.fullName?.message}>
                <Input
                  id="fullName"
                  placeholder="Enter your full name"
                  invalid={!!errors.fullName}
                  {...register('fullName')}
                />
              </Field>

              <Field label="Email" htmlFor="email" error={errors.email?.message}>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  invalid={!!errors.email}
                  {...register('email')}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Phone number" htmlFor="phone" error={errors.phone?.message}>
                  <PhoneInput id="phone" invalid={!!errors.phone} {...register('phone')} />
                </Field>

                <Field
                  label="Date of birth"
                  htmlFor="dateOfBirth"
                  error={errors.dateOfBirth?.message}
                >
                  <DateInput
                    id="dateOfBirth"
                    autoComplete="bday"
                    invalid={!!errors.dateOfBirth}
                    {...register('dateOfBirth')}
                  />
                </Field>
              </div>

              <p className="rounded-md border border-line bg-sand-soft px-3.5 py-3 text-xs leading-relaxed text-muted">
                No password to think up — ARTINU issues your space ID and a password when you
                finish, and shows them to you once.
              </p>

              <Button type="button" className="w-full" onClick={() => void goToStepTwo()}>
                Continue
              </Button>
            </div>
          </AuthCard>
        ) : (
          <AuthCard
            title="Tell us about your space"
            description="You can refine all of this later."
            onBack={() => setStep(1)}
            step={{ current: 2, total: TOTAL_STEPS }}
          >
            <div className="space-y-4">
              <Field label="Space name" htmlFor="spaceName" error={errors.spaceName?.message}>
                <Input
                  id="spaceName"
                  placeholder="e.g. Blue Tokai — Koramangala"
                  invalid={!!errors.spaceName}
                  {...register('spaceName')}
                />
              </Field>

              <Field label="Type of space" error={errors.spaceType?.message}>
                <Controller
                  control={control}
                  name="spaceType"
                  render={({ field }) => (
                    <SimpleSelect
                      value={field.value}
                      onValueChange={field.onChange}
                      invalid={!!errors.spaceType}
                      placeholder="Select space type"
                      options={SPACE_TYPES.map((type) => ({
                        value: type,
                        label: SPACE_TYPE_LABELS[type],
                      }))}
                    />
                  )}
                />
              </Field>

              <Field label="City" htmlFor="city" error={errors.city?.message}>
                <Input
                  id="city"
                  placeholder="Bengaluru"
                  invalid={!!errors.city}
                  {...register('city')}
                />
              </Field>

              <label className="flex cursor-pointer items-start gap-3 pt-1 text-sm text-muted">
                <Checkbox
                  checked={watch('acceptTerms') === true}
                  onCheckedChange={(value) =>
                    setValue('acceptTerms', (value === true) as never, { shouldValidate: true })
                  }
                  className="mt-0.5"
                />
                <span>
                  I agree to ARTINU&rsquo;s{' '}
                  <Link to="/legal/terms" className="text-bronze underline underline-offset-4">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link to="/legal/privacy" className="text-bronze underline underline-offset-4">
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>
              {errors.acceptTerms && (
                <p className="text-xs text-danger">{errors.acceptTerms.message}</p>
              )}

              <Button type="submit" className="w-full" loading={create.isPending}>
                Create Account
              </Button>
            </div>
          </AuthCard>
        )}
      </form>
    </AuthSplit>
  );
}
