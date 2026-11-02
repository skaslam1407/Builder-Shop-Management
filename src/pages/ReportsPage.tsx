import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download, FileSpreadsheet, Printer, Search } from "lucide-react";
import { getErrorMessage, reportApi } from "@/lib/api";
import {
  formatPaise,
  formatQuantityMilli,
  formatTaxBps,
} from "@/lib/money";
import { exportCsv, exportExcel, printReport } from "@/lib/export";
import type { ExportColumn } from "@/lib/export";
import type {
  ExpenseReport,
  GstReport,
  ItemSalesReport,
  PayablesReport,
  ReceivablesReport,
  SalesReport,
  StockReport,
} from "@/lib/types";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, ErrorBanner, LoadingBlock } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

type Tab =
  | "sales"
  | "receivables"
  | "payables"
  | "items"
  | "gst"
  | "expenses"
  | "stock";

const tabs: { value: Tab; label: string }[] = [
  { value: "sales", label: "Sales" },
  { value: "receivables", label: "Receivables" },
  { value: "payables", label: "Payables" },
  { value: "items", label: "Item sales" },
  { value: "gst", label: "GST" },
  { value: "expenses", label: "Expenses" },
  { value: "stock", label: "Stock valuation" },
];

const tabTitles: Record<Tab, string> = {
  sales: "Sales report",
  receivables: "Customer outstanding report",
  payables: "Supplier payable report",
  items: "Item sales report",
  gst: "GST summary",
  expenses: "Expense report",
  stock: "Stock valuation report",
};

function localIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthStart(): string {
  const now = new Date();
  return localIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
        <p className="mt-2 text-2xl font-semibold text-zinc-900">{value}</p>
        {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export function ReportsPage() {
  const canExport = useAuthStore((state) =>
    Boolean(state.user?.permissions.includes("reports.export")),
  );
  const [tab, setTab] = useState<Tab>("sales");
  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo] = useState(localIsoDate(new Date()));
  const [applied, setApplied] = useState({ from: monthStart(), to: localIsoDate(new Date()) });
  const [granularity, setGranularity] = useState<"day" | "month" | "year">("day");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const t = useT();

  const [sales, setSales] = useState<SalesReport | null>(null);
  const [receivables, setReceivables] = useState<ReceivablesReport | null>(null);
  const [payables, setPayables] = useState<PayablesReport | null>(null);
  const [itemSales, setItemSales] = useState<ItemSalesReport | null>(null);
  const [gst, setGst] = useState<GstReport | null>(null);
  const [expenses, setExpenses] = useState<ExpenseReport | null>(null);
  const [stock, setStock] = useState<StockReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const query = search.trim() || undefined;
    try {
      if (tab === "sales") {
        setSales(await reportApi.sales(applied.from, applied.to, granularity));
      } else if (tab === "receivables") {
        setReceivables(await reportApi.receivables(applied.to, query));
      } else if (tab === "payables") {
        setPayables(await reportApi.payables(applied.to, query));
      } else if (tab === "items") {
        setItemSales(await reportApi.itemSales(applied.from, applied.to, query));
      } else if (tab === "gst") {
        setGst(await reportApi.gst(applied.from, applied.to));
      } else if (tab === "expenses") {
        setExpenses(await reportApi.expenses(applied.from, applied.to));
      } else {
        setStock(await reportApi.stock(query));
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [tab, applied, granularity, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [load, reloadKey]);

  const refresh = () => setReloadKey((key) => key + 1);

  const applyRange = () => {
    if (dateFrom > dateTo) {
      setError("From date cannot be after to date");
      return;
    }
    setApplied({ from: dateFrom, to: dateTo });
    refresh();
  };

  const showDateRange = tab !== "stock";
  const showSingleDate = tab === "receivables" || tab === "payables";
  const showSearch = tab === "receivables" || tab === "payables" || tab === "items" || tab === "stock";

  const periodLabel = showSingleDate
    ? `As of ${applied.to}`
    : `${applied.from} to ${applied.to}`;

  const exportName = `${tab}-report-${applied.from}-to-${applied.to}`;

  const exportCurrent = (format: "csv" | "excel") => {
    const run = <T,>(
      filename: string,
      sheetName: string,
      columns: ExportColumn<T>[],
      rows: T[],
    ) => {
      if (format === "csv") exportCsv(filename, columns, rows);
      else exportExcel(filename, sheetName, columns, rows);
    };

    if (tab === "sales" && sales) {
      run(
        exportName,
        "Sales",
        [
          { header: "Period", value: (row) => row.period },
          { header: "Invoices", value: (row) => row.invoiceCount },
          { header: "Subtotal (INR)", value: (row) => row.subtotalMinor / 100 },
          { header: "Discount (INR)", value: (row) => row.discountMinor / 100 },
          { header: "Taxable (INR)", value: (row) => row.taxableMinor / 100 },
          { header: "Tax (INR)", value: (row) => row.taxMinor / 100 },
          { header: "Total (INR)", value: (row) => row.grandTotalMinor / 100 },
        ],
        sales.rows,
      );
    } else if (tab === "receivables" && receivables) {
      run(
        exportName,
        "Receivables",
        [
          { header: "Customer code", value: (row) => row.customerCode ?? "" },
          { header: "Customer", value: (row) => row.customerName },
          { header: "Phone", value: (row) => row.phone ?? "" },
          { header: "Invoices", value: (row) => row.invoiceCount },
          { header: "Billed (INR)", value: (row) => row.billedMinor / 100 },
          { header: "Invoice due (INR)", value: (row) => row.dueMinor / 100 },
          { header: "Opening balance (INR)", value: (row) => row.openingBalanceMinor / 100 },
          { header: "Outstanding (INR)", value: (row) => row.outstandingMinor / 100 },
          { header: "Last invoice", value: (row) => row.lastInvoiceDate ?? "" },
        ],
        receivables.rows,
      );
    } else if (tab === "payables" && payables) {
      run(
        exportName,
        "Payables",
        [
          { header: "Supplier code", value: (row) => row.supplierCode ?? "" },
          { header: "Supplier", value: (row) => row.supplierName },
          { header: "Phone", value: (row) => row.phone ?? "" },
          { header: "Invoices", value: (row) => row.invoiceCount },
          { header: "Billed (INR)", value: (row) => row.billedMinor / 100 },
          { header: "Invoice due (INR)", value: (row) => row.dueMinor / 100 },
          { header: "Opening balance (INR)", value: (row) => row.openingBalanceMinor / 100 },
          { header: "Outstanding (INR)", value: (row) => row.outstandingMinor / 100 },
          { header: "Last invoice", value: (row) => row.lastInvoiceDate ?? "" },
        ],
        payables.rows,
      );
    } else if (tab === "items" && itemSales) {
      run(
        exportName,
        "Item sales",
        [
          { header: "Item code", value: (row) => row.itemCode ?? "" },
          { header: "Item", value: (row) => row.itemName },
          { header: "Quantity", value: (row) => row.quantityMilli / 1000 },
          { header: "Invoices", value: (row) => row.invoiceCount },
          { header: "Sales (INR)", value: (row) => row.salesMinor / 100 },
        ],
        itemSales.rows,
      );
    } else if (tab === "gst" && gst) {
      run(
        exportName,
        "GST rates",
        [
          { header: "Tax rate (%)", value: (row) => row.taxRateBps / 100 },
          { header: "Taxable (INR)", value: (row) => row.taxableMinor / 100 },
          { header: "Tax (INR)", value: (row) => row.taxMinor / 100 },
        ],
        gst.rows,
      );
    } else if (tab === "expenses" && expenses) {
      run(
        exportName,
        "Expenses",
        [
          { header: "Category", value: (row) => row.categoryName },
          { header: "Entries", value: (row) => row.entryCount },
          { header: "Amount (INR)", value: (row) => row.amountMinor / 100 },
        ],
        expenses.rows,
      );
    } else if (tab === "stock" && stock) {
      run(
        exportName,
        "Stock",
        [
          { header: "Item code", value: (row) => row.itemCode },
          { header: "Item", value: (row) => row.name },
          { header: "Unit", value: (row) => row.unitAbbreviation ?? "" },
          { header: "Quantity", value: (row) => row.quantityMilli / 1000 },
          { header: "Reorder level", value: (row) => row.reorderLevelMilli / 1000 },
          { header: "Purchase rate (INR)", value: (row) => row.purchaseRateMinor / 100 },
          { header: "Stock value (INR)", value: (row) => row.stockValueMinor / 100 },
          { header: "Active", value: (row) => (row.isActive ? "Yes" : "No") },
        ],
        stock.rows,
      );
    }
  };

  const hasRows =
    (tab === "sales" && sales?.rows.length) ||
    (tab === "receivables" && receivables?.rows.length) ||
    (tab === "payables" && payables?.rows.length) ||
    (tab === "items" && itemSales?.rows.length) ||
    (tab === "gst" && gst?.rows.length) ||
    (tab === "expenses" && expenses?.rows.length) ||
    (tab === "stock" && stock?.rows.length);

  return (
    <div className="space-y-5">
      <div className="hidden print:block">
        <h1 className="text-xl font-semibold text-zinc-900">{tabTitles[tab]}</h1>
        <p className="text-sm text-zinc-500">{periodLabel}</p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-900">{t("Reports")}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {t("Source-record reports with CSV, Excel, and print output.")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => printReport()} disabled={!hasRows}>
            <Printer className="h-4 w-4" /> {t("Print")}
          </Button>
          {canExport ? (
            <>
              <Button
                variant="outline"
                onClick={() => exportCurrent("csv")}
                disabled={!hasRows}
              >
                <Download className="h-4 w-4" /> CSV
              </Button>
              <Button
                variant="outline"
                onClick={() => exportCurrent("excel")}
                disabled={!hasRows}
              >
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-zinc-200 print:hidden">
        {tabs.map((entry) => (
          <button
            key={entry.value}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
              tab === entry.value
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-zinc-500 hover:text-zinc-800",
            )}
            onClick={() => {
              setTab(entry.value);
              setSearch("");
            }}
          >
            {t(entry.label)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 print:hidden">
        {showDateRange ? (
          <>
            {!showSingleDate ? (
              <div>
                <Label htmlFor="reportFrom">{t("From")}</Label>
                <Input
                  id="reportFrom"
                  type="date"
                  className="mt-1.5 w-40"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                />
              </div>
            ) : null}
            <div>
              <Label htmlFor="reportTo">{showSingleDate ? t("As of") : t("To")}</Label>
              <Input
                id="reportTo"
                type="date"
                className="mt-1.5 w-40"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </div>
            <Button variant="outline" onClick={applyRange}>
              {t("Apply")}
            </Button>
          </>
        ) : null}
        {tab === "sales" ? (
          <div>
            <Label htmlFor="granularity">{t("Group by")}</Label>
            <Select
              id="granularity"
              className="mt-1.5 w-40"
              value={granularity}
              onChange={(event) =>
                setGranularity(event.target.value as "day" | "month" | "year")
              }
            >
              <option value="day">{t("Day")}</option>
              <option value="month">{t("Month")}</option>
              <option value="year">{t("Year")}</option>
            </Select>
          </div>
        ) : null}
        {showSearch ? (
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input
              className="mt-1.5 pl-9"
              placeholder={
                tab === "stock"
                  ? t("Search item name or code")
                  : tab === "items"
                    ? t("Search item")
                    : tab === "receivables"
                      ? t("Search customer")
                      : t("Search supplier")
              }
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        ) : null}
      </div>

      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

      {loading ? (
        <Card>
          <LoadingBlock label={t("Loading report…")} />
        </Card>
      ) : (
        <>
          {tab === "sales" && sales ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi label={t("Sales")} value={formatPaise(sales.grandTotalMinor)} hint={`${sales.invoiceCount} ${t("finalized invoices")}`} />
                <Kpi label={t("Collected")} value={formatPaise(sales.collectedMinor)} hint={t("Posted customer payments")} />
                <Kpi label={t("Tax")} value={formatPaise(sales.taxMinor)} hint={t("Including sales")} />
                <Kpi label={t("Discount")} value={formatPaise(sales.discountMinor)} hint={t("Line discounts")} />
              </div>
              <ReportTable
                title={t(tabTitles[tab])}
                subtitle={periodLabel}
                empty={t("No finalized sales in this period.")}
                hasRows={Boolean(sales.rows.length)}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Period")}</TableHead>
                      <TableHead className="text-right">{t("Invoices")}</TableHead>
                      <TableHead className="text-right">{t("Subtotal")}</TableHead>
                      <TableHead className="text-right">{t("Discount")}</TableHead>
                      <TableHead className="text-right">{t("Taxable")}</TableHead>
                      <TableHead className="text-right">{t("Tax")}</TableHead>
                      <TableHead className="text-right">{t("Total")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sales.rows.map((row) => (
                      <TableRow key={row.period}>
                        <TableCell className="font-medium text-zinc-900">{row.period}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.invoiceCount}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPaise(row.subtotalMinor)}</TableCell>
                        <TableCell className="text-right tabular-nums text-zinc-600">{formatPaise(row.discountMinor)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPaise(row.taxableMinor)}</TableCell>
                        <TableCell className="text-right tabular-nums text-zinc-600">{formatPaise(row.taxMinor)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{formatPaise(row.grandTotalMinor)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ReportTable>
            </>
          ) : null}

          {tab === "receivables" && receivables ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi label={t("Outstanding")} value={formatPaise(receivables.outstandingMinor)} hint={t("Opening balance + invoice dues")} />
                <Kpi label={t("Invoice due")} value={formatPaise(receivables.dueMinor)} hint={`${receivables.invoiceCount} ${t("Invoices")}`} />
                <Kpi label={t("Opening balances")} value={formatPaise(receivables.openingBalanceMinor)} />
                <Kpi label={t("Customers")} value={String(receivables.customerCount)} hint={t("With an outstanding balance")} />
              </div>
              <ReportTable
                title={t(tabTitles[tab])}
                subtitle={periodLabel}
                empty={t("No customer outstanding balances.")}
                hasRows={Boolean(receivables.rows.length)}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Customer")}</TableHead>
                      <TableHead>{t("Phone")}</TableHead>
                      <TableHead className="text-right">{t("Invoices")}</TableHead>
                      <TableHead className="text-right">{t("Billed")}</TableHead>
                      <TableHead className="text-right">{t("Invoice due")}</TableHead>
                      <TableHead className="text-right">{t("Opening")}</TableHead>
                      <TableHead className="text-right">{t("Outstanding")}</TableHead>
                      <TableHead>{t("Last invoice")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receivables.rows.map((row) => (
                      <TableRow key={row.customerId}>
                        <TableCell>
                          <Link className="font-medium text-zinc-900 hover:underline" to={`/customers?search=${encodeURIComponent(row.customerName)}`}>
                            {row.customerName}
                          </Link>
                          {row.customerCode ? (
                            <p className="font-mono text-xs text-zinc-500">{row.customerCode}</p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-zinc-600">{row.phone ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.invoiceCount}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPaise(row.billedMinor)}</TableCell>
                        <TableCell className="text-right tabular-nums text-zinc-600">{formatPaise(row.dueMinor)}</TableCell>
                        <TableCell className="text-right tabular-nums text-zinc-600">{formatPaise(row.openingBalanceMinor)}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{formatPaise(row.outstandingMinor)}</TableCell>
                        <TableCell className="text-zinc-500">{row.lastInvoiceDate ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ReportTable>
            </>
          ) : null}

          {tab === "payables" && payables ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi label={t("Outstanding")} value={formatPaise(payables.outstandingMinor)} hint={t("Opening balance + purchase dues")} />
                <Kpi label={t("Invoice due")} value={formatPaise(payables.dueMinor)} hint={`${payables.invoiceCount} ${t("purchase invoices")}`} />
                <Kpi label={t("Opening balances")} value={formatPaise(payables.openingBalanceMinor)} />
                <Kpi label={t("Suppliers")} value={String(payables.supplierCount)} hint={t("With an outstanding balance")} />
              </div>
              <ReportTable
                title={t(tabTitles[tab])}
                subtitle={periodLabel}
                empty={t("No supplier payable balances.")}
                hasRows={Boolean(payables.rows.length)}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Supplier")}</TableHead>
                      <TableHead>{t("Phone")}</TableHead>
                      <TableHead className="text-right">{t("Invoices")}</TableHead>
                      <TableHead className="text-right">{t("Billed")}</TableHead>
                      <TableHead className="text-right">{t("Invoice due")}</TableHead>
                      <TableHead className="text-right">{t("Opening")}</TableHead>
                      <TableHead className="text-right">{t("Outstanding")}</TableHead>
                      <TableHead>{t("Last invoice")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payables.rows.map((row) => (
                      <TableRow key={row.supplierId}>
                        <TableCell>
                          <Link className="font-medium text-zinc-900 hover:underline" to={`/suppliers/${row.supplierId}`}>
                            {row.supplierName}
                          </Link>
                          {row.supplierCode ? (
                            <p className="font-mono text-xs text-zinc-500">{row.supplierCode}</p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-zinc-600">{row.phone ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.invoiceCount}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPaise(row.billedMinor)}</TableCell>
                        <TableCell className="text-right tabular-nums text-zinc-600">{formatPaise(row.dueMinor)}</TableCell>
                        <TableCell className="text-right tabular-nums text-zinc-600">{formatPaise(row.openingBalanceMinor)}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{formatPaise(row.outstandingMinor)}</TableCell>
                        <TableCell className="text-zinc-500">{row.lastInvoiceDate ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ReportTable>
            </>
          ) : null}

          {tab === "items" && itemSales ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Kpi label={t("Sales")} value={formatPaise(itemSales.salesMinor)} hint={t("Including tax")} />
                <Kpi label={t("Quantity")} value={formatQuantityMilli(itemSales.quantityMilli)} hint={t("Across mixed units")} />
                <Kpi label={t("Items")} value={String(itemSales.itemCount)} hint={t("Sold in this period")} />
              </div>
              <ReportTable
                title={t(tabTitles[tab])}
                subtitle={periodLabel}
                empty={t("No item sales in this period.")}
                hasRows={Boolean(itemSales.rows.length)}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Code")}</TableHead>
                      <TableHead>{t("Item")}</TableHead>
                      <TableHead className="text-right">{t("Quantity")}</TableHead>
                      <TableHead className="text-right">{t("Invoices")}</TableHead>
                      <TableHead className="text-right">{t("Sales")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemSales.rows.map((row, index) => (
                      <TableRow key={`${row.itemId ?? "manual"}-${index}`}>
                        <TableCell className="font-mono text-xs text-zinc-500">{row.itemCode ?? "—"}</TableCell>
                        <TableCell className="font-medium text-zinc-900">{row.itemName}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatQuantityMilli(row.quantityMilli)}</TableCell>
                        <TableCell className="text-right tabular-nums text-zinc-600">{row.invoiceCount}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPaise(row.salesMinor)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ReportTable>
            </>
          ) : null}

          {tab === "gst" && gst ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi label={t("Taxable value")} value={formatPaise(gst.taxableMinor)} hint={`${gst.gstInvoiceCount} ${t("GST invoices")}`} />
                <Kpi label={t("Total tax")} value={formatPaise(gst.totalTaxMinor)} />
                <Kpi label={t("CGST + SGST")} value={formatPaise(gst.cgstMinor + gst.sgstMinor)} hint={`${formatPaise(gst.cgstMinor)} + ${formatPaise(gst.sgstMinor)}`} />
                <Kpi label={t("IGST")} value={formatPaise(gst.igstMinor)} />
              </div>
              <ReportTable
                title={t(tabTitles[tab])}
                subtitle={periodLabel}
                empty={t("No GST sales in this period.")}
                hasRows={Boolean(gst.rows.length)}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Tax rate")}</TableHead>
                      <TableHead className="text-right">{t("Taxable")}</TableHead>
                      <TableHead className="text-right">{t("Tax")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gst.rows.map((row) => (
                      <TableRow key={row.taxRateBps}>
                        <TableCell className="font-medium text-zinc-900">{formatTaxBps(row.taxRateBps)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPaise(row.taxableMinor)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPaise(row.taxMinor)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ReportTable>
              <Card>
                <CardContent className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">{t("Non-GST sales in period")}</span>
                  <span className="font-medium tabular-nums">{formatPaise(gst.nonGstSalesMinor)}</span>
                </CardContent>
              </Card>
            </>
          ) : null}

          {tab === "expenses" && expenses ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Kpi label={t("Total expenses")} value={formatPaise(expenses.totalMinor)} />
                <Kpi label={t("Entries")} value={String(expenses.entryCount)} />
                <Kpi label={t("Categories")} value={String(expenses.rows.length)} />
              </div>
              <ReportTable
                title={t(tabTitles[tab])}
                subtitle={periodLabel}
                empty={t("No expenses recorded in this period.")}
                hasRows={Boolean(expenses.rows.length)}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Category")}</TableHead>
                      <TableHead className="text-right">{t("Entries")}</TableHead>
                      <TableHead className="text-right">{t("Amount")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.rows.map((row) => (
                      <TableRow key={row.categoryId ?? "uncategorized"}>
                        <TableCell className="font-medium text-zinc-900">{row.categoryName}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.entryCount}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPaise(row.amountMinor)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ReportTable>
            </>
          ) : null}

          {tab === "stock" && stock ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Kpi label={t("Stock value")} value={formatPaise(stock.totalValueMinor)} hint={t("At default purchase rates")} />
                <Kpi label={t("Items")} value={String(stock.itemCount)} />
                <Kpi label={t("Low stock")} value={String(stock.lowStockCount)} hint={t("At or below reorder level")} />
              </div>
              <ReportTable
                title={t(tabTitles[tab])}
                subtitle={t("Current stock on hand")}
                empty={t("No items found.")}
                hasRows={Boolean(stock.rows.length)}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Code")}</TableHead>
                      <TableHead>{t("Item")}</TableHead>
                      <TableHead className="text-right">{t("On hand")}</TableHead>
                      <TableHead className="text-right">{t("Reorder")}</TableHead>
                      <TableHead className="text-right">{t("Cost rate")}</TableHead>
                      <TableHead className="text-right">{t("Value")}</TableHead>
                      <TableHead>{t("Status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stock.rows.map((row) => {
                      const low =
                        row.isActive &&
                        row.reorderLevelMilli > 0 &&
                        row.quantityMilli < row.reorderLevelMilli;
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="font-mono text-xs text-zinc-500">{row.itemCode}</TableCell>
                          <TableCell className="font-medium text-zinc-900">
                            {row.name}
                            {row.unitAbbreviation ? (
                              <span className="ml-1 text-xs font-normal text-zinc-500">
                                ({row.unitAbbreviation})
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatQuantityMilli(row.quantityMilli)}</TableCell>
                          <TableCell className="text-right tabular-nums text-zinc-600">{formatQuantityMilli(row.reorderLevelMilli)}</TableCell>
                          <TableCell className="text-right tabular-nums text-zinc-600">{formatPaise(row.purchaseRateMinor)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatPaise(row.stockValueMinor)}</TableCell>
                          <TableCell>
                            {!row.isActive ? (
                              <Badge variant="muted">Inactive</Badge>
                            ) : low ? (
                              <Badge variant="danger">Low</Badge>
                            ) : (
                              <Badge variant="success">OK</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ReportTable>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

function ReportTable({
  title,
  subtitle,
  empty,
  hasRows,
  children,
}: {
  title: string;
  subtitle: string;
  empty: string;
  hasRows: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
        </div>
      </CardHeader>
      <CardContent className="p-0 pb-2">
        {hasRows ? children : <EmptyState title={empty} />}
      </CardContent>
    </Card>
  );
}
