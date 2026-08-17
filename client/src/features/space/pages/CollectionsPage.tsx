import GalleryPage from '@/features/public/pages/GalleryPage';

/**
 * Browsing is one screen, not two.
 *
 * This used to be a second gallery — its own filters, its own sort, its own
 * result grid — over the exact same catalogue the public gallery shows. A space
 * owner had to learn two ways to find a photograph. It now mounts the real
 * gallery in its space variant, which keeps the one thing the dashboard adds:
 * add to cart without leaving the grid.
 */
export default function CollectionsPage() {
  return <GalleryPage variant="space" />;
}
