import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { customerApi, getErrorMessage, ledgerApi } from "@/lib/api";
import { formatPaise } from "@/lib/money";
import type { Customer, CustomerLedger } from "@/lib/types";
import { Button } from "@/components/ui/button";
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
import { ErrorBanner, LoadingBlock } from "@/components/ui/feedback";
import { t } from "@/lib/i18n";

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const customerId = Number(id);
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [ledger, setLedger] = useState<CustomerLedger | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    if (!Number.isFinite(customerId)) return;
    setLoading(true);
    setError(null);
    try {
      const [record, entries] = await Promise.all([
        customerApi.get(customerId),
        ledgerApi.customer(customerId),
      ]);
      setCustomer(record);
      setLedger(entries);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  if (loading) return <LoadingBlock label={t("Loading customer ledger…")} />;
  if (!customer || !ledger) {
    return (
      <div className="space-y-4">
        <ErrorBanner
          message={error ?? t("Customer not found")}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
        <Button variant="outline" onClick={() => navigate("/customers")}>
          <ArrowLeft className="h-4 w-4" /> {t("Back to customers")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 print:hidden"
            onClick={() => navigate("/customers")}
          >
            <ArrowLeft className="h-4 w-4" /> {t("Back to customers")}
          </Button>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold text-zinc-900">{customer.name}</h2>
            <Badge variant={customer.isActive ? "success" : "muted"}>
              {customer.isActive ? t("Active") : t("Inactive")}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {customer.customerCode ?? t("No code")} · {customer.phone ?? t("No phone")}
          </p>
        </div>
        <Button variant="outline" className="print:hidden" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> {t("Print statement")}
        </Button>
      </div>

      {error ? <ErrorBanner message={error} onRetry={() => setReloadKey((key) => key + 1)} /> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card>
          <CardHeader>
            <CardTitle>{t("Customer details")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
            <Detail label={t("Phone")} value={customer.phone ?? "—"} />
            <Detail label={t("Email")} value={customer.email ?? "—"} />
            <Detail label={t("GSTIN")} value={customer.gstin ?? "—"} mono />
            <Detail
              label={t("Opening balance")}
              value={formatPaise(customer.openingBalanceMinor)}
            />
            <div className="sm:col-span-2">
              <Detail label={t("Billing address")} value={customer.billingAddress ?? "—"} />
            </div>
            <div className="sm:col-span-2">
              <Detail label={t("Shipping address")} value={customer.shippingAddress ?? "—"} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("Outstanding")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">{t("Opening balance")}</span>
              <span className="tabular-nums">{formatPaise(ledger.openingBalanceMinor)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">{t("Entries")}</span>
              <span className="tabular-nums">{ledger.entries.length}</span>
            </div>
            <div className="flex items-center justify-between border-t border-zinc-200 pt-2 font-medium text-zinc-900">
              <span>{t("Closing balance")}</span>
              <span className="tabular-nums">{formatPaise(ledger.closingBalanceMinor)}</span>
            </div>
            <p className="pt-2 text-xs text-zinc-400">
              {t("Finalized invoices increase the balance; posted payments reduce it.")}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("Customer ledger")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Date")}</TableHead>
                <TableHead>{t("Type")}</TableHead>
                <TableHead>{t("Reference")}</TableHead>
                <TableHead className="text-right">{t("Debit")}</TableHead>
                <TableHead className="text-right">{t("Credit")}</TableHead>
                <TableHead className="text-right">{t("Balance")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell colSpan={5} className="text-sm font-medium text-zinc-700">
                  {t("Opening balance")}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatPaise(ledger.openingBalanceMinor)}
                </TableCell>
              </TableRow>
              {ledger.entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-sm text-zinc-500">
                    {t("No ledger entries yet.")}
                  </TableCell>
                </TableRow>
              ) : (
                ledger.entries.map((entry, index) => (
                  <TableRow key={`${entry.entryType}-${entry.reference}-${index}`}>
                    <TableCell className="text-zinc-600">{entry.entryDate}</TableCell>
                    <TableCell>
                      <Badge variant={entry.entryType === "Invoice" ? "default" : "success"}>
                        {entry.entryType === "Invoice"
                          ? t("Invoice")
                          : entry.entryType === "Payment"
                            ? t("Payment")
                            : entry.entryType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-zinc-600">
                      {entry.entryType === "Invoice" ? (
                        <Link className="hover:underline" to={`/sales?search=${encodeURIComponent(entry.reference)}`}>
                          {entry.reference}
                        </Link>
                      ) : (
                        entry.reference
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.debitMinor ? formatPaise(entry.debitMinor) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.creditMinor ? formatPaise(entry.creditMinor) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatPaise(entry.balanceMinor)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</p>
      <p className={mono ? "mt-1 font-mono text-sm text-zinc-700" : "mt-1 text-zinc-700"}>
        {value}
      </p>
    </div>
  );
}
