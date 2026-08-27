import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Printer, Truck } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatusBadge } from "@/components/Shared";
import { ApiError, apiGet, apiPost } from "@/lib/api";
import { formatDate, formatIDR } from "@/lib/format";
import type { MonitoringRow, PODetail, Paginated } from "@/lib/types";

export default function PurchaseOrderView() {
  const { poId = "" } = useParams();
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery<PODetail>({
    queryKey: ["purchase-order", poId],
    queryFn: () => apiGet<PODetail>(`/purchase-orders/${poId}`),
  });

  const monitoring = useQuery<Paginated<MonitoringRow>>({
    queryKey: ["po-monitoring", poId],
    queryFn: () => apiGet<Paginated<MonitoringRow>>(`/order-monitoring?search=${poId}&page_size=25`),
    enabled: false,
  });

  const createMonitoring = useMutation({
    mutationFn: () => apiPost<{ created: number }>(`/purchase-orders/${poId}/create-monitoring`),
    onSuccess: (res) => {
      toast.success(`${res.created} baris order monitoring dibuat`);
      qc.invalidateQueries({ queryKey: ["purchase-order", poId] });
      qc.invalidateQueries({ queryKey: ["order-monitoring"] });
      monitoring.refetch();
    },
    onError: (e) =>
      toast.error(
        (e instanceof ApiError ? (e.body as { detail?: string })?.detail : null) ?? "Gagal membuat order monitoring",
      ),
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
        title={isLoading ? "Memuat PO..." : (data?.po_number ?? poId)}
        subtitle={isError ? "PO belum dapat dimuat." : `Customer: ${data?.customer_name ?? "-"}`}
      >
        {data && <StatusBadge value={data.status} testId="po-status-badge" />}
        <Button variant="outline" onClick={() => window.print()} data-testid="btn-print-po">
          <Printer className="mr-2 h-4 w-4" /> Cetak
        </Button>
        {data?.document_name && (
          <Button variant="outline" data-testid="btn-download-po-document">
            <Download className="mr-2 h-4 w-4" /> {data.document_name}
          </Button>
        )}
        <Button
          onClick={() => createMonitoring.mutate()}
          disabled={createMonitoring.isPending}
          data-testid="btn-create-monitoring"
        >
          <Truck className="mr-2 h-4 w-4" /> Buat Order Monitoring
        </Button>
      </PageHeader>

      <Card className="print-area p-6" data-testid="po-document">
        <div className="grid gap-4 border-b border-border pb-5 sm:grid-cols-4">
          {[
            ["Nomor PO", data?.po_number ?? "-"],
            ["Tanggal", formatDate(data?.po_date)],
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
