import { formatCurrency } from '@artinu/shared';
import { useQuery } from '@tanstack/react-query';
import { Download, Receipt, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/layout/DashboardShell';
import { SubNav } from '@/features/console/components/SubNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatGrid, StatTile } from '@/components/ui/stat';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { qk } from '@/lib/query';
import { adminService } from '@/services/admin.service';

/** Builds a CSV in the browser — no server round trip for a table we already have. */
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? '');
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(','),
    )
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Money in, and tax held against it.
 *
 * ── What used to be here ────────────────────────────────────────────────────
 *
 * Most of this screen was artist payouts: a "Paid to artists" tile, a "Pending
 * payouts" tile, a table of every artist's share with a "Mark as paid" button,
 * a confirmation dialog reading "you're recording that ₹X has been transferred
 * to <name>", and a panel explaining that each frame carried a ₹1,200 licence
 * fee of which the artist received 60%.
 *
 * None of it was true. ARTINU does not pay photographers - there is no fee, no
 * share and no payout - so every figure on that half of the page was a
 * liability the business does not have, and the button settled a debt that was
 * never owed. What a photographer gets is their work printed, framed, hung on a
 * real wall, and an email telling them which wall and under which Photo ID.
 *
 * Nothing opens a payout row any anymore (see settlement.service.ts) and the
 * route that marked one paid is gone, so this page would have shown an empty
 * table wired to a 404 regardless.
 *
 * The payouts TABLE is deliberately left in the database. Historical rows are a
 * record of what the business once intended, and deleting financial history to
 * tidy a screen is not a trade worth making.
 */
export default function ConsoleAccountsPage() {
  const { data: analytics } = useQuery({
    queryKey: qk.analytics('console'),
    queryFn: () => adminService.analytics(),
  });

  const { data: reports } = useQuery({
    queryKey: ['admin', 'reports'],
    queryFn: () => adminService.reports(),
  });

  const gstRows = reports?.gst ?? [];
  const gstCollected = gstRows.reduce((sum, entry) => sum + entry.collected, 0);

  return (
    <div>
      <PageHeader title="Accounts" description="Revenue in, and the tax held against it." />

      <SubNav
        items={[
          { to: '/console/payments', label: 'Payments in' },
          { to: '/console/accounts', label: 'Accounts' },
        ]}
      />

      <StatGrid className="mb-8">
        <StatTile
          label="Revenue"
          value={analytics?.revenue ?? 0}
          format="currency-compact"
          icon={TrendingUp}
        />
        <StatTile label="GST collected" value={gstCollected} format="currency" icon={Receipt} />
      </StatGrid>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>GST by month</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv('ARTINU-gst.csv', [
                ['Period', 'GST collected'],
                ...gstRows.map((entry) => [entry.period, entry.collected]),
              ])
            }
          >
            <Download /> CSV
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">GST collected</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {gstRows.map((entry) => (
                <TableRow key={entry.period}>
                  <TableCell>{entry.period}</TableCell>
                  <TableCell className="text-right tabular-nums text-ink">
                    {formatCurrency(entry.collected)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
