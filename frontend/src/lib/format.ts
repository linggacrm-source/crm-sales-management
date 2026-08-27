const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export const formatIDR = (v?: number | null) => idr.format(v ?? 0);

export const formatCompactIDR = (v?: number | null) => {
  const n = v ?? 0;
  if (Math.abs(n) >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)} M`;
  if (Math.abs(n) >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)} Jt`;
  return formatIDR(n);
};

export const formatNumber = (v?: number | null) => new Intl.NumberFormat("id-ID").format(v ?? 0);

export const formatDate = (v?: string | null) => {
  if (!v) return "-";
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return v;
  return dt.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
};

export const formatDateTime = (v?: string | null) => {
  if (!v) return "-";
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return v;
  return dt.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/** Client-side CSV export of the rows already on screen (no extra full-table fetch). */
export function exportCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (val: unknown) => {
    const s = val === null || val === undefined ? "" : String(val);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(";"),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(";")),
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  SALES_MANAGER: "Sales Manager",
  SALES: "Sales Executive",
};

const BADGE: Record<string, string> = {
  // pipeline
  Lead: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300",
  Qualification: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300",
  Proposal: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300",
  Negotiation: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
  Won: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300",
  Lost: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300",
  // quotation / po
  Draft: "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300",
  Sent: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300",
  Approved: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300",
  Rejected: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300",
  Expired: "bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-900 dark:text-slate-400",
  Converted: "bg-green-50 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-300",
  Received: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300",
  Confirmed: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300",
  Processing: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
  Completed: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300",
  Cancelled: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300",
  // monitoring
  "Waiting Order": "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300",
  Indent: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300",
  "Ready Stock": "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300",
  Delivery: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300",
  // activity / misc
  Open: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300",
  Active: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300",
  Inactive: "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300",
  Archived: "bg-slate-100 text-slate-500 border-slate-300 dark:bg-slate-800 dark:text-slate-400",
  // eta flags
  ON_TIME: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300",
  DUE_SOON: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
  OVERDUE: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300",
  COMPLETED: "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300",
  SUPER_ADMIN: "bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300",
  SALES_MANAGER: "bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950 dark:text-purple-300",
  SALES: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300",
};

export const badgeClass = (key?: string | null) =>
  BADGE[key ?? ""] ?? "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300";

export const ETA_LABEL: Record<string, string> = {
  ON_TIME: "On Time",
  DUE_SOON: "Due Soon",
  OVERDUE: "Overdue",
  COMPLETED: "Selesai",
};
