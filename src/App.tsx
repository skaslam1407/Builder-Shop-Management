import { useEffect } from "react";
import { HashRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { LoadingBlock } from "@/components/ui/feedback";
import { useAuthStore } from "@/store/auth";
import { configureMoney } from "@/lib/money";
import { localeFor, setActiveLanguage, useT } from "@/lib/i18n";
import { LoginPage } from "@/pages/LoginPage";
import { ChangePasswordPage } from "@/pages/ChangePasswordPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { CustomersPage } from "@/pages/CustomersPage";
import { CustomerDetailPage } from "@/pages/CustomerDetailPage";
import { UsersPage } from "@/pages/UsersPage";
import { BackupPage } from "@/pages/BackupPage";
import { ImportPage } from "@/pages/ImportPage";
import { ItemsPage } from "@/pages/ItemsPage";
import { SalesListPage } from "@/pages/SalesListPage";
import { InvoiceEditorPage } from "@/pages/InvoiceEditorPage";
import { InvoiceDetailPage } from "@/pages/InvoiceDetailPage";
import { InvoicePrintPage } from "@/pages/InvoicePrintPage";
import { PaymentsPage } from "@/pages/PaymentsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { SuppliersPage } from "@/pages/SuppliersPage";
import { SupplierDetailPage } from "@/pages/SupplierDetailPage";
import { PurchasesListPage } from "@/pages/PurchasesListPage";
import { PurchaseEditorPage } from "@/pages/PurchaseEditorPage";
import { PurchaseDetailPage } from "@/pages/PurchaseDetailPage";
import { SupplierPaymentsPage } from "@/pages/SupplierPaymentsPage";
import { ExpensesPage } from "@/pages/ExpensesPage";
import { StockPage } from "@/pages/StockPage";

function RequireAuth() {
  const { user, initialized } = useAuthStore();
  const t = useT();
  if (!initialized) return <LoadingBlock label={t("Starting Builder Shop…")} />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function RequireBillingAccess() {
  const user = useAuthStore((state) => state.user);
  if (user?.mustChangePassword) return <Navigate to="/change-password" replace />;
  return <AppShell />;
}

export default function App() {
  const refresh = useAuthStore((state) => state.refresh);
  const language = useAuthStore((state) => state.user?.language ?? "en");
  const currencyCode = useAuthStore((state) => state.user?.currencyCode ?? "INR");

  configureMoney(language, currencyCode);
  setActiveLanguage(language);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dataset.locale = localeFor(language);
  }, [language]);

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route element={<RequireBillingAccess />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/customers/:id" element={<CustomerDetailPage />} />
            <Route path="/items" element={<ItemsPage />} />
            <Route path="/stock" element={<StockPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/sales" element={<SalesListPage />} />
            <Route path="/sales/new" element={<InvoiceEditorPage />} />
            <Route path="/sales/:id" element={<InvoiceDetailPage />} />
            <Route path="/sales/:id/edit" element={<InvoiceEditorPage />} />
            <Route path="/sales/:id/print" element={<InvoicePrintPage />} />
            <Route path="/purchases" element={<PurchasesListPage />} />
            <Route path="/purchases/new" element={<PurchaseEditorPage />} />
            <Route path="/purchases/:id" element={<PurchaseDetailPage />} />
            <Route path="/purchases/:id/edit" element={<PurchaseEditorPage />} />
            <Route path="/suppliers" element={<SuppliersPage />} />
            <Route path="/suppliers/:id" element={<SupplierDetailPage />} />
            <Route path="/supplier-payments" element={<SupplierPaymentsPage />} />
            <Route path="/payments" element={<PaymentsPage />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/backup" element={<BackupPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </HashRouter>
  );
}
