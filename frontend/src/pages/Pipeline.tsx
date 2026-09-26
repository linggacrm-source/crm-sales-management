import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, History, LayoutGrid, List, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  EmptyRow,
  ErrorRow,
  FilterSelect,
  KpiCard,
  PageHeader,
  Pagination,
  SearchBox,
  SearchableCustomerSelect,
  TableSkeleton,
} from "@/components/Shared";
import { useAuth } from "@/hooks/useAuth";
import { useDebounced } from "@/hooks/useDebounced";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import { exportCsv, formatCompactIDR, formatDate, formatIDR } from "@/lib/format";
import type {
  CustomerOption,
  KanbanColumn,
  OpportunityRow,
  Paginated,
  SalesOption,
  StageSummary,
  AuditRow,
} from "@/lib/types";

const STAGES = ["Lead", "Qualification", "Proposal", "Negotiation", "Won", "Lost"];

type FormState = {
  opportunity_id?: string;
  opportunity_name: string;
  customer_id: string;
  sales_id: string;
  value: string;
  probability: string;
  stage: string;
  expected_close_date: string;
  source: string;
  notes: string;
};

const EMPTY: FormState = {
  opportunity_name: "",
  customer_id: "",
  sales_id: "",
  value: "0",
  probability: "10",
  stage: "Lead",
  expected_close_date: "",
  source: "Referral",
  notes: "",
};

export default function Pipeline() {
  const qc = useQueryClient();
  const { isSales } = useAuth();
  const [view, setView] = useState<"table" | "kanban">("table");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [salesId, setSalesId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyOpportunity, setHistoryOpportunity] = useState<OpportunityRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const debounced = useDebounced(search);
  const filters = new URLSearchParams();
  if (debounced) filters.set("search", debounced);
  if (salesId) filters.set("sales_id", salesId);
  if (customerId) filters.set("customer_id", customerId);
  const filterQs = filters.toString();

  const listParams = new URLSearchParams(filters);
  listParams.set("page", String(page));
  listParams.set("page_size", String(pageSize));
  if (stage) listParams.set("stage", stage);
  const listQs = listParams.toString();

  const list = useQuery<Paginated<OpportunityRow>>({
    queryKey: ["pipeline", listQs],
    queryFn: () => apiGet<Paginated<OpportunityRow>>(`/pipeline?${listQs}`),
    enabled: view === "table",
    placeholderData: (prev) => prev,
  });

  const kanban = useQuery<KanbanColumn[]>({
    queryKey: ["pipeline-kanban", filterQs],
    queryFn: () => apiGet<KanbanColumn[]>(`/pipeline/kanban${filterQs ? `?${filterQs}` : ""}`),
    enabled: view === "kanban",
  });

  const summary = useQuery<StageSummary[]>({
    queryKey: ["pipeline-summary", filterQs],
    queryFn: () => apiGet<StageSummary[]>(`/pipeline/summary${filterQs ? `?${filterQs}` : ""}`),
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

  const history = useQuery<AuditRow[]>({
    queryKey: ["pipeline-history", historyOpportunity?.opportunity_id],
    queryFn: () => apiGet<AuditRow[]>(`/pipeline/${historyOpportunity?.opportunity_id}/history`),
    enabled: historyOpen && !!historyOpportunity?.opportunity_id,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["pipeline"] });
    qc.invalidateQueries({ queryKey: ["pipeline-kanban"] });
    qc.invalidateQueries({ queryKey: ["pipeline-summary"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const save = useMutation({
    mutationFn: (f: FormState) => {
      const body = {
        opportunity_name: f.opportunity_name,
        customer_id: f.customer_id,
        sales_id: f.sales_id || undefined,
        value: Number(f.value) || 0,
        probability: Number(f.probability) || 0,
        stage: f.stage,
        expected_close_date: f.expected_close_date || undefined,
        source: f.source,
        notes: f.notes,
      };
      return f.opportunity_id
        ? apiPut<OpportunityRow>(`/pipeline/${f.opportunity_id}`, body)
        : apiPost<OpportunityRow>("/pipeline", body);
    },
    onSuccess: () => {
      toast.success("Opportunity tersimpan");
      setDialogOpen(false);
      invalidate();
    },
    onError: (e) =>
      toast.error(
        (e instanceof ApiError ? (e.body as { detail?: string })?.detail : null) ?? "Gagal menyimpan opportunity",
      ),
  });

  const changeStage = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) =>
      apiPatch<OpportunityRow>(`/pipeline/${id}/stage`, { stage: next }),
    onSuccess: (_d, v) => {
      toast.success(`Stage diubah ke ${v.next}`);
      invalidate();
    },
    onError: () => toast.error("Gagal mengubah stage"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/pipeline/${id}`),
    onSuccess: () => {
      toast.success("Opportunity dihapus");
      invalidate();
    },
    onError: () => toast.error("Gagal menghapus opportunity"),
  });

  const openEdit = (o: OpportunityRow) => {
    setForm({
      opportunity_id: o.opportunity_id,
      opportunity_name: o.opportunity_name,
      customer_id: o.customer_id,
      sales_id: o.sales_id ?? "",
      value: String(o.value),
      probability: String(o.probability),
      stage: o.stage,
      expected_close_date: o.expected_close_date ?? "",
      source: o.source ?? "Referral",
      notes: o.notes ?? "",
    });
    setDialogOpen(true);
  };

  const rows = list.isError ? [] : (list.data?.data ?? []);
  const sums = summary.data ?? [];
  const openSum = sums.filter((s) => !["Won", "Lost"].includes(s.stage));
  const totalOpen = openSum.reduce((a, s) => a + s.value, 0);
  const totalWeighted = openSum.reduce((a, s) => a + s.weighted_value, 0);
  const wonValue = sums.find((s) => s.stage === "Won")?.value ?? 0;
  const openCount = openSum.reduce((a, s) => a + s.count, 0);

  return (
    <div>
      <PageHeader title="Sales Pipeline" subtitle="Weighted value = value × probability, dihitung di server">
        <div className="flex overflow-hidden rounded-md border border-border">
          <button
            onClick={() => setView("table")}
            data-testid="btn-view-table"
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
              view === "table" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
            }`}
          >
            <List className="h-3.5 w-3.5" /> Table
          </button>
          <button
            onClick={() => setView("kanban")}
            data-testid="btn-view-kanban"
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
              view === "kanban" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Kanban
          </button>
        </div>
        <Button
          variant="outline"
          onClick={() => exportCsv("pipeline.csv", rows as unknown as Record<string, unknown>[])}
          data-testid="btn-export-pipeline"
        >
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
        <Button
          onClick={() => {
            setForm(EMPTY);
            setDialogOpen(true);
          }}
          data-testid="btn-add-opportunity"
        >
          <Plus className="mr-2 h-4 w-4" /> Opportunity
        </Button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard testId="kpi-pipeline-open" title="Open Pipeline" value={formatCompactIDR(totalOpen)} loading={summary.isLoading} />
        <KpiCard testId="kpi-pipeline-weighted" title="Weighted Pipeline" value={formatCompactIDR(totalWeighted)} loading={summary.isLoading} />
        <KpiCard testId="kpi-pipeline-won" title="Won Value" value={formatCompactIDR(wonValue)} tone="success" loading={summary.isLoading} />
        <KpiCard testId="kpi-pipeline-count" title="Deal Aktif" value={openCount} loading={summary.isLoading} />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <SearchBox
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Cari opportunity / customer..."
            testId="input-search-pipeline"
          />
          {view === "table" && (
            <FilterSelect
              value={stage}
              onChange={(v) => {
                setStage(v);
                setPage(1);
              }}
              options={STAGES.map((s) => ({ value: s, label: s }))}
              placeholder="Semua stage"
              testId="filter-pipeline-stage"
            />
          )}
          {!isSales && (
            <FilterSelect
              value={salesId}
              onChange={(v) => {
                setSalesId(v);
                setPage(1);
              }}
              options={(salesOptions ?? []).map((s) => ({ value: s.user_id, label: s.name }))}
              placeholder="Semua sales"
              testId="filter-pipeline-sales"
            />
          )}
          <SearchableCustomerSelect
            value={customerId}
            onChange={(v) => {
              setCustomerId(v);
              setPage(1);
            }}
            options={customerOptions ?? []}
            placeholder="Semua customer"
            testId="filter-pipeline-customer"
          />
        </div>

        {view === "table" ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Opportunity</TableHead>
                  <TableHead>Perusahaan</TableHead>
                  <TableHead>Sales</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Prob.</TableHead>
                  <TableHead className="text-right">Weighted</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Target Close</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.isLoading ? (
                  <TableSkeleton cols={9} />
                ) : list.isError ? (
                  <ErrorRow colSpan={9} />
                ) : rows.length === 0 ? (
                  <EmptyRow colSpan={9} message="Belum ada opportunity pada filter ini." />
                ) : (
                  rows.map((o) => (
                    <TableRow key={o.opportunity_id} data-testid={`row-opportunity-${o.opportunity_id}`}>
                      <TableCell className="font-semibold">{o.opportunity_name}</TableCell>
                      <TableCell className="text-muted-foreground">{o.customer_name ?? "-"}</TableCell>
                      <TableCell className="text-muted-foreground">{o.sales_name ?? "-"}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatIDR(o.value)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{o.probability}%</TableCell>
                      <TableCell
                        className="text-right font-mono text-xs font-semibold"
                        data-testid={`weighted-${o.opportunity_id}`}
                      >
                        {formatIDR(o.weighted_value)}
                      </TableCell>
                      <TableCell>
                        <select
                          value={o.stage}
                          data-testid={`select-stage-${o.opportunity_id}`}
                          onChange={(e) => changeStage.mutate({ id: o.opportunity_id, next: e.target.value })}
                          className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                        >
                          {STAGES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell className="text-xs">{formatDate(o.expected_close_date)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setHistoryOpportunity(o);
                            setHistoryOpen(true);
                          }}
                          data-testid={`btn-history-opportunity-${o.opportunity_id}`}
                        >
                          <History className="mr-1.5 h-3.5 w-3.5" /> History
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(o)}
                          data-testid={`btn-edit-opportunity-${o.opportunity_id}`}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => remove.mutate(o.opportunity_id)}
                          data-testid={`btn-delete-opportunity-${o.opportunity_id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={list.isError ? 0 : (list.data?.total ?? 0)}
              onPage={setPage}
              onPageSize={setPageSize}
            />
          </>
        ) : (
          <div className="flex gap-4 overflow-x-auto p-4" data-testid="kanban-board">
            {kanban.isLoading
              ? STAGES.map((s) => (
                  <div key={s} className="min-w-[280px] flex-1 rounded-xl bg-muted/50 p-3">
                    <div className="mb-3 h-4 w-24 animate-shimmer rounded bg-muted" />
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="mb-3 h-20 animate-shimmer rounded-lg bg-muted" />
                    ))}
                  </div>
                ))
              : (kanban.data ?? []).map((col) => (
                  <div
                    key={col.stage}
                    data-testid={`kanban-stage-${col.stage.toLowerCase()}`}
                    className="flex max-h-[calc(100vh-260px)] min-w-[290px] flex-1 flex-col rounded-xl border border-border bg-muted/40 p-3"
                  >
                    <div className="mb-3 flex items-center justify-between border-b border-border pb-2.5">
                      <div>
                        <p className="text-sm font-semibold">{col.stage}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {formatCompactIDR(col.value)}
                        </p>
                      </div>
                      <span className="rounded-full border border-border bg-card px-2 py-0.5 font-mono text-xs font-bold">
                        {col.count}
                      </span>
                    </div>
                    <div className="flex-1 space-y-2.5 overflow-y-auto">
                      {col.items.length === 0 ? (
                        <p className="py-6 text-center text-xs text-muted-foreground">Kosong</p>
                      ) : (
                        col.items.map((o) => (
                          <div
                            key={o.opportunity_id}
                            data-testid={`kanban-card-${o.opportunity_id}`}
                            className="rounded-lg border border-border bg-card p-3 transition-all duration-150 hover:border-primary hover:shadow-md"
                          >
                            <p className="text-sm font-semibold">{o.opportunity_name}</p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">{o.customer_name}</p>
                            <p className="mt-2 font-mono text-xs font-bold">{formatIDR(o.value)}</p>
                            <p className="font-mono text-[11px] text-muted-foreground">
                              W: {formatCompactIDR(o.weighted_value)} · {o.probability}%
                            </p>
                            <select
                              value={o.stage}
                              data-testid={`kanban-select-stage-${o.opportunity_id}`}
                              onChange={(e) =>
                                changeStage.mutate({ id: o.opportunity_id, next: e.target.value })
                              }
                              className="mt-2 h-7 w-full rounded-md border border-input bg-background px-2 text-xs"
                            >
                              {STAGES.map((s) => (
                                <option key={s} value={s}>
                                  Pindah ke: {s}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
          </div>
        )}
      </Card>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>History Opportunity</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {historyOpportunity?.opportunity_name} · {historyOpportunity?.customer_name ?? "-"}
            </p>
          </DialogHeader>
          <div className="space-y-4">
            {history.isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Memuat history...</div>
            ) : history.isError ? (
              <div className="py-8 text-center text-sm text-destructive">History tidak dapat dimuat.</div>
            ) : (history.data ?? []).length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Belum ada history.</div>
            ) : (
              (history.data ?? []).map((item, index) => {
                let parsed: Record<string, { old?: unknown; new?: unknown }> | null = null;
                try {
                  if (item.new_value === "Perubahan field" && item.old_value) {
                    parsed = JSON.parse(item.old_value);
                  }
                } catch {
                  parsed = null;
                }
                return (
                  <div key={`${item.timestamp ?? "history"}-${index}`} className="relative border-l-2 border-primary/20 pl-4">
                    <div className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{item.action === "CREATE" ? "Opportunity dibuat" : "Opportunity diperbarui"}</p>
                      <span className="text-xs text-muted-foreground">{formatDate(item.timestamp)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">Oleh: {item.user_name ?? "-"}</p>
                    {parsed ? (
                      <div className="mt-2 space-y-1.5">
                        {Object.entries(parsed).map(([label, change]) => (
                          <div key={label} className="rounded-md bg-muted/50 px-3 py-2 text-xs">
                            <span className="font-semibold">{label}:</span>{" "}
                            <span className="text-muted-foreground">{String(change.old ?? "-")}</span>
                            <span className="mx-1">→</span>
                            <span className="font-medium">{String(change.new ?? "-")}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
                        {item.old_value ? <span>{item.old_value} → </span> : null}
                        <span>{item.new_value ?? "-"}</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{form.opportunity_id ? "Edit Opportunity" : "Buat Opportunity"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="opp-name">Nama Opportunity</Label>
              <Input
                id="opp-name"
                value={form.opportunity_name}
                onChange={(e) => setForm({ ...form, opportunity_name: e.target.value })}
                className="mt-1.5"
                data-testid="input-opportunity-name"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="opp-cust">Customer</Label>
              <SearchableCustomerSelect
                value={form.customer_id}
                onChange={(customer_id) => setForm({ ...form, customer_id })}
                options={customerOptions ?? []}
                testId="input-opportunity-customer"
              />
            </div>
            <div>
              <Label htmlFor="opp-value">Value (Rp)</Label>
              <Input
                id="opp-value"
                type="number"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                className="mt-1.5"
                data-testid="input-opportunity-value"
              />
            </div>
            <div>
              <Label htmlFor="opp-prob">Probability (%)</Label>
              <Input
                id="opp-prob"
                type="number"
                value={form.probability}
                onChange={(e) => setForm({ ...form, probability: e.target.value })}
                className="mt-1.5"
                data-testid="input-opportunity-probability"
              />
            </div>
            <div>
              <Label htmlFor="opp-stage">Stage</Label>
              <select
                id="opp-stage"
                value={form.stage}
                onChange={(e) => setForm({ ...form, stage: e.target.value })}
                className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                data-testid="input-opportunity-stage"
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="opp-close">Target Close</Label>
              <Input
                id="opp-close"
                type="date"
                value={form.expected_close_date}
                onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })}
                className="mt-1.5"
                data-testid="input-opportunity-close-date"
              />
            </div>
            {!isSales && (
              <div className="sm:col-span-2">
                <Label htmlFor="opp-sales">Sales</Label>
                <select
                  id="opp-sales"
                  value={form.sales_id}
                  onChange={(e) => setForm({ ...form, sales_id: e.target.value })}
                  className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  data-testid="input-opportunity-sales"
                >
                  <option value="">— Pilih sales —</option>
                  {(salesOptions ?? []).map((s) => (
                    <option key={s.user_id} value={s.user_id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="sm:col-span-2">
              <Label htmlFor="opp-notes">Catatan</Label>
              <Textarea
                id="opp-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="mt-1.5"
                data-testid="input-opportunity-notes"
              />
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Weighted value otomatis:{" "}
              <span className="font-mono font-semibold">
                {formatIDR((Number(form.value) || 0) * (Number(form.probability) || 0) / 100)}
              </span>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="btn-cancel-opportunity">
              Batal
            </Button>
            <Button
              onClick={() => save.mutate(form)}
              disabled={!form.opportunity_name || !form.customer_id || save.isPending}
              data-testid="btn-save-opportunity"
            >
              {save.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
