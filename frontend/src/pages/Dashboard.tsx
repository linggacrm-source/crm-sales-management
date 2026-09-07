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

const STAGE_COLORS: Record<string, string> = {
  Lead: "#64748b",
  Qualification: "#0ea5e9",
  Proposal: "#2563eb",
  Negotiation: "#7c3aed",
  Won: "#10b981",
  Lost: "#f43f5e",
};

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

          {hint && <p className="mt-2 text-xs text-slate-500">{hint}</p>}
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

function PipelineChart({
  bars,
  loading,
}: {
  bars: DashboardResponse["pipeline_by_stage"];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex h-[300px] items-end gap-4 px-3 pb-8 pt-5">
        {[42, 68, 55, 82, 48, 64].map((height, index) => (
          <div key={index} className="flex flex-1 flex-col justify-end gap-3">
            <div
              className="animate-pulse rounded-t-xl bg-slate-100"
              style={{ height: `${height}%` }}
            />
            <div className="h-3 animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  if (!bars.length) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-slate-500">
        Belum ada data pipeline.
      </div>
    );
  }

  const sorted = [...bars].sort((a, b) => b.value - a.value);
  const maxValue = Math.max(1, ...sorted.map((item) => item.value));

  return (
    <div className="h-[300px] pt-4">
      <div className="relative h-[250px] border-b border-slate-100">
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          {[0, 1, 2, 3].map((line) => (
            <div key={line} className="border-t border-dashed border-slate-100" />
          ))}
        </div>

        <div className="relative z-10 flex h-full items-end gap-3 px-2 sm:gap-5">
          {sorted.map((item) => {
            const height = Math.max(6, (item.value / maxValue) * 100);
            const stageColor = STAGE_COLORS[item.stage] ?? "#2563eb";

            return (
              <div
                key={item.stage}
                className="group flex min-w-0 flex-1 flex-col items-center justify-end"
                data-testid={`pipeline-column-${item.stage.toLowerCase()}`}
              >
                <div className="mb-2 text-center opacity-0 transition-opacity group-hover:opacity-100">
                  <p className="font-mono text-[11px] font-bold text-slate-700">
                    {formatCompactIDR(item.value)}
                  </p>
                  <p className="text-[10px] text-slate-400">{item.count} deal</p>
                </div>
                <div
                  className="w-full max-w-[72px] rounded-t-xl shadow-sm transition-all duration-500 group-hover:-translate-y-1 group-hover:shadow-md"
                  style={{ height: `${height}%`, backgroundColor: stageColor }}
                  title={`${item.stage}: ${formatCompactIDR(item.value)}`}
                />
                <div className="mt-3 w-full truncate text-center text-[10px] font-semibold text-slate-500 sm:text-xs">
                  {item.stage}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StageMix({
  bars,
  loading,
}: {
  bars: DashboardResponse["pipeline_by_stage"];
  loading: boolean;
}) {
  const total = bars.reduce((sum, item) => sum + item.value, 0);
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex h-full flex-col justify-between">
      <div className="relative mx-auto mt-2 h-44 w-44">
        {loading ? (
          <div className="h-full w-full animate-pulse rounded-full border-[22px] border-slate-100" />
        ) : bars.length === 0 || total <= 0 ? (
          <div className="flex h-full w-full items-center justify-center rounded-full border-[22px] border-slate-100">
            <span className="text-xs text-slate-400">No data</span>
          </div>
        ) : (
          <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke="#f1f5f9"
              strokeWidth="22"
            />
            {bars.map((item) => {
              const share = item.value / total;
              const dash = share * circumference;
              const segment = (
                <circle
                  key={item.stage}
                  cx="80"
                  cy="80"
                  r={radius}
                  fill="none"
                  stroke={STAGE_COLORS[item.stage] ?? "#2563eb"}
                  strokeWidth="22"
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                  className="transition-all duration-700"
                />
              );
              offset += dash;
              return segment;
            })}
          </svg>
        )}

        {!loading && bars.length > 0 && total > 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-xl font-bold text-slate-900">
              {bars.reduce((sum, item) => sum + item.count, 0)}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Deals
            </span>
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
        {bars.slice(0, 6).map((item) => {
          const share = total > 0 ? Math.round((item.value / total) * 100) : 0;
          return (
            <div key={item.stage} className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: STAGE_COLORS[item.stage] ?? "#2563eb" }}
              />
              <span className="truncate text-[11px] text-slate-500">{item.stage}</span>
              <span className="ml-auto font-mono text-[11px] font-bold text-slate-700">
                {share}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
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

  const num = (v?: number) => (kpi ? formatNumber(v) : "-");
  const cur = (v?: number) => (kpi ? formatCompactIDR(v) : "-");

  const totalPipeline = bars.reduce((sum, item) => sum + item.value, 0);
  const totalDeals = bars.reduce((sum, item) => sum + item.count, 0);
  const wonRatio =
    totalPipeline > 0 && kpi?.won_value
      ? Math.round((kpi.won_value / totalPipeline) * 100)
      : 0;
  const activeFilterCount = [period, salesId, stage, customerId].filter(Boolean).length;

  return (
    <div className="space-y-6 pb-8">
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
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setPeriod("");
              setSalesId("");
              setStage("");
              setCustomerId("");
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Reset ({activeFilterCount})
          </button>
        )}
      </PageHeader>

      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6 text-white shadow-xl md:p-7">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-blue-300">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-[0.16em]">Sales Overview</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Business performance at a glance</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Lihat peluang terbesar, nilai pipeline, dan kondisi order secara cepat dari dashboard CRM.
            </p>
          </div>

          <div className="grid shrink-0 grid-cols-2 divide-x divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur">
            <div className="px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Active Deals</p>
              <p className="mt-1 font-mono text-2xl font-bold">{isLoading ? "-" : totalDeals}</p>
            </div>
            <div className="px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Pipeline</p>
              <p className="mt-1 font-mono text-2xl font-bold">{isLoading ? "-" : formatCompactIDR(totalPipeline)}</p>
            </div>
          </div>
        </div>
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Business Snapshot</h2>
            <p className="mt-0.5 text-xs text-slate-500">Metrik utama penjualan</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard testId="kpi-total-customers" title="Total Customer" value={num(kpi?.total_customers)} icon={<Users className="h-5 w-5" />} loading={isLoading} featured />
          <MetricCard testId="kpi-open-pipeline" title="Open Pipeline" value={cur(kpi?.open_pipeline)} hint="Deal yang masih berjalan" icon={<TrendingUp className="h-5 w-5" />} tone="blue" loading={isLoading} featured />
          <MetricCard testId="kpi-weighted-pipeline" title="Weighted Pipeline" value={cur(kpi?.weighted_pipeline)} hint="Value × probability" icon={<Calculator className="h-5 w-5" />} loading={isLoading} featured />
          <MetricCard testId="kpi-won-value" title="Won Value" value={cur(kpi?.won_value)} hint={wonRatio ? `${wonRatio}% dari pipeline` : "Deal berhasil"} icon={<Award className="h-5 w-5" />} tone="success" loading={isLoading} featured />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
        <MetricCard testId="kpi-total-quotations" title="Quotation" value={num(kpi?.total_quotations)} icon={<FileText className="h-4 w-4" />} loading={isLoading} />
        <MetricCard testId="kpi-total-po" title="Total PO" value={num(kpi?.total_po)} icon={<ShoppingBag className="h-4 w-4" />} loading={isLoading} />
        <MetricCard testId="kpi-po-value" title="PO Value" value={cur(kpi?.po_value)} icon={<DollarSign className="h-4 w-4" />} tone="blue" loading={isLoading} />
        <MetricCard testId="kpi-activities" title="Aktivitas" value={num(kpi?.activities)} icon={<CalendarCheck className="h-4 w-4" />} loading={isLoading} />
        <MetricCard testId="kpi-open-orders" title="Open Orders" value={num(kpi?.open_orders)} icon={<Truck className="h-4 w-4" />} loading={isLoading} />
        <MetricCard testId="kpi-completed-orders" title="Completed" value={num(kpi?.completed_orders)} icon={<CheckCircle2 className="h-4 w-4" />} tone="success" loading={isLoading} />
        <MetricCard testId="kpi-overdue-orders" title="Overdue" value={num(kpi?.overdue_orders)} hint="Belum selesai" icon={<AlertTriangle className="h-4 w-4" />} tone="danger" loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.8fr)]">
        <Card className="overflow-hidden border-slate-200 bg-white" data-testid="dashboard-pipeline-chart">
          <div className="border-b border-slate-100 px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Target className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Sales Pipeline</h2>
                  <p className="text-xs text-slate-500">Visualisasi value berdasarkan stage</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Value</p>
                <p className="font-mono text-lg font-bold text-slate-900">{isLoading ? "-" : formatCompactIDR(totalPipeline)}</p>
              </div>
            </div>
          </div>
          <div className="px-6 pb-5">
            <PipelineChart bars={bars} loading={isLoading} />
          </div>
        </Card>

        <Card className="border-slate-200 bg-white p-6" data-testid="dashboard-stage-mix">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Stage Mix</h2>
              <p className="mt-0.5 text-xs text-slate-500">Komposisi pipeline</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Live</span>
          </div>
          <div className="mt-3 min-h-[300px]">
            <StageMix bars={bars} loading={isLoading} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Pipeline Detail</h2>
              <p className="mt-1 text-xs text-slate-500">Ranking stage berdasarkan nilai opportunity</p>
            </div>
            <Target className="h-5 w-5 text-slate-300" />
          </div>

          <div className="mt-6 space-y-4">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="space-y-2">
                  <div className="h-4 animate-pulse rounded bg-slate-100" />
                  <div className="h-2 animate-pulse rounded-full bg-slate-100" />
                </div>
              ))
            ) : bars.length === 0 ? (
              <div className="flex min-h-[170px] items-center justify-center text-sm text-slate-500">Belum ada data pipeline.</div>
            ) : (
              [...bars].sort((a, b) => b.value - a.value).map((item, index) => {
                const percentage = totalPipeline > 0 ? Math.round((item.value / totalPipeline) * 100) : 0;
                return (
                  <div key={item.stage} data-testid={`pipeline-bar-${item.stage.toLowerCase()}`}>
                    <div className="mb-2 flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-bold text-slate-500">{index + 1}</span>
                        <span className="truncate text-sm font-semibold text-slate-800">{item.stage}</span>
                        <span className="text-xs text-slate-400">{item.count} deal</span>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="font-mono text-sm font-bold text-slate-800">{formatCompactIDR(item.value)}</span>
                        <span className="ml-2 text-[10px] font-bold text-blue-600">{percentage}%</span>
                      </div>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: `${Math.max(3, percentage)}%`,
                          backgroundColor: STAGE_COLORS[item.stage] ?? "#2563eb",
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card className="border-slate-200 bg-slate-950 p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <TrendingUp className="h-5 w-5 text-blue-300" />
            </div>
            <div>
              <h2 className="font-bold">Pipeline Summary</h2>
              <p className="text-xs text-slate-400">Ringkasan performa saat ini</p>
            </div>
          </div>

          <div className="mt-7 space-y-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Open Pipeline</p>
              <p className="mt-1 font-mono text-2xl font-bold">{cur(kpi?.open_pipeline)}</p>
            </div>
            <div className="h-px bg-white/10" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Weighted Pipeline</p>
              <p className="mt-1 font-mono text-2xl font-bold text-blue-300">{cur(kpi?.weighted_pipeline)}</p>
            </div>
            <div className="h-px bg-white/10" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Won Value</p>
              <p className="mt-1 font-mono text-2xl font-bold text-emerald-400">{cur(kpi?.won_value)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Win contribution</span>
                <span className="font-mono text-sm font-bold text-white">{isLoading ? "-" : `${wonRatio}%`}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-emerald-400 transition-all duration-700" style={{ width: `${Math.min(100, Math.max(0, wonRatio))}%` }} />
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-blue-600" />
              <h2 className="text-base font-bold text-slate-900">Order Health</h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">Kondisi order berdasarkan status penyelesaian</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="rounded-xl bg-blue-50 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500">Open</p>
              <p className="mt-1 font-mono text-xl font-bold text-blue-700">{num(kpi?.open_orders)}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Completed</p>
              <p className="mt-1 font-mono text-xl font-bold text-emerald-700">{num(kpi?.completed_orders)}</p>
            </div>
            <div className="rounded-xl bg-red-50 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-red-500">Overdue</p>
              <p className="mt-1 font-mono text-xl font-bold text-red-600">{num(kpi?.overdue_orders)}</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
