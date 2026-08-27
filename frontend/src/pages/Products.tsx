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
  PageHeader,
  Pagination,
  SearchBox,
  StatusBadge,
  TableSkeleton,
} from "@/components/Shared";
import { useAuth } from "@/hooks/useAuth";
import { useDebounced } from "@/hooks/useDebounced";
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { exportCsv, formatIDR } from "@/lib/format";
import type { Paginated, ProductRow } from "@/lib/types";

const CATEGORIES = [
  "Computing", "Automation", "Motion", "Drives", "Sensor", "Safety", "Networking", "Vision",
  "Pneumatic", "Power", "Electrical", "Instrument", "Robotics", "Material Handling", "HVAC",
];

type FormState = {
  product_id?: string;
  product_code: string;
  product_name: string;
  brand: string;
  category: string;
  description: string;
  unit: string;
  default_price: string;
  supplier: string;
  distributor: string;
  status: string;
};

const EMPTY: FormState = {
  product_code: "",
  product_name: "",
  brand: "",
  category: "Automation",
  description: "",
  unit: "Unit",
  default_price: "0",
  supplier: "",
  distributor: "",
  status: "Active",
};

export default function Products() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const debounced = useDebounced(search);
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (debounced) params.set("search", debounced);
  if (category) params.set("category", category);
  if (status) params.set("status", status);
  const qs = params.toString();

  const { data, isLoading, isError } = useQuery<Paginated<ProductRow>>({
    queryKey: ["products", qs],
    queryFn: () => apiGet<Paginated<ProductRow>>(`/products?${qs}`),
    placeholderData: (prev) => prev,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["product-options"] });
  };

  const save = useMutation({
    mutationFn: (f: FormState) => {
      const body = {
        product_code: f.product_code || undefined,
        product_name: f.product_name,
        brand: f.brand,
        category: f.category,
        description: f.description,
        unit: f.unit,
        default_price: Number(f.default_price) || 0,
        supplier: f.supplier,
        distributor: f.distributor,
        status: f.status,
      };
      return f.product_id
        ? apiPut<ProductRow>(`/products/${f.product_id}`, body)
        : apiPost<ProductRow>("/products", body);
    },
    onSuccess: () => {
      toast.success("Produk tersimpan");
      setDialogOpen(false);
      invalidate();
    },
    onError: (e) =>
      toast.error((e instanceof ApiError ? (e.body as { detail?: string })?.detail : null) ?? "Gagal menyimpan produk"),
  });

  const archive = useMutation({
    mutationFn: (id: string) => apiDelete(`/products/${id}`),
    onSuccess: () => {
      toast.success("Produk diarsipkan");
      invalidate();
    },
    onError: () => toast.error("Gagal mengarsipkan produk"),
  });

  const rows = isError ? [] : (data?.data ?? []);

  return (
    <div>
      <PageHeader title="Master Produk" subtitle="Dipakai di quotation, purchase order, dan order monitoring">
        <Button
          variant="outline"
          onClick={() => exportCsv("products.csv", rows as unknown as Record<string, unknown>[])}
          data-testid="btn-export-products"
        >
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
        {isAdmin && (
          <Button
            onClick={() => {
              setForm(EMPTY);
              setDialogOpen(true);
            }}
            data-testid="btn-add-product"
          >
            <Plus className="mr-2 h-4 w-4" /> Tambah Produk
          </Button>
        )}
      </PageHeader>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <SearchBox
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Cari nama / kode / brand..."
            testId="input-search-products"
          />
          <FilterSelect
            value={category}
            onChange={(v) => {
              setCategory(v);
              setPage(1);
            }}
            options={CATEGORIES.map((c) => ({ value: c, label: c }))}
            placeholder="Semua kategori"
            testId="filter-product-category"
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
            testId="filter-product-status"
          />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kode</TableHead>
              <TableHead>Nama Produk</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="text-right">Harga Default</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton cols={9} />
            ) : isError ? (
              <ErrorRow colSpan={9} />
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={9} message="Tidak ada produk pada filter ini." />
            ) : (
              rows.map((p) => (
                <TableRow key={p.product_id} data-testid={`row-product-${p.product_id}`}>
                  <TableCell className="font-mono text-xs">{p.product_code ?? "-"}</TableCell>
                  <TableCell className="font-semibold">{p.product_name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.brand ?? "-"}</TableCell>
                  <TableCell className="text-xs">{p.category ?? "-"}</TableCell>
                  <TableCell className="text-xs">{p.unit}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-semibold">
                    {formatIDR(p.default_price)}
                  </TableCell>
                  <TableCell className="max-w-[12rem] truncate text-xs text-muted-foreground">
                    {p.supplier ?? "-"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={p.status} testId={`status-product-${p.product_id}`} />
                  </TableCell>
                  <TableCell className="text-right">
                    {isAdmin && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`btn-edit-product-${p.product_id}`}
                          onClick={() => {
                            setForm({
                              product_id: p.product_id,
                              product_code: p.product_code ?? "",
                              product_name: p.product_name,
                              brand: p.brand ?? "",
                              category: p.category ?? "Automation",
                              description: "",
                              unit: p.unit,
                              default_price: String(p.default_price),
                              supplier: p.supplier ?? "",
                              distributor: p.distributor ?? "",
                              status: p.status,
                            });
                            setDialogOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => archive.mutate(p.product_id)}
                          data-testid={`btn-archive-product-${p.product_id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
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
            <DialogTitle>{form.product_id ? "Edit Produk" : "Tambah Produk"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="p-code">Kode Produk</Label>
              <Input
                id="p-code"
                value={form.product_code}
                onChange={(e) => setForm({ ...form, product_code: e.target.value })}
                className="mt-1.5"
                data-testid="input-product-code"
              />
            </div>
            <div>
              <Label htmlFor="p-name">Nama Produk</Label>
              <Input
                id="p-name"
                value={form.product_name}
                onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                className="mt-1.5"
                data-testid="input-product-name"
              />
            </div>
            <div>
              <Label htmlFor="p-brand">Brand</Label>
              <Input
                id="p-brand"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className="mt-1.5"
                data-testid="input-product-brand"
              />
            </div>
            <div>
              <Label htmlFor="p-cat">Kategori</Label>
              <select
                id="p-cat"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                data-testid="input-product-category"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="p-unit">Unit</Label>
              <Input
                id="p-unit"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="mt-1.5"
                data-testid="input-product-unit"
              />
            </div>
            <div>
              <Label htmlFor="p-price">Harga Default (Rp)</Label>
              <Input
                id="p-price"
                type="number"
                value={form.default_price}
                onChange={(e) => setForm({ ...form, default_price: e.target.value })}
                className="mt-1.5"
                data-testid="input-product-price"
              />
            </div>
            <div>
              <Label htmlFor="p-sup">Supplier</Label>
              <Input
                id="p-sup"
                value={form.supplier}
                onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                className="mt-1.5"
                data-testid="input-product-supplier"
              />
            </div>
            <div>
              <Label htmlFor="p-dist">Distributor</Label>
              <Input
                id="p-dist"
                value={form.distributor}
                onChange={(e) => setForm({ ...form, distributor: e.target.value })}
                className="mt-1.5"
                data-testid="input-product-distributor"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="p-desc">Deskripsi</Label>
              <Textarea
                id="p-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="mt-1.5"
                data-testid="input-product-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="btn-cancel-product">
              Batal
            </Button>
            <Button
              onClick={() => save.mutate(form)}
              disabled={!form.product_name || save.isPending}
              data-testid="btn-save-product"
            >
              {save.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
