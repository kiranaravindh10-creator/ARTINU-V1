import { formatDateTime, formatRelative } from '@artinu/shared';
import { useQuery } from '@tanstack/react-query';
import { ScrollText, Search } from 'lucide-react';
import * as React from 'react';
import { PageHeader } from '@/components/layout/DashboardShell';
import { SubNav } from '@/features/console/components/SubNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import { Input } from '@/components/ui/input';
import { qk } from '@/lib/query';
import { adminService } from '@/services/admin.service';

export default function ConsoleAuditPage() {
  const [q, setQ] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.admin.audit({ q: search, page }),
    queryFn: () => adminService.audit({ q: search || undefined, page, pageSize: 40 }),
  });

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Every privileged action, with who did it and when. Append-only - entries cannot be edited or deleted from here."
      />

      <SubNav
        items={[
          { to: '/console/users', label: 'People', end: true },
          { to: '/console/users/audit', label: 'Audit log' },
        ]}
      />

      <form
        className="mb-6 max-w-sm"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(q);
          setPage(1);
        }}
      >
        <Input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search by actor, action or entity…"
          icon={<Search />}
          aria-label="Search the audit log"
        />
      </form>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Skeleton className="h-72 w-full rounded-lg" />
      ) : data && data.items.length > 0 ? (
        <>
          <Card>
            <CardContent className="px-5 py-0">
              <Accordion type="multiple">
                {data.items.map((entry) => (
                  <AccordionItem key={entry.id} value={entry.id}>
                    <AccordionTrigger className="hover:no-underline">
                      <span className="flex min-w-0 flex-1 items-center gap-4 pr-3">
                        <span className="min-w-0 flex-1 text-left">
                          <span className="block truncate font-mono text-xs text-ink">
                            {entry.action}
                          </span>
                          <span className="block truncate text-xs text-subtle">
                            {entry.actorEmail ?? 'system'} · {entry.entity}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-subtle">
                          {formatRelative(entry.createdAt)}
                        </span>
                      </span>
                    </AccordionTrigger>

                    <AccordionContent>
                      <dl className="grid gap-2 sm:grid-cols-2">
                        <Row label="When">{formatDateTime(entry.createdAt)}</Row>
                        <Row label="Actor">{entry.actorEmail ?? 'system'}</Row>
                        <Row label="Entity">{entry.entity}</Row>
                        <Row label="Entity id">
                          <span className="font-mono text-xs">{entry.entityId ?? '-'}</span>
                        </Row>
                        <Row label="IP">{entry.ip ?? '-'}</Row>
                      </dl>

                      {entry.meta && Object.keys(entry.meta).length > 0 && (
                        <div className="mt-4">
                          <p className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
                            Details
                          </p>
                          <dl className="mt-2 space-y-1">
                            {Object.entries(entry.meta).map(([key, value]) => (
                              <div key={key} className="flex gap-3 text-sm">
                                <dt className="min-w-32 text-subtle">{key}</dt>
                                <dd className="min-w-0 flex-1 break-words text-ink-soft">
                                  {typeof value === 'object'
                                    ? JSON.stringify(value)
                                    : String(value)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>

          {data.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={data.page === 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted">
                Page {data.page} of {data.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={data.page === data.totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      ) : (
        <EmptyState icon={<ScrollText />} title="Nothing recorded yet." />
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="text-sm text-ink-soft">{children}</dd>
    </div>
  );
}
