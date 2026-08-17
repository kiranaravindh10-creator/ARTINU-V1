import { phoneSignInSchema, signInSchema, type PhoneSignInInput, type SignInInput } from '@artinu/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Mail, Phone } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AuthCard, AuthFootnote, AuthSplit } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input, PasswordInput } from '@/components/ui/input';
import { SegmentedList, SegmentedTrigger, Tabs, TabsContent } from '@/components/ui/tabs';
import { homePathForRole, useAuth } from '@/contexts/AuthContext';
import { errorMessage } from '@/lib/api';
import { IMAGES } from '@/lib/images';
import { authService, type OtpChallenge } from '@/services/auth.service';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChevronDown } from 'lucide-react';


export default function SignInPage() {
  const [params] = useSearchParams();
  const next = params.get('next') ?? undefined;
  const navigate = useNavigate();
  const { setSession } = useAuth();

  const emailForm = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const phoneForm = useForm<PhoneSignInInput>({
    resolver: zodResolver(phoneSignInSchema),
    defaultValues: { phone: '' },
  });

  const goToOtp = (challenge: OtpChallenge) => {
    // sessionStorage as well as router state, so a refresh on the OTP screen
    // does not strand someone mid sign-in.
    sessionStorage.setItem('ARTINU.challenge', JSON.stringify(challenge));
    navigate(`/signin/verify?${next ? `&next=${next}` : ''}`, {
      state: { challenge },
    });
  };

  const signIn = useMutation({
    mutationFn: (input: SignInInput) => authService.signIn(input),
    onSuccess: (result) => {
      if ('challenge' in result) {
        goToOtp(result.challenge);
        return;
      }
      setSession(result.session);
      toast.success('Welcome back');
      // Derive the destination from the session we just received, not from
      // useAuth().homePath — that reads state React has not committed yet, so
      // it would still be the signed-out value and land everyone on the
      // public home page.
      navigate(next || homePathForRole(result.session.user.role), { replace: true });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  /**
   * Phone sign-in is not live yet.
   *
   * The endpoint behind it emails a code to the address on the account rather
   * than sending an SMS — there is no SMS provider — which is confusing enough
   * to be worse than saying "not yet". The form stays visible so the option is
   * discoverable, but it announces itself instead of half-working.
   */
  const [phoneComingSoon, setPhoneComingSoon] = React.useState(false);

  return (
    <AuthSplit image={IMAGES.photographerField} imageAlt="A photographer working in open country">
      <div className="mx-auto w-full max-w-md">
        <h1 className="font-display text-[2rem] leading-tight text-ink sm:text-[2.5rem]">
          Welcome
          <br />
          back.
        </h1>
        <p className="prose-quiet mt-4">
          Sign in to your ARTINU account.
        </p>
      </div>

      <AuthCard
        title="Welcome back"
        description="Sign in to your account"
        className="mt-8"
        footer={
          <div className="flex items-center gap-2 text-[0.8125rem]">
            <span className="text-muted">New to ARTINU?</span>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1 font-medium text-ink transition-colors hover:text-bronze focus-visible:outline-none">
                Register <ChevronDown className="size-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem asChild>
                  <Link to="/register/artist" className="cursor-pointer">
                    Register as Artist
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/register/artphiles" className="cursor-pointer">
                    Register as ArtPhiles
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      >
        <Tabs defaultValue="email">
          <SegmentedList className="w-full">
            <SegmentedTrigger value="email" className="flex-1 gap-1.5">
              <Mail className="inline size-3.5" aria-hidden /> Email
            </SegmentedTrigger>
            <SegmentedTrigger value="phone" className="flex-1 gap-1.5">
              <Phone className="inline size-3.5" aria-hidden /> Phone
            </SegmentedTrigger>
          </SegmentedList>

          <TabsContent value="email" className="pt-5">
            <form
              onSubmit={emailForm.handleSubmit((values) => signIn.mutate(values))}
              className="space-y-4"
            >
              <Field
                label="Email"
                htmlFor="email"
                error={emailForm.formState.errors.email?.message}
              >
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="Enter your email"
                  invalid={!!emailForm.formState.errors.email}
                  {...emailForm.register('email')}
                />
              </Field>

              <Field
                label="Password"
                htmlFor="password"
                error={emailForm.formState.errors.password?.message}
              >
                <PasswordInput
                  id="password"
                  placeholder="Enter your password"
                  invalid={!!emailForm.formState.errors.password}
                  {...emailForm.register('password')}
                />
              </Field>

              <div className="flex items-center justify-between gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-[0.8125rem] text-muted">
                  <Checkbox defaultChecked />
                  Remember me
                </label>
                <Link
                  to="/forgot-password"
                  className="text-[0.8125rem] text-bronze underline-offset-4 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>

              <Button type="submit" className="w-full" loading={signIn.isPending}>
                Sign In
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="phone" className="pt-5">
            <form
              onSubmit={phoneForm.handleSubmit(() => setPhoneComingSoon(true))}
              className="space-y-4"
            >
              <Field
                label="Phone number"
                htmlFor="phone"
                hint="Signing in with a phone number is coming soon."
                error={phoneForm.formState.errors.phone?.message}
              >
                <Input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+91 98765 43210"
                  invalid={!!phoneForm.formState.errors.phone}
                  {...phoneForm.register('phone')}
                />
              </Field>

              <Button type="submit" className="w-full">
                Send code
              </Button>
            </form>
          </TabsContent>
        </Tabs>

      </AuthCard>

      <Dialog open={phoneComingSoon} onOpenChange={setPhoneComingSoon}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Launching soon</DialogTitle>
            <DialogDescription>
              Phone number verification is to be launched soon. For now, please sign in with
              your email address and password.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button className="w-full" onClick={() => setPhoneComingSoon(false)}>
              Continue with email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AuthSplit>
  );
}
