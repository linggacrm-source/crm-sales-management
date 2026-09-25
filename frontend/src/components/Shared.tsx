import { AlertCircle, ChevronLeft, ChevronRight, Inbox, Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import { badgeClass, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { apiGet } from "@/lib/api";
import type { CustomerOption } from "@/lib/types";

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
      <div className="animate-slide-in">
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl" data-testid="page-title">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function StatusBadge({ value, label, testId }: { value?: string | null; label?: string; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        badgeClass(value),
      )}
    >
      {label ?? value ?? "-"}
    </span>
  );
}

export function SearchableCustomerSelect({
  value,
  onChange,
  options,
  placeholder = "— Pilih customer —",
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  options: CustomerOption[];
  placeholder?: string;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedFromOptions = options.find((c) => c.customer_id === value);
  const { data: selectedCustomer } = useQuery<CustomerOption | null>({
    queryKey: ["customer-option-selected", value],
    queryFn: () => apiGet<CustomerOption>(`/customers/${encodeURIComponent(value)}`),
    enabled: open && Boolean(value) && !selectedFromOptions,
    staleTime: 60_000,
  });
  const selected = selectedFromOptions ?? selectedCustomer ?? undefined;
  const q = search.trim();
  const { data: remoteOptions, isFetching: isSearching } = useQuery<CustomerOption[]>({
    queryKey: ["customer-options-search", q],
    queryFn: () => apiGet<CustomerOption[]>(`/customers/options?search=${encodeURIComponent(q)}`),
    enabled: open && q.length > 0,
    staleTime: 30_000,
  });
  const filtered = (q ? (remoteOptions ?? []) : options).slice(0, 100);

  return (
    <div className="relative mt-1.5">
      <button
        type="button"
        data-testid={testId}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-sm transition-colors hover:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected?.customer_name ?? placeholder}
        </span>
        <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-[80] mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ketik nama customer / perusahaan..."
                className="h-9 pl-8 pr-8"
                data-testid={`${testId}-search`}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setSearch("");
                setOpen(false);
              }}
              className={cn(
                "w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-accent",
                !value && "bg-accent",
              )}
            >
              {placeholder}
            </button>
            {isSearching && q && (
              <p className="px-3 py-3 text-center text-sm text-muted-foreground">Mencari customer...</p>
            )}
            {!isSearching && filtered.map((c) => (
              <button
                type="button"
                key={c.customer_id}
                onClick={() => {
                  onChange(c.customer_id);
                  setSearch("");
                  setOpen(false);
                }}
                className={cn(
                  "w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-accent",
                  c.customer_id === value && "bg-accent",
                )}
              >
                <span className="block truncate font-medium">{c.customer_name}</span>
                {c.company && c.company !== c.customer_name && (
                  <span className="block truncate text-xs text-muted-foreground">{c.company}</span>
                )}
              </button>
            ))}
            {!isSearching && filtered.length === 0 && (
              <p className="px-3 py-5 text-center text-sm text-muted-foreground">
                Customer tidak ditemukan.
              </p>
            )}
            {!isSearching && q && filtered.length === 100 && (
              <p className="px-3 py-2 text-center text-[11px] text-muted-foreground">
                Tampilkan 100 hasil pertama. Persempit pencarian untuk hasil lainnya.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  testId: string;
}) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Cari..."}
        className="pl-9"
      />
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <TableRow key={r} data-testid="table-skeleton-row">
          {Array.from({ length: cols }).map((_, c) => (
            <TableCell key={c}>
              <div
                className="h-4 animate-shimmer rounded bg-muted"
                style={{ width: `${45 + ((r + c) % 4) * 15}%` }}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function EmptyRow({ colSpan, message }: { colSpan: number; message?: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-12 text-center">
        <Inbox className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground" data-testid="empty-state-message">
          {message ?? "Belum ada data untuk ditampilkan."}
        </p>
      </TableCell>
    </TableRow>
  );
}

export function ErrorRow({ colSpan }: { colSpan: number }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-12 text-center">
        <AlertCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground" data-testid="error-state-message">
          Data belum dapat dimuat. Coba muat ulang halaman.
        </p>
      </TableCell>
    </TableRow>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize?: (s: number) => void;
}) {
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 sm:flex-row">
      <p className="text-xs text-muted-foreground" data-testid="pagination-info">
        Menampilkan <span className="font-mono font-semibold">{from}</span>–
        <span className="font-mono font-semibold">{to}</span> dari{" "}
        <span className="font-mono font-semibold">{formatNumber(total)}</span> data
      </p>
      <div className="flex items-center gap-2">
        {onPageSize && (
          <select
            data-testid="select-page-size"
            value={pageSize}
            onChange={(e) => {
              onPageSize(Number(e.target.value));
              onPage(1);
            }}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            {[10, 25, 50].map((s) => (
              <option key={s} value={s} label={`${s} / halaman`} />
            ))}
          </select>
        )}
        <Button
          data-testid="btn-prev-page"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="font-mono text-xs" data-testid="pagination-page">
          {page} / {maxPage}
        </span>
        <Button
          data-testid="btn-next-page"
          variant="outline"
          size="sm"
          disabled={page >= maxPage}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function KpiCard({
  title,
  value,
  hint,
  icon,
  testId,
  tone = "default",
  loading,
}: {
  title: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  testId: string;
  tone?: "default" | "danger" | "success" | "warning";
  loading?: boolean;
}) {
  const toneRing = {
    default: "border-border",
    danger: "border-red-200 dark:border-red-900",
    success: "border-emerald-200 dark:border-emerald-900",
    warning: "border-amber-200 dark:border-amber-900",
  }[tone];
  return (
    <Card
      data-testid={testId}
      className={cn(
        "relative overflow-hidden p-4 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md",
        toneRing,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{title}</p>
        {icon && <span className="text-muted-foreground/70">{icon}</span>}
      </div>
      {loading ? (
        <div className="mt-3 h-7 w-24 animate-shimmer rounded bg-muted" />
      ) : (
        <p className="mt-2 font-mono text-xl font-bold tracking-tight" data-testid={`${testId}-value`}>
          {value}
        </p>
      )}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

export function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  testId: string;
}) {
  return (
    <select
      data-testid={testId}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 min-w-[9rem] rounded-md border border-input bg-background px-3 text-sm transition-colors duration-150 hover:border-ring focus:ring-2 focus:ring-ring/40 focus:outline-none"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value} label={o.label} />
      ))}
    </select>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const labels: Record<string, string> = {
    SUPER_ADMIN: "Super Admin",
    SALES_MANAGER: "Sales Manager",
    SALES: "Sales",
  };
  return <StatusBadge value={role} label={labels[role] ?? role} testId={`role-badge-${role}`} />;
}

export function SectionCard({
  title,
  action,
  children,
  testId,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <Card className="overflow-hidden p-0" data-testid={testId}>
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </Card>
  );
}

export function AccessDenied({ testId = "access-denied" }: { testId?: string }) {
  return (
    <Card className="p-12 text-center" data-testid={testId}>
      <AlertCircle className="mx-auto mb-3 h-10 w-10 text-destructive/70" />
      <h2 className="text-lg font-semibold">Akses ditolak</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Modul ini hanya dapat diakses oleh Super Admin. Data tetap dilindungi di sisi server.
      </p>
    </Card>
  );
}

export { Badge };
