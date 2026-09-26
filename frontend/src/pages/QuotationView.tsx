import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Mail, Printer, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/Shared";
import { QuotationEmailDialog } from "@/components/QuotationEmailDialog";
import { ApiError, apiGet, apiPost } from "@/lib/api";
import { COMPANY, DEFAULT_TERMS } from "@/lib/company";
import { formatDate, formatIDR } from "@/lib/format";
import type { QuotationDetail } from "@/lib/types";
import "@/quotation-pdf-match.css";
import "@/quotation-screen.css";

export default function QuotationView() {
  const { quotationId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [convertOpen, setConvertOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [poNumber, setPoNumber] = useState("");
  const [poDate, setPoDate] = useState(new Date().toISOString().slice(0, 10));
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    const loadPreview = async () => {
      if (!quotationId || !data?.quotation_id) {
        setPreviewUrl(null);
        setPreviewLoading(false);
        return;
      }

      setPreviewLoading(true);
      try {
        const response = await fetch(
          `/api/quotations/${encodeURIComponent(data.quotation_id)}/pdf`,
          { method: "GET", credentials: "include" },
        );
        if (!response.ok) throw new Error(`Preview PDF gagal (${response.status})`);
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.toLowerCase().includes("application/pdf")) {
          throw new Error("Server tidak mengembalikan PDF.");
        }
        const blob = await response.blob();
        if (!blob.size) throw new Error("PDF preview kosong.");

        objectUrl = window.URL.createObjectURL(blob);
        if (active) setPreviewUrl(objectUrl);
      } catch (error) {
        console.error("Quotation preview failed:", error);
        if (active) setPreviewUrl(null);
      } finally {
        if (active) setPreviewLoading(false);
      }
    };

    loadPreview();

    return () => {
      active = false;
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    };
  }, [data?.quotation_id, quotationId]);

  const { data, isLoading, isError } = useQuery<QuotationDetail>({
    queryKey: ["quotation", quotationId],
    queryFn: () => apiGet<QuotationDetail>(`/quotations/${quotationId}`),
  });

  const convert = useMutation({
    mutationFn: () => apiPost<{ po_id: string; po_number: string }>(`/quotations/${quotationId}/convert-to-po`, {
      po_number: poNumber.trim(), po_date: poDate || undefined,
    }),
    onSuccess: (res) => {
      toast.success(`PO customer ${res.po_number} tercatat`);
      setConvertOpen(false);
      qc.invalidateQueries({ queryKey: ["quotations"] });
      qc.invalidateQueries({ queryKey: ["quotation", quotationId] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      navigate(`/purchase-orders/${res.po_id}`);
    },
    onError: (e) => toast.error((e instanceof ApiError ? (e.body as { detail?: string })?.detail : null) ?? "Gagal mencatat PO customer"),
  });

  const handleDownloadPDF = async () => {
    if (!data?.quotation_id) { toast.error("Quotation tidak ditemukan"); return; }
    try {
      toast.loading("Membuat PDF...", { id: "quotation-pdf" });
      const response = await fetch(`/api/quotations/${encodeURIComponent(data.quotation_id)}/pdf`, { method: "GET", credentials: "include" });
      if (!response.ok) {
        let message = `Gagal membuat PDF (${response.status})`;
        try { const errorData = await response.json(); if (errorData?.detail) message = errorData.detail; } catch {}
        throw new Error(message);
      }
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("application/pdf")) throw new Error(`Server tidak mengembalikan PDF. Content-Type: ${contentType || "tidak diketahui"}`);
      const blob = await response.blob();
      if (!blob.size) throw new Error("File PDF kosong.");
      const quotationNumber = data.quotation_number?.replace(/[^a-zA-Z0-9-_]/g, "_") || "quotation";
      const url = window.URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = `${quotationNumber}.pdf`; document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      toast.success("PDF quotation berhasil diunduh", { id: "quotation-pdf" });
    } catch (error) {
      console.error("Download quotation PDF failed:", error);
      toast.error(error instanceof Error ? error.message : "Gagal mengunduh PDF quotation", { id: "quotation-pdf" });
    }
  };

  return (
    <div className="quotation-page-shell mx-auto max-w-5xl">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link to="/quotations" className={buttonVariants({ variant: "ghost", size: "sm" })} data-testid="link-back-quotations"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Link>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleDownloadPDF} data-testid="btn-print-quotation"><Printer className="mr-2 h-4 w-4" /> Cetak / Simpan PDF</Button>
          <Button variant="outline" onClick={() => setEmailOpen(true)} disabled={!data?.customer_email} data-testid="btn-send-quotation-email"><Mail className="mr-2 h-4 w-4" /> Send Email</Button>
          <Button disabled={data?.status === "Converted"} onClick={() => setConvertOpen(true)} data-testid="btn-convert-to-po"><ShoppingBag className="mr-2 h-4 w-4" /> Catat PO Customer</Button>
        </div>
      </div>

      {isError ? <Card className="p-10 text-center"><p className="text-sm text-muted-foreground" data-testid="quotation-error">Quotation belum dapat dimuat.</p></Card> : isLoading ? <Card className="space-y-3 p-10">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-4 animate-shimmer rounded bg-muted" />)}</Card> : data ? (
        <Card className="print-area quotation-document quotation-screen-preview overflow-hidden bg-white p-0" data-testid="quotation-document" data-quotation-number={data.quotation_number}>
          {previewLoading ? (
            <div className="flex min-h-[1123px] items-center justify-center text-sm text-muted-foreground">
              Membuat preview quotation...
            </div>
          ) : previewUrl ? (
            <iframe
              src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0`}
              title={`Quotation ${data.quotation_number}`}
              className="block w-full border-0 bg-white"
              style={{ height: "1123px" }}
              data-testid="quotation-pdf-preview"
            />
          ) : (
            <div className="flex min-h-[300px] items-center justify-center p-10 text-sm text-destructive">
              Preview quotation gagal dibuat. Silakan klik "Cetak / Simpan PDF".
            </div>
          )}
        </Card>
      ) : null}

      {data && <QuotationEmailDialog quotationId={data.quotation_id} quotationNumber={data.quotation_number} customerEmail={data.customer_email ?? undefined} customerName={data.customer_company || data.customer_name || undefined} open={emailOpen} onOpenChange={setEmailOpen} />}

      <Dialog open={convertOpen} onOpenChange={setConvertOpen}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Catat Purchase Order Customer</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Masukkan nomor PO yang tertera pada dokumen PO dari customer (bukan nomor internal).</p><div className="space-y-4"><div><Label htmlFor="conv-po-number">Nomor PO Customer</Label><Input id="conv-po-number" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="mis. PO/ELSI/2026/0088" className="mt-1.5" data-testid="input-convert-po-number"/></div><div><Label htmlFor="conv-po-date">Tanggal PO Customer</Label><Input id="conv-po-date" type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} className="mt-1.5" data-testid="input-convert-po-date"/></div></div><DialogFooter><Button variant="outline" onClick={() => setConvertOpen(false)} data-testid="btn-cancel-convert">Batal</Button><Button disabled={!poNumber.trim() || convert.isPending} onClick={() => convert.mutate()} data-testid="btn-confirm-convert">{convert.isPending ? "Menyimpan..." : "Simpan PO"}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
