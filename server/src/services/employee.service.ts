import type { Role } from '@artinu/shared';
import { db } from '@/database/db';
import { env } from '@/config/env';
import { conflict } from '@/utils/errors';
import { now } from '@/utils/ids';
import { logger } from '@/utils/logger';
import { createProfile, createUser, issueToken, temporaryPassword } from '@/services/auth.service';
import { sendMail } from '@/services/email.service';

/**
 * Employee onboarding (requirements §31, §32).
 *
 * An employee is an ordinary `users` row plus an `employees` record, so there
 * is exactly one authentication path and one RBAC model for the whole company.
 * Adding a second would mean two places to get access control wrong.
 *
 * On the password: no permanent password is ever emailed. The account is
 * created with a random one nobody sees and the invitation carries a
 * single-use setup link, so the credential only ever exists in the new
 * employee's head. That is the difference between an onboarding email that
 * leaks an account and one that does not.
 */

const EMAIL_DOMAIN = 'artinu.in';

/** Roles an employee account may be given. Never 'ceo' through this route. */
export const EMPLOYEE_ROLES = ['manager', 'accounts', 'operations', 'it_team'] as const;
export type EmployeeRole = (typeof EMPLOYEE_ROLES)[number];

export interface CreateEmployeeInput {
  fullName: string;
  jobTitle: string;
  role: EmployeeRole;
  department?: string | null;
  personalEmail?: string | null;
  phone?: string | null;
  permissions?: string[];
}

/**
 * firstname.lastname@artinu.in, with a numeric suffix only when that address is
 * already taken. Accents and punctuation are stripped so the address is always
 * typeable and matches what a mail server will accept.
 */
export async function generateCompanyEmail(fullName: string): Promise<string> {
  const parts = fullName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const first = parts[0] ?? 'staff';
  const last = parts.length > 1 ? parts[parts.length - 1]! : '';
  const base = last ? `${first}.${last}` : first;

  const taken = new Set(
    (await db.employees.find()).map((row) => String(row.companyEmail ?? '').toLowerCase()),
  );

  let candidate = `${base}@${EMAIL_DOMAIN}`;
  for (let suffix = 2; taken.has(candidate) && suffix < 100; suffix += 1) {
    candidate = `${base}${suffix}@${EMAIL_DOMAIN}`;
  }
  if (taken.has(candidate)) {
    throw conflict(`Could not generate a unique company address for ${fullName}.`);
  }
  return candidate;
}

/** ARTINU-0001, sequential and never reused. */
async function nextEmployeeCode(): Promise<string> {
  const existing = await db.employees.find();
  const highest = existing.reduce((max, row) => {
    const match = /^ARTINU-(\d+)$/.exec(String(row.employeeCode ?? ''));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `ARTINU-${String(highest + 1).padStart(4, '0')}`;
}

export async function createEmployee(
  input: CreateEmployeeInput,
  createdBy: { id: string; email: string },
) {
  const companyEmail = await generateCompanyEmail(input.fullName);
  const employeeCode = await nextEmployeeCode();

  // The account signs in with its company address. `createUser` rejects a
  // duplicate, which is the database having the final say on uniqueness.
  const user = await createUser({
    email: companyEmail,
    password: temporaryPassword(),
    role: input.role as Role,
    emailVerified: true,
    phone: input.phone ?? null,
  });

  await createProfile(user.id, {
    fullName: input.fullName,
    displayName: input.fullName,
    phone: input.phone ?? null,
  });

  const employee = await db.employees.insert({
    userId: user.id,
    employeeCode,
    fullName: input.fullName,
    companyEmail,
    personalEmail: input.personalEmail ?? null,
    phone: input.phone ?? null,
    jobTitle: input.jobTitle,
    department: input.department ?? null,
    role: input.role,
    permissions: input.permissions ?? [],
    status: 'active',
    invitedAt: now(),
    onboardedAt: null,
    offboardedAt: null,
    createdBy: createdBy.id,
    createdAt: now(),
    updatedAt: now(),
  } as never);

  // Setup link rather than a password. Sent to the personal address when we
  // have one — the company mailbox may not exist yet on the day they start.
  const token = await issueToken(user.id, 'password_reset', 60 * 24 * 7);
  const destination = input.personalEmail || companyEmail;

  void sendMail({
    to: destination,
    subject: `Welcome to ARTINU — your account is ready`,
    heading: `Welcome aboard, ${input.fullName.split(' ')[0]}.`,
    body:
      `Your ARTINU account has been created.\n\n` +
      `Name — ${input.fullName}\n` +
      `Employee ID — ${employeeCode}\n` +
      `Official email — ${companyEmail}\n` +
      `Role — ${input.jobTitle} (${input.role.replace('_', ' ')})\n` +
      (input.department ? `Team — ${input.department}\n` : '') +
      `\nSign in with your official email above. Use the button below to set your ` +
      `password — the link is good for seven days and can be used once.\n\n` +
      `We will never email you a password, and nobody at ARTINU can see the one you choose.`,
    cta: {
      label: 'Set your password',
      url: `${env.CLIENT_URL.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(token.token)}`,
    },
    footnote: 'If you were not expecting this, please tell the IT team before using the link.',
    // Someone cannot start work without it, so it is not held back by quota.
    priority: 'critical',
  }).catch((error) => logger.error(`Could not send onboarding mail to ${destination}`, error));

  return { employee, user, companyEmail, employeeCode };
}

/**
 * Offboarding suspends the login and keeps the record. Deleting it would break
 * every audit entry and installation that refers to the person.
 */
export async function offboardEmployee(employeeId: string) {
  const employee = await db.employees.byId(employeeId);
  if (!employee) throw conflict('That employee record no longer exists.');

  await db.users.update(String(employee.userId), { status: 'suspended' });

  return db.employees.update(employeeId, {
    status: 'offboarded',
    offboardedAt: now(),
    updatedAt: now(),
  } as never);
}

export async function listEmployees(options: { status?: string; department?: string } = {}) {
  const where: Record<string, unknown> = {};
  if (options.status) where.status = options.status;
  if (options.department) where.department = options.department;

  return db.employees.find({ where, orderBy: { field: 'createdAt', direction: 'desc' } });
}
