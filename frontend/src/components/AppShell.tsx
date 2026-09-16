import {
  Bell, CalendarCheck, FileText, Kanban, LayoutDashboard, LogOut, Menu, Package, Search, Settings,
  ShieldCheck, ShoppingBag, Target, Truck, UserCog, Users, X,
} from "lucide-react";
import { useState } from "react";
import { Link, Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { RoleBadge } from "@/components/Shared";
import { useAuth } from "@/hooks/useAuth";
import { endSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type NavItem = { label: string; path: string; icon: typeof Users; testId: string; roles?: string[] };
const GROUPS: { group: string; items: NavItem[] }[] = [
  { group: "CRM Database", items: [
    { label: "Dashboard", path: "/", icon: LayoutDashboard, testId: "nav-dashboard" },
    { label: "Customers", path: "/customers", icon: Users, testId: "nav-customers" },
    { label: "Sales Pipeline", path: "/pipeline", icon: Kanban, testId: "nav-pipeline" },
    { label: "Aktivitas", path: "/activities", icon: CalendarCheck, testId: "nav-activities" },
    { label: "Quotations", path: "/quotations", icon: FileText, testId: "nav-quotations" },
    { label: "Purchase Orders", path: "/purchase-orders", icon: ShoppingBag, testId: "nav-purchase-orders" },
    { label: "Order Monitoring", path: "/order-monitoring", icon: Truck, testId: "nav-order-monitoring" },
  ]},
  { group: "Management", items: [
    { label: "Sales Team", path: "/sales-team", icon: Target, testId: "nav-sales-team" },
    { label: "Target", path: "/targets", icon: Target, testId: "nav-targets", roles: ["SUPER_ADMIN", "SALES_MANAGER"] },
    { label: "Audit Log", path: "/audit-log", icon: ShieldCheck, testId: "nav-audit-log", roles: ["SUPER_ADMIN"] },
  ]},
  { group: "Administration", items: [
    { label: "Users", path: "/users", icon: UserCog, testId: "nav-users", roles: ["SUPER_ADMIN", "SALES_MANAGER"] },
    { label: "Products", path: "/products", icon: Package, testId: "nav-products" },
    { label: "Settings", path: "/settings", icon: Settings, testId: "nav-settings" },
  ]},
];

export default function AppShell() {
  const { user, isLoading, isError } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-background"><p className="animate-soft-pulse text-sm text-muted-foreground" data-testid="shell-loading">Memuat sesi...</p></div>;
  if (isError || !user) return <Navigate to="/login" replace />;
  const logout = async () => { await endSession(); navigate("/login", { replace: true }); };
  const visible = GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || i.roles.includes(user.role)) })).filter((g) => g.items.length > 0);
  const initials = user.name.slice(0, 2).toUpperCase();

  return <div className="min-h-screen bg-background">
    <aside className={cn("fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-slate-200/80 bg-white transition-transform duration-200 lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")} data-testid="app-sidebar">
      <div className="flex h-[76px] items-center border-b border-slate-100 px-5">
        <Link to="/" className="flex items-center" data-testid="sidebar-brand"><img src="/wellracom-logo.png" alt="WELLRACOM" className="h-11 w-auto object-contain" /></Link>
        <button className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-50 lg:hidden" onClick={() => setOpen(false)} data-testid="btn-close-sidebar" aria-label="Tutup menu"><X className="h-5 w-5" /></button>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-5">
        {visible.map((g) => <div key={g.group} className="mb-6"><p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{g.group}</p><ul className="space-y-1">
          {g.items.map((item) => <li key={item.path}><NavLink to={item.path} end={item.path === "/"} data-testid={item.testId} onClick={() => setOpen(false)} className={({ isActive }) => cn("group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-medium transition-all duration-150", isActive ? "bg-blue-600 text-white shadow-sm shadow-blue-200" : "text-slate-600 hover:bg-blue-50 hover:text-blue-700")}><item.icon className="h-[18px] w-[18px] shrink-0 transition-transform group-hover:scale-105" />{item.label}</NavLink></li>)}
        </ul></div>)}
      </nav>
      <div className="border-t border-slate-100 bg-slate-50/70 p-4">
        <div className="mb-3 flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 text-xs font-bold text-white">{initials}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-800" data-testid="sidebar-user-name">{user.name}</p><p className="truncate text-[10px] text-slate-400">{user.email}</p></div></div>
        <div className="mb-3"><RoleBadge role={user.role} /></div>
        <Button variant="outline" size="sm" className="w-full rounded-xl border-slate-200 bg-white text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600" onClick={logout} data-testid="btn-logout"><LogOut className="mr-2 h-4 w-4" /> Logout</Button>
      </div>
    </aside>
    {open && <div className="fixed inset-0 z-30 bg-slate-900/30 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} data-testid="sidebar-overlay" />}
    <div className="min-w-0 lg:pl-[248px]">
      <header className="sticky top-0 z-20 hidden h-[76px] items-center gap-5 border-b border-slate-200/80 bg-white/90 px-7 backdrop-blur-xl lg:flex">
        <div className="relative max-w-xl flex-1"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/80 pl-10 pr-16 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100" placeholder="Search customers, quotations, opportunities..." aria-label="Global search" /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 ring-1 ring-slate-200">Ctrl K</span></div>
        <div className="ml-auto flex items-center gap-3"><button className="relative rounded-xl p-2.5 text-slate-500 transition hover:bg-blue-50 hover:text-blue-600" aria-label="Notifikasi"><Bell className="h-5 w-5" /><span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" /></button><div className="h-8 w-px bg-slate-200" /><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-sm font-bold text-white shadow-sm">{initials}</div><div className="hidden xl:block"><p className="text-xs font-bold text-slate-800">{user.name}</p><p className="text-[10px] text-slate-400">{user.role.replaceAll("_", " ")}</p></div></div></div>
      </header>
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:hidden"><button className="rounded-lg p-2 hover:bg-slate-50" onClick={() => setOpen(true)} data-testid="btn-open-sidebar" aria-label="Buka menu"><Menu className="h-5 w-5" /></button><img src="/wellracom-logo.png" alt="WELLRACOM" className="h-8 w-auto object-contain" /></header>
      <main className="animate-rise min-h-[calc(100vh-76px)] px-4 py-5 sm:px-6 lg:px-7 lg:py-6"><Outlet /></main>
    </div>
  </div>;
}
