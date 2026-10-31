import {
  accountStatusActionSchema,
  branchChangeSchema,
  emailChangeSchema,
  inviteUserSchema,
  passwordActionSchema,
  roleChangeSchema,
  startSupportSessionSchema,
  userFilterSchema,
  userProfileEditSchema,
} from '@artinu/shared';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, requireAuth, requireInternal, requirePermission, validate } from '@/middleware/index';
import {
  endSupportSession,
  listSupportSessions,
  presentSession,
  startSupportSession,
} from '@/services/support-session.service';
import {
  approveAccess,
  changeUserBranch,
  changeUserRole,
  forcePasswordChange,
  inviteUser,
  listUsers,
  reactivateUser,
  requestEmailChange,
  resendInvitation,
  revokeSessions,
  staffInScope,
  startPasswordReset,
  suspendUser,
  updateUserProfile,
  userDetail,
} from '@/services/user-admin.service';
import { forbidden, notFound } from '@/utils/errors';
import { db } from '@/database/db';
import { branchScopeOf, configuredBranches } from '@/services/branch.service';

/**
 * Administration → People & access → User Management.
 *
 * Mounted at /admin/people. Every route names the permission it needs; the
 * service layer then applies the rules no permission can express (nobody acts
 * on themselves, only a CEO touches a CEO).
 */
export const peopleRouter = Router();

peopleRouter.use(requireInternal);

/*
  Any route here naming a user by id: someone held to a branch cannot open or
  act on another branch's staff, however the id was obtained. A support
  session's id is not a user's, and is left to its own route.
*/
peopleRouter.param('id', (req, _res, next, id: string) => {
  void (async () => {
    const target = await db.users.byId(id).catch(() => null);
    if (target && !staffInScope(await branchScopeOf(req.user!), target)) throw notFound('That user');
  })().then(() => next(), next);
});

/*
  The configured branches and where the person asking stands: every branch, or
  the one they work in. Any member of staff - the Console uses it to label what
  it shows and to offer a branch only to those who may choose one.
*/
peopleRouter.get(
  '/branches',
  asyncHandler(async (req, res) => {
    const [branches, scope] = await Promise.all([configuredBranches(), branchScopeOf(req.user!)]);
    res.json({ branches, scope: { all: scope.all, branch: scope.branch } });
  }),
);

peopleRouter.get(
  '/users',
  requirePermission('users.view'),
  validate(userFilterSchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await listUsers(req.valid, await branchScopeOf(req.user!)));
  }),
);

peopleRouter.get(
  '/users/:id',
  requirePermission('users.view'),
  asyncHandler(async (req, res) => {
    res.json(await userDetail(req.params.id));
  }),
);

// ── Sign-in access ───────────────────────────────────────────────────────────

/** Invite a photographer or a member of staff. Never a second account for one email. */
peopleRouter.post(
  '/invitations',
  requirePermission('users.invite'),
  validate(inviteUserSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await inviteUser(req.user!, req.valid));
  }),
);

peopleRouter.post(
  '/users/:id/invitation',
  requirePermission('users.invite'),
  asyncHandler(async (req, res) => {
    res.json(await resendInvitation(req.user!, req.params.id));
  }),
);

/** The CEO approves IT access granted by someone else (the service checks it is the CEO). */
peopleRouter.post(
  '/users/:id/approve',
  requirePermission('users.change_role'),
  asyncHandler(async (req, res) => {
    res.json(await approveAccess(req.user!, req.params.id));
  }),
);

peopleRouter.patch(
  '/users/:id/profile',
  requirePermission('users.edit'),
  validate(userProfileEditSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateUserProfile(req.user!, req.params.id, req.valid));
  }),
);

peopleRouter.post(
  '/users/:id/role',
  requirePermission('users.change_role'),
  validate(roleChangeSchema),
  asyncHandler(async (req, res) => {
    res.json(await changeUserRole(req.user!, req.params.id, req.valid.role, req.valid.reason));
  }),
);

peopleRouter.post(
  '/users/:id/branch',
  requirePermission('branches.assign'),
  validate(branchChangeSchema),
  asyncHandler(async (req, res) => {
    res.json(await changeUserBranch(req.user!, req.params.id, req.valid.branch, req.valid.reason));
  }),
);

peopleRouter.post(
  '/users/:id/suspend',
  requirePermission('users.suspend'),
  validate(accountStatusActionSchema),
  asyncHandler(async (req, res) => {
    res.json(await suspendUser(req.user!, req.params.id, req.valid.reason));
  }),
);

peopleRouter.post(
  '/users/:id/reactivate',
  requirePermission('users.suspend'),
  validate(accountStatusActionSchema),
  asyncHandler(async (req, res) => {
    res.json(await reactivateUser(req.user!, req.params.id, req.valid.reason));
  }),
);

peopleRouter.post(
  '/users/:id/password',
  requirePermission('users.reset_password'),
  validate(passwordActionSchema),
  asyncHandler(async (req, res) => {
    res.json(await startPasswordReset(req.user!, req.params.id, req.valid.mode));
  }),
);

peopleRouter.post(
  '/users/:id/force-password-change',
  requirePermission('users.reset_password'),
  asyncHandler(async (req, res) => {
    res.json(await forcePasswordChange(req.user!, req.params.id));
  }),
);

peopleRouter.post(
  '/users/:id/revoke-sessions',
  requirePermission('users.revoke_sessions'),
  asyncHandler(async (req, res) => {
    res.json(await revokeSessions(req.user!, req.params.id));
  }),
);

peopleRouter.post(
  '/users/:id/email',
  requirePermission('users.change_email'),
  validate(emailChangeSchema),
  asyncHandler(async (req, res) => {
    res.json(await requestEmailChange(req.user!, req.params.id, req.valid.newEmail, req.valid.reason));
  }),
);

// ── Support sessions ─────────────────────────────────────────────────────────

peopleRouter.post(
  '/support-sessions',
  requirePermission('users.assist'),
  validate(startSupportSessionSchema),
  asyncHandler(async (req, res) => {
    const grant = await startSupportSession(req.user!, req.valid.userId, req.valid.reason, req.ip ?? null);
    res.status(201).json(grant);
  }),
);

peopleRouter.get(
  '/support-sessions',
  requirePermission('users.view'),
  validate(z.object({ userId: z.string().optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const sessions = await listSupportSessions({ userId: req.valid.userId });
    res.json(sessions.map(presentSession));
  }),
);

peopleRouter.post(
  '/support-sessions/:id/end',
  requirePermission('users.assist'),
  asyncHandler(async (req, res) => {
    res.json(await endSupportSession(req.params.id, 'exited', req.user!));
  }),
);

/**
 * The assisted browser's own view of its session, at /support-session.
 *
 * Reached with the support credential, not an admin one, which is why it is a
 * separate router outside /admin: the Console banner asks "how long is left"
 * and "end this now" from inside the session it describes.
 */
export const supportSessionRouter = Router();

supportSessionRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.supportSession) throw notFound('A support session');
    res.json(presentSession(req.supportSession));
  }),
);

supportSessionRouter.post(
  '/end',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.supportSession || !req.supportAdmin) throw forbidden('This is not a support session.');
    res.json(await endSupportSession(req.supportSession.id, 'exited', req.supportAdmin));
  }),
);
