import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { getErrorMessage, salesApi } from "@/lib/api";
import { formatPaise, formatQuantityMilli, formatTaxBps } from "@/lib/money";
import type { SalesInvoicePrintData } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ErrorBanner, LoadingBlock } from "@/components/ui/feedback";
import { t } from "@/lib/i18n";

export function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<SalesInvoicePrintData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    salesApi
      .printData(Number(id))
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={error} />
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> {t("Go back")}
        </Button>
      </div>
    );
  }

  if (!data) return <LoadingBlock label={t("Preparing print view…")} />;

  const { invoice, company } = data;
  const showInterState = invoice.invoiceType === "GST" && invoice.isInterState;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Button variant="ghost" size="sm" className="-ml-3" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> {t("Back")}
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> {t("Print / Save PDF")}
        </Button>
      </div>

      <div className="print-area rounded-xl border border-zinc-200 bg-white p-8 shadow-sm print:border-0 print:shadow-none">
        <div className="flex items-start justify-between gap-6 border-b border-zinc-200 pb-6">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">
              {company.companyName || "Builder Shop"}
            </h1>
            {company.address ? (
              <p className="mt-1 whitespace-pre-line text-sm text-zinc-500">{company.address}</p>
            ) : null}
            <div className="mt-2 space-y-0.5 text-sm text-zinc-500">
              {company.phone ? <p>Phone: {company.phone}</p> : null}
              {company.email ? <p>Email: {company.email}</p> : null}
              {company.gstin ? <p className="font-mono">GSTIN: {company.gstin}</p> : null}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              {invoice.invoiceType === "GST" ? t("Tax invoice") : t("Invoice")}
            </p>
            <p className="mt-1 font-mono text-lg font-semibold text-zinc-900">
              {invoice.invoiceNumber}
            </p>
            <p className="mt-2 text-sm text-zinc-500">Date: {invoice.invoiceDate}</p>
            {invoice.status === "CANCELLED" ? (
              <p className="mt-2 inline-block rounded border border-red-300 px-2 py-1 text-xs font-semibold uppercase text-red-600">
                {t("Cancelled")}
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-6 border-b border-zinc-200 py-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{t("Bill to")}</p>
            <p className="mt-1 font-medium text-zinc-900">{invoice.customerNameSnapshot}</p>
            {invoice.customerAddressSnapshot ? (
              <p className="mt-1 whitespace-pre-line text-sm text-zinc-500">
                {invoice.customerAddressSnapshot}
              </p>
            ) : null}
            {invoice.customerGstinSnapshot ? (
              <p className="mt-1 font-mono text-xs text-zinc-500">
                GSTIN: {invoice.customerGstinSnapshot}
              </p>
            ) : null}
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {t("Invoice details")}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              Type: {invoice.invoiceType === "GST" ? "GST" : "Non-GST"}
            </p>
            {invoice.placeOfSupply ? (
              <p className="text-sm text-zinc-500">Place of supply: {invoice.placeOfSupply}</p>
            ) : null}
            {showInterState ? (
              <p className="text-sm text-zinc-500">{t("Inter-state supply (IGST)")}</p>
            ) : null}
          </div>
        </div>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-2 pr-2">#</th>
              <th className="py-2 pr-2">{t("Description")}</th>
              <th className="py-2 pr-2">{t("HSN")}</th>
              <th className="py-2 pr-2 text-right">{t("Qty")}</th>
              <th className="py-2 pr-2 text-right">{t("Rate")}</th>
              <th className="py-2 pr-2 text-right">{t("Disc.")}</th>
              <th className="py-2 pr-2 text-right">{t("Taxable")}</th>
              <th className="py-2 pr-2 text-right">{t("Tax")}</th>
              <th className="py-2 text-right">{t("Total")}</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.id} className="border-b border-zinc-100 align-top">
                <td className="py-2 pr-2 text-zinc-500">{line.lineNumber + 1}</td>
                <td className="py-2 pr-2">
                  <p className="font-medium text-zinc-900">{line.descriptionSnapshot}</p>
                  {line.unitAbbreviation ? (
                    <p className="text-xs text-zinc-500">{line.unitAbbreviation}</p>
                  ) : null}
                </td>
                <td className="py-2 pr-2 font-mono text-xs text-zinc-500">
                  {line.hsnCodeSnapshot ?? "—"}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {formatQuantityMilli(line.quantityMilli)}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {formatPaise(line.rateMinor)}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums text-zinc-500">
                  {formatPaise(line.discountMinor)}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {formatPaise(line.taxableMinor)}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums text-zinc-500">
                  {line.taxRateBps ? formatTaxBps(line.taxRateBps) : "—"}
                </td>
                <td className="py-2 text-right tabular-nums font-medium">
                  {formatPaise(line.lineTotalMinor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 grid gap-6 sm:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-4 text-sm text-zinc-500">
            {invoice.notes ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {t("Notes")}
                </p>
                <p className="mt-1 whitespace-pre-line">{invoice.notes}</p>
              </div>
            ) : null}
            {invoice.terms ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {t("Terms & conditions")}
                </p>
                <p className="mt-1 whitespace-pre-line">{invoice.terms}</p>
              </div>
            ) : null}
            {company.invoiceFooter ? (
              <p className="text-xs text-zinc-400">{company.invoiceFooter}</p>
            ) : null}
          </div>
          <div className="space-y-1.5 text-sm">
            <PrintRow label={t("Subtotal")} value={formatPaise(invoice.subtotalMinor)} />
            <PrintRow label={t("Discount")} value={formatPaise(invoice.discountMinor)} />
            <PrintRow label={t("Taxable")} value={formatPaise(invoice.taxableMinor)} />
            {invoice.invoiceType === "GST" ? (
              showInterState ? (
                <PrintRow label={t("IGST")} value={formatPaise(invoice.igstMinor)} />
              ) : (
                <>
                  <PrintRow label="CGST" value={formatPaise(invoice.cgstMinor)} />
                  <PrintRow label="SGST" value={formatPaise(invoice.sgstMinor)} />
                </>
              )
            ) : null}
            <div className="mt-2 flex items-center justify-between border-t border-zinc-300 pt-2 text-base font-semibold text-zinc-900">
              <span>{t("Grand total")}</span>
              <span className="tabular-nums">{formatPaise(invoice.grandTotalMinor)}</span>
            </div>
            <PrintRow label={t("Paid")} value={formatPaise(invoice.paidMinor)} />
            <div className="flex items-center justify-between font-medium text-zinc-900">
              <span>{t("Balance due")}</span>
              <span className="tabular-nums">{formatPaise(invoice.dueMinor)}</span>
            </div>
          </div>
        </div>

        <div className="mt-10 flex items-end justify-between border-t border-zinc-200 pt-6 text-xs text-zinc-400">
          <p>Computer-generated invoice · {company.currencyCode}</p>
          <div className="text-right">
            <p className="mb-10">For {company.companyName || "Builder Shop"}</p>
            <p className="border-t border-zinc-300 pt-1">{t("Authorised signatory")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PrintRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className="tabular-nums text-zinc-800">{value}</span>
    </div>
  );
}
