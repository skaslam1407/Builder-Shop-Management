import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, Plus, Search, Wallet } from "lucide-react";
import { getErrorMessage, purchaseApi } from "@/lib/api";
import { formatPaise } from "@/lib/money";
import type { Paged, PurchaseInvoiceSummary } from "@/lib/types";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, ErrorBanner, LoadingBlock } from "@/components/ui/feedback";
import { t } from "@/lib/i18n";

const emptyPage: Paged<PurchaseInvoiceSummary> = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 25,
};

const statusVariant = (status: string) => {
  if (status === "FINALIZED") return "success" as const;
  if (status === "CANCELLED") return "danger" as const;
  return "muted" as const;
};

export function PurchasesListPage() {
  const navigate = useNavigate();
  const canManage = useAuthStore((state) =>
    Boolean(state.user?.permissions.includes("purchases.manage")),
  );
  const [data, setData] = useState<Paged<PurchaseInvoiceSummary>>(emptyPage);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(
        await purchaseApi.list({
          search: search.trim() || undefined,
          status: status || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          page,
          pageSize: 25,
        }),
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [search, status, dateFrom, dateTo, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [load, reloadKey]);

  const refresh = () => setReloadKey((key) => key + 1);
  const firstRow = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const lastRow = Math.min(data.page * data.pageSize, data.total);
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-900">{t("Purchases")}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Supplier invoices, stock-in posting, and payable balances.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate("/supplier-payments")}>
            <Wallet className="h-4 w-4" /> {t("Supplier payments")}
          </Button>
          {canManage ? (
            <Button onClick={() => navigate("/purchases/new")}>
              <Plus className="h-4 w-4" /> {t("New purchase")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            className="pl-9"
            placeholder={t("Search reference, supplier invoice, or supplier")}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          className="w-40"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">{t("All statuses")}</option>
          <option value="DRAFT">{t("Draft")}</option>
          <option value="FINALIZED">{t("Finalized")}</option>
          <option value="CANCELLED">{t("Cancelled")}</option>
        </Select>
        <Input
          type="date"
          className="w-40"
          value={dateFrom}
          onChange={(event) => {
            setDateFrom(event.target.value);
            setPage(1);
          }}
        />
        <Input
          type="date"
          className="w-40"
          value={dateTo}
          onChange={(event) => {
            setDateTo(event.target.value);
            setPage(1);
          }}
        />
      </div>

      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        {loading ? (
          <LoadingBlock label={t("Loading purchases…")} />
        ) : data.items.length === 0 ? (
          <EmptyState
            title={search ? "No matching purchases" : "No purchases yet"}
            description={
              search
                ? "Try a different reference, supplier, or date range."
                : "Record a supplier invoice to receive stock and track payables."
            }
            action={
              canManage && !search ? (
                <Button onClick={() => navigate("/purchases/new")}>
                  <Plus className="h-4 w-4" /> {t("New purchase")}
                </Button>
              ) : null
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Reference")}</TableHead>
                <TableHead>{t("Date")}</TableHead>
                <TableHead>{t("Supplier")}</TableHead>
                <TableHead>{t("Supplier invoice")}</TableHead>
                <TableHead>{t("Status")}</TableHead>
                <TableHead className="text-right">{t("Total")}</TableHead>
                <TableHead className="text-right">{t("Paid")}</TableHead>
                <TableHead className="text-right">{t("Due")}</TableHead>
                <TableHead className="text-right">{t("Open")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-mono text-xs text-zinc-700">
                    <Link className="hover:underline" to={`/purchases/${invoice.id}`}>
                      {invoice.internalReference}
                    </Link>
                  </TableCell>
                  <TableCell className="text-zinc-600">{invoice.invoiceDate}</TableCell>
                  <TableCell className="font-medium text-zinc-900">
                    {invoice.supplierName ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-zinc-600">
                    {invoice.supplierInvoiceNumber}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(invoice.status)}>{invoice.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPaise(invoice.grandTotalMinor)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-zinc-600">
                    {formatPaise(invoice.paidMinor)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium text-zinc-900">
                    {formatPaise(invoice.dueMinor)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Link to={`/purchases/${invoice.id}`}>
                        <Button variant="ghost" size="sm">
                          <Eye className="h-3.5 w-3.5" /> {t("View")}
                        </Button>
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {!loading && data.total > 0 ? (
        <div className="flex items-center justify-between text-sm text-zinc-500">
          <span>
            Showing {firstRow}–{lastRow} of {data.total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Previous
            </Button>
            <span className="text-xs">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
