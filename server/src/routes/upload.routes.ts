import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, requireAuth, uploadLimiter, validate } from '@/middleware/index';
import { storeBase64, type StorageFolder } from '@/services/storage.service';

export const uploadRouter = Router();

const uploadSchema = z.object({
  imageBase64: z.string().min(16, 'Attach an image'),
  folder: z.enum(['artworks', 'profiles', 'spaces', 'documents', 'invoices', 'thumbnails', 'photographers', 'hero', 'featured', 'cafes', 'collaborations']).default('documents'),
  fileName: z.string().max(200).optional(),
});

/** Base64 in, public URL out — the generic half of SDD §11. */
uploadRouter.post(
  '/',
  requireAuth,
  uploadLimiter,
  validate(uploadSchema),
  asyncHandler(async (req, res) => {
    const { imageBase64, folder, fileName } = req.valid as z.infer<typeof uploadSchema>;
    const photographerId = ['photographers', 'profiles'].includes(folder) ? req.user!.id : undefined;
    const stored = await storeBase64(imageBase64, folder as StorageFolder, fileName, photographerId);
    res.status(201).json({ url: stored.url, path: stored.path });
  }),
);
