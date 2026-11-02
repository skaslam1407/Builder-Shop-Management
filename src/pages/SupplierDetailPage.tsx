import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil } from "lucide-react";
import {
  getErrorMessage,
  ledgerApi,
  purchaseApi,
  supplierApi,
  supplierPaymentApi,
} from "@/lib/api";
import { formatPaise } from "@/lib/money";
import type {
  Paged,
  PurchaseInvoiceSummary,
  Supplier,
  SupplierInput,
  SupplierLedger,
  SupplierPayment,
} from "@/lib/types";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
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
import { SupplierForm } from "@/components/suppliers/SupplierForm";
import { t } from "@/lib/i18n";

const emptyPurchases: Paged<PurchaseInvoiceSummary> = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
};
const emptyPayments: Paged<SupplierPayment> = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
};

export function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const supplierId = Number(id);
  const navigate = useNavigate();
  const canManage = useAuthStore((state) =>
    Boolean(state.user?.permissions.includes("suppliers.manage")),
  );

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [purchases, setPurchases] =
    useState<Paged<PurchaseInvoiceSummary>>(emptyPurchases);
  const [payments, setPayments] = useState<Paged<SupplierPayment>>(emptyPayments);
  const [ledger, setLedger] = useState<SupplierLedger | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(supplierId)) return;
    setLoading(true);
    setError(null);
    try {
      const [supplierResult, purchaseResult, paymentResult, ledgerResult] =
        await Promise.all([
          supplierApi.get(supplierId),
          purchaseApi.list({ supplierId, page: 1, pageSize: 10 }),
          supplierPaymentApi.list({ supplierId, page: 1, pageSize: 10 }),
          ledgerApi.supplier(supplierId),
        ]);
      setSupplier(supplierResult);
      setPurchases(purchaseResult);
      setPayments(paymentResult);
      setLedger(ledgerResult);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const refresh = () => setReloadKey((key) => key + 1);

  const save = async (input: SupplierInput) => {
    if (!supplier) return;
    await supplierApi.update(supplier.id, input);
    setEditOpen(false);
    refresh();
  };

  if (loading) return <LoadingBlock label={t("Loading supplier…")} />;
  if (!supplier) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={error ?? "Supplier not found"} onRetry={refresh} />
        <Button variant="outline" onClick={() => navigate("/suppliers")}>
          <ArrowLeft className="h-4 w-4" /> {t("Back to suppliers")}
        </Button>
      </div>
    );
  }

  const outstanding = purchases.items.reduce((sum, invoice) => sum + invoice.dueMinor, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3"
            onClick={() => navigate("/suppliers")}
          >
            <ArrowLeft className="h-4 w-4" /> {t("Back to suppliers")}
          </Button>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold text-zinc-900">{supplier.name}</h2>
            {supplier.isActive ? (
              <Badge variant="success">{t("Active")}</Badge>
            ) : (
              <Badge variant="muted">{t("Inactive")}</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {supplier.supplierCode ?? "No code"} · {supplier.phone ?? "No phone"}
          </p>
        </div>
        {canManage && supplier.isActive ? (
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> {t("Edit supplier")}
          </Button>
        ) : null}
      </div>

      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>{t("Supplier details")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
            <Detail label={t("Phone")} value={supplier.phone ?? "—"} />
            <Detail label={t("Email")} value={supplier.email ?? "—"} />
            <Detail label={t("GSTIN")} value={supplier.gstin ?? "—"} mono />
            <Detail
              label={t("Opening balance")}
              value={formatPaise(supplier.openingBalanceMinor)}
            />
            <div className="sm:col-span-2">
              <Detail label={t("Address")} value={supplier.address ?? "—"} />
            </div>
            {supplier.notes ? (
              <div className="sm:col-span-2">
                <Detail label={t("Notes")} value={supplier.notes} />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("Payables snapshot")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">{t("Opening balance")}</span>
              <span className="tabular-nums">
                {formatPaise(supplier.openingBalanceMinor)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">{t("Recent unpaid")}</span>
              <span className="tabular-nums">{formatPaise(outstanding)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-zinc-200 pt-2 font-medium text-zinc-900">
              <span>Outstanding (recent)</span>
              <span className="tabular-nums">
                {formatPaise(supplier.openingBalanceMinor + outstanding)}
              </span>
            </div>
            <p className="pt-2 text-xs text-zinc-400">
              Based on the latest {purchases.items.length} purchases shown below.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t("Supplier ledger")}</CardTitle>
          {ledger ? (
            <span className="text-sm text-zinc-500">
              {t("Closing balance")}:{" "}
              <span className="font-medium tabular-nums text-zinc-900">
                {formatPaise(ledger.closingBalanceMinor)}
              </span>
            </span>
          ) : null}
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {!ledger || ledger.entries.length === 0 ? (
            <p className="px-6 py-6 text-sm text-zinc-500">{t("No ledger entries yet.")}</p>
          ) : (
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
                {ledger.entries.map((entry, index) => (
                  <TableRow key={`${entry.entryType}-${entry.reference}-${index}`}>
                    <TableCell className="text-zinc-600">{entry.entryDate}</TableCell>
                    <TableCell>
                      <Badge variant={entry.entryType === "Purchase" ? "default" : "success"}>
                        {entry.entryType === "Purchase"
                          ? t("Purchase")
                          : entry.entryType === "Payment"
                            ? t("Payment")
                            : entry.entryType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-zinc-600">{entry.reference}</TableCell>
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t("Recent purchases")}</CardTitle>
          <Link to="/purchases">
            <Button variant="ghost" size="sm">
              {t("View all")}
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {purchases.items.length === 0 ? (
            <p className="px-6 py-6 text-sm text-zinc-500">{t("No purchases recorded.")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Reference")}</TableHead>
                  <TableHead>{t("Date")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                  <TableHead className="text-right">{t("Total")}</TableHead>
                  <TableHead className="text-right">{t("Due")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.items.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-mono text-xs">
                      <Link className="hover:underline" to={`/purchases/${invoice.id}`}>
                        {invoice.internalReference}
                      </Link>
                    </TableCell>
                    <TableCell className="text-zinc-600">{invoice.invoiceDate}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          invoice.status === "FINALIZED"
                            ? "success"
                            : invoice.status === "CANCELLED"
                              ? "danger"
                              : "muted"
                        }
                      >
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPaise(invoice.grandTotalMinor)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPaise(invoice.dueMinor)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t("Recent payments")}</CardTitle>
          <Link to="/supplier-payments">
            <Button variant="ghost" size="sm">
              {t("View all")}
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {payments.items.length === 0 ? (
            <p className="px-6 py-6 text-sm text-zinc-500">{t("No payments recorded.")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Date")}</TableHead>
                  <TableHead>{t("Purchase")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                  <TableHead className="text-right">{t("Amount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.items.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="text-zinc-600">{payment.paymentDate}</TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {payment.purchaseInvoiceId ? (
                        <Link
                          className="hover:underline"
                          to={`/purchases/${payment.purchaseInvoiceId}`}
                        >
                          {payment.internalReference ?? `#${payment.purchaseInvoiceId}`}
                        </Link>
                      ) : (
                        "Advance"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={payment.status === "POSTED" ? "success" : "danger"}>
                        {payment.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPaise(payment.amountMinor)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={t("Edit supplier")}>
        <SupplierForm
          supplier={supplier}
          onSubmit={save}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</p>
      <p className={mono ? "mt-1 font-mono text-sm text-zinc-700" : "mt-1 text-zinc-700"}>
        {value}
      </p>
    </div>
  );
}
