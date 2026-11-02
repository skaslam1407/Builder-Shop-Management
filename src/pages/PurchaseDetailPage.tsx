import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Pencil,
  Undo2,
  Wallet,
} from "lucide-react";
import { getErrorMessage, purchaseApi, supplierPaymentApi } from "@/lib/api";
import {
  formatPaise,
  formatQuantityMilli,
  formatTaxBps,
  paiseToRupees,
  rupeesToPaise,
} from "@/lib/money";
import type { PaymentMode, PurchaseInvoice } from "@/lib/types";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
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
import { t } from "@/lib/i18n";

const paymentModes: { value: PaymentMode; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CARD", label: "Card" },
  { value: "OTHER", label: "Other" },
];

const statusVariant = (status: string) => {
  if (status === "FINALIZED") return "success" as const;
  if (status === "CANCELLED") return "danger" as const;
  return "muted" as const;
};

export function PurchaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const invoiceId = Number(id);
  const navigate = useNavigate();
  const canManage = useAuthStore((state) =>
    Boolean(state.user?.permissions.includes("purchases.manage")),
  );

  const [invoice, setInvoice] = useState<PurchaseInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("CASH");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(invoiceId)) return;
    setLoading(true);
    setError(null);
    try {
      setInvoice(await purchaseApi.get(invoiceId));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const refresh = () => setReloadKey((key) => key + 1);

  const finalize = async () => {
    if (!invoice) return;
    if (!window.confirm("Finalize this purchase? Stock will be received and the reference number assigned.")) {
      return;
    }
    setBusy(true);
    try {
      await purchaseApi.finalize(invoice.id);
      refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const runCancel = async () => {
    if (!invoice) return;
    setCancelError(null);
    if (!cancelReason.trim()) {
      setCancelError("A cancellation reason is required");
      return;
    }
    try {
      await purchaseApi.cancel(invoice.id, cancelReason.trim());
      setCancelOpen(false);
      setCancelReason("");
      refresh();
    } catch (err) {
      setCancelError(getErrorMessage(err));
    }
  };

  const openPayment = () => {
    if (!invoice) return;
    setPaymentAmount(String(paiseToRupees(invoice.dueMinor)));
    setPaymentMode("CASH");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentReference("");
    setPaymentNote("");
    setPaymentError(null);
    setPaymentOpen(true);
  };

  const runPayment = async () => {
    if (!invoice) return;
    setPaymentError(null);
    const amountMinor = rupeesToPaise(paymentAmount);
    if (amountMinor <= 0) {
      setPaymentError("Payment amount must be greater than zero");
      return;
    }
    try {
      await supplierPaymentApi.create({
        supplierId: invoice.supplierId,
        purchaseInvoiceId: invoice.id,
        paymentDate,
        amountMinor,
        paymentMode,
        referenceNumber: paymentReference.trim() || undefined,
        notes: paymentNote.trim() || undefined,
      });
      setPaymentOpen(false);
      refresh();
    } catch (err) {
      setPaymentError(getErrorMessage(err));
    }
  };

  const reversePayment = async (paymentId: number) => {
    const reason = window.prompt("Why is this payment being reversed?");
    if (!reason?.trim()) return;
    if (!window.confirm("Reverse this payment? The purchase balance will be restored.")) return;
    try {
      await supplierPaymentApi.reverse(paymentId, reason.trim());
      refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  if (loading) return <LoadingBlock label={t("Loading purchase…")} />;
  if (!invoice) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={error ?? "Purchase not found"} onRetry={refresh} />
        <Button variant="outline" onClick={() => navigate("/purchases")}>
          <ArrowLeft className="h-4 w-4" /> {t("Back to purchases")}
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
            className="-ml-3"
            onClick={() => navigate("/purchases")}
          >
            <ArrowLeft className="h-4 w-4" /> {t("Back to purchases")}
          </Button>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold text-zinc-900">
              {invoice.internalReference}
            </h2>
            <Badge variant={statusVariant(invoice.status)}>{invoice.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            <Link className="hover:underline" to={`/suppliers/${invoice.supplierId}`}>
              {invoice.supplierName ?? "Unknown supplier"}
            </Link>{" "}
            · Invoice {invoice.supplierInvoiceNumber} · {invoice.invoiceDate}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {invoice.status === "DRAFT" && canManage ? (
            <>
              <Button
                variant="outline"
                onClick={() => navigate(`/purchases/${invoice.id}/edit`)}
              >
                <Pencil className="h-4 w-4" /> {t("Edit draft")}
              </Button>
              <Button onClick={() => void finalize()} disabled={busy}>
                <CheckCircle2 className="h-4 w-4" /> {t("Finalize")}
              </Button>
            </>
          ) : null}
          {invoice.status === "FINALIZED" && invoice.dueMinor > 0 && canManage ? (
            <Button variant="secondary" onClick={openPayment}>
              <Wallet className="h-4 w-4" /> {t("Record payment")}
            </Button>
          ) : null}
          {invoice.status === "FINALIZED" && canManage ? (
            <Button
              variant="danger"
              onClick={() => {
                setCancelReason("");
                setCancelError(null);
                setCancelOpen(true);
              }}
            >
              <Ban className="h-4 w-4" /> {t("Cancel purchase")}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}
      {invoice.status === "CANCELLED" ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Cancelled on {invoice.cancelledAt ?? "—"}
          {invoice.cancellationReason ? ` · ${invoice.cancellationReason}` : ""}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>{t("Supplier")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-zinc-700">
            <p className="font-medium text-zinc-900">{invoice.supplierName ?? "—"}</p>
            <p className="text-zinc-500">Supplier invoice: {invoice.supplierInvoiceNumber}</p>
            {invoice.notes ? (
              <p className="whitespace-pre-line pt-2 text-zinc-500">{invoice.notes}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("Payment summary")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <SummaryRow label={t("Grand total")} value={formatPaise(invoice.grandTotalMinor)} />
            <SummaryRow label={t("Paid")} value={formatPaise(invoice.paidMinor)} />
            <div className="flex items-center justify-between border-t border-zinc-200 pt-2 font-medium text-zinc-900">
              <span>{t("Balance due")}</span>
              <span className="tabular-nums">{formatPaise(invoice.dueMinor)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("Line items")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>{t("Description")}</TableHead>
                <TableHead className="text-right">{t("Qty")}</TableHead>
                <TableHead className="text-right">{t("Rate")}</TableHead>
                <TableHead className="text-right">{t("Discount")}</TableHead>
                <TableHead className="text-right">{t("Taxable")}</TableHead>
                <TableHead className="text-right">{t("Tax")}</TableHead>
                <TableHead className="text-right">{t("Total")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.lines.map((line, index) => (
                <TableRow key={line.id}>
                  <TableCell className="text-zinc-500">{index + 1}</TableCell>
                  <TableCell>
                    <p className="font-medium text-zinc-900">{line.descriptionSnapshot}</p>
                    {line.unitAbbreviation ? (
                      <p className="text-xs text-zinc-500">Unit: {line.unitAbbreviation}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQuantityMilli(line.quantityMilli)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPaise(line.rateMinor)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-zinc-600">
                    {formatPaise(line.discountMinor)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPaise(line.taxableMinor)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-zinc-600">
                    {line.taxRateBps
                      ? `${formatTaxBps(line.taxRateBps)} · ${formatPaise(line.taxMinor)}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatPaise(line.lineTotalMinor)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="grid gap-2 border-t border-zinc-100 px-6 py-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
            <SummaryRow label={t("Subtotal")} value={formatPaise(invoice.subtotalMinor)} />
            <SummaryRow label={t("Discount")} value={formatPaise(invoice.discountMinor)} />
            <SummaryRow label={t("Tax")} value={formatPaise(invoice.taxMinor)} />
            <SummaryRow label={t("Grand total")} value={formatPaise(invoice.grandTotalMinor)} />
            <SummaryRow label={t("Due")} value={formatPaise(invoice.dueMinor)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Payments")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {invoice.payments.length === 0 ? (
            <p className="px-6 py-6 text-sm text-zinc-500">{t("No supplier payments recorded yet.")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Date")}</TableHead>
                  <TableHead>{t("Mode")}</TableHead>
                  <TableHead>{t("Reference")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                  <TableHead className="text-right">{t("Amount")}</TableHead>
                  <TableHead className="text-right">{t("Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="text-zinc-600">{payment.paymentDate}</TableCell>
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
                            onClick={() => void reversePayment(payment.id)}
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
        </CardContent>
      </Card>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={t("Cancel purchase")}
        description={t("Stock received from this purchase will be reversed. Payments must be reversed first.")}
      >
        <div className="space-y-4">
          {cancelError ? <ErrorBanner message={cancelError} /> : null}
          <div>
            <Label htmlFor="cancelReason">{t("Cancellation reason")}</Label>
            <Textarea
              id="cancelReason"
              className="mt-1.5"
              rows={3}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep purchase
            </Button>
            <Button variant="danger" onClick={() => void runCancel()}>
              {t("Cancel purchase")}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        title={t("Record supplier payment")}
        description={`Balance due ${formatPaise(invoice.dueMinor)}`}
      >
        <div className="space-y-4">
          {paymentError ? <ErrorBanner message={paymentError} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="paymentAmount">{t("Amount (₹)")}</Label>
              <Input
                id="paymentAmount"
                type="number"
                min="0"
                step="0.01"
                className="mt-1.5"
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
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
              <Label htmlFor="paymentReference">{t("Reference")}</Label>
              <Input
                id="paymentReference"
                className="mt-1.5"
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="paymentNote">{t("Notes")}</Label>
            <Textarea
              id="paymentNote"
              className="mt-1.5"
              rows={2}
              value={paymentNote}
              onChange={(event) => setPaymentNote(event.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button onClick={() => void runPayment()}>{t("Record payment")}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-zinc-500">{label}</span>
      <span className="tabular-nums text-zinc-900">{value}</span>
    </div>
  );
}
