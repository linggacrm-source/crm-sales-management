import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Printer, ShoppingBag } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/Shared";
import { ApiError, apiGet, apiPost } from "@/lib/api";
import { COMPANY, DEFAULT_TERMS } from "@/lib/company";
import { formatDate, formatIDR } from "@/lib/format";
import type { QuotationDetail } from "@/lib/types";

export default function QuotationView() {
  const { quotationId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [convertOpen, setConvertOpen] = useState(false);
  const [poNumber, setPoNumber] = useState("");
  const [poDate, setPoDate] = useState(new Date().toISOString().slice(0, 10));
  const [qrCode, setQrCode] = useState<string>("");

  const { data, isLoading, isError } = useQuery<QuotationDetail>({
    queryKey: ["quotation", quotationId],
    queryFn: () => apiGet<QuotationDetail>(`/quotations/${quotationId}`),
  });

  const convert = useMutation({
    mutationFn: () =>
      apiPost<{ po_id: string; po_number: string }>(`/quotations/${quotationId}/convert-to-po`, {
        po_number: poNumber.trim(),
        po_date: poDate || undefined,
      }),
    onSuccess: (res) => {
      toast.success(`PO customer ${res.po_number} tercatat`);
      setConvertOpen(false);
      qc.invalidateQueries({ queryKey: ["quotations"] });
      qc.invalidateQueries({ queryKey: ["quotation", quotationId] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      navigate(`/purchase-orders/${res.po_id}`);
    },
    onError: (e) =>
      toast.error(
        (e instanceof ApiError ? (e.body as { detail?: string })?.detail : null) ?? "Gagal mencatat PO customer",
      ),
  });

  const handleDownloadPDF = async () => {
    if (!data?.quotation_id) {
      toast.error("Quotation tidak ditemukan");
      return;
    }

    try {
      toast.loading("Membuat PDF...", { id: "quotation-pdf" });

      const response = await fetch(
        `/api/quotations/${encodeURIComponent(data.quotation_id)}/pdf`,
        {
          method: "GET",
          credentials: "include",
        },
      );

      if (!response.ok) {
        let message = `Gagal membuat PDF (${response.status})`;

        try {
          const errorData = await response.json();
          if (errorData?.detail) {
            message = errorData.detail;
          }
        } catch {
          // Response bukan JSON, gunakan pesan default.
        }

        throw new Error(message);
      }

      const contentType = response.headers.get("content-type") || "";

      if (!contentType.toLowerCase().includes("application/pdf")) {
        throw new Error(
          `Server tidak mengembalikan PDF. Content-Type: ${contentType || "tidak diketahui"}`,
        );
      }

      const blob = await response.blob();

      if (!blob.size) {
        throw new Error("File PDF kosong.");
      }

      const quotationNumber =
        data.quotation_number?.replace(/[^a-zA-Z0-9-_]/g, "_") ||
        "quotation";

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `${quotationNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 1000);

      toast.success("PDF quotation berhasil diunduh", {
        id: "quotation-pdf",
      });
    } catch (error) {
      console.error("Download quotation PDF failed:", error);

      toast.error(
        error instanceof Error
          ? error.message
          : "Gagal mengunduh PDF quotation",
        {
          id: "quotation-pdf",
        },
      );
    }
  };

  const terms = data?.notes
    ? data.notes.split("\n").filter(Boolean)
    : [
        `Payment: ${data?.payment_term ?? DEFAULT_TERMS[0]}`,
        `Pengiriman: ${data?.delivery_term ?? DEFAULT_TERMS[2]}`,
        ...DEFAULT_TERMS.slice(1, 2),
        `Validitas: s/d ${formatDate(data?.validity_date)}`,
      ];

  useEffect(() => {
    if (!data) return;

    // QR Code menjadi identitas/verifikasi digital quotation.
    // Saat URL aplikasi berubah, QR otomatis mengikuti domain yang sedang digunakan.
    const verificationUrl =
      `${window.location.origin}/quotations/${encodeURIComponent(data.quotation_id)}`;

    const verificationData = [
      `DIGITAL QUOTATION`,
      `Quotation No: ${data.quotation_number}`,
      `Date: ${data.quotation_date ?? "-"}`,
      `Customer: ${data.customer_company || data.customer_name || "-"}`,
      `Total: ${data.grand_total}`,
      `Issued by: ${COMPANY.name}`,
      `Verify: ${verificationUrl}`,
    ].join("\n");

    QRCode.toDataURL(verificationData, {
      width: 180,
      margin: 1,
      errorCorrectionLevel: "M",
    })
      .then(setQrCode)
      .catch(() => setQrCode(""));
  }, [data]);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link
          to="/quotations"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
          data-testid="link-back-quotations"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Kembali
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDownloadPDF} data-testid="btn-print-quotation">
            <Printer className="mr-2 h-4 w-4" /> Cetak / Simpan PDF
          </Button>
          <Button
            disabled={data?.status === "Converted"}
            onClick={() => setConvertOpen(true)}
            data-testid="btn-convert-to-po"
          >
            <ShoppingBag className="mr-2 h-4 w-4" /> Catat PO Customer
          </Button>
        </div>
      </div>

      {isError ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground" data-testid="quotation-error">
            Quotation belum dapat dimuat.
          </p>
        </Card>
      ) : isLoading ? (
        <Card className="space-y-3 p-10">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-4 animate-shimmer rounded bg-muted" />
          ))}
        </Card>
      ) : data ? (
        <Card
          className="print-area quotation-document bg-white p-0 text-neutral-900"
          data-testid="quotation-document"
        >
          {/* Letterhead */}
          <div className="quotation-header flex items-center gap-4 border-b-2 border-neutral-900 px-8 py-5">
            <img
              src={COMPANY.logo}
              alt="Logo Wellracom"
              className="h-16 w-16 shrink-0 object-contain"
              data-testid="quotation-logo"
            />
            <div className="min-w-0">
              <h2 className="text-lg leading-tight font-extrabold tracking-tight" data-testid="quotation-company-name">
                {COMPANY.name}
              </h2>
              <p className="text-xs text-neutral-600">{COMPANY.tagline}</p>
              <p className="mt-0.5 text-[11px] text-neutral-500">
                {COMPANY.website} · {COMPANY.email}
              </p>
            </div>
          </div>

          {/* Title + meta */}
          <div className="flex flex-col gap-4 px-8 py-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-[0.12em]">QUOTATION</h1>
              <div className="mt-2">
                <StatusBadge value={data.status} testId="quotation-status-badge" />
              </div>
            </div>
            <table className="border border-neutral-900 text-xs">
              <tbody>
                <tr className="border-b border-neutral-300">
                  <th className="bg-neutral-100 px-3 py-1.5 text-left font-semibold tracking-wider">DATE</th>
                  <td className="px-3 py-1.5">{formatDate(data.quotation_date)}</td>
                </tr>
                <tr className="border-b border-neutral-300">
                  <th className="bg-neutral-100 px-3 py-1.5 text-left font-semibold tracking-wider">QUOTE NO</th>
                  <td className="px-3 py-1.5 font-mono font-bold" data-testid="quotation-number">
                    {data.quotation_number}
                  </td>
                </tr>
                <tr>
                  <th className="bg-neutral-100 px-3 py-1.5 text-left font-semibold tracking-wider">
                    EXPIRATION DATE
                  </th>
                  <td className="px-3 py-1.5">{formatDate(data.validity_date)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Recipient */}
          <div className="px-8 pb-5">
            <p className="mb-1 text-[11px] font-bold tracking-widest text-neutral-500">TO:</p>
            <p className="font-bold" data-testid="quotation-customer-name">
              {data.customer_company || data.customer_name}
            </p>
            <div className="mt-1 space-y-0.5 text-xs text-neutral-700">
              {data.customer_pic_name && <p>ATTN: {data.customer_pic_name}</p>}
              {data.customer_email && <p>EMAIL: {data.customer_email}</p>}
              {data.customer_phone && <p>PHONE: {data.customer_phone}</p>}
            </div>
          </div>

          {/* Items */}
          <div className="px-8">
            <table className="w-full border border-neutral-400 text-xs">
              <thead>
                <tr className="border-b border-neutral-400 bg-neutral-900 text-[10px] tracking-widest text-white">
                  <th className="w-10 border-r border-neutral-500 px-2 py-2 text-center font-bold">
                    NO
                  </th>

                  <th className="border-r border-neutral-500 px-2 py-2 text-left font-bold">
                    ITEMS / SPECIFICATION
                  </th>

                  <th className="w-32 border-r border-neutral-500 px-2 py-2 text-right font-bold">
                    UNIT PRICE
                  </th>

                  <th className="w-20 border-r border-neutral-500 px-2 py-2 text-center font-bold">
                    QTY
                  </th>

                  {data.items.some((it) => Number(it.discount ?? 0) > 0) && (
                    <th className="w-28 border-r border-neutral-500 px-2 py-2 text-right font-bold">
                      DISCOUNT
                    </th>
                  )}

                  <th className="w-36 px-2 py-2 text-right font-bold">
                    AMOUNT
                  </th>
                </tr>
              </thead>

              <tbody>
                {data.items.map((it, i) => {
                  const hasDiscount = data.items.some(
                    (item) => Number(item.discount ?? 0) > 0
                  );

                  return (
                    <tr
                      key={it.quotation_item_id}
                      className="border-b border-neutral-300 align-top"
                      data-testid={`quotation-item-${i}`}
                    >
                      <td className="border-r border-neutral-200 px-2 py-2 text-center font-mono">
                        {i + 1}
                      </td>

                      <td className="border-r border-neutral-200 px-2 py-2">
                        <span
                          className="whitespace-pre-line"
                          data-testid={`quotation-item-spec-${i}`}
                        >
                          {it.description}
                        </span>
                      </td>

                      <td className="border-r border-neutral-200 px-2 py-2 text-right font-mono">
                        {formatIDR(it.unit_price)}
                      </td>

                      <td className="border-r border-neutral-200 px-2 py-2 text-center font-mono">
                        {it.qty} {it.unit}
                      </td>

                      {hasDiscount && (
                        <td className="border-r border-neutral-200 px-2 py-2 text-right font-mono">
                          {Number(it.discount ?? 0) > 0
                            ? formatIDR(it.discount)
                            : "-"}
                        </td>
                      )}

                      <td className="px-2 py-2 text-right font-mono font-semibold">
                        {formatIDR(it.subtotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="quotation-totals flex justify-end px-8 pt-4">
            <table className="w-[85mm] text-xs">
              <tbody>
                <tr>
                  <th className="px-1 py-1 text-left font-normal">
                    SUBTOTAL
                  </th>
                  <td className="px-1 py-1 text-right font-mono">
                    {formatIDR(data.subtotal)}
                  </td>
                </tr>

                {data.discount > 0 && (
                  <tr>
                    <th className="px-1 py-1 text-left font-normal">
                      DISCOUNT
                    </th>
                    <td className="px-1 py-1 text-right font-mono">
                      -{formatIDR(data.discount)}
                    </td>
                  </tr>
                )}

                <tr>
                  <th className="px-1 py-1 text-left font-normal">
                    PPN {data.tax_percent}%
                  </th>
                  <td className="px-1 py-1 text-right font-mono">
                    {formatIDR(data.tax)}
                  </td>
                </tr>

                <tr className="bg-neutral-900 text-white">
                  <th className="px-2 py-2 text-left font-bold tracking-wider">
                    GRAND TOTAL
                  </th>
                  <td
                    className="px-2 py-2 text-right font-mono font-bold"
                    data-testid="quotation-grand-total-view"
                  >
                    {formatIDR(data.grand_total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Terms + signature */}
          <div className="quotation-signature grid gap-8 px-8 py-6 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-[11px] font-bold tracking-widest">TERMS AND CONDITIONS:</p>
              <ol className="list-inside list-decimal space-y-1 text-xs text-neutral-700">
                {terms.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ol>
            </div>
            <div className="sm:text-right">
              <p className="mb-1 text-[11px] text-neutral-600">
                Hormat kami, {COMPANY.name.replace("PT ", "PT ")}
              </p>
              {data.signature_image ? (
                <div data-testid="quotation-signature-block">
                  <img
                    src={data.signature_image}
                    alt="Tanda tangan digital"
                    className="mb-1 h-20 object-contain sm:ml-auto"
                    data-testid="quotation-signature-image"
                  />
                  <p className="inline-block border-t border-neutral-900 pt-1 text-xs font-bold">
                    {data.signature_name ?? data.sales_name}
                  </p>
                  <p className="text-[11px] text-neutral-600">{data.signature_title ?? "Sales"}</p>
                  <p className="mt-1 text-[10px] font-semibold tracking-widest text-emerald-700">
                    DIGITALLY SIGNED — tidak memerlukan tanda tangan basah
                  </p>
                </div>
              ) : (
                <div data-testid="quotation-signature-block">
                  <div className="mb-1 h-20" />
                  <p className="inline-block border-t border-neutral-900 pt-1 text-xs font-bold">
                    {data.sales_name ?? "Sales Executive"}
                  </p>
                  <p className="text-[11px] text-neutral-600">
                    Belum ada tanda tangan digital — unggah di menu Settings
                  </p>
                </div>
              )}

              {/* Digital document verification */}
              {qrCode && (
                <div
                  className="quotation-qr mt-4 flex items-center justify-end gap-3"
                  data-testid="quotation-qr-block"
                >
                  <div className="text-right">
                    <p className="text-[10px] font-bold tracking-widest text-neutral-800">
                      DIGITAL DOCUMENT
                    </p>
                    <p className="text-[9px] text-neutral-500">
                      Scan untuk informasi dokumen
                    </p>
                    <p className="mt-1 text-[9px] font-mono text-neutral-600">
                      {data.quotation_number}
                    </p>
                  </div>
                  <img
                    src={qrCode}
                    alt="QR Code verifikasi quotation"
                    className="h-20 w-20"
                    data-testid="quotation-qr-code"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Office footer */}
          <div className="quotation-footer grid gap-4 border-t border-neutral-900 bg-neutral-50 px-8 py-4 text-[10px] text-neutral-600 sm:grid-cols-2">
            {COMPANY.offices.map((o) => (
              <div key={o.city}>
                <p className="font-bold tracking-widest text-neutral-800">{o.city.toUpperCase()} OFFICE</p>
                <p>{o.address}</p>
                <p>T. {o.phone}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Catat Purchase Order Customer</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Masukkan nomor PO yang tertera pada dokumen PO dari customer (bukan nomor internal).
          </p>
          <div className="space-y-4">
            <div>
              <Label htmlFor="conv-po-number">Nomor PO Customer</Label>
              <Input
                id="conv-po-number"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder="mis. PO/ELSI/2026/0088"
                className="mt-1.5"
                data-testid="input-convert-po-number"
              />
            </div>
            <div>
              <Label htmlFor="conv-po-date">Tanggal PO Customer</Label>
              <Input
                id="conv-po-date"
                type="date"
                value={poDate}
                onChange={(e) => setPoDate(e.target.value)}
                className="mt-1.5"
                data-testid="input-convert-po-date"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertOpen(false)} data-testid="btn-cancel-convert">
              Batal
            </Button>
            <Button
              onClick={() => convert.mutate()}
              disabled={!poNumber.trim() || convert.isPending}
              data-testid="btn-submit-convert"
            >
              {convert.isPending ? "Menyimpan..." : "Simpan PO Customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
