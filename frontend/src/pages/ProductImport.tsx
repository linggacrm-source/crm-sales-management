import { ArrowLeft, CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/Shared";
import { ApiError } from "@/lib/api";

type ImportResult = {
  filename: string;
  total_rows: number;
  inserted: number;
  error_count: number;
  errors: { row: number; message: string }[];
};

export default function ProductImport() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const chooseFile = (selected: File | null) => {
    if (!selected) return;
    const ext = selected.name.toLowerCase().split(".").pop();
    if (!ext || !["xlsx", "xls"].includes(ext)) {
      toast.error("Format file harus XLSX atau XLS");
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      toast.error("Ukuran file maksimal 10 MB");
      return;
    }
    setFile(selected);
    setResult(null);
  };

  const downloadTemplate = async () => {
    try {
      const response = await fetch("/api/products/import/template", { credentials: "include" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new ApiError(response.status, body);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "product_import_template.xlsx";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      const detail = error instanceof ApiError ? (error.body as { detail?: string })?.detail : null;
      toast.error(detail ?? "Gagal mengunduh template");
    }
  };

  const upload = async () => {
    if (!file) {
      toast.error("Pilih file terlebih dahulu");
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/products/import", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new ApiError(response.status, body);
      setResult(body as ImportResult);
      toast.success(`${body.inserted} produk berhasil ditambahkan`);
    } catch (error) {
      const detail = error instanceof ApiError ? (error.body as { detail?: string })?.detail : null;
      toast.error(detail ?? "Import produk gagal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title="Import Master Produk" subtitle="Upload ribuan data produk dari Excel dan kode produk akan dibuat otomatis">
        <Button variant="outline" onClick={() => navigate("/products")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Master Produk
        </Button>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <Card className="p-6">
          <div
            className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${dragging ? "border-primary bg-primary/5" : "border-border bg-muted/20"}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              chooseFile(event.dataTransfer.files?.[0] ?? null);
            }}
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <FileSpreadsheet className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-base font-semibold">Upload Excel Master Produk</h2>
            <p className="mt-1 text-sm text-muted-foreground">Drag & drop atau pilih file XLSX / XLS</p>
            <p className="mt-1 text-xs text-muted-foreground">Maksimal 5.000 baris dan 10 MB per upload</p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
            />
            <Button className="mt-5" onClick={() => inputRef.current?.click()} variant="outline">
              <Upload className="mr-2 h-4 w-4" /> Pilih File
            </Button>
          </div>

          {file && (
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-background p-4">
              <FileSpreadsheet className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setFile(null); setResult(null); }}>Ganti</Button>
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => navigate("/products")}>Batal</Button>
            <Button onClick={upload} disabled={!file || loading}>
              {loading ? "Mengupload..." : "Upload & Import"}
            </Button>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-sm font-semibold">Format Excel</h2>
          <p className="mt-1 text-xs text-muted-foreground">Download template resmi agar nama kolom langsung terbaca sistem.</p>
          <Button variant="outline" className="mt-4 w-full" onClick={downloadTemplate}>
            <Download className="mr-2 h-4 w-4" /> Download Template Excel
          </Button>
          <div className="mt-5 space-y-3 text-xs">
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="font-semibold">Kode Produk</p>
              <p className="mt-1 text-muted-foreground">Tidak perlu diisi. Sistem otomatis membuat kode <code>PRD-0001</code>, <code>PRD-0002</code>, dan seterusnya.</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="font-semibold">Wajib</p>
              <p className="mt-1 text-muted-foreground"><code>product_name</code> / Nama Produk</p>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-blue-900">
              <p className="font-semibold">Duplikat</p>
              <p className="mt-1 leading-5">Produk dengan nama dan brand yang sama akan dilewati. Baris duplikat dalam file yang sama juga tidak akan dimasukkan.</p>
            </div>
          </div>
        </Card>
      </div>

      {result && (
        <Card className="mt-4 p-6">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <h2 className="text-sm font-semibold">Hasil Import</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{result.filename} · {result.total_rows.toLocaleString("id-ID")} baris dibaca</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Ditambahkan</p><p className="mt-1 text-xl font-bold">{result.inserted}</p></div>
            <div className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Dilewati / Error</p><p className="mt-1 text-xl font-bold">{result.error_count}</p></div>
            <div className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Total Baris</p><p className="mt-1 text-xl font-bold">{result.total_rows}</p></div>
          </div>
          {result.error_count > 0 && (
            <div className="mt-4 rounded-xl border border-red-100 bg-red-50/60 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-red-700"><XCircle className="h-4 w-4" /> Baris yang tidak diproses</div>
              <div className="mt-2 max-h-48 overflow-auto text-xs text-red-800">
                {result.errors.map((item) => <div key={`${item.row}-${item.message}`} className="border-b border-red-100 py-1.5">Baris {item.row}: {item.message}</div>)}
                {result.error_count > result.errors.length && <p className="pt-2">Menampilkan 100 error pertama.</p>}
              </div>
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <Button onClick={() => navigate("/products")}>Lihat Master Produk</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
