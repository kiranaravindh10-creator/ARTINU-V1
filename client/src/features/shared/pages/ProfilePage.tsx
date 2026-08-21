import {
  ART_STYLE_LABELS,
  ART_STYLES,
  CONTACT,
  formatDate,
  profileUpdateSchema,
  ROLE_LABELS,
  type ProfileUpdateInput,
} from '@artinu/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  ChevronRight,
  LifeBuoy,
  LogOut,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PanelHeader } from '@/components/layout/DashboardShell';
import { SectionHead, Status } from '@/components/layout/panel';
import { Button } from '@/components/ui/button';
import { CharCount, Field } from '@/components/ui/field';
import { Avatar } from '@/components/ui/display';
import { Input, Textarea } from '@/components/ui/input';
import { Photo } from '@/components/ui/photo';
import { useAuth } from '@/contexts/AuthContext';
import { useUnreadNotifications } from '@/hooks/useNotifications';
import { errorMessage } from '@/lib/api';
import { authService } from '@/services/auth.service';
import { fileToBase64, readImageSize } from '@/lib/utils';
import { cn } from '@/lib/utils';

type Pane = 'profile' | 'account' | 'security' | 'support';

export default function ProfilePage() {
  const { user, profile, updateProfile, signOut } = useAuth();
  const { count: unread } = useUnreadNotifications();
  const avatarInput = React.useRef<HTMLInputElement>(null);
  const coverInput = React.useRef<HTMLInputElement>(null);
  const isArtist = user?.role === 'artist';
  const base = isArtist ? '/studio' : '/space';

  const [pane, setPane] = React.useState<Pane>('profile');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<ProfileUpdateInput>({
    resolver: zodResolver(profileUpdateSchema),
    values: {
      fullName: profile?.fullName ?? '',
      displayName: profile?.displayName ?? '',
      phone: profile?.phone ?? '',
      city: profile?.city ?? '',
      country: profile?.country ?? '',
      bio: profile?.bio ?? '',
      website: profile?.website ?? '',
      instagram: profile?.instagram ?? '',
      genres: profile?.genres ?? [],
      avatarUrl: profile?.avatarUrl ?? '',
    },
  });

  const save = useMutation({
    mutationFn: (input: ProfileUpdateInput) => authService.updateProfile(input),
    onSuccess: (updated) => {
      updateProfile(updated);
      toast.success('Profile updated');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

const uploadAvatar = useMutation({
    mutationFn: (dataUrl: string) => authService.uploadAvatar(dataUrl),
    onSuccess: (result) => {
      if (profile) updateProfile({ ...profile, avatarUrl: result.avatarUrl });
      setAvatarPreview(null);
      toast.success('Photo updated');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const uploadCover = useMutation({
    mutationFn: (dataUrl: string) => authService.uploadCover(dataUrl),
    onSuccess: (result) => {
      if (profile) updateProfile({ ...profile, coverUrl: result.coverUrl });
      setCoverPreview(null);
      toast.success('Cover image updated');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null);
  const [coverPreview, setCoverPreview] = React.useState<string | null>(null);

  const handleAvatarSelect = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('That image is larger than 5 MB.');
      return;
    }
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast.error('Please upload a JPG, PNG, or WebP image.');
      return;
    }
    const dataUrl = await fileToBase64(file);
    const { width, height } = await readImageSize(dataUrl);
    const ratio = width / height;
    if (ratio < 0.8 || ratio > 1.25) {
      toast.warning('For best results, use a square image (1:1 aspect ratio).');
    }
    setAvatarPreview(dataUrl);
  };

  const handleCoverSelect = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('That image is larger than 5 MB.');
      return;
    }
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast.error('Please upload a JPG, PNG, or WebP image.');
      return;
    }
    const dataUrl = await fileToBase64(file);
    const { width, height } = await readImageSize(dataUrl);
    const ratio = width / height;
    if (ratio < 3 || ratio > 4.5) {
      toast.warning('For best results, use a wide image (3:1 to 4:1 aspect ratio).');
    }
    setCoverPreview(dataUrl);
  };

  const confirmAvatarUpload = () => {
    if (avatarPreview) {
      uploadAvatar.mutate(avatarPreview);
    }
  };

  const confirmCoverUpload = () => {
    if (coverPreview) {
      uploadCover.mutate(coverPreview);
    }
  };

  const cancelAvatarPreview = () => setAvatarPreview(null);
  const cancelCoverPreview = () => setCoverPreview(null);

  const resendVerification = useMutation({
    mutationFn: () => authService.resendVerification(),
    onSuccess: () => toast.success('Verification email sent'),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const requestPasswordReset = useMutation({
    mutationFn: () => authService.forgotPassword({ email: user!.email }),
    onSuccess: () => toast.success(`We've emailed a reset link to ${user?.email}`),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const genres = watch('genres') ?? [];
  const bio = watch('bio') ?? '';

  const toggleGenre = (value: string) => {
    if (genres.includes(value)) {
      setValue(
        'genres',
        genres.filter((genre) => genre !== value),
        { shouldDirty: true },
      );
      return;
    }
    if (genres.length >= 3) {
      toast('You can choose up to three genres.');
      return;
    }
    setValue('genres', [...genres, value], { shouldDirty: true });
  };

  return (
    <div>
      <PanelHeader
        icon={UserRound}
        title="Account"
        description="Manage your account and preferences."
      />

      <div className="grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
        {/* ── Who you are, and the way around ──────────────────────────── */}
        <aside className="lg:sticky lg:top-6 lg:h-fit">
          <div className="flex items-center gap-4 border-b border-line pb-6">
            <Avatar
              name={profile?.fullName ?? user?.email}
              src={profile?.avatarUrl}
              className="size-16 shrink-0"
            />
            <div className="min-w-0">
              <p className="truncate font-display text-lg leading-tight text-ink">
                {profile?.fullName ?? 'Your account'}
              </p>
              <p className="truncate text-xs text-muted">
                {user ? ROLE_LABELS[user.role] : '—'}
              </p>
              {(profile?.city || profile?.country) && (
                <p className="truncate text-xs text-subtle">
                  {[profile?.city, profile?.country].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
          </div>

          <nav className="mt-2" aria-label="Account sections">
            <PaneLink
              icon={UserRound}
              label="Profile information"
              active={pane === 'profile'}
              onClick={() => setPane('profile')}
            />
            <PaneLink
              icon={Mail}
              label="Account & verification"
              active={pane === 'account'}
              onClick={() => setPane('account')}
            />
            <PaneLink
              icon={ShieldCheck}
              label="Password & security"
              active={pane === 'security'}
              onClick={() => setPane('security')}
            />
            <PaneLink
              icon={Bell}
              label="Notifications"
              to={`${base}/notifications`}
              badge={unread}
            />
            <PaneLink
              icon={LifeBuoy}
              label="Help & support"
              active={pane === 'support'}
              onClick={() => setPane('support')}
            />

            <button
              type="button"
              onClick={() => void signOut()}
              className="mt-2 flex w-full items-center gap-3 border-t border-line py-3.5 pt-5 text-[0.8125rem] text-danger transition-opacity hover:opacity-70"
            >
              <LogOut className="size-4 shrink-0 stroke-[1.5]" aria-hidden />
              Log out
            </button>
          </nav>
        </aside>

        {/* ── The pane ─────────────────────────────────────────────────── */}
        <div className="min-w-0">
          {pane === 'profile' && (
            <form onSubmit={handleSubmit((values) => save.mutate(values))}>
              <SectionHead
                title="Profile information"
                description={
                  isArtist
                    ? 'Space owners see this when they browse your work.'
                    : 'Our team uses this to reach you about installations and rotations.'
                }
              />

<div className="mt-8 flex items-center gap-5">
                <div className="relative">
                  {avatarPreview ? (
                    <Avatar
                      name={profile?.fullName ?? user?.email}
                      src={avatarPreview}
                      className="size-20 ring-2 ring-bronze"
                    />
                  ) : (
                    <Avatar
                      name={profile?.fullName ?? user?.email}
                      src={profile?.avatarUrl}
                      className="size-20"
                    />
                  )}
                  {avatarPreview && (
                    <button
                      type="button"
                      onClick={cancelAvatarPreview}
                      className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-ink/80 text-canvas hover:bg-ink"
                      aria-label="Remove preview"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-3">
                  {avatarPreview ? (
                    <>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        loading={uploadAvatar.isPending}
                        onClick={confirmAvatarUpload}
                      >
                        Save photo
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={cancelAvatarPreview}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      loading={uploadAvatar.isPending}
                      onClick={() => avatarInput.current?.click()}
                    >
                      Change photo
                    </Button>
                  )}
                  <p className="mt-1 text-xs text-subtle">
                    {avatarPreview
                      ? 'Square crop (1:1) will be applied. Click Save to confirm.'
                      : 'JPG, PNG or WebP up to 5 MB. Square (1:1) recommended.'}
                  </p>
                  <input
                    ref={avatarInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (!file) return;
                      await handleAvatarSelect(file);
                    }}
                  />
                </div>
              </div>

{isArtist && (
                <div className="mt-6 rounded-lg border border-line p-4">
                  <p className="text-sm font-medium text-ink">Artist profile backdrop</p>
                  <p className="mt-1 text-xs text-subtle">Shown on your public artist profile. Wide format (3:1 to 4:1) works best.</p>
                  {coverPreview ? (
                    <div className="mt-3 flex flex-col gap-3">
                      <div className="relative max-w-xl overflow-hidden rounded-lg border border-line bg-ink" style={{ aspectRatio: '4 / 1' }}>
                        <Photo
                          src={coverPreview}
                          alt="Cover preview"
                          className="w-full h-full"
                          imgClassName="w-full h-full object-cover object-center"
                        />
                        <button
                          type="button"
                          onClick={cancelCoverPreview}
                          className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-ink/80 text-canvas hover:bg-ink"
                          aria-label="Remove preview"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                      <div className="flex gap-3">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          loading={uploadCover.isPending}
                          onClick={confirmCoverUpload}
                        >
                          Save backdrop
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={cancelCoverPreview}
                        >
                          Cancel
                        </Button>
                      </div>
                      <p className="text-xs text-subtle">
                        Wide crop (4:1) will be applied. Click Save to confirm.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        loading={uploadCover.isPending}
                        onClick={() => coverInput.current?.click()}
                      >
                        Change backdrop
                      </Button>
                      <p className="mt-2 text-xs text-subtle">
                        JPG, PNG or WebP up to 5 MB. Wide (3:1–4:1) recommended.
                      </p>
                      <input
                        ref={coverInput}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={async (event) => {
                          const file = event.target.files?.[0];
                          event.target.value = '';
                          if (!file) return;
                          await handleCoverSelect(file);
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="mt-8 grid gap-5 sm:grid-cols-2">
                <Field label="Full name" htmlFor="fullName" error={errors.fullName?.message}>
                  <Input id="fullName" invalid={!!errors.fullName} {...register('fullName')} />
                </Field>

                <Field
                  label={isArtist ? 'Artist name' : 'Display name'}
                  htmlFor="displayName"
                  error={errors.displayName?.message}
                >
                  <Input id="displayName" {...register('displayName')} />
                </Field>

                <Field label="Phone" htmlFor="phone" error={errors.phone?.message}>
                  <Input id="phone" type="tel" invalid={!!errors.phone} {...register('phone')} />
                </Field>

                <Field label="City" htmlFor="city">
                  <Input id="city" {...register('city')} />
                </Field>

                <Field label="Country" htmlFor="country">
                  <Input id="country" {...register('country')} />
                </Field>

                <Field label="Website" htmlFor="website" error={errors.website?.message}>
                  <Input id="website" placeholder="https://" {...register('website')} />
                </Field>

                <Field label="Instagram" htmlFor="instagram">
                  <Input id="instagram" placeholder="@handle" {...register('instagram')} />
                </Field>
              </div>

              <div className="mt-5">
                <Field label="Bio" htmlFor="bio" aside={<CharCount value={bio} max={1000} />}>
                  <Textarea id="bio" rows={4} {...register('bio')} />
                </Field>
              </div>

              {isArtist && (
                <div className="mt-6">
                  <p className="text-[0.8125rem] font-medium text-ink-soft">
                    Genres <span className="text-subtle">(up to 3)</span>
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {ART_STYLES.map((style) => {
                      const active = genres.includes(style);
                      return (
                        <button
                          key={style}
                          type="button"
                          onClick={() => toggleGenre(style)}
                          aria-pressed={active}
                          className={cn(
                            'rounded-full border px-3 py-1.5 text-[0.8125rem] transition-all',
                            active
                              ? 'border-bronze bg-bronze-soft text-bronze-deep'
                              : 'border-line text-muted hover:border-line-strong hover:text-ink',
                          )}
                        >
                          {ART_STYLE_LABELS[style]}
                          {active && <X className="ml-1.5 inline size-3" aria-hidden />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-9 border-t border-line pt-6">
                <Button type="submit" loading={save.isPending} disabled={!isDirty}>
                  Save changes
                </Button>
              </div>
            </form>
          )}

          {pane === 'account' && (
            <div>
              <SectionHead
                title="Account & verification"
                description="Your sign-in details and where the account stands."
              />

              <dl className="mt-8 divide-y divide-line-soft">
                <Row label="Email address">
                  <span className="text-ink">{user?.email}</span>
                  <p className="mt-1 text-xs text-subtle">
                    Your email is your sign-in — contact support to change it.
                  </p>
                </Row>
                <Row label="Role">
                  <span className="text-ink">{user ? ROLE_LABELS[user.role] : '—'}</span>
                </Row>
                <Row label="Status">
                  <Status tone={user?.status === 'verified' ? 'success' : 'warning'}>
                    {user?.status === 'verified'
                      ? 'Verified'
                      : user?.status === 'pending_verification'
                        ? 'Pending verification'
                        : 'Suspended'}
                  </Status>
                </Row>
                <Row label="Member since">
                  <span className="text-ink">
                    {user ? formatDate(user.createdAt, 'long') : '—'}
                  </span>
                </Row>
              </dl>

              {user && !user.emailVerified && (
                <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-l-2 border-warning bg-warning-soft/50 py-4 pl-4 pr-4">
                  <p className="flex items-start gap-2.5 text-sm text-warning">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    Your email address hasn&rsquo;t been verified yet.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    loading={resendVerification.isPending}
                    onClick={() => resendVerification.mutate()}
                  >
                    <Mail /> Resend verification
                  </Button>
                </div>
              )}
            </div>
          )}

          {pane === 'security' && (
            <div>
              <SectionHead
                title="Password & security"
                description="Passwords change through an emailed link, so a stolen session can never set a new one."
              />

              <div className="mt-8">
                <Button
                  variant="outline"
                  loading={requestPasswordReset.isPending}
                  onClick={() => requestPasswordReset.mutate()}
                >
                  <ShieldCheck /> Change password
                </Button>
                <p className="mt-2.5 text-xs text-subtle">
                  We&rsquo;ll email a reset link to {user?.email}.
                </p>
              </div>

              <div className="mt-10 border-t border-line pt-8">
                <p className="text-sm text-ink">This session</p>
                <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">
                  You&rsquo;re signed in with a token held in this browser. It expires on the
                  schedule set by the server, and signing out removes it immediately.
                </p>
                <Button variant="danger" className="mt-5" onClick={() => void signOut()}>
                  <LogOut /> Sign out
                </Button>
              </div>
            </div>
          )}

          {pane === 'support' && (
            <div>
              <SectionHead
                title="Help & support"
                description="We're here if you need us — reach the ARTINU team however suits you."
              />

              <div className="mt-8 space-y-4">
                <a
                  href={`tel:${CONTACT.phoneRaw}`}
                  className="flex items-center gap-4 rounded-lg border border-line bg-surface p-5 transition-colors hover:border-bronze"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-bronze-soft text-bronze">
                    <Phone className="size-5" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink">Call us</p>
                    <p className="mt-0.5 text-sm text-muted">{CONTACT.phone}</p>
                  </div>
                </a>

                <a
                  href={`https://wa.me/${CONTACT.phoneRaw}?text=${encodeURIComponent(
                    'Hi ARTINU — I need help with my artist account.',
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-4 rounded-lg border border-line bg-surface p-5 transition-colors hover:border-bronze"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-bronze-soft text-bronze">
                    <MessageCircle className="size-5" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink">Chat on WhatsApp</p>
                    <p className="mt-0.5 text-sm text-muted">
                      Message us on {CONTACT.phone} — fastest for quick questions
                    </p>
                  </div>
                </a>

                <a
                  href={`mailto:${CONTACT.supportEmail}`}
                  className="flex items-center gap-4 rounded-lg border border-line bg-surface p-5 transition-colors hover:border-bronze"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-bronze-soft text-bronze">
                    <Mail className="size-5" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink">Email us</p>
                    <p className="mt-0.5 text-sm text-muted">{CONTACT.supportEmail}</p>
                  </div>
                </a>
              </div>

              <div className="mt-8 rounded-lg border border-line-soft bg-canvas-soft p-5">
                <p className="text-sm text-ink">Working hours</p>
                <dl className="mt-3 space-y-2 text-sm">
                  {CONTACT.hours.map((entry) => (
                    <div key={entry.days} className="flex justify-between gap-4">
                      <dt className="text-muted">{entry.days}</dt>
                      <dd className="text-ink">{entry.time}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** One line in the account nav — either switches the pane or leaves the screen. */
function PaneLink({
  icon: Icon,
  label,
  active,
  onClick,
  to,
  badge,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick?: () => void;
  to?: string;
  badge?: number;
}) {
  const inner = (
    <>
      <Icon
        className={cn('size-4 shrink-0 stroke-[1.5]', active ? 'text-bronze' : 'text-subtle')}
        aria-hidden
      />
      <span className="flex-1 text-left">{label}</span>
      {badge != null && badge > 0 && (
        <span className="flex min-w-5 items-center justify-center rounded-full bg-bronze-soft px-1.5 font-label tabular-nums text-[0.5625rem] text-bronze-deep">
          {badge > 99 ? '99' : badge}
        </span>
      )}
      {to && <ChevronRight className="size-3.5 shrink-0 text-subtle" aria-hidden />}
    </>
  );

  const classes = cn(
    'flex w-full items-center gap-3 border-b border-line-soft py-3.5 text-[0.8125rem] transition-colors',
    active ? 'font-medium text-ink' : 'text-muted hover:text-ink',
  );

  return to ? (
    <Link to={to} className={classes}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-current={active ? 'true' : undefined} className={classes}>
      {inner}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6">
      <dt className="font-label text-[0.5625rem] uppercase tracking-[0.16em] text-subtle sm:pt-1">
        {label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}
