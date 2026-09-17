import { useMutation } from "@tanstack/react-query";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, RoleBadge } from "@/components/Shared";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, apiPost } from "@/lib/api";
import { endSession } from "@/lib/session";

const MATRIX: { module: string; admin: string; manager: string; sales: string }[] = [
  { module: "Dashboard", admin: "Semua data", manager: "Data team", sales: "Data sendiri" },
  { module: "Customers", admin: "Kelola semua", manager: "Lihat team", sales: "Kelola milik sendiri" },
  { module: "Sales Pipeline", admin: "Kelola semua", manager: "Lihat team", sales: "Kelola milik sendiri" },
  { module: "Aktivitas", admin: "Kelola semua", manager: "Lihat team", sales: "Input milik sendiri" },
  { module: "Quotations", admin: "Kelola semua", manager: "Lihat team", sales: "Buat & kelola sendiri" },
  { module: "Purchase Orders", admin: "Kelola semua", manager: "Lihat team", sales: "Input milik sendiri" },
  { module: "Order Monitoring", admin: "Kelola semua", manager: "Lihat team", sales: "Lihat & update sendiri" },
  { module: "Sales Team", admin: "Semua sales", manager: "Sales di bawahnya", sales: "Diri sendiri" },
  { module: "Users", admin: "Kelola penuh", manager: "Lihat team", sales: "Tidak ada akses" },
  { module: "Products", admin: "Kelola penuh", manager: "Lihat", sales: "Lihat" },
  { module: "Audit Log", admin: "Lihat penuh", manager: "Lihat", sales: "Tidak ada akses" },
];

const PERFORMANCE = [
  "Server-side pagination (LIMIT/OFFSET) pada seluruh endpoint list, default 25 baris per halaman.",
  "Pencarian & filter dieksekusi di MongoDB, bukan di browser.",
  "Index dibuat otomatis saat startup untuk user_id, email, role, manager_id, customer_id, sales_id, po_number, status, eta, created_date.",
  "Dashboard & KPI memakai aggregation ($group / $sum / count) — respons hanya berisi angka.",
  "Nama customer/sales/produk didenormalisasi ke dokumen transaksi sehingga tidak ada N+1 query.",
  "Projection ketat: endpoint tabel hanya mengirim kolom yang ditampilkan.",
  "Customer Detail memakai lazy loading — tab transaksi baru fetch saat dibuka.",
  "Master data (products, users, customers options) di-cache 10 menit di client.",
  "Skeleton loading di setiap tabel dan KPI, tidak ada halaman kosong.",
];

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative mt-1.5">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className="pr-11"
          required
          minLength={8}
          data-testid={id}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition hover:text-foreground"
          aria-label={visible ? `Sembunyikan ${label.toLowerCase()}` : `Tampilkan ${label.toLowerCase()}`}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const changePassword = useMutation({
    mutationFn: () =>
      apiPost<{ ok: boolean; message: string }>("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      }),
    onSuccess: async (result) => {
      // The backend invalidates the session cookie after a credential change.
      // Clear the client cache as well, then require a fresh login with the new password.
      await endSession();
      toast.success(result.message ?? "Password berhasil diubah. Silakan login kembali.");
      navigate("/login", { replace: true });
    },
    onError: (err) => {
      const detail = err instanceof ApiError ? (err.body as { detail?: string })?.detail : null;
      toast.error(detail ?? "Password gagal diubah. Silakan coba lagi.");
    },
  });

  const submitPasswordChange = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Password baru minimal 8 karakter");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Konfirmasi password baru tidak cocok");
      return;
    }
    if (newPassword === currentPassword) {
      toast.error("Password baru harus berbeda dari password saat ini");
      return;
    }
    changePassword.mutate();
  };

  return (
    <div>
      <PageHeader title="Pengaturan Sistem" subtitle="Profil, keamanan akun, matriks izin, dan strategi performa" />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5" data-testid="card-profile">
          <h2 className="mb-4 text-sm font-semibold tracking-wider uppercase">Profil Saya</h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-[11px] tracking-wider text-muted-foreground uppercase">User ID</dt>
              <dd className="font-mono font-semibold">{user?.user_id}</dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-wider text-muted-foreground uppercase">Nama</dt>
              <dd className="font-semibold">{user?.name}</dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-wider text-muted-foreground uppercase">Email</dt>
              <dd className="break-all">{user?.email}</dd>
            </div>
            <div>
              <dt className="mb-1 text-[11px] tracking-wider text-muted-foreground uppercase">Role</dt>
              <dd>{user && <RoleBadge role={user.role} />}</dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-wider text-muted-foreground uppercase">Manager ID</dt>
              <dd className="font-mono">{user?.manager_id ?? "-"}</dd>
            </div>
          </dl>
        </Card>

        <Card className="p-5 lg:col-span-2" data-testid="card-change-password">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Keamanan Akun</h2>
              <p className="mt-1 text-xs text-muted-foreground">Ganti password akun Anda kapan saja tanpa bantuan administrator.</p>
            </div>
          </div>

          <form onSubmit={submitPasswordChange} className="grid gap-4 md:grid-cols-3">
            <PasswordField
              id="input-current-password"
              label="Password saat ini"
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
            />
            <PasswordField
              id="input-new-password"
              label="Password baru"
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
            />
            <PasswordField
              id="input-confirm-password"
              label="Konfirmasi password baru"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
            />
            <div className="flex items-center justify-between gap-3 border-t border-border pt-4 md:col-span-3">
              <p className="text-xs text-muted-foreground">Minimal 8 karakter. Setelah berhasil, Anda akan diminta login kembali.</p>
              <Button type="submit" disabled={changePassword.isPending} data-testid="btn-change-password">
                {changePassword.isPending ? "Menyimpan..." : "Ganti Password"}
              </Button>
            </div>
          </form>
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden p-0 lg:col-span-2" data-testid="card-permission-matrix">
        <div className="border-b border-border bg-muted/40 px-4 py-3">
          <h2 className="text-sm font-semibold">Matriks Role & Permission</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-[11px] tracking-wider uppercase">
                <th className="px-4 py-2 text-left">Modul</th>
                <th className="px-4 py-2 text-left">Super Admin</th>
                <th className="px-4 py-2 text-left">Sales Manager</th>
                <th className="px-4 py-2 text-left">Sales</th>
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((m) => (
                <tr key={m.module} className="border-b border-border/70" data-testid={`matrix-row-${m.module}`}>
                  <td className="px-4 py-2 font-semibold">{m.module}</td>
                  <td className="px-4 py-2 text-muted-foreground">{m.admin}</td>
                  <td className="px-4 py-2 text-muted-foreground">{m.manager}</td>
                  <td className="px-4 py-2 text-muted-foreground">{m.sales}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-4 p-5" data-testid="card-performance-strategy">
        <h2 className="mb-3 text-sm font-semibold tracking-wider uppercase">Strategi Performa</h2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {PERFORMANCE.map((p) => (
            <li key={p} className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              {p}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
