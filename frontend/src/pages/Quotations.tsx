import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, Eye, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import type {
  CustomerOption,
  Paginated,
  ProductRow,
  QuotationDetail,
  QuotationRow,
  SalesOption,
} from "@/lib/types";

const STATUSES = ["Draft", "Sent", "Negotiation", "Approved", "Rejected", "Expired", "Converted"];

type ItemForm = {
  product_id: string;
  description: string;
  qty: string;
  unit: string;
  unit_price: string;
  discount: string;
};

type FormState = {
  quotation_id?: string;
  customer_id: string;
  sales_id: string;
  quotation_date: string;
  validity_date: string;
  payment_term: string;
  delivery_term: string;
  notes: string;
  discount: string;
  tax_percent: string;
  status: string;
  items: ItemForm[];
};

const EMPTY_ITEM: ItemForm = {
  product_id: "",
  description: "",
  qty: "1",
  unit: "Unit",
  unit_price: "0",
  discount: "0",
};

const EMPTY: FormState = {
  customer_id: "",
  sales_id: "",
  quotation_date: "",
  validity_date: "",
  payment_term: "30 hari setelah invoice",
  delivery_term: "4-6 minggu setelah PO",
  notes: "",
  discount: "0",
  tax_percent: "11",
  status: "Draft",
  items: [{ ...EMPTY_ITEM }],
};

export default function Quotations() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isSales } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [salesId, setSalesId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [convertFor, setConvertFor] = useState<QuotationRow | null>(null);
  const [convertPoNumber, setConvertPoNumber] = useState("");

  const debounced = useDebounced(search);
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (debounced) params.set("search", debounced);
  if (status) params.set("status", status);
  if (salesId) params.set("sales_id", salesId);
  const qs = params.toString();

  const { data, isLoading, isError } = useQuery<Paginated<QuotationRow>>({
    queryKey: ["quotations", qs],
    queryFn: () => apiGet<Paginated<QuotationRow>>(`/quotations?${qs}`),
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
    qc.invalidateQueries({ queryKey: ["quotations"] });
    qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const save = useMutation({
    mutationFn: (f: FormState) => {
      const body = {
        customer_id: f.customer_id,
        sales_id: f.sales_id || undefined,
        quotation_date: f.quotation_date || undefined,
        validity_date: f.validity_date || undefined,
        payment_term: f.payment_term,
        delivery_term: f.delivery_term,
        notes: f.notes,
        discount: Number(f.discount) || 0,
        tax_percent: Number(f.tax_percent) || 0,
        status: f.status,
        items: f.items
          .filter((i) => i.description)
          .map((i) => ({
            product_id: i.product_id || undefined,
            description: i.description,
            qty: Number(i.qty) || 0,
            unit: i.unit,
            unit_price: Number(i.unit_price) || 0,
            discount: Number(i.discount) || 0,
          })),
      };
      return f.quotation_id
        ? apiPut<QuotationDetail>(`/quotations/${f.quotation_id}`, body)
        : apiPost<QuotationDetail>("/quotations", body);
    },
    onSuccess: (q) => {
      toast.success(`Quotation ${q.quotation_number} tersimpan`);
      setDialogOpen(false);
      invalidate();
    },
    onError: (e) =>
      toast.error(
        (e instanceof ApiError ? (e.body as { detail?: string })?.detail : null) ?? "Gagal menyimpan quotation",
      ),
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) =>
      apiPatch<QuotationDetail>(`/quotations/${id}/status`, { status: next }),
    onSuccess: () => {
      toast.success("Status quotation diperbarui");
      invalidate();
    },
    onError: () => toast.error("Gagal mengubah status"),
  });

  const duplicate = useMutation({
    mutationFn: (id: string) => apiPost<QuotationDetail>(`/quotations/${id}/duplicate`),
    onSuccess: (q) => {
      toast.success(`Duplikat dibuat: ${q.quotation_number}`);
      invalidate();
    },
    onError: () => toast.error("Gagal menduplikasi quotation"),
  });

  const convert = useMutation({
    mutationFn: (args: { id: string; po_number: string }) =>
      apiPost<{ po_id: string; po_number: string }>(`/quotations/${args.id}/convert-to-po`, {
        po_number: args.po_number,
      }),
    onSuccess: (res) => {
      toast.success(`PO customer ${res.po_number} tercatat`);
      setConvertFor(null);
      setConvertPoNumber("");
      invalidate();
      navigate(`/purchase-orders/${res.po_id}`);
    },
    onError: (e) =>
      toast.error(
        (e instanceof ApiError ? (e.body as { detail?: string })?.detail : null) ?? "Gagal mencatat PO customer",
      ),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/quotations/${id}`),
    onSuccess: () => {
      toast.success("Quotation dihapus");
      invalidate();
    },
    onError: () => toast.error("Gagal menghapus quotation"),
  });

  const openEdit = async (id: string) => {
    const d = await apiGet<QuotationDetail>(`/quotations/${id}`);
    setForm({
      quotation_id: d.quotation_id,
      customer_id: d.customer_id,
      sales_id: d.sales_id ?? "",
      quotation_date: d.quotation_date ?? "",
      validity_date: d.validity_date ?? "",
      payment_term: d.payment_term ?? "",
      delivery_term: d.delivery_term ?? "",
      notes: d.notes ?? "",
      discount: String(d.discount ?? 0),
      tax_percent: String(d.tax_percent ?? 11),
      status: d.status,
      items: d.items.map((i) => ({
        product_id: i.product_id ?? "",
        description: i.description,
        qty: String(i.qty),
        unit: i.unit,
        unit_price: String(i.unit_price),
        discount: String(i.discount),
      })),
    });
    setDialogOpen(true);
  };

  const rows = isError ? [] : (data?.data ?? []);
  const subtotal = form.items.reduce(
    (a, i) => a + (Number(i.qty) || 0) * (Number(i.unit_price) || 0) - (Number(i.discount) || 0),
    0,
  );
  const afterDisc = subtotal - (Number(form.discount) || 0);
  const tax = (afterDisc * (Number(form.tax_percent) || 0)) / 100;

  return (
    <div>
      <PageHeader title="Quotations" subtitle="Nomor otomatis QT-TAHUN-URUT, item & total dihitung di server">
        <Button
          variant="outline"
          onClick={() => exportCsv("quotations.csv", rows as unknown as Record<string, unknown>[])}
          data-testid="btn-export-quotations"
        >
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
        <Button
          onClick={() => {
            setForm({ ...EMPTY, items: [{ ...EMPTY_ITEM }] });
            setDialogOpen(true);
          }}
          data-testid="btn-add-quotation"
        >
          <Plus className="mr-2 h-4 w-4" /> Buat Quotation
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
            placeholder="Cari nomor / customer..."
            testId="input-search-quotations"
          />
          <FilterSelect
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={STATUSES.map((s) => ({ value: s, label: s }))}
            placeholder="Semua status"
            testId="filter-quotation-status"
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
              testId="filter-quotation-sales"
            />
          )}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nomor</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Sales</TableHead>
              <TableHead className="text-right">Grand Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton cols={7} />
            ) : isError ? (
              <ErrorRow colSpan={7} />
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={7} message="Belum ada quotation pada filter ini." />
            ) : (
              rows.map((q) => (
                <TableRow key={q.quotation_id} data-testid={`row-quotation-${q.quotation_id}`}>
                  <TableCell className="font-mono text-xs font-semibold">
                    <Link
                      to={`/quotations/${q.quotation_id}`}
                      className="text-primary hover:underline"
                      data-testid={`link-quotation-${q.quotation_id}`}
                    >
                      {q.quotation_number}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs">{formatDate(q.quotation_date)}</TableCell>
                  <TableCell>{q.customer_name ?? "-"}</TableCell>
                  <TableCell className="text-muted-foreground">{q.sales_name ?? "-"}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-semibold">
                    {formatIDR(q.grand_total)}
                  </TableCell>
                  <TableCell>
                    <select
                      value={q.status}
                      data-testid={`select-quotation-status-${q.quotation_id}`}
                      onChange={(e) => changeStatus.mutate({ id: q.quotation_id, next: e.target.value })}
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
                      to={`/quotations/${q.quotation_id}`}
                      className="mr-1 inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
                      data-testid={`btn-view-quotation-${q.quotation_id}`}
                      title="Lihat & cetak"
                    >
                      <Eye className="h-4 w-4" />
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(q.quotation_id)}
                      data-testid={`btn-edit-quotation-${q.quotation_id}`}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Duplikat"
                      onClick={() => duplicate.mutate(q.quotation_id)}
                      data-testid={`btn-duplicate-quotation-${q.quotation_id}`}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Catat PO customer"
                      disabled={q.status === "Converted"}
                      onClick={() => {
                        setConvertFor(q);
                        setConvertPoNumber("");
                      }}
                      data-testid={`btn-convert-quotation-${q.quotation_id}`}
                    >
                      <ShoppingBag className="h-4 w-4 text-primary" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => remove.mutate(q.quotation_id)}
                      data-testid={`btn-delete-quotation-${q.quotation_id}`}
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
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{form.quotation_id ? "Edit Quotation" : "Buat Quotation"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="qt-cust">Customer</Label>
              <select
                id="qt-cust"
                value={form.customer_id}
                onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                data-testid="input-quotation-customer"
              >
                <option value="">— Pilih customer —</option>
                {(customerOptions ?? []).map((c) => (
                  <option key={c.customer_id} value={c.customer_id}>
                    {c.customer_name}
                  </option>
                ))}
              </select>
            </div>
            {!isSales && (
              <div>
                <Label htmlFor="qt-sales">Sales</Label>
                <select
                  id="qt-sales"
                  value={form.sales_id}
                  onChange={(e) => setForm({ ...form, sales_id: e.target.value })}
                  className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  data-testid="input-quotation-sales"
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
              <Label htmlFor="qt-date">Tanggal Quotation</Label>
              <Input
                id="qt-date"
                type="date"
                value={form.quotation_date}
                onChange={(e) => setForm({ ...form, quotation_date: e.target.value })}
                className="mt-1.5"
                data-testid="input-quotation-date"
              />
            </div>
            <div>
              <Label htmlFor="qt-valid">Berlaku Sampai</Label>
              <Input
                id="qt-valid"
                type="date"
                value={form.validity_date}
                onChange={(e) => setForm({ ...form, validity_date: e.target.value })}
                className="mt-1.5"
                data-testid="input-quotation-validity"
              />
            </div>
            <div>
              <Label htmlFor="qt-pay">Payment Term</Label>
              <Input
                id="qt-pay"
                value={form.payment_term}
                onChange={(e) => setForm({ ...form, payment_term: e.target.value })}
                className="mt-1.5"
                data-testid="input-quotation-payment-term"
              />
            </div>
            <div>
              <Label htmlFor="qt-del">Delivery Term</Label>
              <Input
                id="qt-del"
                value={form.delivery_term}
                onChange={(e) => setForm({ ...form, delivery_term: e.target.value })}
                className="mt-1.5"
                data-testid="input-quotation-delivery-term"
              />
            </div>
          </div>

          <div className="mt-2">
            <div className="mb-2 flex items-center justify-between">
              <Label>Item Quotation</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setForm({ ...form, items: [...form.items, { ...EMPTY_ITEM }] })}
                data-testid="btn-add-quotation-item"
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Tambah Item
              </Button>
            </div>
            <div className="space-y-2">
              {form.items.map((it, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 items-end gap-2 rounded-lg border border-border p-3 sm:grid-cols-12"
                  data-testid={`quotation-item-row-${idx}`}
                >
                  <div className="sm:col-span-5">
                    <Label className="text-xs">Produk / Deskripsi</Label>
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
                      data-testid={`input-item-product-${idx}`}
                    >
                      <option value="">— Pilih produk —</option>
                      {(products ?? []).map((p) => (
                        <option key={p.product_id} value={p.product_id}>
                          {p.product_name}
                        </option>
                      ))}
                    </select>
                    <Textarea
                      value={it.description}
                      onChange={(e) => {
                        const items = [...form.items];
                        items[idx] = { ...it, description: e.target.value };
                        setForm({ ...form, items });
                      }}
                      rows={5}
                      placeholder={"Deskripsi / spesifikasi item — tekan ENTER untuk baris baru:\nIndustrial PC Axiomtek\nIntel Core i5\nRAM 16GB"}
                      className="mt-1.5 font-mono text-xs whitespace-pre-wrap"
                      data-testid={`input-item-description-${idx}`}
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
                      data-testid={`input-item-qty-${idx}`}
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
                      data-testid={`input-item-price-${idx}`}
                    />
                  </div>
                  <div className="sm:col-span-2 sm:text-right">
                    <p className="font-mono text-xs font-semibold" data-testid={`item-subtotal-${idx}`}>
                      {formatIDR((Number(it.qty) || 0) * (Number(it.unit_price) || 0) - (Number(it.discount) || 0))}
                    </p>
                    {form.items.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() =>
                          setForm({ ...form, items: form.items.filter((_, i) => i !== idx) })
                        }
                        data-testid={`btn-remove-item-${idx}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <div>
                <Label htmlFor="qt-disc">Diskon Total (Rp)</Label>
                <Input
                  id="qt-disc"
                  type="number"
                  value={form.discount}
                  onChange={(e) => setForm({ ...form, discount: e.target.value })}
                  className="mt-1.5"
                  data-testid="input-quotation-discount"
                />
              </div>
              <div>
                <Label htmlFor="qt-tax">Pajak (%)</Label>
                <Input
                  id="qt-tax"
                  type="number"
                  value={form.tax_percent}
                  onChange={(e) => setForm({ ...form, tax_percent: e.target.value })}
                  className="mt-1.5"
                  data-testid="input-quotation-tax"
                />
              </div>
              <div>
                <Label htmlFor="qt-notes">Catatan</Label>
                <Textarea
                  id="qt-notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="mt-1.5"
                  data-testid="input-quotation-notes"
                />
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="font-mono font-semibold">{formatIDR(subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Diskon</dt>
                  <dd className="font-mono">-{formatIDR(Number(form.discount) || 0)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Pajak</dt>
                  <dd className="font-mono">{formatIDR(tax)}</dd>
                </div>
                <div className="flex justify-between border-t border-border pt-2 text-base">
                  <dt className="font-semibold">Grand Total</dt>
                  <dd className="font-mono font-bold" data-testid="quotation-grand-total">
                    {formatIDR(afterDisc + tax)}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="btn-cancel-quotation">
              Batal
            </Button>
            <Button
              onClick={() => save.mutate(form)}
              disabled={!form.customer_id || save.isPending}
              data-testid="btn-save-quotation"
            >
              {save.isPending ? "Menyimpan..." : "Simpan Quotation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={convertFor !== null} onOpenChange={(o) => !o && setConvertFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Catat PO Customer</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Quotation <span className="font-mono font-semibold">{convertFor?.quotation_number}</span> —{" "}
            {convertFor?.customer_name}. Masukkan nomor PO yang tertera pada dokumen PO customer.
          </p>
          <div>
            <Label htmlFor="list-conv-po">Nomor PO Customer</Label>
            <Input
              id="list-conv-po"
              value={convertPoNumber}
              onChange={(e) => setConvertPoNumber(e.target.value)}
              placeholder="mis. 450/PO/ESIC/2026"
              className="mt-1.5"
              data-testid="input-list-convert-po-number"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertFor(null)} data-testid="btn-cancel-list-convert">
              Batal
            </Button>
            <Button
              onClick={() =>
                convertFor &&
                convert.mutate({ id: convertFor.quotation_id, po_number: convertPoNumber.trim() })
              }
              disabled={!convertPoNumber.trim() || convert.isPending}
              data-testid="btn-submit-list-convert"
            >
              {convert.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
