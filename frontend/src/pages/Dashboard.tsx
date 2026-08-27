import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Award,
  Calculator,
  CalendarCheck,
  CheckCircle2,
  DollarSign,
  FileText,
  ShoppingBag,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { FilterSelect, KpiCard, PageHeader } from "@/components/Shared";
import { apiGet } from "@/lib/api";
import { formatCompactIDR, formatNumber } from "@/lib/format";
import type { CustomerOption, DashboardResponse, SalesOption } from "@/lib/types";

const PERIODS = [
  { value: "30d", label: "30 hari terakhir" },
  { value: "90d", label: "90 hari terakhir" },
  { value: "365d", label: "1 tahun terakhir" },
];
const STAGES = ["Lead", "Qualification", "Proposal", "Negotiation"];

export default function Dashboard() {
  const [period, setPeriod] = useState("");
  const [salesId, setSalesId] = useState("");
  const [stage, setStage] = useState("");
  const [customerId, setCustomerId] = useState("");

  const params = new URLSearchParams();
  if (period) params.set("period", period);
  if (salesId) params.set("sales_id", salesId);
  if (stage) params.set("stage", stage);
  if (customerId) params.set("customer_id", customerId);
  const qs = params.toString();

  const { data, isLoading, isError } = useQuery<DashboardResponse>({
    queryKey: ["dashboard", qs],
    queryFn: () => apiGet<DashboardResponse>(`/dashboard${qs ? `?${qs}` : ""}`),
    staleTime: 60_000,
  });

  // Master lists are small + rarely change → cached long.
  const { data: salesOptions } = useQuery<SalesOption[]>({
    queryKey: ["user-options"],
    queryFn: () => apiGet<SalesOption[]>("/users/options"),
    staleTime: 10 * 60_000,
  });
  const { data: customerOptions } = useQuery<CustomerOption[]>({
    queryKey: ["customer-options"],
    queryFn: () => apiGet<CustomerOption[]>("/customers/options"),
    staleTime: 10 * 60_000,
  });

  const kpi = isError ? null : data?.kpi;
  const bars = isError ? [] : (data?.pipeline_by_stage ?? []);
  const maxBar = Math.max(1, ...bars.map((b) => b.value));

  const num = (v?: number) => (kpi ? formatNumber(v) : "-");
  const cur = (v?: number) => (kpi ? formatCompactIDR(v) : "-");

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Ringkasan performa sales — dihitung penuh di server (aggregation)">
        <FilterSelect
          value={period}
          onChange={setPeriod}
          options={PERIODS}
          placeholder="Semua periode"
          testId="filter-period"
        />
        <FilterSelect
          value={salesId}
          onChange={setSalesId}
          options={(salesOptions ?? []).map((s) => ({ value: s.user_id, label: s.name }))}
          placeholder="Semua sales"
          testId="filter-sales"
        />
        <FilterSelect
          value={stage}
          onChange={setStage}
          options={STAGES.map((s) => ({ value: s, label: s }))}
          placeholder="Semua stage"
          testId="filter-stage"
        />
        <FilterSelect
          value={customerId}
          onChange={setCustomerId}
          options={(customerOptions ?? []).map((c) => ({ value: c.customer_id, label: c.customer_name }))}
          placeholder="Semua customer"
          testId="filter-customer"
        />
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <KpiCard
          testId="kpi-total-customers"
          title="Total Customer"
          value={num(kpi?.total_customers)}
          icon={<Users className="h-4 w-4" />}
          loading={isLoading}
        />
        <KpiCard
          testId="kpi-open-pipeline"
          title="Open Pipeline"
          value={cur(kpi?.open_pipeline)}
          hint="Nilai deal yang masih berjalan"
          icon={<TrendingUp className="h-4 w-4" />}
          loading={isLoading}
        />
        <KpiCard
          testId="kpi-weighted-pipeline"
          title="Weighted Pipeline"
          value={cur(kpi?.weighted_pipeline)}
          hint="Value × probability"
          icon={<Calculator className="h-4 w-4" />}
          loading={isLoading}
        />
        <KpiCard
          testId="kpi-won-value"
          title="Won Value"
          value={cur(kpi?.won_value)}
          tone="success"
          icon={<Award className="h-4 w-4" />}
          loading={isLoading}
        />
        <KpiCard
          testId="kpi-total-quotations"
          title="Total Quotation"
          value={num(kpi?.total_quotations)}
          icon={<FileText className="h-4 w-4" />}
          loading={isLoading}
        />
        <KpiCard
          testId="kpi-total-po"
          title="Total PO"
          value={num(kpi?.total_po)}
          icon={<ShoppingBag className="h-4 w-4" />}
          loading={isLoading}
        />
        <KpiCard
          testId="kpi-po-value"
          title="PO Value"
          value={cur(kpi?.po_value)}
          icon={<DollarSign className="h-4 w-4" />}
          loading={isLoading}
        />
        <KpiCard
          testId="kpi-activities"
          title="Aktivitas"
          value={num(kpi?.activities)}
          icon={<CalendarCheck className="h-4 w-4" />}
          loading={isLoading}
        />
        <KpiCard
          testId="kpi-open-orders"
          title="Open Orders"
          value={num(kpi?.open_orders)}
          icon={<Truck className="h-4 w-4" />}
          loading={isLoading}
        />
        <KpiCard
          testId="kpi-completed-orders"
          title="Completed Orders"
          value={num(kpi?.completed_orders)}
          tone="success"
          icon={<CheckCircle2 className="h-4 w-4" />}
          loading={isLoading}
        />
        <KpiCard
          testId="kpi-overdue-orders"
          title="Overdue Orders"
          value={num(kpi?.overdue_orders)}
          tone="danger"
          hint="ETA terlewat & belum selesai"
          icon={<AlertTriangle className="h-4 w-4" />}
          loading={isLoading}
        />
      </div>

      <Card className="mt-6 p-5" data-testid="dashboard-pipeline-chart">
        <h2 className="text-base font-semibold">Pipeline per Stage</h2>
        <p className="mb-5 text-xs text-muted-foreground">Nilai deal dikelompokkan di database (GROUP BY)</p>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-6 animate-shimmer rounded bg-muted" />
            ))}
          </div>
        ) : bars.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Belum ada data pipeline.</p>
        ) : (
          <div className="space-y-3">
            {bars.map((b) => (
              <div key={b.stage} data-testid={`pipeline-bar-${b.stage.toLowerCase()}`}>
                <div className="mb-1 flex items-baseline justify-between text-xs">
                  <span className="font-semibold">
                    {b.stage} <span className="text-muted-foreground">({b.count})</span>
                  </span>
                  <span className="font-mono font-semibold">{formatCompactIDR(b.value)}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                    style={{ width: `${Math.max(2, (b.value / maxBar) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
