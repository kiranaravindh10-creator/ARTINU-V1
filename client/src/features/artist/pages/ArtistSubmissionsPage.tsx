import { formatDate, GALLERY_CATEGORY_LABELS, type ArtworkStatus } from '@artinu/shared';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, Upload } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { PanelHeader } from '@/components/layout/DashboardShell';
import { Status, type StatusTone } from '@/components/layout/panel';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import { Photo } from '@/components/ui/photo';
import { FilterChips } from '@/components/ui/tabs';
import { ValidationResults } from '@/features/shared/components/ValidationResults';
import { qk } from '@/lib/query';
import { catalogService } from '@/services/catalog.service';

/**
 * There is no manual review queue any more (requirements §26). A photograph
 * either clears the automated checks on upload and is live, or it never gets
 * created at all — so pending/approved/rejected are not states an artist can
 * be sitting in, and showing those filters would invent a workflow that no
 * longer exists.
 *
 * `archived` is the one status still worth separating: it is work the artist
 * has taken down themselves, which is theirs to see and restore.
 */
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'approved', label: 'Live' },
  { value: 'archived', label: 'Archived' },
];

const STATUS: Record<ArtworkStatus, { label: string; variant: StatusTone }> = {
  draft: { label: 'Draft', variant: 'neutral' },
  processing: { label: 'Processing', variant: 'warning' },
  // Retained so an older row from before instant publish still renders.
  pending_review: { label: 'Processing', variant: 'warning' },
  approved: { label: 'Live', variant: 'success' },
  rejected: { label: 'Not published', variant: 'neutral' },
  archived: { label: 'Archived', variant: 'neutral' },
};

export default function ArtistSubmissionsPage() {
  const [status, setStatus] = React.useState('all');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.myArtworks({ status }),
    queryFn: () => catalogService.myArtworks({ status, pageSize: 50 }),
  });

  return (
    <div>
      <PanelHeader
        title="Uploaded Works"
        description="Everything you've published. Photographs go live as soon as they pass our automated checks."
        actions={
          <Button asChild>
            <Link to="/studio/upload">
              <Upload /> Upload work
            </Link>
          </Button>
        }
      />

      <FilterChips options={FILTERS} value={status} onChange={setStatus} className="mb-6" />

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <Accordion type="multiple" className="rounded-lg border border-line bg-surface px-5">
          {data.items.map((artwork) => (
            <AccordionItem key={artwork.id} value={artwork.id}>
              <AccordionTrigger className="hover:no-underline">
                <span className="flex min-w-0 flex-1 items-center gap-4">
                  <Photo
                    src={artwork.thumbnailUrl}
                    alt={artwork.title}
                    className="size-12 shrink-0 rounded-sm"
                  />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm text-ink">{artwork.title}</span>
                    <span className="block text-xs text-subtle">
                      {GALLERY_CATEGORY_LABELS[artwork.category]} ·{' '}
                      {formatDate(artwork.createdAt)}
                    </span>
                  </span>
                  <Status tone={STATUS[artwork.status].variant}>
                    {STATUS[artwork.status].label}
                  </Status>
                </span>
              </AccordionTrigger>

              <AccordionContent>
                {artwork.reviewNote && (
                  <p
                    className={`mb-4 rounded-md p-3 text-sm ${
                      artwork.status === 'rejected'
                        ? 'bg-danger-soft text-danger'
                        : 'bg-sand-soft text-ink-soft'
                    }`}
                  >
                    {artwork.reviewNote}
                  </p>
                )}

                {artwork.validation.length > 0 && (
                  <ValidationResults results={artwork.validation} />
                )}

                <div className="mt-5 flex flex-wrap gap-3">
                  {artwork.status === 'approved' && (
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/gallery/${artwork.id}`}>View in gallery</Link>
                    </Button>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      ) : (
        <EmptyState
          icon={<ClipboardCheck />}
          title="Nothing here yet."
          description="Photographs you upload appear here straight away, ready for curators to place."
          action={
            <Button asChild>
              <Link to="/studio/upload">Upload your first photograph</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
