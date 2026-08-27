import {
  CalendarCheck,
  FileText,
  Kanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Target,
  Truck,
  UserCog,
  Users,
  X,
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
  {
    group: "CRM Database",
    items: [
      { label: "Dashboard", path: "/", icon: LayoutDashboard, testId: "nav-dashboard" },
      { label: "Customers", path: "/customers", icon: Users, testId: "nav-customers" },
      { label: "Sales Pipeline", path: "/pipeline", icon: Kanban, testId: "nav-pipeline" },
      { label: "Aktivitas", path: "/activities", icon: CalendarCheck, testId: "nav-activities" },
      { label: "Quotations", path: "/quotations", icon: FileText, testId: "nav-quotations" },
      { label: "Purchase Orders", path: "/purchase-orders", icon: ShoppingBag, testId: "nav-purchase-orders" },
      { label: "Order Monitoring", path: "/order-monitoring", icon: Truck, testId: "nav-order-monitoring" },
    ],
  },
  {
    group: "Management",
    items: [
      { label: "Sales Team", path: "/sales-team", icon: Target, testId: "nav-sales-team" },
      {
        label: "Audit Log",
        path: "/audit-log",
        icon: ShieldCheck,
        testId: "nav-audit-log",
        roles: ["SUPER_ADMIN"],
      },
    ],
  },
  {
    group: "Administration",
    items: [
      {
        label: "Users",
        path: "/users",
        icon: UserCog,
        testId: "nav-users",
        roles: ["SUPER_ADMIN"],
      },
      { label: "Products", path: "/products", icon: Package, testId: "nav-products" },
      { label: "Settings", path: "/settings", icon: Settings, testId: "nav-settings" },
    ],
  },
];

export default function AppShell() {
  const { user, isLoading, isError } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="animate-soft-pulse text-sm text-muted-foreground" data-testid="shell-loading">
          Memuat sesi...
        </p>
      </div>
    );
  }
  if (isError || !user) return <Navigate to="/login" replace />;

  const logout = async () => {
    await endSession();
    navigate("/login", { replace: true });
  };

  const visible = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.roles || i.roles.includes(user.role)),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform duration-200 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        data-testid="app-sidebar"
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Link to="/" className="flex items-center gap-2.5" data-testid="sidebar-brand">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 font-bold text-white">
              C
            </span>
            <span>
              <span className="block text-sm font-bold tracking-tight text-white">CRM Sales</span>
              <span className="block text-[10px] tracking-widest text-slate-400 uppercase">Management</span>
            </span>
          </Link>
          <button
            className="text-slate-400 lg:hidden"
            onClick={() => setOpen(false)}
            data-testid="btn-close-sidebar"
            aria-label="Tutup menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {visible.map((g) => (
            <div key={g.group} className="mb-5">
              <p className="px-3 pb-2 text-[10px] font-bold tracking-[0.14em] text-slate-500 uppercase">
                {g.group}
              </p>
              <ul className="space-y-0.5">
                {g.items.map((item) => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      end={item.path === "/"}
                      data-testid={item.testId}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors duration-150",
                          isActive
                            ? "bg-sidebar-primary font-semibold text-sidebar-primary-foreground"
                            : "text-slate-300 hover:bg-sidebar-accent hover:text-white",
                        )
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <div className="mb-3">
            <p className="truncate text-sm font-semibold text-white" data-testid="sidebar-user-name">
              {user.name}
            </p>
            <p className="truncate text-xs text-slate-400">{user.email}</p>
            <div className="mt-2">
              <RoleBadge role={user.role} />
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800 hover:text-white"
            onClick={logout}
            data-testid="btn-logout"
          >
            <LogOut className="mr-2 h-4 w-4" /> Logout
          </Button>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
          data-testid="sidebar-overlay"
        />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} data-testid="btn-open-sidebar" aria-label="Buka menu">
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold">CRM Sales Management</span>
        </header>
        <main className="animate-rise flex-1 px-4 py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
