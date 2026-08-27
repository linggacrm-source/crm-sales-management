import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
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
  PageHeader,
  Pagination,
  SearchBox,
  TableSkeleton,
} from "@/components/Shared";
import { useAuth } from "@/hooks/useAuth";
import { useDebounced } from "@/hooks/useDebounced";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import { exportCsv, formatDate, formatIDR } from "@/lib/format";
import type { CustomerOption, PODetail, PORow, Paginated, ProductRow, SalesOption } from "@/lib/types";

const STATUSES = ["Draft", "Received", "Confirmed", "Processing", "Completed", "Cancelled"];

type ItemForm = { product_id: string; description: string; qty: string; unit: string; unit_price: string };

type FormState = {
  po_id?: string;
  po_number: string;
  customer_id: string;
  quotation_id: string;
  sales_id: string;
  po_date: string;
  delivery_address: string;
  payment_term: string;
  notes: string;
  status: string;
  document_name: string;
  items: ItemForm[];
};

const EMPTY_ITEM: ItemForm = { product_id: "", description: "", qty: "1", unit: "Unit", unit_price: "0" };
const EMPTY: FormState = {
  po_number: "",
  customer_id: "",
  quotation_id: "",
  sales_id: "",
  po_date: "",
  delivery_address: "",
  payment_term: "30 hari setelah invoice",
  notes: "",
  status: "Received",
  document_name: "",
  items: [{ ...EMPTY_ITEM }],
};

export default function PurchaseOrders() {
  const qc = useQueryClient();
  const { isSales } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [salesId, setSalesId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const debounced = useDebounced(search);
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (debounced) params.set("search", debounced);
  if (status) params.set("status", status);
  if (salesId) params.set("sales_id", salesId);
  const qs = params.toString();

  const { data, isLoading, isError } = useQuery<Paginated<PORow>>({
    queryKey: ["purchase-orders", qs],
    queryFn: () => apiGet<Paginated<PORow>>(`/purchase-orders?${qs}`),
    placeholderData: (prev) => prev,
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
  const { data: products } = useQuery<ProductRow[]>({
    queryKey: ["product-options"],
    queryFn: () => apiGet<ProductRow[]>("/products/options"),
    staleTime: 10 * 60_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    qc.invalidateQueries({ queryKey: ["order-monitoring"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const save = useMutation({
    mutationFn: (f: FormState) => {
      const body = {
        po_number: f.po_number.trim(),
        customer_id: f.customer_id,
        quotation_id: f.quotation_id || undefined,
        sales_id: f.sales_id || undefined,
        po_date: f.po_date || undefined,
        delivery_address: f.delivery_address,
        payment_term: f.payment_term,
        notes: f.notes,
        status: f.status,
        document_name: f.document_name || undefined,
        items: f.items
          .filter((i) => i.description)
          .map((i) => ({
            product_id: i.product_id || undefined,
            description: i.description,
            qty: Number(i.qty) || 0,
            unit: i.unit,
            unit_price: Number(i.unit_price) || 0,
          })),
      };
      return f.po_id ? apiPut<PODetail>(`/purchase-orders/${f.po_id}`, body) : apiPost<PODetail>("/purchase-orders", body);
    },
    onSuccess: (po) => {
      toast.success(`PO ${po.po_number} tersimpan`);
      setDialogOpen(false);
      invalidate();
    },
    onError: (e) =>
      toast.error((e instanceof ApiError ? (e.body as { detail?: string })?.detail : null) ?? "Gagal menyimpan PO"),
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) =>
      apiPatch<PODetail>(`/purchase-orders/${id}/status`, { status: next }),
    onSuccess: () => {
      toast.success("Status PO diperbarui");
      invalidate();
    },
    onError: () => toast.error("Gagal mengubah status PO"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/purchase-orders/${id}`),
    onSuccess: () => {
      toast.success("PO dihapus");
      invalidate();
    },
    onError: () => toast.error("Gagal menghapus PO"),
  });

  const openEdit = async (id: string) => {
    const d = await apiGet<PODetail>(`/purchase-orders/${id}`);
    setForm({
      po_id: d.po_id,
      po_number: d.po_number,
      customer_id: d.customer_id,
      quotation_id: d.quotation_id ?? "",
      sales_id: d.sales_id ?? "",
      po_date: d.po_date ?? "",
      delivery_address: d.delivery_address ?? "",
      payment_term: d.payment_term ?? "",
      notes: d.notes ?? "",
      status: d.status,
      document_name: d.document_name ?? "",
      items: d.items.map((i) => ({
        product_id: i.product_id ?? "",
        description: i.description,
        qty: String(i.qty),
        unit: i.unit,
        unit_price: String(i.unit_price),
      })),
    });
    setDialogOpen(true);
  };

  const rows = isError ? [] : (data?.data ?? []);
  const poTotal = form.items.reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.unit_price) || 0), 0);

  return (
    <div>
      <PageHeader
        title="Purchase Order Customer"
        subtitle="PO yang DITERIMA dari customer — nomor PO diambil dari dokumen customer, bukan dibuat sistem"
      >
        <Button
          variant="outline"
          onClick={() => exportCsv("purchase-orders.csv", rows as unknown as Record<string, unknown>[])}
          data-testid="btn-export-po"
        >
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
        <Button
          onClick={() => {
            setForm({ ...EMPTY, items: [{ ...EMPTY_ITEM }] });
            setDialogOpen(true);
          }}
          data-testid="btn-add-po"
        >
          <Plus className="mr-2 h-4 w-4" /> Input PO Customer
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
            placeholder="Cari nomor PO / customer..."
            testId="input-search-po"
          />
          <FilterSelect
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={STATUSES.map((s) => ({ value: s, label: s }))}
            placeholder="Semua status"
            testId="filter-po-status"
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
              testId="filter-po-sales"
            />
          )}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>No PO Customer</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Quotation</TableHead>
              <TableHead>Sales</TableHead>
              <TableHead className="text-right">Nilai PO</TableHead>
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
              <EmptyRow colSpan={8} message="Belum ada PO pada filter ini." />
            ) : (
              rows.map((p) => (
                <TableRow key={p.po_id} data-testid={`row-po-${p.po_id}`}>
                  <TableCell className="font-mono text-xs font-semibold">
                    <Link to={`/purchase-orders/${p.po_id}`} className="text-primary hover:underline" data-testid={`link-po-${p.po_id}`}>
                      {p.po_number}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs">{formatDate(p.po_date)}</TableCell>
                  <TableCell>{p.customer_name ?? "-"}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {p.quotation_number ?? "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.sales_name ?? "-"}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-semibold">{formatIDR(p.po_value)}</TableCell>
                  <TableCell>
                    <select
                      value={p.status}
                      data-testid={`select-po-status-${p.po_id}`}
                      onChange={(e) => changeStatus.mutate({ id: p.po_id, next: e.target.value })}
                      className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Link
                      to={`/purchase-orders/${p.po_id}`}
                      className="mr-1 inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
                      data-testid={`btn-view-po-${p.po_id}`}
                    >
                      <Eye className="h-4 w-4" />
                    </Link>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(p.po_id)} data-testid={`btn-edit-po-${p.po_id}`}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => remove.mutate(p.po_id)}
                      data-testid={`btn-delete-po-${p.po_id}`}
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
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {form.po_id ? "Edit PO Customer" : "Input Purchase Order dari Customer"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="po-number">
                No PO Customer <span className="text-destructive">*</span>
              </Label>
              <Input
                id="po-number"
                value={form.po_number}
                onChange={(e) => setForm({ ...form, po_number: e.target.value })}
                placeholder="Tulis persis seperti pada dokumen PO customer, mis. PO/ELSI/2026/0088"
                className="mt-1.5 font-mono"
                data-testid="input-po-number"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Nomor ini berasal dari customer — sistem tidak membuat nomor PO sendiri.
              </p>
            </div>
            <div>
              <Label htmlFor="po-cust">Customer</Label>
              <select
                id="po-cust"
                value={form.customer_id}
                onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                data-testid="input-po-customer"
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
              <Label htmlFor="po-date">Tanggal PO</Label>
              <Input
                id="po-date"
                type="date"
                value={form.po_date}
                onChange={(e) => setForm({ ...form, po_date: e.target.value })}
                className="mt-1.5"
                data-testid="input-po-date"
              />
            </div>
            <div>
              <Label htmlFor="po-status">Status</Label>
              <select
                id="po-status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                data-testid="input-po-status"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            {!isSales && (
              <div>
                <Label htmlFor="po-sales">Sales</Label>
                <select
                  id="po-sales"
                  value={form.sales_id}
                  onChange={(e) => setForm({ ...form, sales_id: e.target.value })}
                  className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  data-testid="input-po-sales"
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
            <div>
              <Label htmlFor="po-pay">Payment Term</Label>
              <Input
                id="po-pay"
                value={form.payment_term}
                onChange={(e) => setForm({ ...form, payment_term: e.target.value })}
                className="mt-1.5"
                data-testid="input-po-payment-term"
              />
            </div>
            <div>
              <Label htmlFor="po-doc">Nama Dokumen PO (upload)</Label>
              <Input
                id="po-doc"
                type="file"
                className="mt-1.5"
                data-testid="input-po-document"
                onChange={(e) => setForm({ ...form, document_name: e.target.files?.[0]?.name ?? "" })}
              />
              {form.document_name && (
                <p className="mt-1 text-xs text-muted-foreground" data-testid="po-document-name">
                  {form.document_name}
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="po-addr">Alamat Pengiriman</Label>
              <Textarea
                id="po-addr"
                value={form.delivery_address}
                onChange={(e) => setForm({ ...form, delivery_address: e.target.value })}
                className="mt-1.5"
                data-testid="input-po-address"
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Item PO</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setForm({ ...form, items: [...form.items, { ...EMPTY_ITEM }] })}
                data-testid="btn-add-po-item"
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Tambah Item
              </Button>
            </div>
            <div className="space-y-2">
              {form.items.map((it, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 items-end gap-2 rounded-lg border border-border p-3 sm:grid-cols-12"
                  data-testid={`po-item-row-${idx}`}
                >
                  <div className="sm:col-span-5">
                    <Label className="text-xs">Produk</Label>
                    <select
                      value={it.product_id}
                      onChange={(e) => {
                        const p = (products ?? []).find((x) => x.product_id === e.target.value);
                        const items = [...form.items];
                        items[idx] = {
                          ...it,
                          product_id: e.target.value,
                          description: p?.product_name ?? it.description,
                          unit: p?.unit ?? it.unit,
                          unit_price: p ? String(p.default_price) : it.unit_price,
                        };
                        setForm({ ...form, items });
                      }}
                      className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      data-testid={`input-po-item-product-${idx}`}
                    >
                      <option value="">— Pilih produk —</option>
                      {(products ?? []).map((p) => (
                        <option key={p.product_id} value={p.product_id}>
                          {p.product_name}
                        </option>
                      ))}
                    </select>
                    <Input
                      value={it.description}
                      onChange={(e) => {
                        const items = [...form.items];
                        items[idx] = { ...it, description: e.target.value };
                        setForm({ ...form, items });
                      }}
                      placeholder="Deskripsi item"
                      className="mt-1.5"
                      data-testid={`input-po-item-description-${idx}`}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Qty</Label>
                    <Input
                      type="number"
                      value={it.qty}
                      onChange={(e) => {
                        const items = [...form.items];
                        items[idx] = { ...it, qty: e.target.value };
                        setForm({ ...form, items });
                      }}
                      className="mt-1"
                      data-testid={`input-po-item-qty-${idx}`}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <Label className="text-xs">Harga Satuan</Label>
                    <Input
                      type="number"
                      value={it.unit_price}
                      onChange={(e) => {
                        const items = [...form.items];
                        items[idx] = { ...it, unit_price: e.target.value };
                        setForm({ ...form, items });
                      }}
                      className="mt-1"
                      data-testid={`input-po-item-price-${idx}`}
                    />
                  </div>
                  <div className="sm:col-span-2 sm:text-right">
                    <p className="font-mono text-xs font-semibold">
                      {formatIDR((Number(it.qty) || 0) * (Number(it.unit_price) || 0))}
                    </p>
                    {form.items.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) })}
                        data-testid={`btn-remove-po-item-${idx}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-right text-sm">
              Total PO:{" "}
              <span className="font-mono font-bold" data-testid="po-total-preview">
                {formatIDR(poTotal)}
              </span>
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="btn-cancel-po">
              Batal
            </Button>
            <Button
              onClick={() => save.mutate(form)}
              disabled={!form.customer_id || !form.po_number.trim() || save.isPending}
              data-testid="btn-save-po"
            >
              {save.isPending ? "Menyimpan..." : "Simpan PO Customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
