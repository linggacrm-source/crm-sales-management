import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  EmptyRow,
  ErrorRow,
  FilterSelect,
  Pagination,
  PageHeader,
  SearchBox,
  StatusBadge,
  TableSkeleton,
} from "@/components/Shared";
import { useAuth } from "@/hooks/useAuth";
import { useDebounced } from "@/hooks/useDebounced";
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { exportCsv } from "@/lib/format";
import type { CustomerRow, Paginated, SalesOption } from "@/lib/types";

const INDUSTRIES = ["Manufaktur", "Oil & Gas", "Pertambangan", "Otomotif", "FMCG", "Telekomunikasi", "Konstruksi"];
const SOURCES = ["Referral", "Website", "Pameran", "Cold Call", "Partner"];

type FormState = {
  customer_id?: string;
  customer_name: string;
  company: string;
  industry: string;
  address: string;
  city: string;
  province: string;
  phone: string;
  email: string;
  pic_name: string;
  pic_position: string;
  source: string;
  sales_id: string;
  status: string;
  notes: string;
};

const EMPTY: FormState = {
  customer_name: "",
  company: "",
  industry: "Manufaktur",
  address: "",
  city: "",
  province: "",
  phone: "",
  email: "",
  pic_name: "",
  pic_position: "",
  source: "Referral",
  sales_id: "",
  status: "Active",
  notes: "",
};

export default function Customers() {
  const qc = useQueryClient();
  const { isSales } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [industry, setIndustry] = useState("");
  const [salesId, setSalesId] = useState("");
  const [sortBy, setSortBy] = useState("created_date");
  const [sortDir, setSortDir] = useState("desc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const debounced = useDebounced(search);
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    sort_by: sortBy,
    sort_dir: sortDir,
  });
  if (debounced) params.set("search", debounced);
  if (status) params.set("status", status);
  if (industry) params.set("industry", industry);
  if (salesId) params.set("sales_id", salesId);
  const qs = params.toString();

  const { data, isLoading, isError } = useQuery<Paginated<CustomerRow>>({
    queryKey: ["customers", qs],
    queryFn: () => apiGet<Paginated<CustomerRow>>(`/customers?${qs}`),
    placeholderData: (prev) => prev,
  });

  const { data: salesOptions } = useQuery<SalesOption[]>({
    queryKey: ["user-options"],
    queryFn: () => apiGet<SalesOption[]>("/users/options"),
    staleTime: 10 * 60_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["customers"] });
    qc.invalidateQueries({ queryKey: ["customer-options"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const save = useMutation({
    mutationFn: (payload: FormState) => {
      const body = { ...payload, sales_id: payload.sales_id || undefined };
      return payload.customer_id
        ? apiPut<CustomerRow>(`/customers/${payload.customer_id}`, body)
        : apiPost<CustomerRow>("/customers", body);
    },
    onSuccess: () => {
      toast.success("Data customer tersimpan");
      setDialogOpen(false);
      invalidate();
    },
    onError: (e) =>
      toast.error(
        (e instanceof ApiError ? (e.body as { detail?: string })?.detail : null) ?? "Gagal menyimpan customer",
      ),
  });

  const archive = useMutation({
    mutationFn: (id: string) => apiDelete(`/customers/${id}`),
    onSuccess: () => {
      toast.success("Customer diarsipkan");
      invalidate();
    },
    onError: () => toast.error("Gagal mengarsipkan customer"),
  });

  const rows = isError ? [] : (data?.data ?? []);
  const total = isError ? 0 : (data?.total ?? 0);

  const sortHead = (label: string, field: string) => (
    <TableHead>
      <button
        className="flex items-center gap-1 transition-colors duration-150 hover:text-foreground"
        data-testid={`sort-${field}`}
        onClick={() => {
          if (sortBy === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
          else {
            setSortBy(field);
            setSortDir("asc");
          }
          setPage(1);
        }}
      >
        {label}
        {sortBy === field && <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </TableHead>
  );

  const field = (
    key: keyof FormState,
    label: string,
    type: "text" | "email" | "textarea" | "select" = "text",
    options?: string[],
  ) => (
    <div>
      <Label htmlFor={`cust-${key}`}>{label}</Label>
      {type === "textarea" ? (
        <Textarea
          id={`cust-${key}`}
          value={form[key] ?? ""}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className="mt-1.5"
          data-testid={`input-customer-${key}`}
        />
      ) : type === "select" ? (
        <select
          id={`cust-${key}`}
          value={form[key] ?? ""}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          data-testid={`input-customer-${key}`}
        >
          {(options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={`cust-${key}`}
          type={type}
          value={form[key] ?? ""}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className="mt-1.5"
          data-testid={`input-customer-${key}`}
        />
      )}
    </div>
  );

  return (
    <div>
      <PageHeader title="Customers" subtitle="Database pelanggan — pencarian & filter dijalankan di server">
        <Button
          variant="outline"
          onClick={() => exportCsv("customers.csv", rows as unknown as Record<string, unknown>[])}
          data-testid="btn-export-customers"
        >
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
        <Button
          onClick={() => {
            setForm(EMPTY);
            setDialogOpen(true);
          }}
          data-testid="btn-add-customer"
        >
          <Plus className="mr-2 h-4 w-4" /> Tambah Customer
        </Button>
      </PageHeader>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <SearchBox
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Cari nama, PIC, email..."
            testId="input-search-customers"
          />
          <FilterSelect
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={[
              { value: "Active", label: "Active" },
              { value: "Archived", label: "Archived" },
            ]}
            placeholder="Semua status"
            testId="filter-customer-status"
          />
          <FilterSelect
            value={industry}
            onChange={(v) => {
              setIndustry(v);
              setPage(1);
            }}
            options={INDUSTRIES.map((i) => ({ value: i, label: i }))}
            placeholder="Semua industri"
            testId="filter-customer-industry"
          />
          {!isSales && (
            <FilterSelect
              value={salesId}
              onChange={(v) => {
                setSalesId(v);
                setPage(1);
              }}
              options={(salesOptions ?? []).map((s) => ({ value: s.user_id, label: s.name }))}
              placeholder="Semua sales"
              testId="filter-customer-sales"
            />
          )}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer ID</TableHead>
              {sortHead("Nama Customer", "customer_name")}
              <TableHead>Industri</TableHead>
              {sortHead("Kota", "city")}
              <TableHead>PIC</TableHead>
              <TableHead>Sales</TableHead>
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
              <EmptyRow colSpan={8} message="Tidak ada customer yang cocok dengan filter." />
            ) : (
              rows.map((c) => (
                <TableRow key={c.customer_id} data-testid={`row-customer-${c.customer_id}`}>
                  <TableCell className="font-mono text-xs">{c.customer_id}</TableCell>
                  <TableCell>
                    <Link
                      to={`/customers/${c.customer_id}`}
                      className="font-semibold text-primary hover:underline"
                      data-testid={`link-customer-${c.customer_id}`}
                    >
                      {c.customer_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.industry ?? "-"}</TableCell>
                  <TableCell>{c.city ?? "-"}</TableCell>
                  <TableCell>{c.pic_name ?? "-"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.sales_name ?? "-"}</TableCell>
                  <TableCell>
                    <StatusBadge value={c.status} testId={`status-customer-${c.customer_id}`} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid={`btn-edit-customer-${c.customer_id}`}
                      onClick={async () => {
                        const detail = await apiGet<FormState>(`/customers/${c.customer_id}`);
                        setForm({ ...EMPTY, ...detail });
                        setDialogOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      data-testid={`btn-archive-customer-${c.customer_id}`}
                      onClick={() => archive.mutate(c.customer_id)}
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
          total={total}
          onPage={setPage}
          onPageSize={setPageSize}
        />
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.customer_id ? "Edit Customer" : "Tambah Customer"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("customer_name", "Nama Customer")}
            {field("company", "Perusahaan")}
            {field("industry", "Industri", "select", INDUSTRIES)}
            {field("source", "Sumber", "select", SOURCES)}
            {field("city", "Kota")}
            {field("province", "Provinsi")}
            {field("phone", "Telepon")}
            {field("email", "Email", "email")}
            {field("pic_name", "Nama PIC")}
            {field("pic_position", "Jabatan PIC")}
            {field("status", "Status", "select", ["Active", "Inactive", "Archived"])}
            {!isSales && (
              <div>
                <Label htmlFor="cust-sales">Sales Penanggung Jawab</Label>
                <select
                  id="cust-sales"
                  value={form.sales_id}
                  onChange={(e) => setForm({ ...form, sales_id: e.target.value })}
                  className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  data-testid="input-customer-sales_id"
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
            <div className="sm:col-span-2">{field("address", "Alamat", "textarea")}</div>
            <div className="sm:col-span-2">{field("notes", "Catatan", "textarea")}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="btn-cancel-customer">
              Batal
            </Button>
            <Button
              onClick={() => save.mutate(form)}
              disabled={!form.customer_name || save.isPending}
              data-testid="btn-save-customer"
            >
              {save.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
