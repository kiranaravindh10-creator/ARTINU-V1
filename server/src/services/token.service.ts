import { randomBytes, randomInt } from 'node:crypto';
import type { Role } from '@artinu/shared';
import jwt from 'jsonwebtoken';
import { env } from '@/config/env';

export interface TokenPayload {
  sub: string;
  email: string;
  role: Role;
}

export function signToken(payload: TokenPayload): { token: string; expiresAt: string } {
  const token = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    issuer: 'curate',
  });
  const decoded = jwt.decode(token) as { exp?: number } | null;
  const expiresAt = new Date((decoded?.exp ?? Math.floor(Date.now() / 1000) + 604800) * 1000);
  return { token, expiresAt: expiresAt.toISOString() };
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, env.JWT_SECRET, { issuer: 'curate' }) as TokenPayload;
  } catch {
    return null;
  }
}

/** Cryptographically random code for the sign-in challenge. */
export function generateOtp(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i += 1) code += randomInt(0, 10).toString();
  return code;
}

/** URL-safe single-use token for password reset and email verification. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
