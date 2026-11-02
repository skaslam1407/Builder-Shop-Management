import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Search, Undo2 } from "lucide-react";
import {
  getErrorMessage,
  purchaseApi,
  supplierApi,
  supplierPaymentApi,
} from "@/lib/api";
import { formatPaise, paiseToRupees, rupeesToPaise } from "@/lib/money";
import type {
  Paged,
  PaymentMode,
  PurchaseInvoiceSummary,
  Supplier,
  SupplierPayment,
} from "@/lib/types";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
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

const paymentModes: { value: PaymentMode; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CARD", label: "Card" },
  { value: "OTHER", label: "Other" },
];

const emptyPage: Paged<SupplierPayment> = { items: [], total: 0, page: 1, pageSize: 25 };

export function SupplierPaymentsPage() {
  const navigate = useNavigate();
  const canManage = useAuthStore((state) =>
    Boolean(state.user?.permissions.includes("purchases.manage")),
  );
  const [data, setData] = useState<Paged<SupplierPayment>>(emptyPage);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [invoices, setInvoices] = useState<PurchaseInvoiceSummary[]>([]);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("CASH");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(
        await supplierPaymentApi.list({
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

  useEffect(() => {
    supplierApi
      .list({ page: 1, pageSize: 200, includeInactive: false })
      .then((result) => setSuppliers(result.items))
      .catch(() => setSuppliers([]));
  }, []);

  useEffect(() => {
    if (!supplierId) {
      setInvoices([]);
      setInvoiceId("");
      return;
    }
    purchaseApi
      .list({
        supplierId: Number(supplierId),
        status: "FINALIZED",
        page: 1,
        pageSize: 200,
      })
      .then((result) => setInvoices(result.items))
      .catch(() => setInvoices([]));
  }, [supplierId]);

  const refresh = () => setReloadKey((key) => key + 1);

  const openCreate = () => {
    setSupplierId("");
    setInvoiceId("");
    setInvoices([]);
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setAmount("");
    setPaymentMode("CASH");
    setReference("");
    setNotes("");
    setFormError(null);
    setModalOpen(true);
  };

  const applyInvoice = (value: string) => {
    setInvoiceId(value);
    const invoice = invoices.find((entry) => String(entry.id) === value);
    if (invoice) setAmount(String(paiseToRupees(invoice.dueMinor)));
  };

  const save = async () => {
    setFormError(null);
    if (!supplierId) {
      setFormError("Select a supplier");
      return;
    }
    const amountMinor = rupeesToPaise(amount);
    if (amountMinor <= 0) {
      setFormError("Payment amount must be greater than zero");
      return;
    }
    setSaving(true);
    try {
      await supplierPaymentApi.create({
        supplierId: Number(supplierId),
        purchaseInvoiceId: invoiceId ? Number(invoiceId) : undefined,
        paymentDate,
        amountMinor,
        paymentMode,
        referenceNumber: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setModalOpen(false);
      refresh();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const reverse = async (payment: SupplierPayment) => {
    const reason = window.prompt("Why is this payment being reversed?");
    if (!reason?.trim()) return;
    if (!window.confirm("Reverse this supplier payment? The payable balance will be restored.")) {
      return;
    }
    try {
      await supplierPaymentApi.reverse(payment.id, reason.trim());
      refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const firstRow = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const lastRow = Math.min(data.page * data.pageSize, data.total);
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3"
            onClick={() => navigate("/purchases")}
          >
            <ArrowLeft className="h-4 w-4" /> {t("Back to purchases")}
          </Button>
          <h2 className="mt-2 text-2xl font-semibold text-zinc-900">{t("Supplier payments")}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Invoice payments and advance payments to suppliers.
          </p>
        </div>
        {canManage ? (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> {t("Record payment")}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            className="pl-9"
            placeholder="Search supplier, reference, or purchase"
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
          <option value="POSTED">{t("Posted")}</option>
          <option value="REVERSED">{t("Reversed")}</option>
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
          <LoadingBlock label={t("Loading supplier payments…")} />
        ) : data.items.length === 0 ? (
          <EmptyState
            title={search ? "No matching payments" : "No supplier payments yet"}
            description={
              search
                ? "Try a different supplier, reference, or date range."
                : "Record a payment against a finalized purchase or as an advance."
            }
            action={
              canManage ? (
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" /> {t("Record payment")}
                </Button>
              ) : null
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Date")}</TableHead>
                <TableHead>{t("Supplier")}</TableHead>
                <TableHead>{t("Purchase")}</TableHead>
                <TableHead>{t("Mode")}</TableHead>
                <TableHead>{t("Reference")}</TableHead>
                <TableHead>{t("Status")}</TableHead>
                <TableHead className="text-right">{t("Amount")}</TableHead>
                <TableHead className="text-right">{t("Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="text-zinc-600">{payment.paymentDate}</TableCell>
                  <TableCell>
                    <Link
                      className="font-medium text-zinc-900 hover:underline"
                      to={`/suppliers/${payment.supplierId}`}
                    >
                      {payment.supplierName ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-zinc-600">
                    {payment.purchaseInvoiceId ? (
                      <Link
                        className="hover:underline"
                        to={`/purchases/${payment.purchaseInvoiceId}`}
                      >
                        {payment.internalReference ?? `#${payment.purchaseInvoiceId}`}
                      </Link>
                    ) : (
                      <Badge variant="outline">{t("Advance")}</Badge>
                    )}
                  </TableCell>
                  <TableCell>{payment.paymentMode.replaceAll("_", " ")}</TableCell>
                  <TableCell className="font-mono text-xs text-zinc-500">
                    {payment.referenceNumber ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={payment.status === "POSTED" ? "success" : "danger"}>
                      {payment.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPaise(payment.amountMinor)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      {payment.status === "POSTED" && canManage ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => void reverse(payment)}
                        >
                          <Undo2 className="h-3.5 w-3.5" /> {t("Reverse")}
                        </Button>
                      ) : null}
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={t("Record supplier payment")}
        description={t("Leave the purchase blank to record an advance payment.")}
      >
        <div className="space-y-4">
          {formError ? <ErrorBanner message={formError} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="paymentSupplier">{t("Supplier")}</Label>
              <Select
                id="paymentSupplier"
                className="mt-1.5"
                value={supplierId}
                onChange={(event) => {
                  setSupplierId(event.target.value);
                  setInvoiceId("");
                }}
              >
                <option value="">{t("Select a supplier")}</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="paymentInvoice">{t("Purchase invoice")}</Label>
              <Select
                id="paymentInvoice"
                className="mt-1.5"
                value={invoiceId}
                onChange={(event) => applyInvoice(event.target.value)}
                disabled={!supplierId}
              >
                <option value="">{t("Advance / no invoice")}</option>
                {invoices
                  .filter((invoice) => invoice.dueMinor > 0)
                  .map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.internalReference} · due {formatPaise(invoice.dueMinor)}
                    </option>
                  ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="supplierAmount">{t("Amount (₹)")}</Label>
              <Input
                id="supplierAmount"
                type="number"
                min="0"
                step="0.01"
                className="mt-1.5"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="supplierPaymentDate">{t("Payment date")}</Label>
              <Input
                id="supplierPaymentDate"
                type="date"
                className="mt-1.5"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="supplierPaymentMode">{t("Mode")}</Label>
              <Select
                id="supplierPaymentMode"
                className="mt-1.5"
                value={paymentMode}
                onChange={(event) => setPaymentMode(event.target.value as PaymentMode)}
              >
                {paymentModes.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="supplierReference">{t("Reference")}</Label>
              <Input
                id="supplierReference"
                className="mt-1.5"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="supplierNotes">{t("Notes")}</Label>
            <Textarea
              id="supplierNotes"
              className="mt-1.5"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? t("Saving…") : t("Record payment")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
