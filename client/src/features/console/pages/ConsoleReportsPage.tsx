import { formatCurrency, formatNumber } from '@artinu/shared';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import * as React from 'react';
import { PageHeader } from '@/components/layout/DashboardShell';
import { TrendChart } from '@/components/charts/charts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/display';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FilterChips } from '@/components/ui/tabs';
import { downloadCsv } from '@/features/console/pages/ConsoleAccountsPage';
import { adminService } from '@/services/admin.service';

const PERIODS = [
  { value: '3', label: 'Last 3 months' },
  { value: '6', label: 'Last 6 months' },
  { value: '12', label: 'Last 12 months' },
];

export default function ConsoleReportsPage() {
  const [period, setPeriod] = React.useState('12');
  const months = Number(period);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'reports'],
    queryFn: () => adminService.reports(),
  });

  const slice = <T,>(list: T[] | undefined) => (list ?? []).slice(-months);

  if (isLoading) return <Skeleton className="h-96 w-full rounded-lg" />;

  return (
    <div>
      <PageHeader title="Reports" description="The numbers, and the tables behind them." />

      <FilterChips options={PERIODS} value={period} onChange={setPeriod} className="mb-6" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart data={slice(data?.revenueTrend)} format="currency" label={`Last ${months} months`} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart data={slice(data?.ordersTrend)} label={`Last ${months} months`} />
          </CardContent>
        </Card>
      </div>

      <ReportTable
        title="Top spaces"
        filename="ARTINU-top-spaces.csv"
        head={['Space', 'Orders', 'Revenue', 'Average order']}
        rows={(data?.topSpaces ?? []).map((space) => [
          space.name,
          space.orders,
          space.revenue ?? 0,
          space.orders > 0 ? Math.round((space.revenue ?? 0) / space.orders) : 0,
        ])}
        render={(row) => [
          <span key="n" className="text-ink">
            {row[0]}
          </span>,
          formatNumber(Number(row[1])),
          formatCurrency(Number(row[2])),
          formatCurrency(Number(row[3])),
        ]}
      />

      <ReportTable
        title="Top artists"
        filename="ARTINU-top-artists.csv"
        head={['Artist', 'Frames selected', 'Earnings']}
        rows={(data?.topArtists ?? []).map((artist) => [
          artist.name,
          artist.selections,
          artist.earnings ?? 0,
        ])}
        render={(row) => [
          <span key="n" className="text-ink">
            {row[0]}
          </span>,
          formatNumber(Number(row[1])),
          formatCurrency(Number(row[2])),
        ]}
      />

      <ReportTable
        title="Popular photographs"
        filename="ARTINU-popular-artworks.csv"
        head={['Photograph', 'Views', 'Selections', 'Conversion']}
        rows={(data?.popularArtworks ?? []).map((artwork) => [
          artwork.title,
          artwork.views,
          artwork.selections,
          artwork.views > 0 ? `${((artwork.selections / artwork.views) * 100).toFixed(2)}%` : '—',
        ])}
        render={(row) => [
          <span key="n" className="text-ink">
            {row[0]}
          </span>,
          formatNumber(Number(row[1])),
          formatNumber(Number(row[2])),
          String(row[3]),
        ]}
      />

      <ReportTable
        title="GST collected"
        filename="ARTINU-gst.csv"
        head={['Period', 'GST']}
        rows={slice(data?.gst).map((entry) => [entry.period, entry.collected])}
        render={(row) => [String(row[0]), formatCurrency(Number(row[1]))]}
      />
    </div>
  );
}

function ReportTable({
  title,
  filename,
  head,
  rows,
  render,
}: {
  title: string;
  filename: string;
  head: string[];
  rows: (string | number)[][];
  render: (row: (string | number)[]) => React.ReactNode[];
}) {
  return (
    <Card className="mt-6">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <Button variant="outline" size="sm" onClick={() => downloadCsv(filename, [head, ...rows])}>
          <Download /> CSV
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              {head.map((column, index) => (
                <TableHead key={column} className={index > 0 ? 'text-right' : undefined}>
                  {column}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {render(row).map((cell, cellIndex) => (
                  <TableCell
                    key={cellIndex}
                    className={cellIndex > 0 ? 'text-right tabular-nums' : undefined}
                  >
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={head.length} className="py-8 text-center text-sm text-subtle">
                  Nothing to report yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
