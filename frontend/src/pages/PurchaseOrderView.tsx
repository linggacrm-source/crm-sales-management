import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, Eye, Printer } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatusBadge } from "@/components/Shared";
import { apiGet } from "@/lib/api";
import { formatDate, formatIDR } from "@/lib/format";
import type { MonitoringRow, PODetail, Paginated } from "@/lib/types";

export default function PurchaseOrderView() {
  const { poId = "" } = useParams();
  const { data, isLoading, isError } = useQuery<PODetail>({
    queryKey: ["purchase-order", poId],
    queryFn: () => apiGet<PODetail>(`/purchase-orders/${poId}`),
  });

  const monitoring = useQuery<Paginated<MonitoringRow>>({
    queryKey: ["po-monitoring", poId],
    queryFn: () => apiGet<Paginated<MonitoringRow>>(`/order-monitoring?search=${poId}&page_size=25`),
    enabled: false,
  });



  return (
    <div className="mx-auto max-w-4xl">
      <Link
        to="/purchase-orders"
        className={buttonVariants({ variant: "ghost", size: "sm" }) + " no-print mb-3"}
        data-testid="link-back-po"
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> Kembali
      </Link>

      <PageHeader
        title={isLoading ? "Memuat PO..." : `PO Customer ${data?.po_number ?? poId}`}
        subtitle={isError ? "PO belum dapat dimuat." : `Diterima dari: ${data?.customer_name ?? "-"}`}
      >
        {data && <StatusBadge value={data.status} testId="po-status-badge" />}
        <Button variant="outline" onClick={() => window.print()} data-testid="btn-print-po">
          <Printer className="mr-2 h-4 w-4" /> Cetak
        </Button>
        {data?.document_name && data?.document_file_id && (
          <>
            <Button
              variant="outline"
              onClick={() => window.open(`/api/purchase-orders/${poId}/document`, "_blank", "noopener,noreferrer")}
              data-testid="btn-view-po-document"
            >
              <Eye className="mr-2 h-4 w-4" /> Lihat PO
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const response = await fetch(`/api/purchase-orders/${poId}/document`, { credentials: "include" });
                  if (!response.ok) throw new Error("Gagal mengambil dokumen");
                  const blob = await response.blob();
                  const url = URL.createObjectURL(blob);
                  const anchor = document.createElement("a");
                  anchor.href = url;
                  anchor.download = data.document_name ?? "purchase-order";
                  document.body.appendChild(anchor);
                  anchor.click();
                  anchor.remove();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                } catch {
                  toast.error("Dokumen PO tidak dapat diunduh");
                }
              }}
              data-testid="btn-download-po-document"
            >
              <Download className="mr-2 h-4 w-4" /> Download
            </Button>
          </>
        )}
        {data?.document_name && !data?.document_file_id && (
          <span className="text-xs text-muted-foreground">Dokumen: {data.document_name} (file belum tersedia)</span>
        )}
      </PageHeader>

      <Card className="print-area p-6" data-testid="po-document">
        <div className="grid gap-4 border-b border-border pb-5 sm:grid-cols-4">
          {[
            ["No PO Customer", data?.po_number ?? "-"],
            ["Tanggal PO", formatDate(data?.po_date)],
            ["Quotation", data?.quotation_number ?? "-"],
            ["Sales", data?.sales_name ?? "-"],
            ["Payment Term", data?.payment_term ?? "-"],
            ["Alamat Kirim", data?.delivery_address ?? "-"],
            ["Customer ID", data?.customer_id ?? "-"],
            ["Nilai PO", formatIDR(data?.po_value)],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-[11px] tracking-wider text-muted-foreground uppercase">{k}</p>
              <p className="mt-0.5 text-sm font-medium">{isLoading ? "…" : v}</p>
            </div>
          ))}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Deskripsi</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="text-right">Harga</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.items ?? []).map((it, i) => (
              <TableRow key={it.po_item_id} data-testid={`po-item-${i}`}>
                <TableCell className="font-mono text-xs">{i + 1}</TableCell>
                <TableCell>{it.description}</TableCell>
                <TableCell className="text-right font-mono text-xs">{it.qty}</TableCell>
                <TableCell className="text-xs">{it.unit}</TableCell>
                <TableCell className="text-right font-mono text-xs">{formatIDR(it.unit_price)}</TableCell>
                <TableCell className="text-right font-mono text-xs font-semibold">{formatIDR(it.subtotal)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {data?.notes && <p className="mt-4 text-xs text-muted-foreground">{data.notes}</p>}
      </Card>
    </div>
  );
}
