import { Router } from 'express';
import { z } from 'zod';
import { db } from '@/database/db';
import { asyncHandler, requireAuth, requireRole, validate } from '@/middleware/index';
import { notFound } from '@/utils/errors';
import { recordAudit } from '@/services/audit.service';
import {
  errorSummary,
  listErrors,
  resolveError,
} from '@/services/error-log.service';
import {
  createEmployee,
  EMPLOYEE_ROLES,
  listEmployees,
  offboardEmployee,
} from '@/services/employee.service';
import {
  addFrames,
  frameHistory,
  installFrame,
  inventorySummary,
  reallocationPlan,
  releaseFramesFromSpace,
  reserveFrames,
} from '@/services/frame-inventory.service';
import { quotaStatus, usageHistory } from '@/services/mail-quota.service';
import { fulfilmentPipeline } from '@/services/pipeline.service';
import { listFeaturedArtists, setFeaturedArtists } from '@/services/featured-artists.service';
import { broadcast } from '@/services/sse.service';

/**
 * Operational endpoints for the Manager and IT consoles: system health,
 * employee accounts and physical frame inventory.
 *
 * Split from admin.routes because these are about running the company rather
 * than moderating its content, and because employee creation and frame
 * reallocation each carry authorisation rules the content routes do not.
 */
export const operationsRouter = Router();

operationsRouter.use(requireAuth);

// ── System health (IT) ───────────────────────────────────────────────────────

operationsRouter.get(
  '/system/health',
  requireRole('it_team', 'ceo'),
  asyncHandler(async (_req, res) => {
    const [errors, mail] = await Promise.all([errorSummary(), quotaStatus()]);
    res.json({
      errors,
      mail,
      uptimeSeconds: Math.round(process.uptime()),
      memory: {
        heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
      checkedAt: new Date().toISOString(),
    });
  }),
);

operationsRouter.get(
  '/system/errors',
  requireRole('it_team', 'ceo'),
  asyncHandler(async (req, res) => {
    res.json(
      await listErrors({
        resolution: typeof req.query.resolution === 'string' ? req.query.resolution : undefined,
        severity: typeof req.query.severity === 'string' ? req.query.severity : undefined,
        source: typeof req.query.source === 'string' ? req.query.source : undefined,
        limit: Math.min(200, Number(req.query.limit ?? 100)),
      }),
    );
  }),
);

operationsRouter.post(
  '/system/errors/:id/resolve',
  requireRole('it_team', 'ceo'),
  asyncHandler(async (req, res) => {
    res.json(await resolveError(req.params.id, req.user!.id));
  }),
);

/**
 * What is in flight, with no money attached (requirements §7).
 *
 * Open to IT alongside the operational roles precisely because it carries no
 * order totals — see pipeline.service.ts for what is left out and why.
 */
operationsRouter.get(
  '/pipeline',
  requireRole('it_team', 'ceo', 'manager', 'operations'),
  asyncHandler(async (_req, res) => res.json(await fulfilmentPipeline())),
);

operationsRouter.get(
  '/system/mail-usage',
  requireRole('it_team', 'ceo', 'manager'),
  asyncHandler(async (_req, res) => {
    res.json({ current: await quotaStatus(), history: await usageHistory() });
  }),
);

// ── Employees (IT / CEO) ─────────────────────────────────────────────────────

const employeeSchema = z.object({
  fullName: z.string().min(2).max(120),
  jobTitle: z.string().min(2).max(120),
  role: z.enum(EMPLOYEE_ROLES),
  department: z.string().max(80).optional().nullable(),
  personalEmail: z.string().email().optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  permissions: z.array(z.string().max(60)).max(40).optional(),
});

operationsRouter.get(
  '/employees',
  requireRole('it_team', 'ceo'),
  asyncHandler(async (req, res) => {
    res.json(
      await listEmployees({
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        department: typeof req.query.department === 'string' ? req.query.department : undefined,
      }),
    );
  }),
);

operationsRouter.post(
  '/employees',
  requireRole('it_team', 'ceo'),
  validate(employeeSchema),
  asyncHandler(async (req, res) => {
    const input = req.valid as z.infer<typeof employeeSchema>;

    const { employee, companyEmail, employeeCode } = await createEmployee(input, {
      id: req.user!.id,
      email: req.user!.email,
    });

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'employee.created',
      entity: 'employee',
      entityId: String(employee.id),
      meta: { companyEmail, employeeCode, role: input.role },
      ip: req.ip,
    });

    res.status(201).json(employee);
  }),
);

operationsRouter.post(
  '/employees/:id/offboard',
  requireRole('it_team', 'ceo'),
  asyncHandler(async (req, res) => {
    const employee = await offboardEmployee(req.params.id);

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'employee.offboarded',
      entity: 'employee',
      entityId: req.params.id,
      ip: req.ip,
    });

    res.json(employee);
  }),
);

// ── Featured artists (Manager / CEO) ─────────────────────────────────────────

operationsRouter.get(
  '/featured-artists',
  requireRole('manager', 'ceo'),
  asyncHandler(async (_req, res) => res.json(await listFeaturedArtists())),
);

/**
 * Replaces the carousel wholesale — the array order is the running order, so
 * reordering is the same call as adding or removing.
 */
operationsRouter.put(
  '/featured-artists',
  requireRole('manager', 'ceo'),
  validate(
    z.object({
      entries: z
        .array(
          z.object({
            artistId: z.string().uuid(),
            sponsored: z.boolean().optional(),
            note: z.string().max(200).optional().nullable(),
          }),
        )
        .max(24),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { entries } = req.valid as {
      entries: { artistId: string; sponsored?: boolean; note?: string | null }[];
    };

    const saved = await setFeaturedArtists(entries);

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'featured_artists.updated',
      entity: 'ui_content',
      entityId: 'featured_artists',
      meta: { count: saved.length, sponsored: saved.filter((e) => e.sponsored).length },
      ip: req.ip,
    });

    // Anyone with the artists page open sees the new running order without a
    // reload, the same channel the café carousel already uses.
    broadcast('content-updates', 'content-updated', {
      type: 'featured-artists',
      action: 'reorder',
      timestamp: new Date().toISOString(),
    });

    res.json(saved);
  }),
);

// ── Frame inventory (Manager / Operations) ───────────────────────────────────

const OPS_ROLES = ['manager', 'operations', 'ceo'] as const;

operationsRouter.get(
  '/frames/summary',
  requireRole(...OPS_ROLES),
  asyncHandler(async (_req, res) => res.json(await inventorySummary())),
);

operationsRouter.get(
  '/frames',
  requireRole(...OPS_ROLES),
  asyncHandler(async (req, res) => {
    const where: Record<string, unknown> = {};
    if (typeof req.query.status === 'string') where.status = req.query.status;
    if (typeof req.query.spaceId === 'string') where.spaceId = req.query.spaceId;

    res.json(
      await db.frames.find({
        where,
        orderBy: { field: 'createdAt', direction: 'desc' },
        limit: Math.min(500, Number(req.query.limit ?? 200)),
      }),
    );
  }),
);

operationsRouter.post(
  '/frames',
  requireRole(...OPS_ROLES),
  validate(
    z.object({
      size: z.string().min(1),
      material: z.string().min(1),
      color: z.string().min(1),
      glass: z.string().optional(),
      purchaseCost: z.number().nonnegative().optional(),
      quantity: z.number().int().positive().max(500),
    }),
  ),
  asyncHandler(async (req, res) => {
    const frames = await addFrames(req.valid as never, req.user!.id);

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'frames.added',
      entity: 'frame',
      entityId: frames[0]?.id ?? 'batch',
      meta: { count: frames.length },
      ip: req.ip,
    });

    res.status(201).json({ added: frames.length, frames });
  }),
);

/**
 * The procurement check. Managers run this before ordering anything: it says
 * how much of a requirement existing stock already covers.
 */
operationsRouter.post(
  '/frames/reallocation-plan',
  requireRole(...OPS_ROLES),
  validate(
    z.object({
      requirements: z
        .array(
          z.object({
            size: z.string().min(1),
            material: z.string().min(1),
            color: z.string().min(1),
            quantity: z.number().int().positive().max(500),
          }),
        )
        .min(1)
        .max(50),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { requirements } = req.valid as {
      requirements: { size: string; material: string; color: string; quantity: number }[];
    };
    res.json(await reallocationPlan(requirements));
  }),
);

operationsRouter.post(
  '/frames/reserve',
  requireRole(...OPS_ROLES),
  validate(
    z.object({
      frameCodes: z.array(z.string().min(1)).min(1).max(500),
      spaceId: z.string().uuid(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { frameCodes, spaceId } = req.valid as { frameCodes: string[]; spaceId: string };
    const reserved = await reserveFrames(frameCodes, spaceId, req.user!.id);
    res.json({ reserved: reserved.length, frames: reserved });
  }),
);

operationsRouter.post(
  '/frames/:id/install',
  requireRole(...OPS_ROLES),
  validate(
    z.object({
      spaceId: z.string().uuid(),
      installationId: z.string().uuid().optional(),
      orderId: z.string().uuid().optional(),
      artworkId: z.string().uuid().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    res.json(await installFrame(req.params.id, req.valid as never, req.user!.id));
  }),
);

/** A space cancelled — put its frames back into reusable stock. */
operationsRouter.post(
  '/spaces/:spaceId/release-frames',
  requireRole(...OPS_ROLES),
  asyncHandler(async (req, res) => {
    const space = await db.spaces.byId(req.params.spaceId);
    if (!space) throw notFound('That space');

    const result = await releaseFramesFromSpace(
      req.params.spaceId,
      typeof req.body?.reason === 'string' ? req.body.reason : 'cancelled',
      req.user!.id,
    );

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'frames.released',
      entity: 'space',
      entityId: req.params.spaceId,
      meta: { released: result.released },
      ip: req.ip,
    });

    res.json(result);
  }),
);

operationsRouter.get(
  '/frames/:id/history',
  requireRole(...OPS_ROLES),
  asyncHandler(async (req, res) => res.json(await frameHistory(req.params.id))),
);
