import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AccessDenied,
  EmptyRow,
  ErrorRow,
  FilterSelect,
  PageHeader,
  Pagination,
  RoleBadge,
  SearchBox,
  StatusBadge,
  TableSkeleton,
} from "@/components/Shared";
import { useAuth } from "@/hooks/useAuth";
import { useDebounced } from "@/hooks/useDebounced";
import { ApiError, apiGet, apiPost, apiPut } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Paginated, SalesOption, UserRow } from "@/lib/types";

const ROLES = ["SUPER_ADMIN", "SALES_MANAGER", "SALES"];

type FormState = {
  user_id?: string;
  name: string;
  email: string;
  password: string;
  role: string;
  manager_id: string;
  phone: string;
  status: string;
};

const EMPTY: FormState = {
  name: "",
  email: "",
  password: "Password123",
  role: "SALES",
  manager_id: "",
  phone: "",
  status: "Active",
};

export default function Users() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const debounced = useDebounced(search);
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (debounced) params.set("search", debounced);
  if (role) params.set("role", role);
  if (status) params.set("status", status);
  const qs = params.toString();

  const { data, isLoading, isError } = useQuery<Paginated<UserRow>>({
    queryKey: ["users", qs],
    queryFn: () => apiGet<Paginated<UserRow>>(`/users?${qs}`),
    placeholderData: (prev) => prev,
    enabled: isAdmin,
  });

  const { data: options } = useQuery<SalesOption[]>({
    queryKey: ["user-options"],
    queryFn: () => apiGet<SalesOption[]>("/users/options"),
    staleTime: 10 * 60_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["users"] });
    qc.invalidateQueries({ queryKey: ["user-options"] });
    qc.invalidateQueries({ queryKey: ["sales-team"] });
  };

  const save = useMutation({
    mutationFn: (f: FormState) => {
      const body = {
        name: f.name,
        email: f.email,
        role: f.role,
        manager_id: f.manager_id || undefined,
        phone: f.phone,
        status: f.status,
        ...(f.user_id ? {} : { password: f.password }),
      };
      return f.user_id ? apiPut<UserRow>(`/users/${f.user_id}`, body) : apiPost<UserRow>("/users", body);
    },
    onSuccess: () => {
      toast.success("Data user tersimpan");
      setDialogOpen(false);
      invalidate();
    },
    onError: (e) =>
      toast.error((e instanceof ApiError ? (e.body as { detail?: string })?.detail : null) ?? "Gagal menyimpan user"),
  });

  const resetPassword = useMutation({
    mutationFn: (id: string) => apiPost<{ temporary_password: string }>(`/users/${id}/reset-password`),
    onSuccess: (res) => toast.success(`Password direset ke: ${res.temporary_password}`),
    onError: () => toast.error("Gagal reset password"),
  });

  const toggleStatus = useMutation({
    mutationFn: (u: UserRow) =>
      apiPut<UserRow>(`/users/${u.user_id}`, { status: u.status === "Active" ? "Inactive" : "Active" }),
    onSuccess: () => {
      toast.success("Status user diperbarui");
      invalidate();
    },
    onError: () => toast.error("Gagal mengubah status user"),
  });

  const rows = isError ? [] : (data?.data ?? []);
  const managers = (options ?? []).filter((o) => o.role !== "SALES");

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Kelola Pengguna" />
        <AccessDenied testId="users-access-denied" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Kelola Pengguna" subtitle="User_ID adalah identifier utama; Manager_ID menghubungkan hierarki">
        {isAdmin && (
          <Button
            onClick={() => {
              setForm(EMPTY);
              setDialogOpen(true);
            }}
            data-testid="btn-add-user"
          >
            <Plus className="mr-2 h-4 w-4" /> Tambah User
          </Button>
        )}
      </PageHeader>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <SearchBox
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Cari nama / email / ID..."
            testId="input-search-users"
          />
          <FilterSelect
            value={role}
            onChange={(v) => {
              setRole(v);
              setPage(1);
            }}
            options={ROLES.map((r) => ({ value: r, label: r }))}
            placeholder="Semua role"
            testId="filter-user-role"
          />
          <FilterSelect
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={[
              { value: "Active", label: "Active" },
              { value: "Inactive", label: "Inactive" },
            ]}
            placeholder="Semua status"
            testId="filter-user-status"
          />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User ID</TableHead>
              <TableHead>Nama</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Manager</TableHead>
              <TableHead>Telepon</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton cols={9} />
            ) : isError ? (
              <ErrorRow colSpan={9} />
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={9} message="Tidak ada user pada filter ini." />
            ) : (
              rows.map((u) => (
                <TableRow key={u.user_id} data-testid={`row-user-${u.user_id}`}>
                  <TableCell className="font-mono text-xs">{u.user_id}</TableCell>
                  <TableCell className="font-semibold">{u.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <RoleBadge role={u.role} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{u.manager_name ?? "-"}</TableCell>
                  <TableCell className="font-mono text-xs">{u.phone ?? "-"}</TableCell>
                  <TableCell>
                    <StatusBadge value={u.status} testId={`status-user-${u.user_id}`} />
                  </TableCell>
                  <TableCell className="text-xs">{formatDateTime(u.last_login)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {isAdmin && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`btn-edit-user-${u.user_id}`}
                          onClick={() => {
                            setForm({
                              user_id: u.user_id,
                              name: u.name,
                              email: u.email,
                              password: "",
                              role: u.role,
                              manager_id: u.manager_id ?? "",
                              phone: u.phone ?? "",
                              status: u.status,
                            });
                            setDialogOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleStatus.mutate(u)}
                          data-testid={`btn-toggle-user-${u.user_id}`}
                        >
                          {u.status === "Active" ? "Deactivate" : "Activate"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Reset password"
                          onClick={() => resetPassword.mutate(u.user_id)}
                          data-testid={`btn-reset-password-${u.user_id}`}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <Pagination
          page={page}
          pageSize={pageSize}
          total={isError ? 0 : (data?.total ?? 0)}
          onPage={setPage}
          onPageSize={setPageSize}
        />
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.user_id ? "Edit User" : "Tambah User"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="u-name">Nama</Label>
              <Input
                id="u-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1.5"
                data-testid="input-user-name"
              />
            </div>
            <div>
              <Label htmlFor="u-email">Email</Label>
              <Input
                id="u-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-1.5"
                data-testid="input-user-email"
              />
            </div>
            <div>
              <Label htmlFor="u-role">Role</Label>
              <select
                id="u-role"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                data-testid="input-user-role"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="u-manager">Manager</Label>
              <select
                id="u-manager"
                value={form.manager_id}
                onChange={(e) => setForm({ ...form, manager_id: e.target.value })}
                className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                data-testid="input-user-manager"
              >
                <option value="">— Tanpa manager —</option>
                {managers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name} ({m.user_id})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="u-phone">Telepon</Label>
              <Input
                id="u-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="mt-1.5"
                data-testid="input-user-phone"
              />
            </div>
            <div>
              <Label htmlFor="u-status">Status</Label>
              <select
                id="u-status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                data-testid="input-user-status"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            {!form.user_id && (
              <div className="sm:col-span-2">
                <Label htmlFor="u-pass">Password Awal</Label>
                <Input
                  id="u-pass"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="mt-1.5"
                  data-testid="input-user-password"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="btn-cancel-user">
              Batal
            </Button>
            <Button
              onClick={() => save.mutate(form)}
              disabled={!form.name || !form.email || save.isPending}
              data-testid="btn-save-user"
            >
              {save.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
