import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PackagePlus, Search } from "lucide-react";
import { catalogApi, getErrorMessage, inventoryApi } from "@/lib/api";
import { formatQuantityMilli } from "@/lib/money";
import type {
  Item,
  Paged,
  StockMovement,
  StockSummaryRow,
} from "@/lib/types";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
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
import { EmptyState, ErrorBanner, LoadingBlock } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

const emptySummary: Paged<StockSummaryRow> = { items: [], total: 0, page: 1, pageSize: 25 };
const emptyMovements: Paged<StockMovement> = { items: [], total: 0, page: 1, pageSize: 25 };

const movementVariant = (type: string) => {
  if (type.startsWith("PURCHASE")) return "success" as const;
  if (type.startsWith("SALE")) return "default" as const;
  return "outline" as const;
};

export function StockPage() {
  const navigate = useNavigate();
  const canManagePurchases = useAuthStore((state) =>
    Boolean(state.user?.permissions.includes("purchases.manage")),
  );

  const [tab, setTab] = useState<"summary" | "movements">("summary");
  const [summary, setSummary] = useState<Paged<StockSummaryRow>>(emptySummary);
  const [movements, setMovements] = useState<Paged<StockMovement>>(emptyMovements);
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [itemId, setItemId] = useState("");
  const [movementType, setMovementType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    catalogApi
      .items({ page: 1, pageSize: 300 })
      .then((result) => setItems(result.items))
      .catch(() => setItems([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "summary") {
        setSummary(
          await inventoryApi.summary({
            search: search.trim() || undefined,
            includeInactive,
            lowStockOnly,
            page,
            pageSize: 25,
          }),
        );
      } else {
        setMovements(
          await inventoryApi.movements({
            itemId: itemId ? Number(itemId) : undefined,
            movementType: movementType || undefined,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            page,
            pageSize: 25,
          }),
        );
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [
    tab,
    search,
    includeInactive,
    lowStockOnly,
    itemId,
    movementType,
    dateFrom,
    dateTo,
    page,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [load, reloadKey]);

  const refresh = () => setReloadKey((key) => key + 1);

  const data = tab === "summary" ? summary : movements;
  const firstRow = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const lastRow = Math.min(data.page * data.pageSize, data.total);
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-900">{t("Stock")}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Current stock on hand and the movement ledger from sales and purchases.
          </p>
        </div>
        {canManagePurchases ? (
          <Button onClick={() => navigate("/purchases/new")}>
            <PackagePlus className="h-4 w-4" /> Receive stock
          </Button>
        ) : null}
      </div>

      <div className="flex gap-2 border-b border-zinc-200">
        {(
          [
            ["summary", "Stock summary"],
            ["movements", "Movement ledger"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium",
              tab === value
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-zinc-500 hover:text-zinc-800",
            )}
            onClick={() => {
              setTab(value);
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "summary" ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input
              className="pl-9"
              placeholder={t("Search item name or code")}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-zinc-300 accent-brand-600"
              checked={lowStockOnly}
              onChange={(event) => {
                setLowStockOnly(event.target.checked);
                setPage(1);
              }}
            />
            Low stock only
          </label>
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
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Select
            className="w-56"
            value={itemId}
            onChange={(event) => {
              setItemId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">{t("All items")}</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Select
            className="w-44"
            value={movementType}
            onChange={(event) => {
              setMovementType(event.target.value);
              setPage(1);
            }}
          >
            <option value="">{t("All movement types")}</option>
            <option value="SALE">{t("Sale")}</option>
            <option value="SALE_CANCELLED">{t("Sale cancelled")}</option>
            <option value="PURCHASE">{t("Purchase")}</option>
            <option value="PURCHASE_CANCELLED">{t("Purchase cancelled")}</option>
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
      )}

      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>{tab === "summary" ? t("Stock on hand") : t("Stock movements")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {loading ? (
            <LoadingBlock label={t("Loading stock…")} />
          ) : data.items.length === 0 ? (
            <EmptyState
              title={tab === "summary" ? "No stock records" : "No stock movements"}
              description={
                tab === "summary"
                  ? "Items appear here after they are created."
                  : "Sales and purchases post stock movements automatically."
              }
            />
          ) : tab === "summary" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Code")}</TableHead>
                  <TableHead>{t("Item")}</TableHead>
                  <TableHead>{t("Unit")}</TableHead>
                  <TableHead className="text-right">{t("Reorder level")}</TableHead>
                  <TableHead className="text-right">{t("On hand")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.items.map((row) => {
                  const low =
                    row.reorderLevelMilli > 0 && row.quantityMilli < row.reorderLevelMilli;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs text-zinc-500">
                        {row.itemCode}
                      </TableCell>
                      <TableCell>
                        <Link
                          className="font-medium text-zinc-900 hover:underline"
                          to="/items"
                        >
                          {row.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-zinc-600">
                        {row.unitAbbreviation ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-zinc-600">
                        {formatQuantityMilli(row.reorderLevelMilli)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-zinc-900">
                        {formatQuantityMilli(row.quantityMilli)}
                      </TableCell>
                      <TableCell>
                        {!row.isActive ? (
                          <Badge variant="muted">{t("Inactive")}</Badge>
                        ) : low ? (
                          <Badge variant="danger">{t("Low stock")}</Badge>
                        ) : (
                          <Badge variant="success">{t("OK")}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Date")}</TableHead>
                  <TableHead>{t("Item")}</TableHead>
                  <TableHead>{t("Type")}</TableHead>
                  <TableHead>{t("Source")}</TableHead>
                  <TableHead className="text-right">{t("Quantity")}</TableHead>
                  <TableHead>{t("Notes")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.items.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell className="text-zinc-600">{movement.movementDate}</TableCell>
                    <TableCell className="font-medium text-zinc-900">
                      {movement.itemName ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={movementVariant(movement.movementType)}>
                        {movement.movementType.replaceAll("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {movement.sourceType === "SALES_INVOICE" && movement.sourceId ? (
                        <Link className="hover:underline" to={`/sales/${movement.sourceId}`}>
                          Sales #{movement.sourceId}
                        </Link>
                      ) : movement.sourceType === "PURCHASE_INVOICE" && movement.sourceId ? (
                        <Link
                          className="hover:underline"
                          to={`/purchases/${movement.sourceId}`}
                        >
                          Purchase #{movement.sourceId}
                        </Link>
                      ) : (
                        (movement.sourceType?.replaceAll("_", " ") ?? "—")
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums font-medium",
                        movement.quantityMilli < 0 ? "text-red-600" : "text-emerald-700",
                      )}
                    >
                      {movement.quantityMilli > 0 ? "+" : ""}
                      {formatQuantityMilli(movement.quantityMilli)}{" "}
                      {movement.unitAbbreviation ?? ""}
                    </TableCell>
                    <TableCell className="max-w-56 truncate text-xs text-zinc-500">
                      {movement.notes ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
    </div>
  );
}
