import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyRow, ErrorRow, PageHeader, StatusBadge, TableSkeleton } from "@/components/Shared";
import { buttonVariants } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { ETA_LABEL, formatDate, formatIDR, formatNumber } from "@/lib/format";
import type { CustomerDetail as CustomerDetailType, Paginated } from "@/lib/types";

type TabKey = "pipeline" | "quotations" | "purchase-orders" | "activities" | "order-monitoring";

const TABS: { key: TabKey; label: string; columns: string[] }[] = [
  { key: "pipeline", label: "Sales Pipeline", columns: ["Opportunity", "Stage", "Value", "Weighted", "Target Close"] },
  { key: "quotations", label: "Quotations", columns: ["Nomor", "Tanggal", "Grand Total", "Status", "Sales"] },
  { key: "purchase-orders", label: "Purchase Orders", columns: ["Nomor PO", "Tanggal", "Nilai PO", "Status", "Sales"] },
  { key: "activities", label: "Aktivitas", columns: ["Tipe", "Tanggal", "Subjek", "Follow Up", "Status"] },
  { key: "order-monitoring", label: "Order Monitoring", columns: ["Monitoring", "PO", "Produk", "Qty", "Status", "ETA"] },
];

function RelatedTable({ customerId, tab }: { customerId: string; tab: (typeof TABS)[number] }) {
  // Fired only when this tab is mounted → true lazy / on-demand loading.
  const { data, isLoading, isError } = useQuery<Paginated<Record<string, unknown>>>({
    queryKey: ["customer-related", customerId, tab.key],
    queryFn: () => apiGet<Paginated<Record<string, unknown>>>(`/customers/${customerId}/${tab.key}?page_size=10`),
    staleTime: 60_000,
  });

  const rows = isError ? [] : (data?.data ?? []);
  const cols = tab.columns.length;

  const cell = (r: Record<string, unknown>) => {
    const s = (k: string) => (r[k] === null || r[k] === undefined ? "-" : String(r[k]));
    const n = (k: string) => formatIDR(Number(r[k] ?? 0));
    switch (tab.key) {
      case "pipeline":
        return [
          s("opportunity_name"),
          <StatusBadge key="st" value={s("stage")} />,
          n("value"),
          n("weighted_value"),
          formatDate(s("expected_close_date")),
        ];
      case "quotations":
        return [
          s("quotation_number"),
          formatDate(s("quotation_date")),
          n("grand_total"),
          <StatusBadge key="st" value={s("status")} />,
          s("sales_name"),
        ];
      case "purchase-orders":
        return [
          s("po_number"),
          formatDate(s("po_date")),
          n("po_value"),
          <StatusBadge key="st" value={s("status")} />,
          s("sales_name"),
        ];
      case "activities":
        return [
          s("activity_type"),
          formatDate(s("activity_date")),
          s("subject"),
          formatDate(s("next_followup")),
          <StatusBadge key="st" value={s("status")} />,
        ];
      case "order-monitoring":
        return [
          s("monitoring_id"),
          s("po_number"),
          s("product_name"),
          formatNumber(Number(r.qty ?? 0)),
          <StatusBadge key="st" value={s("status")} />,
          formatDate(s("eta")),
        ];
    }
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {tab.columns.map((c) => (
            <TableHead key={c}>{c}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableSkeleton cols={cols} rows={3} />
        ) : isError ? (
          <ErrorRow colSpan={cols} />
        ) : rows.length === 0 ? (
          <EmptyRow colSpan={cols} message={`Belum ada data ${tab.label.toLowerCase()}.`} />
        ) : (
          rows.map((r, i) => (
            <TableRow key={i} data-testid={`row-${tab.key}-${i}`}>
              {(cell(r) ?? []).map((v, j) => (
                <TableCell key={j} className={j >= 2 && typeof v === "string" ? "font-mono text-xs" : ""}>
                  {v}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

export default function CustomerDetailPage() {
  const { customerId = "" } = useParams();
  const [tab, setTab] = useState<TabKey>("pipeline");

  const { data, isLoading, isError } = useQuery<CustomerDetailType>({
    queryKey: ["customer", customerId],
    queryFn: () => apiGet<CustomerDetailType>(`/customers/${customerId}`),
  });

  const info: [string, string][] = [
    ["Customer ID", data?.customer_id ?? "-"],
    ["Perusahaan", data?.company ?? "-"],
    ["Industri", data?.industry ?? "-"],
    ["Kota / Provinsi", `${data?.city ?? "-"} / ${data?.province ?? "-"}`],
    ["Alamat", data?.address ?? "-"],
    ["Sumber", data?.source ?? "-"],
    ["Sales", data?.sales_name ?? "-"],
    ["Dibuat", formatDate(data?.created_date)],
  ];
  const contacts: [string, string][] = [
    ["Nama PIC", data?.pic_name ?? "-"],
    ["Jabatan", data?.pic_position ?? "-"],
    ["Telepon", data?.phone ?? "-"],
    ["Email", data?.email ?? "-"],
  ];

  return (
    <div>
      <Link
        to="/customers"
        className={buttonVariants({ variant: "ghost", size: "sm" }) + " mb-3"}
        data-testid="link-back-customers"
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke daftar
      </Link>
      <PageHeader
        title={isLoading ? "Memuat..." : (data?.customer_name ?? customerId)}
        subtitle={isError ? "Detail belum dapat dimuat." : "Data transaksi dimuat hanya saat tab dibuka"}
      >
        {data && <StatusBadge value={data.status} testId="customer-detail-status" />}
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2" data-testid="card-customer-information">
          <h2 className="mb-4 text-sm font-semibold tracking-wider uppercase">Customer Information</h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            {info.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] tracking-wider text-muted-foreground uppercase">{k}</dt>
                <dd className="mt-0.5 text-sm font-medium">{isLoading ? "…" : v}</dd>
              </div>
            ))}
          </dl>
          {data?.notes && (
            <p className="mt-4 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">{data.notes}</p>
          )}
        </Card>
        <Card className="p-5" data-testid="card-customer-contacts">
          <h2 className="mb-4 text-sm font-semibold tracking-wider uppercase">Contacts</h2>
          <dl className="space-y-3">
            {contacts.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] tracking-wider text-muted-foreground uppercase">{k}</dt>
                <dd className="mt-0.5 text-sm font-medium break-all">{isLoading ? "…" : v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden p-0">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <div className="border-b border-border px-3 pt-3">
            <TabsList variant="line" className="flex-wrap">
              {TABS.map((t) => (
                <TabsTrigger key={t.key} value={t.key} data-testid={`tab-${t.key}`}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {TABS.map((t) => (
            <TabsContent key={t.key} value={t.key} className="m-0">
              {tab === t.key && <RelatedTable customerId={customerId} tab={t} />}
            </TabsContent>
          ))}
        </Tabs>
      </Card>

      <p className="mt-3 text-xs text-muted-foreground" data-testid="eta-legend">
        Keterangan indikator ETA: {Object.values(ETA_LABEL).join(" · ")}
      </p>
    </div>
  );
}
