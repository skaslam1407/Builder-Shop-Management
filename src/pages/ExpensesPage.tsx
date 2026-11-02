import { useCallback, useEffect, useState } from "react";
import { Download, Plus, Search } from "lucide-react";
import { expenseApi, getErrorMessage } from "@/lib/api";
import { formatPaise, rupeesToPaise } from "@/lib/money";
import type {
  Expense,
  ExpenseCategory,
  ExpenseInput,
  Paged,
  PaymentMode,
} from "@/lib/types";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
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
import { EmptyState, ErrorBanner, LoadingBlock } from "@/components/ui/feedback";
import { t } from "@/lib/i18n";
import { exportCsv, exportExcel } from "@/lib/export";

const paymentModes: { value: PaymentMode; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CARD", label: "Card" },
  { value: "OTHER", label: "Other" },
];

const emptyPage: Paged<Expense> = { items: [], total: 0, page: 1, pageSize: 25 };

export function ExpensesPage() {
  const canManage = useAuthStore((state) =>
    Boolean(state.user?.permissions.includes("expenses.manage")),
  );
  const [data, setData] = useState<Paged<Expense>>(emptyPage);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("CASH");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [categoryModal, setCategoryModal] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pageResult, categoryResult] = await Promise.all([
        expenseApi.list({
          search: search.trim() || undefined,
          categoryId: categoryId ? Number(categoryId) : undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          page,
          pageSize: 25,
        }),
        expenseApi.categories(true),
      ]);
      setData(pageResult);
      setCategories(categoryResult);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [search, categoryId, dateFrom, dateTo, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [load, reloadKey]);

  const refresh = () => setReloadKey((key) => key + 1);

  const openCreate = () => {
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setCategory(categories.find((entry) => entry.isActive)?.id ? String(categories.find((entry) => entry.isActive)?.id) : "");
    setDescription("");
    setAmount("");
    setPaymentMode("CASH");
    setReference("");
    setNotes("");
    setFormError(null);
    setModalOpen(true);
  };

  const save = async () => {
    setFormError(null);
    if (!description.trim()) {
      setFormError("Description is required");
      return;
    }
    const amountMinor = rupeesToPaise(amount);
    if (amountMinor <= 0) {
      setFormError("Amount must be greater than zero");
      return;
    }
    const input: ExpenseInput = {
      expenseCategoryId: category ? Number(category) : undefined,
      expenseDate,
      description: description.trim(),
      amountMinor,
      paymentMode,
      referenceNumber: reference.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    setSaving(true);
    try {
      await expenseApi.create(input);
      setModalOpen(false);
      refresh();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const addCategory = async () => {
    setCategoryError(null);
    if (!newCategory.trim()) {
      setCategoryError("Category name is required");
      return;
    }
    try {
      const created = await expenseApi.createCategory({ name: newCategory.trim() });
      setNewCategory("");
      setCategoryModal(false);
      setCategories((current) => [...current, created]);
      setCategory(String(created.id));
    } catch (err) {
      setCategoryError(getErrorMessage(err));
    }
  };

  const firstRow = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const lastRow = Math.min(data.page * data.pageSize, data.total);
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-900">{t("Expenses")}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Record day-to-day expenses with categories and payment modes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCsv("expenses", [{header:"Category", value: e => e.categoryName ?? ""}, {header:"Date", value: e => e.expenseDate}, {header:"Description", value: e => e.description}, {header:"Amount", value: e => e.amountMinor}, {header:"Payment Mode", value: e => e.paymentMode}, {header:"Reference", value: e => e.referenceNumber ?? ""}, {header:"Notes", value: e => e.notes ?? ""}], data.items)}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportExcel("expenses", "Expenses", [{header:"Category", value: e => e.categoryName ?? ""}, {header:"Date", value: e => e.expenseDate}, {header:"Description", value: e => e.description}, {header:"Amount", value: e => e.amountMinor}, {header:"Payment Mode", value: e => e.paymentMode}, {header:"Reference", value: e => e.referenceNumber ?? ""}, {header:"Notes", value: e => e.notes ?? ""}], data.items)}>
            <Download className="h-4 w-4" /> Excel
          </Button>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setCategoryModal(true)}>
                Manage categories
              </Button>
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" /> {t("Add expense")}
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
            placeholder={t("Search description or reference")}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          className="w-48"
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
            setPage(1);
          }}
        >
          <option value="">{t("All categories")}</option>
          {categories
            .filter((entry) => entry.isActive)
            .map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
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

      <Card>
        <CardHeader>
          <CardTitle>{t("Expense list")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {loading ? (
            <LoadingBlock label={t("Loading expenses…")} />
          ) : data.items.length === 0 ? (
            <EmptyState
              title={search ? "No matching expenses" : "No expenses yet"}
              description={
                search
                  ? "Try a different description, category, or date range."
                  : "Record your first expense to include it in reporting."
              }
              action={
                canManage && !search ? (
                  <Button onClick={openCreate}>
                    <Plus className="h-4 w-4" /> {t("Add expense")}
                  </Button>
                ) : null
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Date")}</TableHead>
                  <TableHead>{t("Description")}</TableHead>
                  <TableHead>{t("Category")}</TableHead>
                  <TableHead>{t("Mode")}</TableHead>
                  <TableHead>{t("Reference")}</TableHead>
                  <TableHead className="text-right">{t("Amount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="text-zinc-600">{expense.expenseDate}</TableCell>
                    <TableCell className="font-medium text-zinc-900">
                      {expense.description}
                    </TableCell>
                    <TableCell>
                      {expense.categoryName ? (
                        <Badge variant="outline">{expense.categoryName}</Badge>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>{expense.paymentMode.replaceAll("_", " ")}</TableCell>
                    <TableCell className="font-mono text-xs text-zinc-500">
                      {expense.referenceNumber ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPaise(expense.amountMinor)}
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t("Add expense")}>
        <div className="space-y-4">
          {formError ? <ErrorBanner message={formError} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="expenseDate">{t("Date")}</Label>
              <Input
                id="expenseDate"
                type="date"
                className="mt-1.5"
                value={expenseDate}
                onChange={(event) => setExpenseDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="expenseCategory">{t("Category")}</Label>
              <Select
                id="expenseCategory"
                className="mt-1.5"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="">{t("Uncategorized")}</option>
                {categories
                  .filter((entry) => entry.isActive)
                  .map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="expenseDescription">{t("Description")}</Label>
              <Input
                id="expenseDescription"
                className="mt-1.5"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="expenseAmount">{t("Amount (₹)")}</Label>
              <Input
                id="expenseAmount"
                type="number"
                min="0"
                step="0.01"
                className="mt-1.5"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="expenseMode">{t("Payment mode")}</Label>
              <Select
                id="expenseMode"
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
              <Label htmlFor="expenseRef">{t("Reference")}</Label>
              <Input
                id="expenseRef"
                className="mt-1.5"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="expenseNotes">{t("Notes")}</Label>
              <Textarea
                id="expenseNotes"
                className="mt-1.5"
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? t("Saving…") : t("Add expense")}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={categoryModal}
        onClose={() => setCategoryModal(false)}
        title={t("Expense categories")}
      >
        <div className="space-y-4">
          {categoryError ? <ErrorBanner message={categoryError} /> : null}
          <div className="flex gap-2">
            <Input
              placeholder={t("New category name")}
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
            />
            <Button onClick={() => void addCategory()}>
              <Plus className="h-4 w-4" /> {t("Add")}
            </Button>
          </div>
          <div className="rounded-lg border border-zinc-200">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Name")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium text-zinc-900">
                      {entry.name}
                    </TableCell>
                    <TableCell>
                      {entry.isActive ? (
                        <Badge variant="success">{t("Active")}</Badge>
                      ) : (
                        <Badge variant="muted">{t("Inactive")}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </Modal>
    </div>
  );
}
