import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { catalogApi, customerApi, getErrorMessage, salesApi } from "@/lib/api";
import { formatPaise, paiseToRupees, rupeesToPaise } from "@/lib/money";
import type {
  Customer,
  InvoicePreview,
  InvoiceType,
  Item,
  SalesInvoiceInput,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  FieldError,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorBanner, LoadingBlock } from "@/components/ui/feedback";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { t } from "@/lib/i18n";

const today = () => new Date().toISOString().slice(0, 10);

interface EditorLine {
  key: string;
  itemId: string;
  description: string;
  hsnCode: string;
  quantity: string;
  rate: string;
  discount: string;
  taxRateBps: string;
  unitLabel: string;
}

const blankLine = (): EditorLine => ({
  key: crypto.randomUUID(),
  itemId: "",
  description: "",
  hsnCode: "",
  quantity: "1",
  rate: "0",
  discount: "0",
  taxRateBps: "0",
  unitLabel: "",
});

const taxOptions = [0, 5, 12, 18, 28];

export function InvoiceEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const invoiceId = id && id !== "new" ? Number(id) : null;

  const [loading, setLoading] = useState(Boolean(invoiceId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [invoiceType, setInvoiceType] = useState<InvoiceType>("GST");
  const [customerId, setCustomerId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [isInterState, setIsInterState] = useState(false);
  const [placeOfSupply, setPlaceOfSupply] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [lines, setLines] = useState<EditorLine[]>([blankLine()]);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      customerApi.list({ page: 1, pageSize: 200 }),
      catalogApi.items({ page: 1, pageSize: 200 }),
    ])
      .then(([customerPage, itemPage]) => {
        if (cancelled) return;
        setCustomers(customerPage.items);
        setItems(itemPage.items);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(getErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!invoiceId) return;
    let cancelled = false;
    setLoading(true);
    salesApi
      .get(invoiceId)
      .then((invoice) => {
        if (cancelled) return;
        if (invoice.status !== "DRAFT") {
          navigate(`/sales/${invoice.id}`, { replace: true });
          return;
        }
        setInvoiceType(invoice.invoiceType);
        setCustomerId(invoice.customerId ? String(invoice.customerId) : "");
        setInvoiceDate(invoice.invoiceDate);
        setIsInterState(invoice.isInterState);
        setPlaceOfSupply(invoice.placeOfSupply ?? "");
        setNotes(invoice.notes ?? "");
        setTerms(invoice.terms ?? "");
        setLines(
          invoice.lines.map((line) => ({
            key: crypto.randomUUID(),
            itemId: line.itemId ? String(line.itemId) : "",
            description: line.descriptionSnapshot,
            hsnCode: line.hsnCodeSnapshot ?? "",
            quantity: String(line.quantityMilli / 1000),
            rate: String(paiseToRupees(line.rateMinor)),
            discount: String(paiseToRupees(line.discountMinor)),
            taxRateBps: String(line.taxRateBps),
            unitLabel: line.unitAbbreviation ?? "",
          })),
        );
      })
      .catch((err) => {
        if (!cancelled) setLoadError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [invoiceId, navigate]);

  const input = useMemo<SalesInvoiceInput>(
    () => ({
      invoiceType,
      customerId: customerId ? Number(customerId) : undefined,
      invoiceDate,
      placeOfSupply: placeOfSupply.trim() || undefined,
      isInterState: invoiceType === "GST" ? isInterState : false,
      notes: notes.trim() || undefined,
      terms: terms.trim() || undefined,
      lines: lines.map((line) => ({
        itemId: line.itemId ? Number(line.itemId) : undefined,
        description: line.description.trim() || undefined,
        hsnCode: line.hsnCode.trim() || undefined,
        quantityMilli: Math.round((Number(line.quantity) || 0) * 1000),
        rateMinor: rupeesToPaise(line.rate),
        discountMinor: rupeesToPaise(line.discount),
        taxRateBps: invoiceType === "GST" ? Number(line.taxRateBps) || 0 : 0,
      })),
    }),
    [
      invoiceType,
      customerId,
      invoiceDate,
      placeOfSupply,
      isInterState,
      notes,
      terms,
      lines,
    ],
  );

  const linesReady =
    lines.length > 0 &&
    lines.every(
      (line) =>
        (line.itemId || line.description.trim()) &&
        (Number(line.quantity) || 0) > 0 &&
        (Number(line.rate) || 0) >= 0,
    );

  const [preview, setPreview] = useState<InvoicePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!linesReady) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      salesApi
        .preview(input)
        .then((result) => {
          if (cancelled) return;
          setPreview(result);
          setPreviewError(null);
        })
        .catch((err) => {
          if (cancelled) return;
          setPreview(null);
          setPreviewError(getErrorMessage(err));
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [input, linesReady]);

  const updateLine = (key: string, patch: Partial<EditorLine>) => {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  };

  const applyItem = (key: string, itemId: string) => {
    const item = items.find((entry) => String(entry.id) === itemId);
    updateLine(key, {
      itemId,
      description: item ? item.name : "",
      hsnCode: item?.hsnCode ?? "",
      rate: item ? String(paiseToRupees(item.sellingRateMinor)) : "0",
      taxRateBps: item ? String(item.defaultTaxRateBps) : "0",
      unitLabel: item?.unitAbbreviation ?? "",
    });
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const saved = invoiceId
        ? await salesApi.updateDraft(invoiceId, input)
        : await salesApi.createDraft(input);
      navigate(`/sales/${saved.id}`);
    } catch (err) {
      setSaveError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBlock label={t("Loading invoice…")} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="-ml-3" onClick={() => navigate("/sales")}>
            <ArrowLeft className="h-4 w-4" /> {t("Back to sales")}
          </Button>
          <h2 className="mt-2 text-2xl font-semibold text-zinc-900">
            {invoiceId ? t("Edit draft invoice") : t("New invoice")}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Figures are recalculated by the application engine before saving.
          </p>
        </div>
        <Button onClick={() => void save()} disabled={saving || !linesReady}>
          <Save className="h-4 w-4" /> {saving ? t("Saving…") : t("Save draft")}
        </Button>
      </div>

      {loadError ? <ErrorBanner message={loadError} /> : null}
      {saveError ? <ErrorBanner message={saveError} /> : null}
      {previewError ? <ErrorBanner message={previewError} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("Invoice details")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="invoiceType">{t("Invoice type")}</Label>
            <Select
              id="invoiceType"
              className="mt-1.5"
              value={invoiceType}
              onChange={(event) => {
                const next = event.target.value as InvoiceType;
                setInvoiceType(next);
                if (next === "NON_GST") {
                  setIsInterState(false);
                  setLines((current) =>
                    current.map((line) => ({ ...line, taxRateBps: "0" })),
                  );
                }
              }}
            >
              <option value="GST">{t("GST invoice")}</option>
              <option value="NON_GST">{t("Non-GST invoice")}</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="invoiceDate">
              Invoice date <span className="text-red-500">*</span>
            </Label>
            <Input
              id="invoiceDate"
              type="date"
              className="mt-1.5"
              value={invoiceDate}
              onChange={(event) => setInvoiceDate(event.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="customer">
              Customer {invoiceType === "GST" ? <span className="text-red-500">*</span> : null}
            </Label>
            <SearchableSelect
              className="mt-1.5"
              value={customerId}
              onChange={(val) => setCustomerId(val)}
              placeholder={invoiceType === "GST" ? t("Search or select customer…") : t("Walk-in customer (optional)")}
              options={customers.map((c) => ({
                value: c.id,
                label: c.name,
                subLabel: [c.phone, c.gstin].filter(Boolean).join(" · ") || undefined,
              }))}
            />
            {invoiceType === "GST" && !customerId ? (
              <FieldError message="A customer is required for GST invoices" />
            ) : null}
          </div>
          {invoiceType === "GST" ? (
            <>
              <div>
                <Label htmlFor="placeOfSupply">{t("Place of supply")}</Label>
                <Input
                  id="placeOfSupply"
                  className="mt-1.5"
                  placeholder={t("e.g. Maharashtra")}
                  value={placeOfSupply}
                  onChange={(event) => setPlaceOfSupply(event.target.value)}
                />
              </div>
              <label className="flex items-end gap-2 pb-2.5 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-zinc-300 accent-brand-600"
                  checked={isInterState}
                  onChange={(event) => setIsInterState(event.target.checked)}
                />
                {t("Inter-state supply (IGST)")}
              </label>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t("Line items")}</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLines((current) => [...current, blankLine()])}
          >
            <Plus className="h-3.5 w-3.5" /> {t("Add line")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.map((line, index) => {
            const computed = preview?.lines[index];
            return (
              <div
                key={line.key}
                className="grid gap-3 rounded-lg border border-zinc-200 p-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_7rem_8rem_7rem_7rem_auto]"
              >
                <div>
                  <Label>{t("Item")}</Label>
                  <SearchableSelect
                    className="mt-1"
                    value={line.itemId}
                    onChange={(val) => applyItem(line.key, val)}
                    placeholder={t("Search item by name or code…")}
                    options={items.map((it) => ({
                      value: it.id,
                      label: it.name,
                      subLabel: [it.itemCode, it.hsnCode ? `HSN: ${it.hsnCode}` : undefined].filter(Boolean).join(" · ") || undefined,
                    }))}
                  />
                </div>
                <div>
                  <Label>{t("Description")}</Label>
                  <Input
                    className="mt-1"
                    placeholder={t("Required for manual lines")}
                    value={line.description}
                    onChange={(event) =>
                      updateLine(line.key, { description: event.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Qty {line.unitLabel ? `(${line.unitLabel})` : ""}</Label>
                  <Input
                    className="mt-1"
                    type="number"
                    min="0"
                    step="0.001"
                    value={line.quantity}
                    onChange={(event) =>
                      updateLine(line.key, { quantity: event.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>{t("Rate (₹)")}</Label>
                  <Input
                    className="mt-1"
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.rate}
                    onChange={(event) => updateLine(line.key, { rate: event.target.value })}
                  />
                </div>
                <div>
                  <Label>{t("Discount (₹)")}</Label>
                  <Input
                    className="mt-1"
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.discount}
                    onChange={(event) =>
                      updateLine(line.key, { discount: event.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>{t("Tax")}</Label>
                  {invoiceType === "GST" ? (
                    <Select
                      className="mt-1"
                      value={line.taxRateBps}
                      onChange={(event) =>
                        updateLine(line.key, { taxRateBps: event.target.value })
                      }
                    >
                      {taxOptions.map((rate) => (
                        <option key={rate} value={rate * 100}>
                          {rate}%
                        </option>
                      ))}
                      {!taxOptions.includes(Number(line.taxRateBps) / 100) ? (
                        <option value={line.taxRateBps}>
                          {(Number(line.taxRateBps) / 100).toFixed(2)}%
                        </option>
                      ) : null}
                    </Select>
                  ) : (
                    <Input className="mt-1 bg-zinc-50" value="0%" disabled readOnly />
                  )}
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-400">{t("Line total")}</p>
                    <p className="text-sm font-medium tabular-nums text-zinc-900">
                      {formatPaise(computed?.lineTotalMinor ?? 0)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-600 hover:bg-red-50"
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((current) => current.filter((entry) => entry.key !== line.key))
                    }
                    aria-label={t("Remove line")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>{t("Notes & terms")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="notes">{t("Notes")}</Label>
              <Textarea
                id="notes"
                className="mt-1.5"
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="terms">{t("Terms & conditions")}</Label>
              <Textarea
                id="terms"
                className="mt-1.5"
                rows={3}
                value={terms}
                onChange={(event) => setTerms(event.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("Summary")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label={t("Subtotal")} value={formatPaise(preview?.subtotalMinor ?? 0)} />
            <Row label={t("Discount")} value={formatPaise(preview?.discountMinor ?? 0)} />
            <Row label={t("Taxable")} value={formatPaise(preview?.taxableMinor ?? 0)} />
            {invoiceType === "GST" ? (
              isInterState ? (
                <Row label={t("IGST")} value={formatPaise(preview?.igstMinor ?? 0)} />
              ) : (
                <>
                  <Row label="CGST" value={formatPaise(preview?.cgstMinor ?? 0)} />
                  <Row label="SGST" value={formatPaise(preview?.sgstMinor ?? 0)} />
                </>
              )
            ) : null}
            <div className="mt-3 flex items-center justify-between border-t border-zinc-200 pt-3">
              <span className="font-medium text-zinc-900">{t("Grand total")}</span>
              <span className="text-lg font-semibold tabular-nums text-zinc-900">
                {formatPaise(preview?.grandTotalMinor ?? 0)}
              </span>
            </div>
            <p className="pt-2 text-xs text-zinc-400">
              Totals refresh automatically. Saving a draft does not affect stock or numbering.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className="tabular-nums text-zinc-800">{value}</span>
    </div>
  );
}
