import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Pencil,
  Printer,
  Undo2,
  Wallet,
} from "lucide-react";
import { getErrorMessage, paymentApi, salesApi } from "@/lib/api";
import { formatPaise, formatQuantityMilli, formatTaxBps, paiseToRupees, rupeesToPaise } from "@/lib/money";
import type { PaymentMode, SalesInvoice } from "@/lib/types";
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

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const invoiceId = Number(id);
  const navigate = useNavigate();
  const canManage = useAuthStore((state) =>
    Boolean(state.user?.permissions.includes("sales.manage")),
  );
  const canManagePayments = useAuthStore((state) =>
    Boolean(state.user?.permissions.includes("payments.manage")),
  );

  const [invoice, setInvoice] = useState<SalesInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [finalizing, setFinalizing] = useState(false);
  const [finalizeAmount, setFinalizeAmount] = useState("0");
  const [finalizeMode, setFinalizeMode] = useState<PaymentMode>("CASH");
  const [finalizeReference, setFinalizeReference] = useState("");
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

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
      setInvoice(await salesApi.get(invoiceId));
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

  const openFinalize = () => {
    if (!invoice) return;
    setFinalizeAmount("0");
    setFinalizeMode("CASH");
    setFinalizeReference("");
    setFinalizeError(null);
    setFinalizing(true);
  };

  const runFinalize = async () => {
    if (!invoice) return;
    setFinalizeError(null);
    const amountMinor = rupeesToPaise(finalizeAmount);
    if (amountMinor > 0 && !invoice.customerId) {
      setFinalizeError("An initial payment requires a customer");
      return;
    }
    try {
      await salesApi.finalize(invoice.id, {
        initialPaymentMinor: amountMinor,
        paymentMode: amountMinor > 0 ? finalizeMode : undefined,
        referenceNumber: finalizeReference.trim() || undefined,
      });
      setFinalizing(false);
      refresh();
    } catch (err) {
      setFinalizeError(getErrorMessage(err));
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
      await salesApi.cancel(invoice.id, cancelReason.trim());
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
    if (!invoice || !invoice.customerId) return;
    setPaymentError(null);
    const amountMinor = rupeesToPaise(paymentAmount);
    if (amountMinor <= 0) {
      setPaymentError("Payment amount must be greater than zero");
      return;
    }
    try {
      await paymentApi.create({
        customerId: invoice.customerId,
        salesInvoiceId: invoice.id,
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
    if (!window.confirm("Reverse this payment? The invoice balance will be restored.")) return;
    try {
      await paymentApi.reverse(paymentId, reason.trim());
      refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  if (loading) return <LoadingBlock label={t("Loading invoice…")} />;
  if (!invoice) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={error ?? "Invoice not found"} onRetry={refresh} />
        <Button variant="outline" onClick={() => navigate("/sales")}>
          <ArrowLeft className="h-4 w-4" /> {t("Back to sales")}
        </Button>
      </div>
    );
  }

  const showInterState = invoice.invoiceType === "GST" && invoice.isInterState;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="-ml-3" onClick={() => navigate("/sales")}>
            <ArrowLeft className="h-4 w-4" /> {t("Back to sales")}
          </Button>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold text-zinc-900">{invoice.invoiceNumber}</h2>
            <Badge variant={statusVariant(invoice.status)}>{invoice.status}</Badge>
            <Badge variant="outline">
              {invoice.invoiceType === "GST" ? "GST" : "Non-GST"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {invoice.customerNameSnapshot} · {invoice.invoiceDate}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {invoice.status === "DRAFT" && canManage ? (
            <>
              <Button
                variant="outline"
                onClick={() => navigate(`/sales/${invoice.id}/edit`)}
              >
                <Pencil className="h-4 w-4" /> {t("Edit draft")}
              </Button>
              <Button onClick={openFinalize}>
                <CheckCircle2 className="h-4 w-4" /> {t("Finalize")}
              </Button>
            </>
          ) : null}
          {invoice.status !== "DRAFT" ? (
            <Link to={`/sales/${invoice.id}/print`}>
              <Button variant="outline">
                <Printer className="h-4 w-4" /> {t("Print")}
              </Button>
            </Link>
          ) : null}
          {invoice.status === "FINALIZED" && invoice.dueMinor > 0 && canManagePayments ? (
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
              <Ban className="h-4 w-4" /> {t("Cancel invoice")}
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
            <CardTitle>{t("Bill to")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-zinc-700">
            <p className="font-medium text-zinc-900">{invoice.customerNameSnapshot}</p>
            {invoice.customerAddressSnapshot ? (
              <p className="whitespace-pre-line text-zinc-500">
                {invoice.customerAddressSnapshot}
              </p>
            ) : null}
            {invoice.customerGstinSnapshot ? (
              <p className="font-mono text-xs text-zinc-500">
                GSTIN {invoice.customerGstinSnapshot}
              </p>
            ) : null}
            {invoice.placeOfSupply ? (
              <p className="text-zinc-500">Place of supply: {invoice.placeOfSupply}</p>
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
                <TableHead>{t("HSN")}</TableHead>
                <TableHead className="text-right">{t("Qty")}</TableHead>
                <TableHead className="text-right">{t("Rate")}</TableHead>
                <TableHead className="text-right">{t("Discount")}</TableHead>
                <TableHead className="text-right">{t("Taxable")}</TableHead>
                <TableHead className="text-right">{t("Tax")}</TableHead>
                <TableHead className="text-right">{t("Total")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="text-zinc-500">{line.lineNumber + 1}</TableCell>
                  <TableCell>
                    <p className="font-medium text-zinc-900">{line.descriptionSnapshot}</p>
                    {line.unitAbbreviation ? (
                      <p className="text-xs text-zinc-500">Unit: {line.unitAbbreviation}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-zinc-500">
                    {line.hsnCodeSnapshot ?? "—"}
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
                      ? `${formatTaxBps(line.taxRateBps)} · ${formatPaise(
                          line.cgstMinor + line.sgstMinor + line.igstMinor,
                        )}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatPaise(line.lineTotalMinor)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>{t("Notes & terms")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-zinc-600">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{t("Notes")}</p>
              <p className="whitespace-pre-line">{invoice.notes || "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                Terms
              </p>
              <p className="whitespace-pre-line">{invoice.terms || "—"}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("Totals")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <SummaryRow label={t("Subtotal")} value={formatPaise(invoice.subtotalMinor)} />
            <SummaryRow label={t("Discount")} value={formatPaise(invoice.discountMinor)} />
            <SummaryRow label={t("Taxable")} value={formatPaise(invoice.taxableMinor)} />
            {invoice.invoiceType === "GST" ? (
              showInterState ? (
                <SummaryRow label={t("IGST")} value={formatPaise(invoice.igstMinor)} />
              ) : (
                <>
                  <SummaryRow label="CGST" value={formatPaise(invoice.cgstMinor)} />
                  <SummaryRow label="SGST" value={formatPaise(invoice.sgstMinor)} />
                </>
              )
            ) : null}
            <div className="flex items-center justify-between border-t border-zinc-200 pt-2 text-base font-semibold text-zinc-900">
              <span>{t("Grand total")}</span>
              <span className="tabular-nums">{formatPaise(invoice.grandTotalMinor)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("Payments")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {invoice.payments.length === 0 ? (
            <p className="px-5 pb-3 text-sm text-zinc-500">{t("No payments recorded.")}</p>
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
                        <p className="mt-1 text-xs text-zinc-500">{payment.reversalReason}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatPaise(payment.amountMinor)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        {payment.status === "POSTED" && canManagePayments ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:bg-red-50"
                            onClick={() => void reversePayment(payment.id)}
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
        </CardContent>
      </Card>

      <Modal
        open={finalizing}
        onClose={() => setFinalizing(false)}
        title={t("Finalize invoice")}
        description={t("A final number will be assigned, stock will be posted, and the bill becomes immutable.")}
        footer={
          <>
            <Button variant="outline" onClick={() => setFinalizing(false)}>
              {t("Cancel")}
            </Button>
            <Button onClick={() => void runFinalize()}>
              <CheckCircle2 className="h-4 w-4" /> {t("Finalize invoice")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {finalizeError ? <ErrorBanner message={finalizeError} /> : null}
          <div className="rounded-lg bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            Invoice total <strong>{formatPaise(invoice.grandTotalMinor)}</strong>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="finalizeAmount">{t("Initial payment (₹)")}</Label>
              <Input
                id="finalizeAmount"
                type="number"
                min="0"
                step="0.01"
                className="mt-1.5"
                value={finalizeAmount}
                onChange={(event) => setFinalizeAmount(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="finalizeMode">{t("Payment mode")}</Label>
              <Select
                id="finalizeMode"
                className="mt-1.5"
                value={finalizeMode}
                onChange={(event) => setFinalizeMode(event.target.value as PaymentMode)}
                disabled={rupeesToPaise(finalizeAmount) <= 0}
              >
                {paymentModes.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {rupeesToPaise(finalizeAmount) > 0 ? (
            <div>
              <Label htmlFor="finalizeReference">{t("Payment reference")}</Label>
              <Input
                id="finalizeReference"
                className="mt-1.5"
                placeholder={t("Optional cheque / UPI reference")}
                value={finalizeReference}
                onChange={(event) => setFinalizeReference(event.target.value)}
              />
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={t("Cancel invoice")}
        description={t("Stock will be reversed. All payments must be reversed first.")}
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep invoice
            </Button>
            <Button variant="danger" onClick={() => void runCancel()}>
              <Ban className="h-4 w-4" /> {t("Cancel invoice")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {cancelError ? <ErrorBanner message={cancelError} /> : null}
          <Label htmlFor="cancelReason">{t("Cancellation reason")}</Label>
          <Textarea
            id="cancelReason"
            rows={3}
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            placeholder={t("Why is this invoice being cancelled?")}
          />
        </div>
      </Modal>

      <Modal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        title={t("Record payment")}
        footer={
          <>
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button onClick={() => void runPayment()}>
              <Wallet className="h-4 w-4" /> {t("Save payment")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {paymentError ? <ErrorBanner message={paymentError} /> : null}
          <div className="rounded-lg bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            {t("Balance due")} <strong>{formatPaise(invoice.dueMinor)}</strong>
          </div>
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
                placeholder={t("Optional")}
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
        </div>
      </Modal>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className="tabular-nums text-zinc-800">{value}</span>
    </div>
  );
}
