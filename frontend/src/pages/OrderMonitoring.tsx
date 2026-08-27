import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  EmptyRow,
  ErrorRow,
  FilterSelect,
  KpiCard,
  PageHeader,
  Pagination,
  SearchBox,
  StatusBadge,
  TableSkeleton,
} from "@/components/Shared";
import { useAuth } from "@/hooks/useAuth";
import { useDebounced } from "@/hooks/useDebounced";
import { apiGet, apiPatch } from "@/lib/api";
import { ETA_LABEL, exportCsv, formatDate, formatNumber } from "@/lib/format";
import type { CustomerOption, MonitoringRow, MonitoringSummary, Paginated, SalesOption } from "@/lib/types";

const STATUSES = ["Waiting Order", "Processing", "Indent", "Ready Stock", "Delivery", "Completed", "Cancelled"];
const FLAGS = ["OVERDUE", "DUE_SOON", "COMPLETED"];
const FLOW = ["PO Diterima", "Processing", "Indent", "Ready Stock", "Delivery", "Completed"];

export default function OrderMonitoring() {
  const qc = useQueryClient();
  const { isSales } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [salesId, setSalesId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [flag, setFlag] = useState("");

  const debounced = useDebounced(search);
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (debounced) params.set("search", debounced);
  if (status) params.set("status", status);
  if (salesId) params.set("sales_id", salesId);
  if (customerId) params.set("customer_id", customerId);
  if (flag) params.set("eta_flag", flag);
  const qs = params.toString();

  const { data, isLoading, isError } = useQuery<Paginated<MonitoringRow>>({
    queryKey: ["order-monitoring", qs],
    queryFn: () => apiGet<Paginated<MonitoringRow>>(`/order-monitoring?${qs}`),
    placeholderData: (prev) => prev,
  });

  const summary = useQuery<MonitoringSummary>({
    queryKey: ["monitoring-summary"],
    queryFn: () => apiGet<MonitoringSummary>("/order-monitoring/summary"),
    staleTime: 60_000,
  });

  const { data: salesOptions } = useQuery<SalesOption[]>({
    queryKey: ["user-options"],
    queryFn: () => apiGet<SalesOption[]>("/users/options"),
    staleTime: 10 * 60_000,
  });
  const { data: customerOptions } = useQuery<CustomerOption[]>({
    queryKey: ["customer-options"],
    queryFn: () => apiGet<CustomerOption[]>("/customers/options"),
    staleTime: 10 * 60_000,
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiPatch<MonitoringRow>(`/order-monitoring/${id}`, body),
    onSuccess: () => {
      toast.success("Data monitoring diperbarui");
      qc.invalidateQueries({ queryKey: ["order-monitoring"] });
      qc.invalidateQueries({ queryKey: ["monitoring-summary"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: () => toast.error("Gagal memperbarui data monitoring"),
  });

  const rows = isError ? [] : (data?.data ?? []);
  const s = summary.data;

  return (
    <div>
      <PageHeader
        title="Order Monitoring"
        subtitle="Satu query terindeks langsung menghasilkan bentuk tabel — tanpa join di browser"
      >
        <Button
          variant="outline"
          onClick={() => exportCsv("order-monitoring.csv", rows as unknown as Record<string, unknown>[])}
          data-testid="btn-export-monitoring"
        >
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard testId="kpi-monitoring-total" title="Total" value={formatNumber(s?.total)} loading={summary.isLoading} />
        <KpiCard testId="kpi-monitoring-indent" title="Indent" value={formatNumber(s?.indent)} loading={summary.isLoading} />
        <KpiCard testId="kpi-monitoring-ready" title="Ready Stock" value={formatNumber(s?.ready_stock)} loading={summary.isLoading} />
        <KpiCard testId="kpi-monitoring-delivery" title="Delivery" value={formatNumber(s?.delivery)} loading={summary.isLoading} />
        <KpiCard testId="kpi-monitoring-completed" title="Completed" value={formatNumber(s?.completed)} tone="success" loading={summary.isLoading} />
        <KpiCard testId="kpi-monitoring-overdue" title="Overdue" value={formatNumber(s?.overdue)} tone="danger" loading={summary.isLoading} />
      </div>

      <Card className="mb-4 p-4" data-testid="monitoring-flow">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {FLOW.map((f, i) => (
            <span key={f} className="flex items-center gap-2">
              <span className="rounded-full border border-border bg-muted/60 px-2.5 py-1 font-semibold">{f}</span>
              {i < FLOW.length - 1 && <span className="text-muted-foreground">→</span>}
            </span>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <SearchBox
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Cari PO / produk / customer..."
            testId="input-search-monitoring"
          />
          <FilterSelect
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={STATUSES.map((x) => ({ value: x, label: x }))}
            placeholder="Semua status"
            testId="filter-monitoring-status"
          />
          <FilterSelect
            value={flag}
            onChange={(v) => {
              setFlag(v);
              setPage(1);
            }}
            options={FLAGS.map((f) => ({ value: f, label: ETA_LABEL[f] }))}
            placeholder="Semua indikator ETA"
            testId="filter-monitoring-eta"
          />
          {!isSales && (
            <FilterSelect
              value={salesId}
              onChange={(v) => {
                setSalesId(v);
                setPage(1);
              }}
              options={(salesOptions ?? []).map((x) => ({ value: x.user_id, label: x.name }))}
              placeholder="Semua sales"
              testId="filter-monitoring-sales"
            />
          )}
          <FilterSelect
            value={customerId}
            onChange={(v) => {
              setCustomerId(v);
              setPage(1);
            }}
            options={(customerOptions ?? []).map((c) => ({ value: c.customer_id, label: c.customer_name }))}
            placeholder="Semua customer"
            testId="filter-monitoring-customer"
          />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Monitoring ID</TableHead>
              <TableHead>Nomor PO</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Produk</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>ETA</TableHead>
              <TableHead>Indikator</TableHead>
              <TableHead>Sales</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton cols={10} />
            ) : isError ? (
              <ErrorRow colSpan={10} />
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={10} message="Belum ada data monitoring pada filter ini." />
            ) : (
              rows.map((m) => (
                <TableRow key={m.monitoring_id} data-testid={`row-monitoring-${m.monitoring_id}`}>
                  <TableCell className="font-mono text-xs">{m.monitoring_id}</TableCell>
                  <TableCell className="font-mono text-xs font-semibold">{m.po_number ?? "-"}</TableCell>
                  <TableCell>{m.customer_name ?? "-"}</TableCell>
                  <TableCell className="max-w-[16rem] truncate">{m.product_name ?? "-"}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatNumber(m.qty)}</TableCell>
                  <TableCell>
                    <select
                      value={m.status}
                      data-testid={`select-monitoring-status-${m.monitoring_id}`}
                      onChange={(e) => update.mutate({ id: m.monitoring_id, body: { status: e.target.value } })}
                      className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      {STATUSES.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell className="max-w-[12rem] truncate text-xs text-muted-foreground">
                    {m.supplier ?? "-"}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="date"
                      defaultValue={m.eta ?? ""}
                      data-testid={`input-monitoring-eta-${m.monitoring_id}`}
                      onBlur={(e) => {
                        if (e.target.value && e.target.value !== m.eta)
                          update.mutate({ id: m.monitoring_id, body: { eta: e.target.value } });
                      }}
                      className="h-7 w-36 text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      value={m.eta_flag}
                      label={ETA_LABEL[m.eta_flag] ?? m.eta_flag}
                      testId={`eta-flag-${m.monitoring_id}`}
                    />
                    {m.actual_delivery_date && (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Diterima: {formatDate(m.actual_delivery_date)}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{m.sales_name ?? "-"}</TableCell>
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
