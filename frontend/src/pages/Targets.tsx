import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Target as TargetIcon, Trash2, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyRow, ErrorRow, PageHeader, TableSkeleton } from "@/components/Shared";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, apiDelete, apiGet, apiPost } from "@/lib/api";
import { formatIDR } from "@/lib/format";
import type { TargetOptions, TargetRow } from "@/lib/types";

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 6 }, (_, i) => currentYear + i);

type TargetType = "TEAM" | "PERSONAL";
type FormState = { target_type: TargetType; owner_id: string; target_value: string; notes: string };
const EMPTY: FormState = { target_type: "TEAM", owner_id: "", target_value: "", notes: "" };

const errorMessage = (e: unknown) =>
  e instanceof ApiError ? ((e.body as { detail?: string } | null)?.detail ?? "Terjadi kesalahan") : "Terjadi kesalahan";

export default function Targets() {
  const { isAdmin, isManager } = useAuth();
  const qc = useQueryClient();
  const canAccess = isAdmin || isManager;
  const [year, setYear] = useState(currentYear);
  const [type, setType] = useState<TargetType>("TEAM");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const { data: targets, isLoading, isError } = useQuery<TargetRow[]>({
    queryKey: ["targets", year],
    queryFn: () => apiGet<TargetRow[]>(`/targets?year=${year}`),
    enabled: canAccess,
    staleTime: 30_000,
  });
  const { data: options } = useQuery<TargetOptions>({
    queryKey: ["target-options"],
    queryFn: () => apiGet<TargetOptions>("/targets/options"),
    enabled: canAccess,
    staleTime: 5 * 60_000,
  });

  const visibleRows = useMemo(() => (targets ?? []).filter((r) => r.target_type === type), [targets, type]);
  const owners = type === "TEAM" ? (options?.managers ?? []) : (options?.sales ?? []);

  const save = useMutation({
    mutationFn: () => apiPost<TargetRow>("/targets", {
      year,
      target_type: form.target_type,
      owner_id: form.owner_id,
      target_value: Number(form.target_value.replace(/[^0-9]/g, "")),
      notes: form.notes || undefined,
    }),
    onSuccess: () => {
      toast.success("Target berhasil disimpan");
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["targets"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/targets/${id}`),
    onSuccess: () => {
      toast.success("Target dihapus");
      qc.invalidateQueries({ queryKey: ["targets"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const openCreate = (nextType: TargetType = type) => {
    setType(nextType);
    setForm({ ...EMPTY, target_type: nextType });
    setDialogOpen(true);
  };

  const edit = (row: TargetRow) => {
    setType(row.target_type);
    setForm({
      target_type: row.target_type,
      owner_id: row.owner_id,
      target_value: String(row.target_value),
      notes: row.notes ?? "",
    });
    setDialogOpen(true);
  };

  if (!canAccess) {
    return <div><PageHeader title="Target Penjualan" /><Card className="p-12 text-center"><p className="font-semibold">Akses ditolak</p><p className="mt-1 text-sm text-muted-foreground">Modul target hanya tersedia untuk Super Admin dan Sales Manager.</p></Card></div>;
  }

  return (
    <div>
      <PageHeader title="Target Penjualan" subtitle="Tetapkan target omzet tahunan untuk tim dan masing-masing sales.">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-9 rounded-md border border-input bg-background px-3 text-sm" data-testid="target-year">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <Button onClick={() => openCreate()} data-testid="btn-add-target"><Plus className="mr-2 h-4 w-4" /> Tambah Target</Button>
      </PageHeader>

      <div className="mb-5 grid gap-3 md:grid-cols-2">
        <button onClick={() => setType("TEAM")} className={`rounded-xl border p-4 text-left transition ${type === "TEAM" ? "border-blue-300 bg-blue-50 ring-2 ring-blue-100" : "border-border bg-white hover:bg-muted/40"}`} data-testid="target-tab-team">
          <div className="flex items-center gap-3"><span className="rounded-lg bg-blue-100 p-2 text-blue-700"><UsersRound className="h-5 w-5" /></span><div><p className="font-semibold">Target Tim</p><p className="text-xs text-muted-foreground">Target tahunan per Sales Manager / team.</p></div></div>
        </button>
        <button onClick={() => setType("PERSONAL")} className={`rounded-xl border p-4 text-left transition ${type === "PERSONAL" ? "border-violet-300 bg-violet-50 ring-2 ring-violet-100" : "border-border bg-white hover:bg-muted/40"}`} data-testid="target-tab-personal">
          <div className="flex items-center gap-3"><span className="rounded-lg bg-violet-100 p-2 text-violet-700"><TargetIcon className="h-5 w-5" /></span><div><p className="font-semibold">Target Personal</p><p className="text-xs text-muted-foreground">Target tahunan masing-masing Sales Executive.</p></div></div>
        </button>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3"><div><p className="text-sm font-semibold">{type === "TEAM" ? "Target Tim" : "Target Personal"} — {year}</p><p className="text-xs text-muted-foreground">{visibleRows.length} target terdaftar</p></div></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/20"><th className="px-4 py-3 text-left font-semibold">Pemilik Target</th>{type === "PERSONAL" && <th className="px-4 py-3 text-left font-semibold">Manager</th>}<th className="px-4 py-3 text-right font-semibold">Target Tahunan</th><th className="px-4 py-3 text-left font-semibold">Catatan</th><th className="px-4 py-3 text-right font-semibold">Aksi</th></tr></thead>
            <tbody>
              {isLoading ? <TableSkeleton cols={type === "PERSONAL" ? 5 : 4} /> : isError ? <ErrorRow colSpan={type === "PERSONAL" ? 5 : 4} /> : visibleRows.length === 0 ? <EmptyRow colSpan={type === "PERSONAL" ? 5 : 4} message={`Belum ada target ${type === "TEAM" ? "tim" : "personal"} untuk ${year}.`} /> : visibleRows.map((row) => (
                <tr key={row.target_id} className="border-b last:border-0 hover:bg-muted/20" data-testid={`target-row-${row.target_id}`}>
                  <td className="px-4 py-3"><p className="font-semibold">{row.owner_name}</p><p className="font-mono text-[11px] text-muted-foreground">{row.owner_id}</p></td>
                  {type === "PERSONAL" && <td className="px-4 py-3 text-xs text-muted-foreground">{row.manager_name ?? "-"}</td>}
                  <td className="px-4 py-3 text-right font-mono font-semibold">{formatIDR(row.target_value)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{row.notes ?? "-"}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap"><Button variant="ghost" size="sm" onClick={() => edit(row)} data-testid={`btn-edit-target-${row.target_id}`}><Pencil className="mr-1 h-3.5 w-3.5" /> Edit</Button><Button variant="ghost" size="icon-sm" onClick={() => remove.mutate(row.target_id)} title="Hapus" data-testid={`btn-delete-target-${row.target_id}`}><Trash2 className="h-4 w-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{form.target_type === "TEAM" ? "Target Tim" : "Target Personal"} — {year}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div><Label htmlFor="target-type">Jenis Target</Label><select id="target-type" value={form.target_type} onChange={(e) => { const next = e.target.value as TargetType; setType(next); setForm({ ...form, target_type: next, owner_id: "" }); }} className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="TEAM">Target Tim</option><option value="PERSONAL">Target Personal</option></select></div>
            <div><Label htmlFor="target-owner">{form.target_type === "TEAM" ? "Sales Manager / Tim" : "Sales Executive"}</Label><select id="target-owner" value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })} className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm" data-testid="target-owner"><option value="">— Pilih —</option>{owners.map((o) => <option key={o.user_id} value={o.user_id}>{o.name} ({o.user_id})</option>)}</select></div>
            <div><Label htmlFor="target-value">Target Tahunan (Rp)</Label><Input id="target-value" inputMode="numeric" value={form.target_value} onChange={(e) => setForm({ ...form, target_value: e.target.value })} placeholder="Contoh: 5000000000" className="mt-1.5" data-testid="target-value" /><p className="mt-1 text-[11px] text-muted-foreground">Masukkan angka tanpa titik atau simbol Rp.</p></div>
            <div><Label htmlFor="target-notes">Catatan (opsional)</Label><Input id="target-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1.5" data-testid="target-notes" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button><Button onClick={() => save.mutate()} disabled={!form.owner_id || !form.target_value || save.isPending} data-testid="btn-save-target">{save.isPending ? "Menyimpan..." : "Simpan Target"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
