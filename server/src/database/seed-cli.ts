import { seedAll } from '@/database/seed';
import { logger } from '@/utils/logger';

/** `npm run seed` — add `-- --fresh` to discard the persisted dev store first. */
const fresh = process.argv.includes('--fresh');

seedAll({ fresh })
  .then(() => {
    logger.success(fresh ? 'Reseeded from scratch.' : 'Seed complete.');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Seeding failed', error);
    process.exit(1);
  });
