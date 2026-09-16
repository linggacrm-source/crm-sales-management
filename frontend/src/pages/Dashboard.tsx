import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  FileText,
  Filter,
  PackageCheck,
  RefreshCw,
  ShoppingBag,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/Shared";
import { apiGet } from "@/lib/api";
import { formatCompactIDR, formatNumber } from "@/lib/format";
import type { CustomerOption, DashboardResponse, SalesOption } from "@/lib/types";

const PERIODS = [
  { value: "30d", label: "30 hari terakhir" },
  { value: "90d", label: "90 hari terakhir" },
  { value: "365d", label: "1 tahun terakhir" },
];

const STAGES = ["Lead", "Qualification", "Proposal", "Negotiation"];

const STAGE_DOTS: Record<string, string> = {
  Lead: "bg-slate-400",
  Qualification: "bg-sky-500",
  Proposal: "bg-blue-600",
  Negotiation: "bg-violet-500",
  Won: "bg-emerald-500",
  Lost: "bg-rose-500",
};

const STAGE_COLORS: Record<string, string> = {
  Lead: "bg-slate-400",
  Qualification: "bg-sky-500",
  Proposal: "bg-blue-600",
  Negotiation: "bg-violet-500",
  Won: "bg-emerald-500",
  Lost: "bg-rose-500",
};

function KpiCard({ title, value, caption, icon, tone = "blue", loading, testId }: {
  title: string;
  value: string;
  caption?: string;
  icon: React.ReactNode;
  tone?: "blue" | "green" | "violet" | "amber";
  loading?: boolean;
  testId: string;
}) {
  const tones = {
    blue: { icon: "bg-blue-50 text-blue-600", accent: "bg-blue-600" },
    green: { icon: "bg-emerald-50 text-emerald-600", accent: "bg-emerald-500" },
    violet: { icon: "bg-violet-50 text-violet-600", accent: "bg-violet-500" },
    amber: { icon: "bg-amber-50 text-amber-600", accent: "bg-amber-500" },
  };
  const style = tones[tone];
  return (
    <Card data-testid={testId} className="group relative overflow-hidden rounded-2xl border-slate-200/80 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{title}</p>
          {loading ? <div className="mt-3 h-8 w-32 animate-pulse rounded-lg bg-slate-100" /> : <p className="mt-2 truncate text-[27px] font-bold tracking-tight text-slate-950">{value}</p>}
          {caption && <p className="mt-1.5 text-xs text-slate-500">{caption}</p>}
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${style.icon} transition-transform group-hover:scale-105`}>{icon}</div>
      </div>
      <div className={`absolute bottom-0 left-0 h-[3px] w-full ${style.accent} opacity-0 transition-opacity group-hover:opacity-100`} />
    </Card>
  );
}

function MiniMetric({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone: "neutral" | "green" | "red" }) {
  const classes = tone === "green" ? "bg-emerald-50 text-emerald-600" : tone === "red" ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-600";
  return <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-3"><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${classes}`}>{icon}</div><div className="min-w-0"><p className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-0.5 text-sm font-bold text-slate-800">{value}</p></div></div>;
}

function PipelineChart({ bars, loading }: { bars: DashboardResponse["pipeline_by_stage"]; loading: boolean }) {
  if (loading) return <div className="space-y-5 pt-3">{[70, 48, 82, 58].map((width) => <div key={width} className="space-y-2"><div className="flex justify-between"><div className="h-3 w-24 animate-pulse rounded bg-slate-100" /><div className="h-3 w-16 animate-pulse rounded bg-slate-100" /></div><div className="h-2.5 animate-pulse rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-200" style={{ width: `${width}%` }} /></div></div>)}</div>;
  if (!bars.length) return <div className="flex h-64 items-center justify-center text-sm text-slate-400">Belum ada data pipeline.</div>;
  const maxValue = Math.max(1, ...bars.map((item) => item.value));
  const total = bars.reduce((sum, item) => sum + item.value, 0);
  return <div className="space-y-5 pt-2">{bars.map((item) => { const width = Math.max(2, (item.value / maxValue) * 100); const share = total > 0 ? Math.round((item.value / total) * 100) : 0; return <div key={item.stage} className="group" data-testid={`pipeline-stage-${item.stage.toLowerCase()}`}><div className="mb-2 flex items-center justify-between gap-4"><div className="flex min-w-0 items-center gap-2.5"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STAGE_DOTS[item.stage] ?? "bg-blue-600"}`} /><span className="truncate text-sm font-semibold text-slate-700">{item.stage}</span><span className="text-xs text-slate-400">{item.count} deal</span></div><div className="flex shrink-0 items-center gap-2"><span className="text-[11px] font-semibold text-slate-400">{share}%</span><span className="font-mono text-xs font-bold text-slate-700">{formatCompactIDR(item.value)}</span></div></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${STAGE_COLORS[item.stage] ?? "bg-blue-600"} transition-all duration-700 group-hover:brightness-110`} style={{ width: `${width}%` }} /></div></div>; })}</div>;
}

function StageDistribution({ bars, loading }: { bars: DashboardResponse["pipeline_by_stage"]; loading: boolean }) {
  const total = bars.reduce((sum, item) => sum + item.value, 0);
  if (loading) return <div className="mx-auto h-36 w-36 animate-pulse rounded-full border-[22px] border-slate-100" />;
  if (!bars.length || total <= 0) return <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-full border-[22px] border-slate-100 text-xs text-slate-400">No data</div>;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const colors: Record<string, string> = { Lead: "#94a3b8", Qualification: "#0ea5e9", Proposal: "#2563eb", Negotiation: "#8b5cf6", Won: "#10b981", Lost: "#f43f5e" };
  return <div className="relative mx-auto h-40 w-40"><svg viewBox="0 0 140 140" className="h-full w-full -rotate-90"><circle cx="70" cy="70" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="18" />{bars.map((item) => { const dash = (item.value / total) * circumference; const segment = <circle key={item.stage} cx="70" cy="70" r={radius} fill="none" stroke={colors[item.stage] ?? "#2563eb"} strokeWidth="18" strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-offset} className="transition-all duration-700" />; offset += dash; return segment; })}</svg><div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-2xl font-bold tracking-tight text-slate-900">{bars.reduce((sum, item) => sum + item.count, 0)}</span><span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Deals</span></div></div>;
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
  const { data, isLoading, isError, refetch, isFetching } = useQuery<DashboardResponse>({ queryKey: ["dashboard", qs], queryFn: () => apiGet<DashboardResponse>(`/dashboard${qs ? `?${qs}` : ""}`), staleTime: 60_000 });
  const { data: salesOptions } = useQuery<SalesOption[]>({ queryKey: ["user-options"], queryFn: () => apiGet<SalesOption[]>("/users/options"), staleTime: 10 * 60_000 });
  const { data: customerOptions } = useQuery<CustomerOption[]>({ queryKey: ["customer-options"], queryFn: () => apiGet<CustomerOption[]>("/customers/options"), staleTime: 10 * 60_000 });
  const kpi = isError ? null : data?.kpi;
  const bars = isError ? [] : (data?.pipeline_by_stage ?? []);
  const num = (v?: number) => (kpi ? formatNumber(v) : "-");
  const cur = (v?: number) => (kpi ? formatCompactIDR(v) : "-");
  const totalPipeline = bars.reduce((sum, item) => sum + item.value, 0);
  const wonRatio = totalPipeline > 0 && kpi?.won_value ? Math.round((kpi.won_value / totalPipeline) * 100) : 0;
  const activeFilters = [period, salesId, stage, customerId].filter(Boolean).length;
  const resetFilters = () => { setPeriod(""); setSalesId(""); setStage(""); setCustomerId(""); };

  return <div className="space-y-6 pb-10">
    <section className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div><div className="mb-2 flex items-center gap-2 text-blue-600"><BarChart3 className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-[0.14em]">Sales Intelligence</span></div><h1 className="text-3xl font-bold tracking-tight text-slate-950 md:text-[34px]">Dashboard</h1><p className="mt-1.5 max-w-2xl text-sm text-slate-500">Pantau performa sales, pipeline, quotation, dan order dari satu workspace.</p></div>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"><div className="hidden items-center gap-2 px-2 text-xs font-semibold text-slate-400 sm:flex"><Filter className="h-3.5 w-3.5" /> Filter</div><FilterSelect value={period} onChange={setPeriod} options={PERIODS} placeholder="Semua periode" testId="filter-period" /><FilterSelect value={salesId} onChange={setSalesId} options={(salesOptions ?? []).map((s) => ({ value: s.user_id, label: s.name }))} placeholder="Semua sales" testId="filter-sales" /><FilterSelect value={stage} onChange={setStage} options={STAGES.map((s) => ({ value: s, label: s }))} placeholder="Semua stage" testId="filter-stage" /><FilterSelect value={customerId} onChange={setCustomerId} options={(customerOptions ?? []).map((c) => ({ value: c.customer_id, label: c.customer_name }))} placeholder="Semua customer" testId="filter-customer" />{activeFilters > 0 && <button type="button" onClick={resetFilters} className="rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-800">Reset {activeFilters}</button>}<Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9 rounded-lg text-slate-500 hover:bg-slate-100" title="Refresh dashboard" aria-label="Refresh dashboard"><RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /></Button></div>
    </section>

    <section className="relative overflow-hidden rounded-2xl border border-blue-100/80 bg-gradient-to-br from-blue-50 via-sky-50 to-indigo-100 px-6 py-6 text-slate-900 shadow-md md:px-8 md:py-7"><div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-blue-200/70 via-sky-100/20 to-transparent" /><div className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-blue-200/30 blur-3xl" /><div className="relative grid gap-7 lg:grid-cols-[1fr_auto] lg:items-center"><div><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-blue-700 shadow-sm"><TrendingUp className="h-3.5 w-3.5" /> Business performance</div><h2 className="max-w-2xl text-xl font-bold tracking-tight text-slate-900 md:text-2xl">Business performance at a glance</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Gunakan pipeline dan indikator operasional untuk memprioritaskan follow-up, quotation, dan delivery.</p></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:w-[440px]"><div className="rounded-xl border border-blue-100/80 bg-white/65 p-3 shadow-sm backdrop-blur-sm"><p className="text-[10px] uppercase tracking-wider text-slate-500">Customers</p><p className="mt-1 text-lg font-bold text-slate-900">{num(kpi?.total_customers)}</p></div><div className="rounded-xl border border-blue-100/80 bg-white/65 p-3 shadow-sm backdrop-blur-sm"><p className="text-[10px] uppercase tracking-wider text-slate-500">Pipeline</p><p className="mt-1 text-lg font-bold text-slate-900">{cur(kpi?.open_pipeline)}</p></div><div className="rounded-xl border border-blue-100/80 bg-white/65 p-3 shadow-sm backdrop-blur-sm"><p className="text-[10px] uppercase tracking-wider text-slate-500">Won</p><p className="mt-1 text-lg font-bold text-slate-900">{cur(kpi?.won_value)}</p></div><div className="rounded-xl border border-blue-100/80 bg-white/65 p-3 shadow-sm backdrop-blur-sm"><p className="text-[10px] uppercase tracking-wider text-slate-500">Overdue</p><p className="mt-1 text-lg font-bold text-amber-600">{num(kpi?.overdue_orders)}</p></div></div></div></section>

    <section><div className="mb-3"><h2 className="text-sm font-bold text-slate-900">Business Snapshot</h2><p className="mt-0.5 text-xs text-slate-500">Metrik utama yang perlu dipantau</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><KpiCard testId="kpi-total-customers" title="Total Customer" value={num(kpi?.total_customers)} caption="Customer dalam database CRM" icon={<Users className="h-5 w-5" />} loading={isLoading} /><KpiCard testId="kpi-open-pipeline" title="Open Pipeline" value={cur(kpi?.open_pipeline)} caption="Total value deal yang berjalan" icon={<TrendingUp className="h-5 w-5" />} tone="blue" loading={isLoading} /><KpiCard testId="kpi-weighted-pipeline" title="Weighted Pipeline" value={cur(kpi?.weighted_pipeline)} caption="Value berdasarkan probability" icon={<Target className="h-5 w-5" />} tone="violet" loading={isLoading} /><KpiCard testId="kpi-won-value" title="Won Value" value={cur(kpi?.won_value)} caption={wonRatio ? `${wonRatio}% dari open pipeline` : "Deal berhasil"} icon={<Award className="h-5 w-5" />} tone="green" loading={isLoading} /></div></section>

    <section className="grid gap-5 xl:grid-cols-[1.65fr_1fr]"><Card className="rounded-2xl border-slate-200/80 bg-white p-5 shadow-sm md:p-6"><div className="mb-6 flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><TrendingUp className="h-4 w-4" /></div><h2 className="text-sm font-bold text-slate-900">Pipeline by Stage</h2></div><p className="mt-2 text-xs text-slate-500">Nilai pipeline berdasarkan tahap penjualan.</p></div><div className="text-right"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total Pipeline</p><p className="mt-1 font-mono text-sm font-bold text-slate-800">{cur(totalPipeline)}</p></div></div><PipelineChart bars={bars} loading={isLoading} /></Card><Card className="rounded-2xl border-slate-200/80 bg-white p-5 shadow-sm md:p-6"><div className="mb-5"><div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600"><BarChart3 className="h-4 w-4" /></div><h2 className="text-sm font-bold text-slate-900">Stage Distribution</h2></div><p className="mt-2 text-xs text-slate-500">Komposisi value pipeline saat ini.</p></div><StageDistribution bars={bars} loading={isLoading} /><div className="mt-5 space-y-2.5">{bars.slice(0, 5).map((item) => <div key={item.stage} className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${STAGE_DOTS[item.stage] ?? "bg-blue-600"}`} /><span className="min-w-0 flex-1 truncate text-xs text-slate-500">{item.stage}</span><span className="font-mono text-xs font-semibold text-slate-700">{totalPipeline ? Math.round((item.value / totalPipeline) * 100) : 0}%</span></div>)}</div></Card></section>

    <section><div className="mb-3"><h2 className="text-sm font-bold text-slate-900">Operational Health</h2><p className="mt-0.5 text-xs text-slate-500">Ringkasan aktivitas dan order.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MiniMetric label="Quotation" value={num(kpi?.total_quotations)} icon={<FileText className="h-4 w-4" />} tone="neutral" /><MiniMetric label="Purchase Order" value={`${num(kpi?.total_po)} · ${cur(kpi?.po_value)}`} icon={<ShoppingBag className="h-4 w-4" />} tone="neutral" /><MiniMetric label="Activities" value={num(kpi?.activities)} icon={<Activity className="h-4 w-4" />} tone="green" /><MiniMetric label="Completed Orders" value={num(kpi?.completed_orders)} icon={<CheckCircle2 className="h-4 w-4" />} tone="green" /><MiniMetric label="Open Orders" value={num(kpi?.open_orders)} icon={<PackageCheck className="h-4 w-4" />} tone="neutral" /><MiniMetric label="Overdue Orders" value={num(kpi?.overdue_orders)} icon={<AlertTriangle className="h-4 w-4" />} tone="red" /><MiniMetric label="Won Value" value={cur(kpi?.won_value)} icon={<CircleDollarSign className="h-4 w-4" />} tone="green" /><MiniMetric label="Weighted Pipeline" value={cur(kpi?.weighted_pipeline)} icon={<Target className="h-4 w-4" />} tone="neutral" /></div></section>

    {isError && <Card className="rounded-2xl border-rose-200 bg-rose-50/60 p-4"><div className="flex items-center gap-3"><AlertTriangle className="h-5 w-5 text-rose-500" /><div className="flex-1"><p className="text-sm font-semibold text-rose-800">Dashboard belum dapat memuat data.</p><p className="mt-0.5 text-xs text-rose-600">Periksa koneksi lalu coba refresh kembali.</p></div><Button variant="outline" size="sm" onClick={() => refetch()} className="border-rose-200 bg-white text-rose-700 hover:bg-rose-50">Coba lagi<ChevronRight className="ml-1 h-4 w-4" /></Button></div></Card>}
  </div>;
}
