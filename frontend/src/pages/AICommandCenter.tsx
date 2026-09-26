import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CircleDollarSign,
  MessageCircle,
  Presentation,
  RefreshCw,
  Send,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPost } from "@/lib/api";
import { formatCompactIDR } from "@/lib/format";

interface StaleCustomer {
  customer_id: string;
  customer: string;
  pic: string;
  sales: string;
  last_activity?: string | null;
  days_since_contact: number;
}

interface PipelineRisk {
  opportunity_id: string;
  opportunity: string;
  customer?: string | null;
  sales?: string | null;
  stage: string;
  value: number;
  days_stale: number;
  expected_close_date?: string | null;
  reason: string;
}

interface Overview {
  configured: boolean;
  model: string;
  as_of: string;
  kpi: {
    active_customers: number;
    open_pipeline: number;
    weighted_pipeline: number;
    won_pipeline: number;
    quotations: number;
    purchase_orders: number;
  };
  pipeline_by_stage: Record<string, { count: number; value: number; weighted_value: number }>;
  stale_customers: StaleCustomer[];
  pipeline_risks: PipelineRisk[];
  presentation_recommendations: string[];
  suggested_questions: string[];
}

interface ChatItem {
  role: "user" | "assistant";
  content: string;
}

interface ChatResponse {
  answer: string;
  configured: boolean;
  model?: string | null;
}

function Metric({ label, value, icon, tone = "blue" }: { label: string; value: string; icon: React.ReactNode; tone?: "blue" | "amber" | "violet" | "green" }) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    violet: "bg-violet-50 text-violet-600",
    green: "bg-emerald-50 text-emerald-600",
  }[tone];
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">{label}</p>
          <p className="mt-1.5 truncate text-xl font-bold tracking-tight text-slate-900">{value}</p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>{icon}</div>
      </div>
    </div>
  );
}

export default function AICommandCenter() {
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [sending, setSending] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<Overview>({
    queryKey: ["ai-command-center-overview"],
    queryFn: () => apiGet<Overview>("/ai-command-center/overview"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const stageRows = useMemo(() => Object.entries(data?.pipeline_by_stage ?? {}).sort((a, b) => b[1].value - a[1].value), [data]);
  const ask = async (text?: string) => {
    const question = (text ?? message).trim();
    if (!question || sending) return;
    const nextChat = [...chat, { role: "user" as const, content: question }];
    setChat(nextChat);
    setMessage("");
    setSending(true);
    try {
      const result = await apiPost<ChatResponse>("/ai-command-center/chat", {
        message: question,
        history: chat.slice(-8),
      });
      setChat([...nextChat, { role: "assistant", content: result.answer }]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI tidak dapat menjawab saat ini");
      setChat(chat);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <section className="relative overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 via-sky-50 to-indigo-100 px-6 py-6 shadow-sm md:px-8 md:py-7">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-blue-200/40 blur-3xl" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/75 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.13em] text-blue-700 shadow-sm">
              <Sparkles className="h-3 w-3" /> AI Sales Intelligence
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950 md:text-[34px]">AI Command Center</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Tanya kondisi sales pipeline, cari customer yang lama belum di-follow-up, temukan risiko opportunity, dan siapkan bahan presentasi untuk manajemen.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`rounded-xl border px-3 py-2 text-xs font-semibold ${data?.configured ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
              {data?.configured ? `AI aktif • ${data.model}` : "AI provider belum dikonfigurasi"}
            </div>
            <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching} className="rounded-xl bg-white/80">
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </section>

      {isError ? (
        <Card className="rounded-2xl border-red-200 bg-red-50 p-5 text-sm text-red-700">
          <p className="font-semibold">Data AI Command Center gagal dimuat.</p>
          <p className="mt-1 text-xs text-red-600">{error instanceof Error ? error.message : "Silakan refresh."}</p>
        </Card>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric label="Open Pipeline" value={isLoading ? "-" : formatCompactIDR(data?.kpi.open_pipeline)} icon={<CircleDollarSign className="h-5 w-5" />} />
            <Metric label="Weighted Pipeline" value={isLoading ? "-" : formatCompactIDR(data?.kpi.weighted_pipeline)} icon={<Sparkles className="h-5 w-5" />} tone="violet" />
            <Metric label="Active Customer" value={isLoading ? "-" : String(data?.kpi.active_customers ?? 0)} icon={<UsersRound className="h-5 w-5" />} />
            <Metric label="Follow-up Lama" value={isLoading ? "-" : String(data?.stale_customers.length ?? 0)} icon={<UserRound className="h-5 w-5" />} tone="amber" />
            <Metric label="Pipeline Risk" value={isLoading ? "-" : String(data?.pipeline_risks.length ?? 0)} icon={<AlertTriangle className="h-5 w-5" />} tone="green" />
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <Card className="rounded-2xl border-slate-200/80 bg-white p-5 shadow-sm md:p-6">
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Bot className="h-4 w-4" /></div><h2 className="text-sm font-bold text-slate-900">Ask Sales AI</h2></div>
                  <p className="mt-2 text-xs text-slate-500">AI hanya menggunakan data CRM yang dapat dilihat oleh user yang sedang login.</p>
                </div>
              </div>
              <div className="mb-4 min-h-[270px] max-h-[440px] space-y-3 overflow-y-auto rounded-2xl bg-slate-50/80 p-3">
                {chat.length === 0 ? (
                  <div className="flex h-[245px] flex-col items-center justify-center px-6 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm ring-1 ring-slate-200"><MessageCircle className="h-5 w-5" /></div>
                    <p className="mt-3 text-sm font-semibold text-slate-700">Apa yang ingin Anda ketahui?</p>
                    <p className="mt-1 max-w-md text-xs leading-5 text-slate-400">Contoh: “Mana customer yang belum saya follow-up?” atau “Buatkan summary pipeline untuk presentasi manajemen.”</p>
                  </div>
                ) : chat.map((item, index) => (
                  <div key={`${item.role}-${index}`} className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${item.role === "user" ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-700 shadow-sm"}`}>
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider opacity-60">{item.role === "user" ? "Anda" : "AI Sales Assistant"}</div>
                      <div className="whitespace-pre-wrap">{item.content}</div>
                    </div>
                  </div>
                ))}
                {sending && <div className="flex justify-start"><div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-400 shadow-sm">AI sedang menganalisis pipeline...</div></div>}
              </div>
              <div className="flex items-end gap-2">
                <Textarea value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(); } }} placeholder="Tanyakan tentang pipeline, customer, follow-up, forecast..." rows={3} className="min-h-[82px] resize-none rounded-xl bg-white" />
                <Button onClick={() => void ask()} disabled={!message.trim() || sending} className="h-[82px] w-12 shrink-0 rounded-xl bg-blue-600 hover:bg-blue-700" aria-label="Kirim pertanyaan">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(data?.suggested_questions ?? []).slice(0, 4).map((q) => <button key={q} type="button" onClick={() => void ask(q)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">{q}</button>)}
              </div>
            </Card>

            <Card className="rounded-2xl border-slate-200/80 bg-white p-5 shadow-sm md:p-6">
              <div className="mb-5 flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><AlertTriangle className="h-4 w-4" /></div><div><h2 className="text-sm font-bold text-slate-900">Pipeline yang Perlu Perhatian</h2><p className="text-xs text-slate-500">Stagnan ≥ 14 hari atau target close sudah lewat.</p></div></div>
              <div className="space-y-2.5">
                {(data?.pipeline_risks ?? []).length === 0 && <p className="py-10 text-center text-sm text-slate-400">Tidak ada risiko yang terdeteksi.</p>}
                {(data?.pipeline_risks ?? []).map((risk) => (
                  <div key={risk.opportunity_id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-800">{risk.opportunity}</p><p className="mt-0.5 truncate text-[11px] text-slate-500">{risk.customer || "-"} • {risk.sales || "-"}</p></div><span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700">{risk.stage}</span></div>
                    <div className="mt-2 flex items-center justify-between text-[11px]"><span className="font-semibold text-slate-600">{formatCompactIDR(risk.value)}</span><span className="text-slate-400">{risk.reason}</span></div>
                  </div>
                ))}
              </div>
            </Card>
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <Card className="rounded-2xl border-slate-200/80 bg-white p-5 shadow-sm md:p-6">
              <div className="mb-5 flex items-center justify-between"><div><div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><UserRound className="h-4 w-4" /></div><h2 className="text-sm font-bold text-slate-900">Customer Lama Tidak Di-follow-up</h2></div><p className="mt-2 text-xs text-slate-500">Batas awal: 14 hari sejak aktivitas terakhir.</p></div><span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">{data?.stale_customers.length ?? 0} customer</span></div>
              <div className="space-y-2">
                {(data?.stale_customers ?? []).length === 0 && <p className="py-10 text-center text-sm text-slate-400">Semua customer terlihat masih ter-follow-up.</p>}
                {(data?.stale_customers ?? []).map((customer) => (
                  <div key={customer.customer_id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-3">
                    <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{customer.customer}</p><p className="mt-0.5 truncate text-[11px] text-slate-500">{customer.pic} • Sales: {customer.sales}</p></div>
                    <div className="shrink-0 text-right"><p className="text-sm font-bold text-amber-600">{customer.days_since_contact} hari</p><p className="text-[10px] text-slate-400">tanpa activity</p></div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="rounded-2xl border-slate-200/80 bg-white p-5 shadow-sm md:p-6">
              <div className="mb-5 flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600"><Presentation className="h-4 w-4" /></div><div><h2 className="text-sm font-bold text-slate-900">Rekomendasi Presentasi Manajemen</h2><p className="text-xs text-slate-500">Struktur yang bisa langsung dipakai Sales Manager.</p></div></div>
              <div className="space-y-2.5">
                {(data?.presentation_recommendations ?? []).map((item, index) => (
                  <div key={item} className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-violet-600 ring-1 ring-slate-200">{index + 1}</div>
                    <p className="text-xs leading-5 text-slate-600">{item}</p>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="mt-4 w-full rounded-xl" onClick={() => void ask("Buatkan draft presentasi sales pipeline untuk manajemen berdasarkan data CRM saat ini. Susun menjadi: Executive Summary, Pipeline Overview, Top Opportunities, Risk & Stagnant Deals, Customer Follow-up, Forecast, Gap terhadap target jika tersedia, dan Action Plan. Gunakan angka CRM dan jangan mengarang data.")}>
                <Presentation className="mr-2 h-4 w-4" /> Generate Draft Presentasi dengan AI <ArrowRight className="ml-auto h-4 w-4" />
              </Button>
            </Card>
          </section>

          <Card className="rounded-2xl border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600"><Sparkles className="h-4 w-4" /></div><div><h2 className="text-sm font-bold text-slate-900">Pipeline by Stage</h2><p className="text-xs text-slate-500">Ringkasan cepat posisi opportunity saat ini.</p></div></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {stageRows.map(([stage, row]) => <div key={stage} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5"><div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-700">{stage}</span><span className="text-[10px] text-slate-400">{row.count} deal</span></div><p className="mt-2 text-sm font-bold text-slate-900">{formatCompactIDR(row.value)}</p><p className="mt-0.5 text-[10px] text-slate-400">Weighted {formatCompactIDR(row.weighted_value)}</p></div>)}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
