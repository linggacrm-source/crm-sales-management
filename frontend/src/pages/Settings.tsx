import { Card } from "@/components/ui/card";
import { PageHeader, RoleBadge } from "@/components/Shared";
import { useAuth } from "@/hooks/useAuth";

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

export default function Settings() {
  const { user } = useAuth();

  return (
    <div>
      <PageHeader title="Pengaturan Sistem" subtitle="Profil, matriks izin, dan strategi performa yang diterapkan" />

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

        <Card className="overflow-hidden p-0 lg:col-span-2" data-testid="card-permission-matrix">
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
      </div>

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
