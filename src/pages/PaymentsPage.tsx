import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Undo2, Wallet } from "lucide-react";
import { customerApi, getErrorMessage, paymentApi, salesApi } from "@/lib/api";
import { formatPaise, paiseToRupees, rupeesToPaise } from "@/lib/money";
import type {
  Customer,
  Paged,
  Payment,
  PaymentMode,
  SalesInvoiceSummary,
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

const emptyPage: Paged<Payment> = { items: [], total: 0, page: 1, pageSize: 25 };

const paymentModes: { value: PaymentMode; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CARD", label: "Card" },
  { value: "OTHER", label: "Other" },
];

export function PaymentsPage() {
  const canManage = useAuthStore((state) =>
    Boolean(state.user?.permissions.includes("payments.manage")),
  );
  const [data, setData] = useState<Paged<Payment>>(emptyPage);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<SalesInvoiceSummary[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PaymentMode>("CASH");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await paymentApi.list({
        search: search.trim() || undefined,
        status: status || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        pageSize: 25,
      });
      setData(result);
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

  const loadOptions = useCallback(async () => {
    try {
      const [customerPage, invoicePage] = await Promise.all([
        customerApi.list({ page: 1, pageSize: 200 }),
        salesApi.list({ status: "FINALIZED", page: 1, pageSize: 200 }),
      ]);
      setCustomers(customerPage.items);
      setInvoices(invoicePage.items);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions, reloadKey]);

  const refresh = () => setReloadKey((key) => key + 1);

  const openCreate = () => {
    setCustomerId("");
    setInvoiceId("");
    setAmount("");
    setMode("CASH");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setReference("");
    setNote("");
    setCreateError(null);
    setCreateOpen(true);
  };

  const availableInvoices = invoices.filter(
    (invoice) =>
      invoice.customerId === Number(customerId) && invoice.dueMinor > 0 && invoice.status === "FINALIZED",
  );

  const selectInvoice = (value: string) => {
    setInvoiceId(value);
    const invoice = invoices.find((entry) => String(entry.id) === value);
    setAmount(invoice ? String(paiseToRupees(invoice.dueMinor)) : "");
  };

  const createPayment = async () => {
    setCreateError(null);
    if (!customerId) {
      setCreateError("Select a customer");
      return;
    }
    const amountMinor = rupeesToPaise(amount);
    if (amountMinor <= 0) {
      setCreateError("Payment amount must be greater than zero");
      return;
    }
    try {
      await paymentApi.create({
        customerId: Number(customerId),
        salesInvoiceId: invoiceId ? Number(invoiceId) : undefined,
        paymentDate,
        amountMinor,
        paymentMode: mode,
        referenceNumber: reference.trim() || undefined,
        notes: note.trim() || undefined,
      });
      setCreateOpen(false);
      refresh();
    } catch (err) {
      setCreateError(getErrorMessage(err));
    }
  };

  const reversePayment = async (payment: Payment) => {
    const reason = window.prompt("Why is this payment being reversed?");
    if (!reason?.trim()) return;
    if (!window.confirm("Reverse this payment? The invoice balance will be restored.")) return;
    try {
      await paymentApi.reverse(payment.id, reason.trim());
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
          <h2 className="text-2xl font-semibold text-zinc-900">{t("Payments")}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Record invoice payments or customer advances. Reversals keep a full audit trail.
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
            placeholder={t("Search customer, invoice, or reference")}
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
          <LoadingBlock label={t("Loading payments…")} />
        ) : data.items.length === 0 ? (
          <EmptyState
            title={search ? "No matching payments" : "No payments yet"}
            description={
              search
                ? "Try a different customer, invoice number, or reference."
                : "Record a payment against a finalized invoice or as a customer advance."
            }
            action={
              canManage && !search ? (
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
                <TableHead>{t("Customer")}</TableHead>
                <TableHead>{t("Invoice")}</TableHead>
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
                  <TableCell className="font-medium text-zinc-900">
                    {payment.customerName ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-zinc-600">
                    {payment.invoiceNumber ?? "Advance"}
                  </TableCell>
                  <TableCell className="text-zinc-700">
                    {payment.paymentMode.replaceAll("_", " ")}
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {payment.referenceNumber ?? "—"}
                  </TableCell>
                  <TableCell>
                    {payment.status === "POSTED" ? (
                      <Badge variant="success">{t("Posted")}</Badge>
                    ) : (
                      <Badge variant="danger">{t("Reversed")}</Badge>
                    )}
                    {payment.reversalReason ? (
                      <p className="mt-1 max-w-40 text-xs text-zinc-500">
                        {payment.reversalReason}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatPaise(payment.amountMinor)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      {payment.status === "POSTED" && canManage ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => void reversePayment(payment)}
                        >
                          <Undo2 className="h-3.5 w-3.5" /> {t("Reverse")}
                        </Button>
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
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
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("Record payment")}
        description={t("Apply a payment to a finalized invoice, or leave it unallocated as an advance.")}
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button onClick={() => void createPayment()}>
              <Wallet className="h-4 w-4" /> {t("Save payment")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {createError ? <ErrorBanner message={createError} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="paymentCustomer">{t("Customer")}</Label>
              <Select
                id="paymentCustomer"
                className="mt-1.5"
                value={customerId}
                onChange={(event) => {
                  setCustomerId(event.target.value);
                  setInvoiceId("");
                  setAmount("");
                }}
              >
                <option value="">{t("Select a customer")}</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="paymentInvoice">{t("Apply to invoice")}</Label>
              <Select
                id="paymentInvoice"
                className="mt-1.5"
                value={invoiceId}
                onChange={(event) => selectInvoice(event.target.value)}
                disabled={!customerId}
              >
                <option value="">{t("Advance / on account")}</option>
                {availableInvoices.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.invoiceNumber} · due {formatPaise(invoice.dueMinor)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="paymentAmount">{t("Amount (₹)")}</Label>
              <Input
                id="paymentAmount"
                type="number"
                min="0"
                step="0.01"
                className="mt-1.5"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="paymentDate">{t("Payment date")}</Label>
              <Input
                id="paymentDate"
                type="date"
                className="mt-1.5"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="paymentMode">{t("Mode")}</Label>
              <Select
                id="paymentMode"
                className="mt-1.5"
                value={mode}
                onChange={(event) => setMode(event.target.value as PaymentMode)}
              >
                {paymentModes.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="paymentReference">{t("Reference")}</Label>
              <Input
                id="paymentReference"
                className="mt-1.5"
                placeholder={t("Optional")}
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="paymentNote">{t("Notes")}</Label>
            <Textarea
              id="paymentNote"
              className="mt-1.5"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
