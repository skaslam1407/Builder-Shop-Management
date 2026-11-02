import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Building2,
  DatabaseBackup,
  HardHat,
  LayoutDashboard,
  LogOut,
  Package,
  Receipt,
  ReceiptText,
  Settings,
  ShieldCheck,
  Upload,
  Truck,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { localeFor, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: string;
}

const navItems: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { to: "/customers", label: "Customers", icon: Users, permission: "customers.view" },
  { to: "/items", label: "Items", icon: Package, permission: "catalog.view" },
  { to: "/stock", label: "Stock", icon: Warehouse, permission: "inventory.view" },
  { to: "/sales", label: "Sales", icon: ReceiptText, permission: "sales.view" },
  { to: "/purchases", label: "Purchases", icon: Truck, permission: "purchases.view" },
  { to: "/suppliers", label: "Suppliers", icon: Building2, permission: "suppliers.view" },
  { to: "/payments", label: "Payments", icon: Wallet, permission: "payments.view" },
  { to: "/expenses", label: "Expenses", icon: Receipt, permission: "expenses.view" },
  { to: "/reports", label: "Reports", icon: BarChart3, permission: "reports.view" },
  { to: "/import", label: "Import", icon: Upload },
  { to: "/users", label: "Users & Roles", icon: ShieldCheck, permission: "users.manage" },
  { to: "/backup", label: "Backup", icon: DatabaseBackup, permission: "backup.manage" },
  { to: "/settings", label: "Settings", icon: Settings },
];

const titles: Record<string, string> = {
  "/": "Dashboard",
  "/customers": "Customers",
  "/items": "Items",
  "/stock": "Stock",
  "/sales": "Sales Billing",
  "/sales/new": "New Invoice",
  "/purchases": "Purchases",
  "/purchases/new": "New Purchase",
  "/suppliers": "Suppliers",
  "/supplier-payments": "Supplier Payments",
  "/payments": "Payments",
  "/expenses": "Expenses",
  "/reports": "Reports",
  "/import": "Import data",
  "/users": "Users & Roles",
  "/backup": "Backup & Restore",
  "/settings": "Settings",
};

export function AppShell() {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const t = useT();
  const language = user?.language ?? "en";
  const locale = localeFor(language);

  const allowed = navItems.filter(
    (item) => !item.permission || user?.permissions.includes(item.permission),
  );
  const rawTitle =
    titles[location.pathname] ??
    (location.pathname.startsWith("/sales/")
      ? "Sales Billing"
      : location.pathname.startsWith("/payments")
        ? "Payments"
        : location.pathname.startsWith("/customers/")
          ? "Customer Ledger"
          : location.pathname.startsWith("/suppliers/")
            ? "Supplier Ledger"
            : "Builder Shop");
  const title = t(rawTitle);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col bg-zinc-950 text-zinc-300">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500 text-zinc-950">
            <HardHat className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{t("Builder Shop")}</p>
            <p className="text-xs text-zinc-500">{t("Management & Billing")}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {allowed.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-brand-500/15 text-brand-300"
                      : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {t(item.label)}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-zinc-800 p-4">
          <div className="mb-3">
            <p className="truncate text-sm font-medium text-white">{user?.displayName}</p>
            <p className="truncate text-xs text-zinc-500">@{user?.username}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            {t("Sign out")}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-8">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">{title}</h1>
            <p className="text-xs text-zinc-500">{t("Offline-first · Local database")}</p>
          </div>
          <div className="text-right text-xs text-zinc-500">
            <p>
              {new Date().toLocaleDateString(locale, {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
            <p className="mt-0.5 font-medium text-emerald-600">{t("Database connected")}</p>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
