import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyRow, ErrorRow, PageHeader, RoleBadge, TableSkeleton } from "@/components/Shared";
import { apiGet } from "@/lib/api";
import { exportCsv, formatCompactIDR, formatNumber } from "@/lib/format";
import type { SalesKPIRow } from "@/lib/types";

export default function SalesTeam() {
  const { data, isLoading, isError } = useQuery<SalesKPIRow[]>({
    queryKey: ["sales-team"],
    queryFn: () => apiGet<SalesKPIRow[]>("/sales-team"),
    staleTime: 60_000,
  });

  const rows = isError ? [] : (data ?? []);

  return (
    <div>
      <PageHeader
        title="Sales Team & KPI"
        subtitle="KPI per sales dihitung dengan grouped aggregation — bukan query per orang"
      >
        <Button
          variant="outline"
          onClick={() => exportCsv("sales-team.csv", rows as unknown as Record<string, unknown>[])}
          data-testid="btn-export-sales-team"
        >
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </PageHeader>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sales</TableHead>
              <TableHead>Peran</TableHead>
              <TableHead>Manager</TableHead>
              <TableHead className="text-right">Open Pipeline</TableHead>
              <TableHead className="text-right">Weighted</TableHead>
              <TableHead className="text-right">Won</TableHead>
              <TableHead className="text-right">QT</TableHead>
              <TableHead className="text-right">PO</TableHead>
              <TableHead className="text-right">PO Value</TableHead>
              <TableHead className="text-right">Aktivitas</TableHead>
              <TableHead className="text-right">Indent</TableHead>
              <TableHead className="text-right">Overdue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton cols={12} />
            ) : isError ? (
              <ErrorRow colSpan={12} />
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={12} message="Belum ada anggota sales team." />
            ) : (
              rows.map((r) => (
                <TableRow key={r.sales_id} data-testid={`row-sales-${r.sales_id}`}>
                  <TableCell>
                    <p className="font-semibold">{r.sales_name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{r.sales_id}</p>
                  </TableCell>
                  <TableCell>
                    <RoleBadge role={r.role} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.manager_name ?? "-"}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatCompactIDR(r.open_pipeline)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatCompactIDR(r.weighted_pipeline)}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-semibold text-emerald-600">
                    {formatCompactIDR(r.won_value)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatNumber(r.quotations)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatNumber(r.po_count)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatCompactIDR(r.po_value)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatNumber(r.activities)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatNumber(r.indent)}</TableCell>
                  <TableCell
                    className={`text-right font-mono text-xs font-bold ${r.overdue > 0 ? "text-destructive" : ""}`}
                    data-testid={`sales-overdue-${r.sales_id}`}
                  >
                    {formatNumber(r.overdue)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
