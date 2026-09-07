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
  Target,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { FilterSelect, PageHeader } from "@/components/Shared";
import { apiGet } from "@/lib/api";
import { formatCompactIDR, formatNumber } from "@/lib/format";
import type { CustomerOption, DashboardResponse, SalesOption } from "@/lib/types";

const PERIODS = [
  { value: "30d", label: "30 hari terakhir" },
  { value: "90d", label: "90 hari terakhir" },
  { value: "365d", label: "1 tahun terakhir" },
];

const STAGES = ["Lead", "Qualification", "Proposal", "Negotiation"];

function MetricCard({
  testId,
  title,
  value,
  hint,
  icon,
  tone = "default",
  loading = false,
  featured = false,
}: {
  testId: string;
  title: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  tone?: "default" | "success" | "danger" | "blue";
  loading?: boolean;
  featured?: boolean;
}) {
  const iconClass =
    tone === "success"
      ? "bg-emerald-50 text-emerald-600"
      : tone === "danger"
        ? "bg-red-50 text-red-600"
        : tone === "blue"
          ? "bg-blue-50 text-blue-600"
          : "bg-slate-100 text-slate-600";

  const valueClass =
    tone === "success"
      ? "text-emerald-700"
      : tone === "danger"
        ? "text-red-600"
        : "text-slate-950";

  return (
    <Card
      data-testid={testId}
      className={`group relative overflow-hidden border-slate-200 bg-white transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg ${
        featured ? "min-h-[164px] p-6" : "min-h-[132px] p-5"
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
            {title}
          </p>

          {loading ? (
            <div className="mt-4 h-9 w-32 animate-pulse rounded-md bg-slate-100" />
          ) : (
            <p
              className={`mt-3 font-mono text-2xl font-bold tracking-tight ${featured ? "text-3xl" : ""} ${valueClass}`}
            >
              {value}
            </p>
          )}

          {hint && (
            <p className="mt-2 text-xs text-slate-500">
              {hint}
            </p>
          )}
        </div>

        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClass} transition-transform group-hover:scale-105`}
        >
          {icon}
        </div>
      </div>

      <div
        className={`absolute bottom-0 left-0 h-1 ${
          tone === "success"
            ? "w-full bg-emerald-500"
            : tone === "danger"
              ? "w-full bg-red-500"
              : "w-full bg-blue-600"
        } opacity-0 transition-opacity group-hover:opacity-100`}
      />
    </Card>
  );
}

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

  const totalPipeline = bars.reduce((sum, item) => sum + item.value, 0);
  const totalDeals = bars.reduce((sum, item) => sum + item.count, 0);
  const wonRatio =
    totalPipeline > 0 && kpi?.won_value
      ? Math.round((kpi.won_value / totalPipeline) * 100)
      : 0;

  return (
    <div className="space-y-6 pb-8">
      {/* HEADER */}
      <PageHeader
        title="Dashboard"
        subtitle="Pantau performa sales, pipeline, quotation, dan order dalam satu tampilan."
      >
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
          options={(salesOptions ?? []).map((s) => ({
            value: s.user_id,
            label: s.name,
          }))}
          placeholder="Semua sales"
          testId="filter-sales"
        />
        <FilterSelect
          value={stage}
          onChange={setStage}
          options={STAGES.map((s) => ({
            value: s,
            label: s,
          }))}
          placeholder="Semua stage"
          testId="filter-stage"
        />
        <FilterSelect
          value={customerId}
          onChange={setCustomerId}
          options={(customerOptions ?? []).map((c) => ({
            value: c.customer_id,
            label: c.customer_name,
          }))}
          placeholder="Semua customer"
          testId="filter-customer"
        />
      </PageHeader>

      {/* WELCOME / SUMMARY */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6 text-white shadow-xl">
        <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-blue-300">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-[0.16em]">
                Sales Overview
              </span>
            </div>

            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
              Business performance at a glance
            </h2>

            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Lihat peluang terbesar, nilai pipeline, dan kondisi order
              secara cepat dari dashboard CRM.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-6 rounded-xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Active Deals
              </p>
              <p className="mt-1 font-mono text-2xl font-bold">
                {isLoading ? "-" : totalDeals}
              </p>
            </div>

            <div className="h-10 w-px bg-white/10" />

            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Pipeline
              </p>
              <p className="mt-1 font-mono text-2xl font-bold">
                {isLoading ? "-" : formatCompactIDR(totalPipeline)}
              </p>
            </div>
          </div>
        </div>

        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />
      </div>

      {/* PRIMARY KPI */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Business Snapshot
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Metrik utama penjualan
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            testId="kpi-total-customers"
            title="Total Customer"
            value={num(kpi?.total_customers)}
            icon={<Users className="h-5 w-5" />}
            loading={isLoading}
            featured
          />

          <MetricCard
            testId="kpi-open-pipeline"
            title="Open Pipeline"
            value={cur(kpi?.open_pipeline)}
            hint="Deal yang masih berjalan"
            icon={<TrendingUp className="h-5 w-5" />}
            tone="blue"
            loading={isLoading}
            featured
          />

          <MetricCard
            testId="kpi-weighted-pipeline"
            title="Weighted Pipeline"
            value={cur(kpi?.weighted_pipeline)}
            hint="Value × probability"
            icon={<Calculator className="h-5 w-5" />}
            loading={isLoading}
            featured
          />

          <MetricCard
            testId="kpi-won-value"
            title="Won Value"
            value={cur(kpi?.won_value)}
            hint={wonRatio ? `${wonRatio}% dari pipeline` : "Deal berhasil"}
            icon={<Award className="h-5 w-5" />}
            tone="success"
            loading={isLoading}
            featured
          />
        </div>
      </section>

      {/* SECONDARY KPI */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
        <MetricCard
          testId="kpi-total-quotations"
          title="Quotation"
          value={num(kpi?.total_quotations)}
          icon={<FileText className="h-4 w-4" />}
          loading={isLoading}
        />

        <MetricCard
          testId="kpi-total-po"
          title="Total PO"
          value={num(kpi?.total_po)}
          icon={<ShoppingBag className="h-4 w-4" />}
          loading={isLoading}
        />

        <MetricCard
          testId="kpi-po-value"
          title="PO Value"
          value={cur(kpi?.po_value)}
          icon={<DollarSign className="h-4 w-4" />}
          tone="blue"
          loading={isLoading}
        />

        <MetricCard
          testId="kpi-activities"
          title="Aktivitas"
          value={num(kpi?.activities)}
          icon={<CalendarCheck className="h-4 w-4" />}
          loading={isLoading}
        />

        <MetricCard
          testId="kpi-open-orders"
          title="Open Orders"
          value={num(kpi?.open_orders)}
          icon={<Truck className="h-4 w-4" />}
          loading={isLoading}
        />

        <MetricCard
          testId="kpi-completed-orders"
          title="Completed"
          value={num(kpi?.completed_orders)}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="success"
          loading={isLoading}
        />

        <MetricCard
          testId="kpi-overdue-orders"
          title="Overdue"
          value={num(kpi?.overdue_orders)}
          hint="Belum selesai"
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="danger"
          loading={isLoading}
        />
      </div>

      {/* PIPELINE */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card
          className="overflow-hidden border-slate-200 bg-white"
          data-testid="dashboard-pipeline-chart"
        >
          <div className="border-b border-slate-100 px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <Target className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Sales Pipeline
                    </h2>
                    <p className="text-xs text-slate-500">
                      Distribusi value berdasarkan stage
                    </p>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Total
                </p>
                <p className="font-mono text-lg font-bold text-slate-900">
                  {isLoading ? "-" : formatCompactIDR(totalPipeline)}
                </p>
              </div>
            </div>
          </div>

          <div className="p-6">
            {isLoading ? (
              <div className="space-y-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i}>
                    <div className="mb-2 h-4 w-full animate-pulse rounded bg-slate-100" />
                    <div className="h-3 animate-pulse rounded-full bg-slate-100" />
                  </div>
                ))}
              </div>
            ) : bars.length === 0 ? (
              <div className="flex min-h-[220px] items-center justify-center text-sm text-slate-500">
                Belum ada data pipeline.
              </div>
            ) : (
              <div className="space-y-5">
                {[...bars]
                  .sort((a, b) => b.value - a.value)
                  .map((b, index) => {
                    const percentage =
                      totalPipeline > 0
                        ? Math.round((b.value / totalPipeline) * 100)
                        : 0;

                    return (
                      <div
                        key={b.stage}
                        data-testid={`pipeline-bar-${b.stage.toLowerCase()}`}
                      >
                        <div className="mb-2 flex items-end justify-between gap-4">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-bold text-slate-500">
                              {index + 1}
                            </span>

                            <span className="truncate text-sm font-semibold text-slate-800">
                              {b.stage}
                            </span>

                            <span className="text-xs text-slate-400">
                              {b.count} deal
                            </span>
                          </div>

                          <div className="shrink-0 text-right">
                            <span className="font-mono text-sm font-bold text-slate-800">
                              {formatCompactIDR(b.value)}
                            </span>
                            <span className="ml-2 text-[10px] font-bold text-blue-600">
                              {percentage}%
                            </span>
                          </div>
                        </div>

                        <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-blue-700 to-blue-500 transition-all duration-700 ease-out"
                            style={{
                              width: `${Math.max(
                                3,
                                (b.value / maxBar) * 100,
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </Card>

        {/* PIPELINE SUMMARY */}
        <Card className="border-slate-200 bg-slate-950 p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <TrendingUp className="h-5 w-5 text-blue-300" />
            </div>
            <div>
              <h2 className="font-bold">Pipeline Summary</h2>
              <p className="text-xs text-slate-400">
                Ringkasan performa saat ini
              </p>
            </div>
          </div>

          <div className="mt-7 space-y-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Open Pipeline
              </p>
              <p className="mt-1 font-mono text-2xl font-bold">
                {cur(kpi?.open_pipeline)}
              </p>
            </div>

            <div className="h-px bg-white/10" />

            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Weighted Pipeline
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-blue-300">
                {cur(kpi?.weighted_pipeline)}
              </p>
            </div>

            <div className="h-px bg-white/10" />

            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Won Value
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-emerald-400">
                {cur(kpi?.won_value)}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Win contribution
                </span>
                <span className="font-mono text-sm font-bold text-white">
                  {isLoading ? "-" : `${wonRatio}%`}
                </span>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-all duration-700"
                  style={{
                    width: `${Math.min(100, Math.max(0, wonRatio))}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ORDER HEALTH */}
      <Card className="border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-blue-600" />
              <h2 className="text-base font-bold text-slate-900">
                Order Health
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Kondisi order berdasarkan status penyelesaian
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="rounded-xl bg-blue-50 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500">
                Open
              </p>
              <p className="mt-1 font-mono text-xl font-bold text-blue-700">
                {num(kpi?.open_orders)}
              </p>
            </div>

            <div className="rounded-xl bg-emerald-50 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">
                Completed
              </p>
              <p className="mt-1 font-mono text-xl font-bold text-emerald-700">
                {num(kpi?.completed_orders)}
              </p>
            </div>

            <div className="rounded-xl bg-red-50 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-red-500">
                Overdue
              </p>
              <p className="mt-1 font-mono text-xl font-bold text-red-600">
                {num(kpi?.overdue_orders)}
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
