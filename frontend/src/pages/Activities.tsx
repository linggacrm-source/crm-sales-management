import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Trash2 } from "lucide-react";
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
  StatusBadge,
  TableSkeleton,
} from "@/components/Shared";
import { useAuth } from "@/hooks/useAuth";
import { useDebounced } from "@/hooks/useDebounced";
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { exportCsv, formatDate, formatNumber } from "@/lib/format";
import type {
  ActivityRow,
  ActivitySummary,
  CustomerOption,
  Paginated,
  SalesOption,
} from "@/lib/types";

const TYPES = ["Call", "WhatsApp", "Email", "Meeting", "Visit", "Presentation", "Follow Up", "Other"];
const STATUSES = ["Open", "Completed", "Cancelled"];
const BUCKETS = [
  { value: "", label: "Semua aktivitas" },
  { value: "today", label: "Hari ini" },
  { value: "upcoming", label: "Follow-up mendatang" },
  { value: "overdue", label: "Follow-up terlambat" },
  { value: "completed", label: "Selesai" },
];

type FormState = {
  activity_id?: string;
  customer_id: string;
  sales_id: string;
  activity_type: string;
  activity_date: string;
  subject: string;
  description: string;
  next_followup: string;
  status: string;
};

const EMPTY: FormState = {
  customer_id: "",
  sales_id: "",
  activity_type: "Call",
  activity_date: new Date().toISOString().slice(0, 10),
  subject: "",
  description: "",
  next_followup: "",
  status: "Open",
};

export default function Activities() {
  const qc = useQueryClient();
  const { isSales } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [bucket, setBucket] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [salesId, setSalesId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const debounced = useDebounced(search);
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (debounced) params.set("search", debounced);
  if (bucket) params.set("bucket", bucket);
  if (type) params.set("activity_type", type);
  if (status) params.set("status", status);
  if (salesId) params.set("sales_id", salesId);
  const qs = params.toString();

  const { data, isLoading, isError } = useQuery<Paginated<ActivityRow>>({
    queryKey: ["activities", qs],
    queryFn: () => apiGet<Paginated<ActivityRow>>(`/activities?${qs}`),
    placeholderData: (prev) => prev,
  });

  const summary = useQuery<ActivitySummary>({
    queryKey: ["activity-summary"],
    queryFn: () => apiGet<ActivitySummary>("/activities/summary"),
    staleTime: 60_000,
  });

  const { data: customerOptions } = useQuery<CustomerOption[]>({
    queryKey: ["customer-options"],
    queryFn: () => apiGet<CustomerOption[]>("/customers/options"),
    staleTime: 10 * 60_000,
  });
  const { data: salesOptions } = useQuery<SalesOption[]>({
    queryKey: ["user-options"],
    queryFn: () => apiGet<SalesOption[]>("/users/options"),
    staleTime: 10 * 60_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["activities"] });
    qc.invalidateQueries({ queryKey: ["activity-summary"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const save = useMutation({
    mutationFn: (f: FormState) => {
      const body = {
        customer_id: f.customer_id || undefined,
        sales_id: f.sales_id || undefined,
        activity_type: f.activity_type,
        activity_date: f.activity_date,
        subject: f.subject,
        description: f.description,
        next_followup: f.next_followup || undefined,
        status: f.status,
      };
      return f.activity_id
        ? apiPut<ActivityRow>(`/activities/${f.activity_id}`, body)
        : apiPost<ActivityRow>("/activities", body);
    },
    onSuccess: () => {
      toast.success("Aktivitas tersimpan");
      setDialogOpen(false);
      invalidate();
    },
    onError: (e) =>
      toast.error(
        (e instanceof ApiError ? (e.body as { detail?: string })?.detail : null) ?? "Gagal menyimpan aktivitas",
      ),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/activities/${id}`),
    onSuccess: () => {
      toast.success("Aktivitas dihapus");
      invalidate();
    },
    onError: () => toast.error("Gagal menghapus aktivitas"),
  });

  const rows = isError ? [] : (data?.data ?? []);
  const s = summary.data;

  return (
    <div>
      <PageHeader title="Aktivitas Sales" subtitle="Call, meeting, visit, dan jadwal follow-up">
        <Button
          variant="outline"
          onClick={() => exportCsv("activities.csv", rows as unknown as Record<string, unknown>[])}
          data-testid="btn-export-activities"
        >
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
        <Button
          onClick={() => {
            setForm(EMPTY);
            setDialogOpen(true);
          }}
          data-testid="btn-add-activity"
        >
          <Plus className="mr-2 h-4 w-4" /> Tambah Aktivitas
        </Button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <button onClick={() => setBucket("today")} className="text-left" data-testid="btn-bucket-today">
          <KpiCard testId="kpi-activity-today" title="Hari Ini" value={formatNumber(s?.today)} loading={summary.isLoading} />
        </button>
        <button onClick={() => setBucket("upcoming")} className="text-left" data-testid="btn-bucket-upcoming">
          <KpiCard testId="kpi-activity-upcoming" title="Follow-up Mendatang" value={formatNumber(s?.upcoming)} loading={summary.isLoading} />
        </button>
        <button onClick={() => setBucket("overdue")} className="text-left" data-testid="btn-bucket-overdue">
          <KpiCard testId="kpi-activity-overdue" title="Follow-up Terlambat" value={formatNumber(s?.overdue)} tone="danger" loading={summary.isLoading} />
        </button>
        <button onClick={() => setBucket("completed")} className="text-left" data-testid="btn-bucket-completed">
          <KpiCard testId="kpi-activity-completed" title="Selesai" value={formatNumber(s?.completed)} tone="success" loading={summary.isLoading} />
        </button>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <SearchBox
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Cari subjek / customer..."
            testId="input-search-activities"
          />
          <select
            value={bucket}
            onChange={(e) => {
              setBucket(e.target.value);
              setPage(1);
            }}
            data-testid="filter-activity-bucket"
            className="h-9 min-w-[11rem] rounded-md border border-input bg-background px-3 text-sm"
          >
            {BUCKETS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
          <FilterSelect
            value={type}
            onChange={(v) => {
              setType(v);
              setPage(1);
            }}
            options={TYPES.map((t) => ({ value: t, label: t }))}
            placeholder="Semua tipe"
            testId="filter-activity-type"
          />
          <FilterSelect
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={STATUSES.map((t) => ({ value: t, label: t }))}
            placeholder="Semua status"
            testId="filter-activity-status"
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
              testId="filter-activity-sales"
            />
          )}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipe</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>Subjek</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Sales</TableHead>
              <TableHead>Follow-up</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton cols={8} />
            ) : isError ? (
              <ErrorRow colSpan={8} />
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={8} message="Belum ada aktivitas pada filter ini." />
            ) : (
              rows.map((a) => (
                <TableRow key={a.activity_id} data-testid={`row-activity-${a.activity_id}`}>
                  <TableCell className="text-xs font-semibold">{a.activity_type}</TableCell>
                  <TableCell className="text-xs">{formatDate(a.activity_date)}</TableCell>
                  <TableCell className="max-w-[18rem] truncate">{a.subject}</TableCell>
                  <TableCell className="text-muted-foreground">{a.customer_name ?? "-"}</TableCell>
                  <TableCell className="text-muted-foreground">{a.sales_name ?? "-"}</TableCell>
                  <TableCell className="text-xs">{formatDate(a.next_followup)}</TableCell>
                  <TableCell>
                    <StatusBadge value={a.status} testId={`status-activity-${a.activity_id}`} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid={`btn-edit-activity-${a.activity_id}`}
                      onClick={() => {
                        setForm({
                          activity_id: a.activity_id,
                          customer_id: a.customer_id ?? "",
                          sales_id: a.sales_id ?? "",
                          activity_type: a.activity_type,
                          activity_date: a.activity_date ?? "",
                          subject: a.subject,
                          description: a.description ?? "",
                          next_followup: a.next_followup ?? "",
                          status: a.status,
                        });
                        setDialogOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => remove.mutate(a.activity_id)}
                      data-testid={`btn-delete-activity-${a.activity_id}`}
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
          total={isError ? 0 : (data?.total ?? 0)}
          onPage={setPage}
          onPageSize={setPageSize}
        />
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{form.activity_id ? "Edit Aktivitas" : "Tambah Aktivitas"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="act-subject">Subjek</Label>
              <Input
                id="act-subject"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                className="mt-1.5"
                data-testid="input-activity-subject"
              />
            </div>
            <div>
              <Label htmlFor="act-type">Tipe</Label>
              <select
                id="act-type"
                value={form.activity_type}
                onChange={(e) => setForm({ ...form, activity_type: e.target.value })}
                className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                data-testid="input-activity-type"
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="act-date">Tanggal</Label>
              <Input
                id="act-date"
                type="date"
                value={form.activity_date}
                onChange={(e) => setForm({ ...form, activity_date: e.target.value })}
                className="mt-1.5"
                data-testid="input-activity-date"
              />
            </div>
            <div>
              <Label htmlFor="act-cust">Customer</Label>
              <select
                id="act-cust"
                value={form.customer_id}
                onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                data-testid="input-activity-customer"
              >
                <option value="">— Pilih customer —</option>
                {(customerOptions ?? []).map((c) => (
                  <option key={c.customer_id} value={c.customer_id}>
                    {c.customer_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="act-follow">Next Follow-up</Label>
              <Input
                id="act-follow"
                type="date"
                value={form.next_followup}
                onChange={(e) => setForm({ ...form, next_followup: e.target.value })}
                className="mt-1.5"
                data-testid="input-activity-followup"
              />
            </div>
            <div>
              <Label htmlFor="act-status">Status</Label>
              <select
                id="act-status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                data-testid="input-activity-status"
              >
                {STATUSES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            {!isSales && (
              <div>
                <Label htmlFor="act-sales">Sales</Label>
                <select
                  id="act-sales"
                  value={form.sales_id}
                  onChange={(e) => setForm({ ...form, sales_id: e.target.value })}
                  className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  data-testid="input-activity-sales"
                >
                  <option value="">— Pilih sales —</option>
                  {(salesOptions ?? []).map((x) => (
                    <option key={x.user_id} value={x.user_id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="sm:col-span-2">
              <Label htmlFor="act-desc">Deskripsi</Label>
              <Textarea
                id="act-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="mt-1.5"
                data-testid="input-activity-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="btn-cancel-activity">
              Batal
            </Button>
            <Button
              onClick={() => save.mutate(form)}
              disabled={!form.subject || !form.activity_date || save.isPending}
              data-testid="btn-save-activity"
            >
              {save.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
