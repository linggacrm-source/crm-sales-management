import { useMutation } from "@tanstack/react-query";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import type { Me } from "@/lib/types";

const DEMO = [
  { label: "Super Admin", email: "admin@crm.co.id" },
  { label: "Sales Manager", email: "manager@crm.co.id" },
  { label: "Sales", email: "sales1@crm.co.id" },
];

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@crm.co.id");
  const [password, setPassword] = useState("Password123");

  const login = useMutation({
    mutationFn: () => apiPost<Me>("/auth/login", { email, password }),
    onSuccess: (me) => {
      beginSession();
      toast.success(`Selamat datang, ${me.name}`);
      navigate("/", { replace: true });
    },
    onError: (err) => {
      const detail = err instanceof ApiError ? (err.body as { detail?: string })?.detail : null;
      toast.error(detail ?? "Login gagal, periksa email dan password");
    },
  });

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden flex-col justify-between bg-[#0B132B] p-12 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 font-bold">C</span>
          <span className="text-lg font-bold tracking-tight">CRM Sales Management</span>
        </div>
        <div className="max-w-lg">
          <h1 className="text-4xl leading-tight font-bold tracking-tight">
            Kendalikan pipeline, quotation, dan pengiriman order dalam satu tempat.
          </h1>
          <p className="mt-4 text-slate-400">
            Server-side pagination, agregasi dashboard, dan monitoring ETA per PO — dibangun untuk tim
            sales yang bergerak cepat.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-4">
            {[
              ["Modul", "11"],
              ["Peran", "3"],
              ["Tahap Order", "6"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="font-mono text-2xl font-bold text-blue-400">{v}</p>
                <p className="mt-1 text-xs tracking-wider text-slate-400 uppercase">{k}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="h-4 w-4" /> Sesi httpOnly cookie, password ter-hash, RBAC per modul.
        </p>
      </div>

      <div className="flex items-center justify-center bg-background px-6 py-12">
        <Card className="w-full max-w-md p-8">
          <h2 className="text-2xl font-bold tracking-tight">Masuk ke akun Anda</h2>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">
            Gunakan kredensial yang diberikan administrator.
          </p>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              login.mutate();
            }}
          >
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5"
                data-testid="input-email"
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5"
                data-testid="input-password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={login.isPending} data-testid="btn-login">
              {login.isPending ? "Memproses..." : "Masuk"}
              {!login.isPending && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
          </form>

          <div className="mt-6 border-t border-border pt-5">
            <p className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Akun demo (password: Password123)
            </p>
            <div className="flex flex-wrap gap-2">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  onClick={() => {
                    setEmail(d.email);
                    setPassword("Password123");
                  }}
                  data-testid={`btn-demo-${d.email.split("@")[0]}`}
                  className="rounded-md border border-border px-2.5 py-1 text-xs transition-colors duration-150 hover:border-ring hover:bg-accent"
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
