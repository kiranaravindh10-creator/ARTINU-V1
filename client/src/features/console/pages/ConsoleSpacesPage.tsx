import { formatDate, SPACE_TYPE_LABELS, type Space } from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Building2, Plus, Search } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/DashboardShell';
import { SubNav } from '@/features/console/components/SubNav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent } from '@/components/ui/dialog';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import { Input } from '@/components/ui/input';
import { Photo } from '@/components/ui/photo';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMessage } from '@/lib/api';
import { CreateSpaceDialog } from '@/features/console/components/CreateSpaceDialog';
import { qk } from '@/lib/query';
import { adminService } from '@/services/admin.service';

type AdminSpace = Space & { ownerName?: string; orderCount?: number };

export default function ConsoleSpacesPage() {
  const [creating, setCreating] = React.useState(false);
  const queryClient = useQueryClient();
  const [q, setQ] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [unverifiedOnly, setUnverifiedOnly] = React.useState(false);
  const [selected, setSelected] = React.useState<AdminSpace | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.admin.spaces({ q: search, unverified: unverifiedOnly }),
    queryFn: () =>
      adminService.spaces({
        q: search || undefined,
        unverified: unverifiedOnly || undefined,
        pageSize: 60,
      }),
  });

  const verify = useMutation({
    mutationFn: ({ id, verified }: { id: string; verified: boolean }) =>
      adminService.verifySpace(id, verified),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'spaces'] });
      toast.success(variables.verified ? 'Space verified' : 'Verification removed');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div>
      <PageHeader
        title="Spaces"
        description="Every registered space and its curation notes."
        actions={
          /* For the owners who will never register themselves - see
             CreateSpaceDialog. */
          <Button onClick={() => setCreating(true)}>
            <Plus />
            Add space
          </Button>
        }
      />

      <CreateSpaceDialog open={creating} onOpenChange={setCreating} />

      <SubNav
        items={[
          { to: '/console/spaces', label: 'Spaces', end: true },
          { to: '/console/spaces/consultations', label: 'Consultations' },
        ]}
      />

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <form
          className="min-w-0 flex-1 max-w-sm"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(q);
          }}
        >
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search by name, city or type…"
            icon={<Search />}
            aria-label="Search spaces"
          />
        </form>

        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-muted">
          <Checkbox
            checked={unverifiedOnly}
            onCheckedChange={(value) => setUnverifiedOnly(value === true)}
          />
          Needs verification only
        </label>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Skeleton className="h-72 w-full rounded-lg" />
      ) : data && data.items.length > 0 ? (
        <Card>
          <CardContent className="p-0 sm:p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Space ID</TableHead>
                  <TableHead>Space</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-right">Walls</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.items as AdminSpace[]).map((space) => (
                  <TableRow key={space.id}>
                    {/* The ID ARTINU issued at registration (requirements §1) —
                        first column because it is what support and paperwork
                        quote. Em dash for rows that predate migration 006. */}
                    <TableCell className="whitespace-nowrap font-mono text-xs text-bronze">
                      {space.code ?? '-'}
                    </TableCell>
                    <TableCell className="max-w-[14rem] truncate text-ink">{space.name}</TableCell>
                    <TableCell className="text-xs text-muted">
                      {SPACE_TYPE_LABELS[space.type]}
                    </TableCell>
                    <TableCell className="text-xs text-muted">{space.city}</TableCell>
                    <TableCell className="text-xs text-muted">{space.ownerName ?? '-'}</TableCell>
                    <TableCell className="text-right tabular-nums">{space.wallCount ?? '-'}</TableCell>
                    <TableCell className="text-right tabular-nums">{space.orderCount ?? 0}</TableCell>
                    <TableCell>
                      {space.verified ? (
                        <Badge variant="success">
                          <BadgeCheck /> Verified
                        </Badge>
                      ) : (
                        <Badge variant="warning">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setSelected(space)}>
                          Open
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={verify.isPending}
                          onClick={() => verify.mutate({ id: space.id, verified: !space.verified })}
                        >
                          {space.verified ? 'Unverify' : 'Verify'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState icon={<Building2 />} title="No spaces match that." />
      )}

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="max-w-md">
          {selected && (
            <div>
              <h2 className="font-display text-2xl text-ink">{selected.name}</h2>
              <p className="mt-1 text-sm text-muted">
                {SPACE_TYPE_LABELS[selected.type]} · {selected.city}
              </p>

              {selected.imageUrls?.[0] && (
                <Photo
                  src={selected.imageUrls[0]}
                  alt={selected.name}
                  ratio="aspect-[3/2]"
                  className="mt-4 rounded-md"
                />
              )}

              <dl className="mt-5 space-y-3 text-sm">
                <Row label="Address">
                  {selected.addressLine1}
                  {selected.addressLine2 ? `, ${selected.addressLine2}` : ''}
                  <br />
                  {selected.city} {selected.pin}
                </Row>
                <Row label="Contact">
                  {selected.contactName}
                  <br />
                  {selected.contactPhone}
                  <br />
                  {selected.contactEmail}
                </Row>
                <Row label="Rotation">
                  Every {selected.rotationIntervalMonths}{' '}
                  {selected.rotationIntervalMonths === 1 ? 'month' : 'months'}
                </Row>
                <Row label="Registered">{formatDate(selected.createdAt, 'long')}</Row>
              </dl>

              <h3 className="mt-6 font-label text-[0.625rem] uppercase tracking-[0.16em] text-bronze">
                Curation notes
              </h3>
              <dl className="mt-3 space-y-3 text-sm">
                <Row label="Theme">{selected.theme ?? '-'}</Row>
                {selected.cuisine && <Row label="Cuisine">{selected.cuisine}</Row>}
                <Row label="Wall colour">{selected.wallColor ?? '-'}</Row>
                <Row label="Lighting">{selected.lighting ?? '-'}</Row>
              </dl>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="text-ink-soft">{children}</dd>
    </div>
  );
}
