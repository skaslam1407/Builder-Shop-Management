import { useCallback, useEffect, useState } from "react";
import { Download, Pencil, Plus, Search, Settings2, UserX } from "lucide-react";
import { catalogApi, getErrorMessage } from "@/lib/api";
import { formatPaise, formatQuantityMilli, formatTaxBps } from "@/lib/money";
import type { Category, Item, ItemInput, Paged, Unit } from "@/lib/types";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
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
import { ItemForm } from "@/components/catalog/ItemForm";
import { CatalogManager } from "@/components/catalog/CatalogManager";
import { t } from "@/lib/i18n";
import { exportCsv, exportExcel } from "@/lib/export";

const emptyPage: Paged<Item> = { items: [], total: 0, page: 1, pageSize: 25 };

export function ItemsPage() {
  const canManage = useAuthStore((state) =>
    Boolean(state.user?.permissions.includes("catalog.manage")),
  );
  const [data, setData] = useState<Paged<Item>>(emptyPage);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);

  const loadCatalog = useCallback(async () => {
    try {
      const [nextCategories, nextUnits] = await Promise.all([
        catalogApi.categories(canManage),
        catalogApi.units(canManage),
      ]);
      setCategories(nextCategories);
      setUnits(nextUnits);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [canManage]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await catalogApi.items({
        search: search.trim() || undefined,
        categoryId: categoryFilter ? Number(categoryFilter) : undefined,
        page,
        pageSize: 25,
        includeInactive,
      });
      setData(result);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter, page, includeInactive]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog, reloadKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadItems();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loadItems, reloadKey]);

  const refresh = () => setReloadKey((key) => key + 1);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (item: Item) => {
    setEditing(item);
    setFormOpen(true);
  };

  const submitItem = async (input: ItemInput) => {
    if (editing) {
      await catalogApi.updateItem(editing.id, input);
    } else {
      await catalogApi.createItem(input);
    }
    setFormOpen(false);
    setEditing(null);
    refresh();
  };

  const toggleActive = async (item: Item) => {
    const action = item.isActive ? "deactivate" : "activate";
    if (!window.confirm(`Are you sure you want to ${action} ${item.name}?`)) return;
    try {
      await catalogApi.setItemActive(item.id, !item.isActive);
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
          <h2 className="text-2xl font-semibold text-zinc-900">{t("Items & stock catalogue")}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Material master data, units, rates, and GST defaults.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCsv("items", [{header:"Item Code", value: i => i.itemCode}, {header:"Name", value: i => i.name}, {header:"Category", value: i => i.categoryName ?? ""}, {header:"Unit", value: i => i.unitAbbreviation ?? ""}, {header:"Purchase Rate", value: i => i.purchaseRateMinor}, {header:"Selling Rate", value: i => i.sellingRateMinor}, {header:"HSN", value: i => i.hsnCode ?? ""}, {header:"GST %", value: i => i.defaultTaxRateBps}, {header:"Reorder LVL", value: i => i.reorderLevelMilli}, {header:"Description", value: i => i.description ?? ""}], data.items)}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportExcel("items", "Items", [{header:"Item Code", value: i => i.itemCode}, {header:"Name", value: i => i.name}, {header:"Category", value: i => i.categoryName ?? ""}, {header:"Unit", value: i => i.unitAbbreviation ?? ""}, {header:"Purchase Rate", value: i => i.purchaseRateMinor}, {header:"Selling Rate", value: i => i.sellingRateMinor}, {header:"HSN", value: i => i.hsnCode ?? ""}, {header:"GST %", value: i => i.defaultTaxRateBps}, {header:"Reorder LVL", value: i => i.reorderLevelMilli}, {header:"Description", value: i => i.description ?? ""}], data.items)}>
            <Download className="h-4 w-4" /> Excel
          </Button>
          {canManage ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCatalogOpen(true)}>
                <Settings2 className="h-4 w-4" /> {t("Categories & units")}
              </Button>
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" /> {t("Add item")}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            className="pl-9"
            placeholder={t("Search by name, code, or HSN")}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          className="w-48"
          value={categoryFilter}
          onChange={(event) => {
            setCategoryFilter(event.target.value);
            setPage(1);
          }}
        >
          <option value="">{t("All categories")}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-zinc-300 accent-brand-600"
            checked={includeInactive}
            onChange={(event) => {
              setIncludeInactive(event.target.checked);
              setPage(1);
            }}
          />
          Show inactive
        </label>
      </div>

      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        {loading ? (
          <LoadingBlock label={t("Loading items…")} />
        ) : data.items.length === 0 ? (
          <EmptyState
            title={search ? "No matching items" : "No items yet"}
            description={
              search
                ? "Try a different name, code, or HSN number."
                : "Add materials and units before creating purchase or sales invoices."
            }
            action={
              canManage && !search ? (
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" /> {t("Add item")}
                </Button>
              ) : null
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Code")}</TableHead>
                <TableHead>{t("Item")}</TableHead>
                <TableHead>{t("Category")}</TableHead>
                <TableHead>{t("Unit")}</TableHead>
                <TableHead className="text-right">{t("Purchase")}</TableHead>
                <TableHead className="text-right">{t("Selling")}</TableHead>
                <TableHead className="text-right">{t("GST")}</TableHead>
                <TableHead className="text-right">{t("Reorder")}</TableHead>
                <TableHead>{t("Status")}</TableHead>
                <TableHead className="text-right">{t("Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs text-zinc-500">
                    {item.itemCode}
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-zinc-900">{item.name}</p>
                    {item.hsnCode ? (
                      <p className="text-xs text-zinc-500">HSN {item.hsnCode}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-zinc-600">{item.categoryName ?? "—"}</TableCell>
                  <TableCell className="text-zinc-600">{item.unitAbbreviation ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPaise(item.purchaseRateMinor)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPaise(item.sellingRateMinor)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatTaxBps(item.defaultTaxRateBps)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQuantityMilli(item.reorderLevelMilli)}
                  </TableCell>
                  <TableCell>
                    {item.isActive ? (
                      <Badge variant="success">{t("Active")}</Badge>
                    ) : (
                      <Badge variant="muted">{t("Inactive")}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {canManage && item.isActive ? (
                        <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                          <Pencil className="h-3.5 w-3.5" /> {t("Edit")}
                        </Button>
                      ) : null}
                      {canManage ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className={item.isActive ? "text-red-600 hover:bg-red-50" : ""}
                          onClick={() => void toggleActive(item)}
                        >
                          {item.isActive ? (
                            <>
                              <UserX className="h-3.5 w-3.5" /> {t("Deactivate")}
                            </>
                          ) : (
                            "Activate"
                          )}
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
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        title={editing ? t("Edit item") : t("New item")}
        description={t("Rates are stored as integer paise; GST is stored as basis points.")}
        size="lg"
      >
        <ItemForm
          item={editing}
          categories={categories.filter(
            (category) => category.isActive || category.id === editing?.categoryId,
          )}
          units={units.filter((unit) => unit.isActive || unit.id === editing?.defaultUnitId)}
          onSubmit={submitItem}
          onCancel={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      </Modal>

      <Modal
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        title={t("Categories & units")}
        description={t("Units are not hardcoded; add any unit your shop uses.")}
        size="xl"
      >
        <CatalogManager categories={categories} units={units} onChanged={refresh} />
      </Modal>
    </div>
  );
}
