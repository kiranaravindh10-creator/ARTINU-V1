import {
  ART_STYLE_LABELS,
  ART_STYLES,
  formatDate,
  registerStep1Schema,
  registerStep2Schema,
  registerStep3Schema,
  type ArtistRegistrationInput,
  type RegisterStep1Input,
  type RegisterStep2Input,
  type RegisterStep3Input,
} from '@artinu/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Check, MapPin, Pencil } from 'lucide-react';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AuthCard, AuthFootnote, AuthSplit, StepRail } from '@/components/layout/AuthLayout';
import { Logo } from '@/components/layout/Logo';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CharCount, Field } from '@/components/ui/field';
import { DateInput, Input, PasswordInput, PhoneInput, Textarea } from '@/components/ui/input';
import { LocationInput } from '@/components/ui/location-input';
import { Photo } from '@/components/ui/photo';
import { SimpleSelect } from '@/components/ui/select';
import { AvatarDropzone, PasswordRules } from '@/features/auth/components/AuthBits';
import { useAuth } from '@/contexts/AuthContext';
import { errorMessage } from '@/lib/api';
import { IMAGES } from '@/lib/images';
import { authService } from '@/services/auth.service';

type Draft = Partial<RegisterStep1Input & RegisterStep2Input & RegisterStep3Input>;

const TOTAL_STEPS = 4;

export default function ArtistRegisterPage() {
  const navigate = useNavigate();
  const { setSession } = useAuth();

  const [step, setStep] = React.useState(0); // 0 = intro, 1–4 = wizard, 5 = welcome
  const [draft, setDraft] = React.useState<Draft>({});
  const [accepted, setAccepted] = React.useState(false);
  const [termsError, setTermsError] = React.useState<string | null>(null);

  const register = useMutation({
    mutationFn: (input: ArtistRegistrationInput) => authService.registerArtist(input),
    onSuccess: (session) => {
      setSession(session);
      setStep(5);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const merge = (values: Draft) => setDraft((current) => ({ ...current, ...values }));

  if (step === 5) {
    return <WelcomeScreen />;
  }

  return (
    <AuthSplit
      image={IMAGES.camerasAndPrints}
      imageAlt="Cameras and printed photographs on a desk"
      side="right"
    >
      {step === 0 ? (
        <div className="mx-auto w-full max-w-md">
          <h1 className="font-display text-[2rem] leading-tight text-ink sm:text-[2.5rem]">
            Join a community that celebrates vision and story.
          </h1>
          <p className="prose-quiet mt-5">
            Create your artist account to start sharing your work with the world.
          </p>
          <Button size="lg" className="mt-8 w-full sm:w-auto" onClick={() => setStep(1)}>
            Register as Artist →
          </Button>
          <p className="mt-6 text-sm text-muted">
            <AuthFootnote question="Already have an account?" action="Sign In" to="/signin?as=artist" />
          </p>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-md">
          <StepRail current={step} total={TOTAL_STEPS} />

          {step === 1 && (
            <StepOne
              defaults={draft}
              onNext={(values) => {
                merge(values);
                setStep(2);
              }}
            />
          )}

          {step === 2 && (
            <StepTwo
              defaults={draft}
              onBack={() => setStep(1)}
              onNext={(values) => {
                merge(values);
                setStep(3);
              }}
            />
          )}

          {step === 3 && (
            <StepThree
              defaults={draft}
              onBack={() => setStep(2)}
              onNext={(values) => {
                merge(values);
                setStep(4);
              }}
            />
          )}

          {step === 4 && (
            <AuthCard
              title="All set!"
              description="Review your details and finish creating your artist account."
              onBack={() => setStep(3)}
              step={{ current: 4, total: TOTAL_STEPS }}
            >
              <dl className="divide-y divide-line rounded-md bg-sand-soft px-4">
                {[
                  { label: 'Name', value: draft.fullName, step: 1 },
                  { label: 'Artist Name', value: draft.artistName, step: 2 },
                  { label: 'Email', value: draft.email, step: 1 },
                  { label: 'Phone', value: draft.phone, step: 1 },
                  {
                    label: 'Date of Birth',
                    value: draft.dateOfBirth ? formatDate(draft.dateOfBirth, 'long') : undefined,
                    step: 1,
                  },
                  { label: 'Location', value: draft.location, step: 2 },
                  {
                    label: 'Art Style',
                    value: draft.artStyle ? ART_STYLE_LABELS[draft.artStyle] : undefined,
                    step: 2,
                  },
                  { label: 'Website', value: draft.website || undefined, step: 2 },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-[0.8125rem] text-muted">{row.label}</dt>
                    <dd className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm text-ink">{row.value || '-'}</span>
                      <button
                        type="button"
                        onClick={() => setStep(row.step)}
                        aria-label={`Edit ${row.label}`}
                        className="shrink-0 text-subtle transition-colors hover:text-bronze"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    </dd>
                  </div>
                ))}
              </dl>

              <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm text-muted">
                <Checkbox
                  checked={accepted}
                  onCheckedChange={(value) => {
                    setAccepted(value === true);
                    setTermsError(null);
                  }}
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
              {termsError && <p className="mt-2 text-xs text-danger">{termsError}</p>}

              <Button
                className="mt-5 w-full"
                loading={register.isPending}
                onClick={() => {
                  if (!accepted) {
                    setTermsError('Please accept the terms to create your account.');
                    return;
                  }
                  register.mutate({ ...(draft as ArtistRegistrationInput), acceptTerms: true });
                }}
              >
                Create Account
              </Button>
            </AuthCard>
          )}
        </div>
      )}
    </AuthSplit>
  );
}

function StepOne({ defaults, onNext }: { defaults: Draft; onNext: (values: RegisterStep1Input) => void }) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterStep1Input>({
    resolver: zodResolver(registerStep1Schema),
    defaultValues: {
      fullName: defaults.fullName ?? '',
      email: defaults.email ?? '',
      phone: defaults.phone ?? '',
      dateOfBirth: defaults.dateOfBirth ?? '',
      password: defaults.password ?? '',
    },
  });

  return (
    <AuthCard
      title="Create your account"
      description="Let's start with the basics."
      step={{ current: 1, total: TOTAL_STEPS }}
      footer={<AuthFootnote question="Already have an account?" action="Sign In" to="/signin?as=artist" />}
    >
      <form onSubmit={handleSubmit(onNext)} className="space-y-4">
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

        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            placeholder="Create a password"
            invalid={!!errors.password}
            {...register('password')}
          />
          <PasswordRules password={watch('password')} />
        </Field>

        <Button type="submit" className="w-full">
          Continue
        </Button>
      </form>
    </AuthCard>
  );
}

function StepTwo({
  defaults,
  onBack,
  onNext,
}: {
  defaults: Draft;
  onBack: () => void;
  onNext: (values: RegisterStep2Input) => void;
}) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<RegisterStep2Input>({
    resolver: zodResolver(registerStep2Schema),
    defaultValues: {
      artistName: defaults.artistName ?? '',
      location: defaults.location ?? '',
      website: defaults.website ?? '',
      artStyle: defaults.artStyle,
    },
  });

  return (
    <AuthCard
      title="Tell us about you"
      description="This helps spaces discover you."
      onBack={onBack}
      step={{ current: 2, total: TOTAL_STEPS }}
    >
      <form onSubmit={handleSubmit(onNext)} className="space-y-4">
        <Field label="Artist name" htmlFor="artistName" error={errors.artistName?.message}>
          <Input
            id="artistName"
            placeholder="Your professional name"
            invalid={!!errors.artistName}
            {...register('artistName')}
          />
        </Field>

        <Field label="Location" htmlFor="location" error={errors.location?.message}>
          <Controller
            name="location"
            control={control}
            render={({ field }) => (
              <LocationInput
                id="location"
                name={field.name}
                value={field.value ?? ''}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder="Start typing your city"
                invalid={!!errors.location}
              />
            )}
          />
        </Field>

        <Field label="Website or Social" htmlFor="website" hint="Optional" error={errors.website?.message}>
          <Input id="website" placeholder="https://" {...register('website')} />
        </Field>

        <Field label="Art Style / Genre" error={errors.artStyle?.message}>
          <Controller
            control={control}
            name="artStyle"
            render={({ field }) => (
              <SimpleSelect
                value={field.value}
                onValueChange={field.onChange}
                invalid={!!errors.artStyle}
                placeholder="Select your primary style"
                options={ART_STYLES.map((style) => ({ value: style, label: ART_STYLE_LABELS[style] }))}
              />
            )}
          />
        </Field>

        <Button type="submit" className="w-full">
          Continue
        </Button>
      </form>
    </AuthCard>
  );
}

function StepThree({
  defaults,
  onBack,
  onNext,
}: {
  defaults: Draft;
  onBack: () => void;
  onNext: (values: RegisterStep3Input) => void;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RegisterStep3Input>({
    resolver: zodResolver(registerStep3Schema),
    defaultValues: { bio: defaults.bio ?? '', avatarBase64: defaults.avatarBase64 ?? null },
  });

  const bio = watch('bio') ?? '';
  const avatar = watch('avatarBase64') ?? null;

  return (
    <AuthCard
      title="Tell your story"
      description="A short bio helps space owners connect with your work."
      onBack={onBack}
      step={{ current: 3, total: TOTAL_STEPS }}
    >
      <form onSubmit={handleSubmit(onNext)} className="space-y-5">
        <Field label="Bio" htmlFor="bio" error={errors.bio?.message} aside={<CharCount value={bio} max={500} />}>
          <Textarea
            id="bio"
            rows={5}
            placeholder="Write a short bio about yourself and your artistic journey…"
            {...register('bio')}
          />
        </Field>

        <AvatarDropzone
          value={avatar}
          onChange={(value) => setValue('avatarBase64', value, { shouldValidate: true })}
        />

        <div className="flex items-center gap-3">
          <Button type="submit" className="flex-1">
            Continue
          </Button>
          <Button type="button" variant="ghost" onClick={() => onNext({ bio: '', avatarBase64: null })}>
            Skip for now
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}

/** The dark welcome panel that closes the registration flow. */
function WelcomeScreen() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-ink px-6 text-center">
      <Photo src={IMAGES.darkroom} alt="" className="absolute inset-0 opacity-25" />
      <div className="relative">
        <Logo invert asLink={false} className="mx-auto" />
        <span className="mx-auto mt-10 flex size-16 items-center justify-center rounded-full border border-bronze-light/60 text-bronze-light">
          <Check className="size-8" strokeWidth={1.4} aria-hidden />
        </span>
        <h1 className="mt-8 font-display text-[2rem] leading-tight text-canvas sm:text-[2.5rem]">
          Welcome to ARTINU, Artist!
        </h1>
        <p className="mt-4 text-sm text-canvas/60">Your account has been created successfully.</p>
        <Button variant="light" shape="pill" size="lg" asChild className="mt-9">
          <Link to="/studio">Go to Workspace →</Link>
        </Button>
      </div>
    </div>
  );
}
