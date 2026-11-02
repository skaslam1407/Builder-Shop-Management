import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { catalogApi, getErrorMessage, purchaseApi, supplierApi } from "@/lib/api";
import { formatPaise, paiseToRupees, rupeesToPaise } from "@/lib/money";
import type {
  Item,
  PurchaseInvoiceInput,
  PurchasePreview,
  Supplier,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorBanner, LoadingBlock } from "@/components/ui/feedback";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { t } from "@/lib/i18n";

const today = () => new Date().toISOString().slice(0, 10);
const taxOptions = [0, 5, 12, 18, 28];

interface EditorLine {
  key: string;
  itemId: string;
  description: string;
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
  quantity: "1",
  rate: "0",
  discount: "0",
  taxRateBps: "0",
  unitLabel: "",
});

export function PurchaseEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const invoiceId = id && id !== "new" ? Number(id) : null;

  const [loading, setLoading] = useState(Boolean(invoiceId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [supplierId, setSupplierId] = useState("");
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<EditorLine[]>([blankLine()]);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supplierApi.list({ page: 1, pageSize: 200, includeInactive: false }),
      catalogApi.items({ page: 1, pageSize: 200 }),
    ])
      .then(([supplierPage, itemPage]) => {
        if (cancelled) return;
        setSuppliers(supplierPage.items);
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
    purchaseApi
      .get(invoiceId)
      .then((invoice) => {
        if (cancelled) return;
        if (invoice.status !== "DRAFT") {
          navigate(`/purchases/${invoice.id}`, { replace: true });
          return;
        }
        setSupplierId(String(invoice.supplierId));
        setSupplierInvoiceNumber(invoice.supplierInvoiceNumber);
        setInvoiceDate(invoice.invoiceDate);
        setNotes(invoice.notes ?? "");
        setLines(
          invoice.lines.map((line) => ({
            key: crypto.randomUUID(),
            itemId: line.itemId ? String(line.itemId) : "",
            description: line.descriptionSnapshot,
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

  const input = useMemo<PurchaseInvoiceInput>(
    () => ({
      supplierId: supplierId ? Number(supplierId) : 0,
      supplierInvoiceNumber: supplierInvoiceNumber.trim(),
      invoiceDate,
      notes: notes.trim() || undefined,
      lines: lines.map((line) => ({
        itemId: line.itemId ? Number(line.itemId) : undefined,
        description: line.description.trim() || undefined,
        quantityMilli: Math.round((Number(line.quantity) || 0) * 1000),
        rateMinor: rupeesToPaise(line.rate),
        discountMinor: rupeesToPaise(line.discount),
        taxRateBps: Number(line.taxRateBps) || 0,
      })),
    }),
    [supplierId, supplierInvoiceNumber, invoiceDate, notes, lines],
  );

  const linesReady =
    input.supplierId > 0 &&
    input.supplierInvoiceNumber.length > 0 &&
    lines.length > 0 &&
    lines.every(
      (line) =>
        (line.itemId || line.description.trim()) &&
        (Number(line.quantity) || 0) > 0 &&
        (Number(line.rate) || 0) >= 0,
    );

  const [preview, setPreview] = useState<PurchasePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!linesReady) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      purchaseApi
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
      rate: item ? String(paiseToRupees(item.purchaseRateMinor)) : "0",
      taxRateBps: item ? String(item.defaultTaxRateBps) : "0",
      unitLabel: item?.unitAbbreviation ?? "",
    });
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const saved = invoiceId
        ? await purchaseApi.updateDraft(invoiceId, input)
        : await purchaseApi.createDraft(input);
      navigate(`/purchases/${saved.id}`);
    } catch (err) {
      setSaveError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBlock label={t("Loading purchase…")} />;

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
          <h2 className="mt-2 text-2xl font-semibold text-zinc-900">
            {invoiceId ? t("Edit draft purchase") : t("New purchase")}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Stock is received only when the purchase invoice is finalized.
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
          <CardTitle>{t("Purchase details")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <Label htmlFor="supplier">
              {t("Supplier")} <span className="text-red-500">*</span>
            </Label>
            <SearchableSelect
              className="mt-1.5"
              value={supplierId}
              onChange={(val) => setSupplierId(val)}
              placeholder={t("Search or select supplier…")}
              options={suppliers.map((sup) => ({
                value: sup.id,
                label: sup.name,
                subLabel: [sup.phone, sup.gstin].filter(Boolean).join(" · ") || undefined,
              }))}
            />
            {!supplierId ? <FieldError message="A supplier is required" /> : null}
          </div>
          <div>
            <Label htmlFor="supplierInvoiceNumber">
              Supplier invoice # <span className="text-red-500">*</span>
            </Label>
            <Input
              id="supplierInvoiceNumber"
              className="mt-1.5"
              value={supplierInvoiceNumber}
              onChange={(event) => setSupplierInvoiceNumber(event.target.value)}
            />
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
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-400">
                      {t("Line total")}
                    </p>
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
            <CardTitle>{t("Notes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              id="notes"
              className="mt-1.5"
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t("Delivery notes, transporter details, or payment terms")}
            />
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
            <Row label={t("Tax")} value={formatPaise(preview?.taxMinor ?? 0)} />
            <div className="mt-3 flex items-center justify-between border-t border-zinc-200 pt-3">
              <span className="font-medium text-zinc-900">{t("Grand total")}</span>
              <span className="text-lg font-semibold tabular-nums text-zinc-900">
                {formatPaise(preview?.grandTotalMinor ?? 0)}
              </span>
            </div>
            <p className="pt-2 text-xs text-zinc-400">
              Totals are recalculated by the application before saving.
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
