import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Printer, ShoppingBag } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/Shared";
import { ApiError, apiGet, apiPost } from "@/lib/api";
import { formatDate, formatIDR } from "@/lib/format";
import type { QuotationDetail } from "@/lib/types";

export default function QuotationView() {
  const { quotationId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery<QuotationDetail>({
    queryKey: ["quotation", quotationId],
    queryFn: () => apiGet<QuotationDetail>(`/quotations/${quotationId}`),
  });

  const convert = useMutation({
    mutationFn: () => apiPost<{ po_id: string; po_number: string }>(`/quotations/${quotationId}/convert-to-po`),
    onSuccess: (res) => {
      toast.success(`Berhasil menjadi PO ${res.po_number}`);
      qc.invalidateQueries({ queryKey: ["quotations"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      navigate(`/purchase-orders/${res.po_id}`);
    },
    onError: (e) =>
      toast.error(
        (e instanceof ApiError ? (e.body as { detail?: string })?.detail : null) ?? "Gagal konversi ke PO",
      ),
  });

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
          <Button variant="outline" onClick={() => window.print()} data-testid="btn-print-quotation">
            <Printer className="mr-2 h-4 w-4" /> Cetak / Simpan PDF
          </Button>
          <Button
            disabled={data?.status === "Converted" || convert.isPending}
            onClick={() => convert.mutate()}
            data-testid="btn-convert-to-po"
          >
            <ShoppingBag className="mr-2 h-4 w-4" /> Konversi ke PO
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
        <Card className="print-area p-8" data-testid="quotation-document">
          <div className="flex items-start justify-between border-b-2 border-foreground pb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
                  C
                </span>
                <div>
                  <p className="font-bold">CRM Sales Management</p>
                  <p className="text-xs text-muted-foreground">Kawasan Industri MM2100, Bekasi</p>
                </div>
              </div>
            </div>
            <div className="text-right">
              <h1 className="text-2xl font-bold tracking-tight">QUOTATION</h1>
              <p className="font-mono text-sm font-semibold" data-testid="quotation-number">
                {data.quotation_number}
              </p>
              <div className="mt-1">
                <StatusBadge value={data.status} testId="quotation-status-badge" />
              </div>
            </div>
          </div>

          <div className="grid gap-6 py-6 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                Kepada
              </p>
              <p className="font-semibold" data-testid="quotation-customer-name">
                {data.customer_name}
              </p>
              <p className="text-xs text-muted-foreground">ID: {data.customer_id}</p>
            </div>
            <div className="sm:text-right">
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between sm:justify-end sm:gap-6">
                  <dt className="text-muted-foreground">Tanggal</dt>
                  <dd className="font-medium">{formatDate(data.quotation_date)}</dd>
                </div>
                <div className="flex justify-between sm:justify-end sm:gap-6">
                  <dt className="text-muted-foreground">Berlaku s/d</dt>
                  <dd className="font-medium">{formatDate(data.validity_date)}</dd>
                </div>
                <div className="flex justify-between sm:justify-end sm:gap-6">
                  <dt className="text-muted-foreground">Sales</dt>
                  <dd className="font-medium">{data.sales_name ?? "-"}</dd>
                </div>
              </dl>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-border bg-muted/50">
                <th className="px-2 py-2 text-left text-[11px] tracking-wider uppercase">#</th>
                <th className="px-2 py-2 text-left text-[11px] tracking-wider uppercase">Deskripsi</th>
                <th className="px-2 py-2 text-right text-[11px] tracking-wider uppercase">Qty</th>
                <th className="px-2 py-2 text-left text-[11px] tracking-wider uppercase">Unit</th>
                <th className="px-2 py-2 text-right text-[11px] tracking-wider uppercase">Harga</th>
                <th className="px-2 py-2 text-right text-[11px] tracking-wider uppercase">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it, i) => (
                <tr key={it.quotation_item_id} className="border-b border-border" data-testid={`quotation-item-${i}`}>
                  <td className="px-2 py-2 font-mono text-xs">{i + 1}</td>
                  <td className="px-2 py-2">{it.description}</td>
                  <td className="px-2 py-2 text-right font-mono text-xs">{it.qty}</td>
                  <td className="px-2 py-2 text-xs">{it.unit}</td>
                  <td className="px-2 py-2 text-right font-mono text-xs">{formatIDR(it.unit_price)}</td>
                  <td className="px-2 py-2 text-right font-mono text-xs font-semibold">
                    {formatIDR(it.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-5 flex justify-end">
            <dl className="w-full max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="font-mono">{formatIDR(data.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Diskon</dt>
                <dd className="font-mono">-{formatIDR(data.discount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">PPN {data.tax_percent}%</dt>
                <dd className="font-mono">{formatIDR(data.tax)}</dd>
              </div>
              <div className="flex justify-between border-t-2 border-foreground pt-2 text-base">
                <dt className="font-bold">Grand Total</dt>
                <dd className="font-mono font-bold" data-testid="quotation-grand-total-view">
                  {formatIDR(data.grand_total)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-8 grid gap-6 border-t border-border pt-6 text-xs sm:grid-cols-2">
            <div>
              <p className="mb-1 font-semibold">Syarat & Ketentuan</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>Pembayaran: {data.payment_term ?? "-"}</li>
                <li>Pengiriman: {data.delivery_term ?? "-"}</li>
                {data.notes && <li>{data.notes}</li>}
              </ul>
            </div>
            <div className="sm:text-right">
              <p className="mb-12 text-muted-foreground">Hormat kami,</p>
              <p className="border-t border-foreground pt-1 font-semibold sm:ml-auto sm:w-48">
                {data.sales_name ?? "Sales Executive"}
              </p>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
