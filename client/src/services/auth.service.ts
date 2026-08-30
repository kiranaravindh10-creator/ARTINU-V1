import type {
  ArtistRegistrationInput,
  AuthSession,
  ForgotPasswordInput,
  OtpVerifyInput,
  PhoneSignInInput,
  Profile,
  ProfileUpdateInput,
  ResetPasswordInput,
  SignInInput,
  SignUpInput,
  SpaceOwnerRegistrationInput,
} from '@artinu/shared';
import { api } from '@/lib/api';

/**
 * A session plus the credentials ARTINU just generated for a space owner.
 *
 * The password is here exactly once — it is never emailed and never stored, so
 * if the owner closes the page without noting it they have to use the password
 * reset link like anybody else.
 */
export interface IssuedSession extends AuthSession {
  /**
   * What registration hands back beyond the session itself.
   *
   * `password` is null now and always: space owners choose their own during
   * sign-up, so the server has no plaintext to return. Kept on the type rather
   * than deleted because staff provisioning still issues passwords, and this is
   * the shape that would carry one if that path ever came through here.
   */
  credentials?: {
    spaceCode: string | null;
    email: string;
    password: string | null;
  };
}

/** A sign-in that needs the code before a session is issued. */
export interface OtpChallenge {
  challengeId: string;
  method: 'otp';
  sentTo: string;
  expiresAt: string;
  /** Present only outside production, so the flow is walkable without SMTP. */
  devCode?: string;
}

export type SignInResult = { session: AuthSession } | { challenge: OtpChallenge };

function isChallenge(data: unknown): data is OtpChallenge {
  return typeof data === 'object' && data !== null && 'challengeId' in data;
}

export const authService = {
  async signIn(input: SignInInput): Promise<SignInResult> {
    const { data } = await api.post<AuthSession | OtpChallenge>('/auth/sign-in', input);
    return isChallenge(data) ? { challenge: data } : { session: data };
  },

  async signInWithPhone(input: PhoneSignInInput): Promise<OtpChallenge> {
    const { data } = await api.post<OtpChallenge>('/auth/sign-in/phone', input);
    return data;
  },

  async verifyOtp(input: OtpVerifyInput): Promise<AuthSession> {
    const { data } = await api.post<AuthSession>('/auth/verify-otp', input);
    return data;
  },

  async resendOtp(challengeId: string): Promise<OtpChallenge> {
    const { data } = await api.post<OtpChallenge>('/auth/resend-otp', { challengeId });
    return data;
  },

  /** Trades a verified provider token for a challenge entry on the OTP screen. */

  async signUp(input: SignUpInput): Promise<AuthSession> {
    const { data } = await api.post<AuthSession>('/auth/sign-up', input);
    return data;
  },

  async registerArtist(input: ArtistRegistrationInput): Promise<AuthSession> {
    const { data } = await api.post<AuthSession>('/auth/register/artist', input);
    return data;
  },

  /**
   * ARTINU issues the space owner their ID and password (requirements §1), so
   * the response carries a `credentials` block the caller must show once and
   * then forget — it is not persisted anywhere on the client.
   */
  async registerSpaceOwner(input: SpaceOwnerRegistrationInput): Promise<IssuedSession> {
    const { data } = await api.post<IssuedSession>('/auth/register/space-owner', input);
    return data;
  },

  /** Replaces a password while signed in — used to retire an ARTINU-issued one. */
  async changePassword(input: { currentPassword: string; password: string }): Promise<AuthSession> {
    const { data } = await api.post<AuthSession>('/auth/change-password', input);
    return data;
  },

  async forgotPassword(input: ForgotPasswordInput): Promise<{ sent: boolean; devToken?: string }> {
    const { data } = await api.post('/auth/forgot-password', input);
    return data;
  },

  async resetPassword(input: ResetPasswordInput): Promise<{ ok: boolean }> {
    const { data } = await api.post('/auth/reset-password', input);
    return data;
  },

  async verifyEmail(token: string): Promise<AuthSession> {
    const { data } = await api.post<AuthSession>('/auth/verify-email', { token });
    return data;
  },

  async resendVerification(): Promise<{ sent: boolean }> {
    const { data } = await api.post('/auth/resend-verification');
    return data;
  },

  async session(): Promise<AuthSession> {
    const { data } = await api.get<AuthSession>('/auth/session');
    return data;
  },

  async signOut(): Promise<void> {
    await api.post('/auth/sign-out').catch(() => undefined);
  },

  async updateProfile(input: ProfileUpdateInput): Promise<Profile> {
    const { data } = await api.patch<Profile>('/users/me', input);
    return data;
  },

  async uploadAvatar(imageBase64: string): Promise<{ avatarUrl: string }> {
    const { data } = await api.post('/users/me/avatar', { imageBase64 });
    return data;
  },

  async uploadCover(imageBase64: string): Promise<{ coverUrl: string }> {
    const { data } = await api.post('/users/me/cover', { imageBase64 });
    return data;
  },
};
