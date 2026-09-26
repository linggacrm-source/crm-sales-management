import { useMutation } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
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


export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
      <div className="relative hidden overflow-hidden bg-[#071126] lg:flex">
        <img
          src="/crm-login-illustration.svg"
          alt="CRM Sales Management"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute left-10 top-10 flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 font-bold text-white shadow-lg shadow-blue-600/30">
            C
          </span>
          <span className="text-lg font-bold tracking-tight text-white">CRM Sales Management</span>
        </div>
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

        </Card>
      </div>
    </div>
  );
}
