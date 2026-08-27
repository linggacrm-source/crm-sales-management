import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  EmptyRow,
  ErrorRow,
  FilterSelect,
  PageHeader,
  Pagination,
  SearchBox,
  TableSkeleton,
} from "@/components/Shared";
import { useDebounced } from "@/hooks/useDebounced";
import { apiGet } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { AuditRow, Paginated } from "@/lib/types";

const MODULES = ["Customer", "Opportunity", "Quotation", "PO", "Order Monitoring", "User", "Product"];
const ACTIONS = ["CREATE", "UPDATE", "DELETE", "ARCHIVE", "CONVERT", "DUPLICATE", "RESET_PASSWORD"];

export default function AuditLog() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [module, setModule] = useState("");
  const [action, setAction] = useState("");

  const debounced = useDebounced(search);
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (debounced) params.set("search", debounced);
  if (module) params.set("module", module);
  if (action) params.set("action", action);
  const qs = params.toString();

  const { data, isLoading, isError } = useQuery<Paginated<AuditRow>>({
    queryKey: ["audit-log", qs],
    queryFn: () => apiGet<Paginated<AuditRow>>(`/audit-log?${qs}`),
    placeholderData: (prev) => prev,
  });

  const rows = isError ? [] : (data?.data ?? []);

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Jejak perubahan penting: siapa, apa, kapan, dari nilai apa ke apa" />

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <SearchBox
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Cari user / record ID..."
            testId="input-search-audit"
          />
          <FilterSelect
            value={module}
            onChange={(v) => {
              setModule(v);
              setPage(1);
            }}
            options={MODULES.map((m) => ({ value: m, label: m }))}
            placeholder="Semua modul"
            testId="filter-audit-module"
          />
          <FilterSelect
            value={action}
            onChange={(v) => {
              setAction(v);
              setPage(1);
            }}
            options={ACTIONS.map((a) => ({ value: a, label: a }))}
            placeholder="Semua aksi"
            testId="filter-audit-action"
          />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Aksi</TableHead>
              <TableHead>Modul</TableHead>
              <TableHead>Record ID</TableHead>
              <TableHead>Perubahan</TableHead>
              <TableHead>Waktu</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton cols={6} />
            ) : isError ? (
              <ErrorRow colSpan={6} />
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={6} message="Belum ada catatan audit." />
            ) : (
              rows.map((r, i) => (
                <TableRow key={i} data-testid={`row-audit-${i}`}>
                  <TableCell>
                    <p className="font-semibold">{r.user_name ?? "-"}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{r.user_id}</p>
                  </TableCell>
                  <TableCell className="text-xs font-semibold">{r.action}</TableCell>
                  <TableCell className="text-xs">{r.module}</TableCell>
                  <TableCell className="font-mono text-xs">{r.record_id ?? "-"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.old_value || r.new_value ? (
                      <span>
                        {r.old_value ?? "—"} <span className="text-foreground">→</span> {r.new_value ?? "—"}
                      </span>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{formatDateTime(r.timestamp)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <Pagination
          page={page}
          pageSize={pageSize}
          total={isError ? 0 : (data?.total ?? 0)}
          onPage={setPage}
          onPageSize={setPageSize}
        />
      </Card>
    </div>
  );
}
