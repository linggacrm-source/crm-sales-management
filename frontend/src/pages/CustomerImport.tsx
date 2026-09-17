import { ArrowLeft, CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/Shared";
import { ApiError } from "@/lib/api";

const TEMPLATE_HEADERS = [
  "customer_id", "customer_name", "company", "industry", "address", "city", "province",
  "phone", "email", "pic_name", "pic_position", "source", "sales_id", "status", "notes",
];

const TEMPLATE_SAMPLE = [
  "", "PT Contoh Indonesia", "PT Contoh Indonesia", "Manufaktur", "Jl. Contoh No. 1", "Jakarta Selatan",
  "DKI Jakarta", "0211234567", "pic@contoh.co.id", "Budi", "Purchasing Manager", "Referral", "", "Active", "Customer hasil import",
];

function downloadTemplate() {
  const csv = `${TEMPLATE_HEADERS.join(",")}\n${TEMPLATE_SAMPLE.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")}\n`;
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "customer_import_template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

type ImportResult = {
  filename: string;
  total_rows: number;
  inserted: number;
  updated: number;
  skipped: number;
  error_count: number;
  errors: { row: number; message: string }[];
};

export default function CustomerImport() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const chooseFile = (selected: File | null) => {
    if (!selected) return;
    const ext = selected.name.toLowerCase().split(".").pop();
    if (!ext || !["csv", "xlsx", "xls"].includes(ext)) {
      toast.error("Format file harus CSV, XLSX, atau XLS");
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      toast.error("Ukuran file maksimal 10 MB");
      return;
    }
    setFile(selected);
    setResult(null);
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
      const response = await fetch("/api/customers/import", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new ApiError(response.status, body);
      }
      setResult(body as ImportResult);
      toast.success(`${body.inserted} customer berhasil ditambahkan`);
    } catch (error) {
      const detail = error instanceof ApiError ? (error.body as { detail?: string })?.detail : null;
      toast.error(detail ?? "Import customer gagal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title="Import Customer" subtitle="Upload database customer dari Excel atau CSV langsung ke database">
        <Button variant="outline" onClick={() => navigate("/customers")} data-testid="btn-back-customers">
          <ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Customers
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
            data-testid="customer-import-dropzone"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <FileSpreadsheet className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-base font-semibold">Upload file customer</h2>
            <p className="mt-1 text-sm text-muted-foreground">Drag & drop atau pilih file CSV, XLSX, atau XLS</p>
            <p className="mt-1 text-xs text-muted-foreground">Maksimal 5.000 baris dan 10 MB per upload</p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
              data-testid="input-customer-import-file"
            />
            <Button className="mt-5" onClick={() => inputRef.current?.click()} variant="outline" data-testid="btn-select-import-file">
              <Upload className="mr-2 h-4 w-4" /> Pilih File
            </Button>
          </div>

          {file && (
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-background p-4" data-testid="selected-import-file">
              <FileSpreadsheet className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setFile(null); setResult(null); }}>
                Ganti
              </Button>
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => navigate("/customers")}>Batal</Button>
            <Button onClick={upload} disabled={!file || loading} data-testid="btn-import-customers">
              {loading ? "Mengupload..." : "Upload & Import"}
            </Button>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-sm font-semibold">Format kolom</h2>
          <p className="mt-1 text-xs text-muted-foreground">Gunakan template agar nama kolom langsung terbaca sistem.</p>
          <Button variant="outline" className="mt-4 w-full" onClick={downloadTemplate} data-testid="btn-download-customer-template">
            <Download className="mr-2 h-4 w-4" /> Download Template CSV
          </Button>
          <div className="mt-5 space-y-3 text-xs">
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="font-semibold">Wajib</p>
              <p className="mt-1 text-muted-foreground"><code>customer_name</code> / Nama Customer</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="font-semibold">Opsional</p>
              <p className="mt-1 leading-5 text-muted-foreground">Company, industry, address, city, province, phone, email, PIC, source, sales_id, status, notes.</p>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-blue-900">
              <p className="font-semibold">Duplikat</p>
              <p className="mt-1 leading-5">Jika customer_id diisi dan ditemukan, data akan diperbarui. Tanpa ID, email yang sama atau kombinasi nama customer + perusahaan yang sama akan diperbarui. Baris duplikat di dalam file yang sama akan dilewati.</p>
            </div>
          </div>
        </Card>
      </div>

      {result && (
        <Card className="mt-4 p-6" data-testid="customer-import-result">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <h2 className="text-sm font-semibold">Hasil Import</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{result.filename} · {result.total_rows.toLocaleString("id-ID")} baris dibaca</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Ditambahkan</p><p className="mt-1 text-xl font-bold">{result.inserted}</p></div>
            <div className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Diperbarui</p><p className="mt-1 text-xl font-bold">{result.updated}</p></div>
            <div className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Dilewati</p><p className="mt-1 text-xl font-bold">{result.skipped}</p></div>
            <div className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Error</p><p className="mt-1 text-xl font-bold">{result.error_count}</p></div>
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
            <Link to="/customers"><Button data-testid="btn-view-imported-customers">Lihat Database Customer</Button></Link>
          </div>
        </Card>
      )}
    </div>
  );
}
