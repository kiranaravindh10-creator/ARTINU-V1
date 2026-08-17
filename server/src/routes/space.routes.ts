import { spaceSchema, type Space } from '@artinu/shared';
import { Router } from 'express';
import { db, type StoredUser } from '@/database/db';
import { asyncHandler, requireAuth, requireRole, validate } from '@/middleware/index';
import { forbidden, notFound } from '@/utils/errors';
import { now } from '@/utils/ids';
import { recordAudit } from '@/services/audit.service';
import { recommendArtworks } from '@/services/recommendation.service';
import { isRemoteUrl, storeImage } from '@/services/storage.service';

export const spaceRouter = Router();

const INTERNAL = ['ceo', 'manager', 'accounts', 'operations', 'it_team'];

function assertCanSee(space: Space, user: StoredUser) {
  if (space.ownerId !== user.id && !INTERNAL.includes(user.role)) {
    throw forbidden('That space belongs to another account.');
  }
}

/** Space photographs arrive as data URLs from the client; seeds arrive as URLs. */
async function persistImages(imageUrls: string[] | undefined): Promise<string[]> {
  if (!imageUrls?.length) return [];
  const stored = await Promise.all(
    imageUrls.map((value) => (isRemoteUrl(value) ? Promise.resolve({ url: value }) : storeImage(value, 'spaces'))),
  );
  return stored.map((entry) => entry.url);
}

spaceRouter.use(requireAuth);

spaceRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const spaces = INTERNAL.includes(user.role)
      ? await db.spaces.find({ orderBy: { field: 'createdAt', direction: 'desc' } })
      : await db.spaces.find({
          where: { ownerId: user.id },
          orderBy: { field: 'createdAt', direction: 'desc' },
        });
    res.json(spaces);
  }),
);

spaceRouter.post(
  '/',
  requireRole('space_owner'),
  validate(spaceSchema),
  asyncHandler(async (req, res) => {
    const input = req.valid as Record<string, unknown>;

    const space = await db.spaces.insert({
      ...(input as unknown as Omit<Space, 'id' | 'ownerId' | 'verified' | 'createdAt' | 'updatedAt'>),
      imageUrls: await persistImages(input.imageUrls as string[] | undefined),
      ownerId: req.user!.id,
      verified: false,
      createdAt: now(),
      updatedAt: now(),
    });

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'space.created',
      entity: 'space',
      entityId: space.id,
      meta: { name: space.name },
      ip: req.ip,
    });

    res.status(201).json(space);
  }),
);

spaceRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const space = await db.spaces.byId(req.params.id);
    if (!space) throw notFound('That space');
    assertCanSee(space, req.user!);
    res.json(space);
  }),
);

spaceRouter.patch(
  '/:id',
  validate(spaceSchema.partial()),
  asyncHandler(async (req, res) => {
    const space = await db.spaces.byId(req.params.id);
    if (!space) throw notFound('That space');
    assertCanSee(space, req.user!);

    const patch = req.valid as Record<string, unknown>;
    if (patch.imageUrls) patch.imageUrls = await persistImages(patch.imageUrls as string[]);

    const updated = await db.spaces.update(space.id, { ...patch, updatedAt: now() });

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'space.updated',
      entity: 'space',
      entityId: space.id,
      ip: req.ip,
    });

    res.json(updated);
  }),
);

spaceRouter.get(
  '/:id/recommendations',
  asyncHandler(async (req, res) => {
    const space = await db.spaces.byId(req.params.id);
    if (!space) throw notFound('That space');
    assertCanSee(space, req.user!);

    const limit = Math.min(48, Number(req.query.limit ?? 12));
    res.json(await recommendArtworks(space, limit));
  }),
);
