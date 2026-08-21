import { seedAll } from '@/database/seed';
import { logger } from '@/utils/logger';

/**
 * `npm run seed` — add `-- --fresh` to discard the persisted dev store first.
 *
 * Only seeds the in-memory store. `--allow-remote` overrides that, and should be
 * typed out in full every time rather than put in a script: seeding clears every
 * table before it inserts.
 */
const fresh = process.argv.includes('--fresh');
const allowRemote = process.argv.includes('--allow-remote');

seedAll({ fresh, allowRemote })
  .then(() => {
    logger.success(fresh ? 'Reseeded from scratch.' : 'Seed complete.');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Seeding failed', error);
    process.exit(1);
  });
