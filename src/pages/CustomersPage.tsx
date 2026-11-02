import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Pencil, Plus, Search, UserX } from "lucide-react";
import { customerApi, getErrorMessage } from "@/lib/api";
import { formatPaise } from "@/lib/money";
import type { Customer, CustomerInput, Paged } from "@/lib/types";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { CustomerForm } from "@/components/customers/CustomerForm";
import { exportCsv, exportExcel } from "@/lib/export";
import { Download } from "lucide-react";
import { t } from "@/lib/i18n";

const emptyPage: Paged<Customer> = { items: [], total: 0, page: 1, pageSize: 25 };

export function CustomersPage() {
  const canManage = useAuthStore((state) =>
    Boolean(state.user?.permissions.includes("customers.manage")),
  );
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<Paged<Customer>>(emptyPage);
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await customerApi.list({
        search: search.trim() || undefined,
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
  }, [search, page, includeInactive]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [load, reloadKey]);

  const refresh = () => setReloadKey((key) => key + 1);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (customer: Customer) => {
    setEditing(customer);
    setFormOpen(true);
  };

  const submitCustomer = async (input: CustomerInput) => {
    if (editing) {
      await customerApi.update(editing.id, input);
    } else {
      await customerApi.create(input);
    }
    setFormOpen(false);
    setEditing(null);
    refresh();
  };

  const toggleActive = async (customer: Customer) => {
    const action = customer.isActive ? "deactivate" : "activate";
    if (!window.confirm(`Are you sure you want to ${action} ${customer.name}?`)) return;
    try {
      await customerApi.setActive(customer.id, !customer.isActive);
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
          <h2 className="text-2xl font-semibold text-zinc-900">{t("Customers")}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Master records used for GST and non-GST sales invoices.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCsv("customers", [{header:"Name", value: c => c.name}, {header:"Phone", value: c => c.phone ?? ""}, {header:"Email", value: c => c.email ?? ""}, {header:"GSTIN", value: c => c.gstin ?? ""}, {header:"Address", value: c => c.billingAddress ?? ""}, {header:"Balance", value: c => c.openingBalanceMinor}], data.items)}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportExcel("customers", "Customers", [{header:"Name", value: c => c.name}, {header:"Phone", value: c => c.phone ?? ""}, {header:"Email", value: c => c.email ?? ""}, {header:"GSTIN", value: c => c.gstin ?? ""}, {header:"Address", value: c => c.billingAddress ?? ""}, {header:"Balance", value: c => c.openingBalanceMinor}], data.items)}>
            <Download className="h-4 w-4" /> Excel
          </Button>
          {canManage ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> {t("Add customer")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            className="pl-9"
            placeholder={t("Search by name, code, or phone")}
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
          <LoadingBlock label={t("Loading customers…")} />
        ) : data.items.length === 0 ? (
          <EmptyState
            title={search ? "No matching customers" : "No customers yet"}
            description={
              search
                ? "Try a different name, code, or phone number."
                : "Add your first customer to start recording invoices and payments."
            }
            action={
              canManage && !search ? (
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" /> {t("Add customer")}
                </Button>
              ) : null
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Code")}</TableHead>
                <TableHead>{t("Customer")}</TableHead>
                <TableHead>{t("Phone")}</TableHead>
                <TableHead>{t("GSTIN")}</TableHead>
                <TableHead className="text-right">{t("Opening balance")}</TableHead>
                <TableHead>{t("Status")}</TableHead>
                <TableHead className="text-right">{t("Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-mono text-xs text-zinc-500">
                    {customer.customerCode ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Link
                      className="font-medium text-zinc-900 hover:underline"
                      to={`/customers/${customer.id}`}
                    >
                      {customer.name}
                    </Link>
                    {customer.email ? (
                      <p className="text-xs text-zinc-500">{customer.email}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-zinc-600">{customer.phone ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-zinc-600">
                    {customer.gstin ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPaise(customer.openingBalanceMinor)}
                  </TableCell>
                  <TableCell>
                    {customer.isActive ? (
                      <Badge variant="success">{t("Active")}</Badge>
                    ) : (
                      <Badge variant="muted">{t("Inactive")}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {canManage && customer.isActive ? (
                        <Button variant="ghost" size="sm" onClick={() => openEdit(customer)}>
                          <Pencil className="h-3.5 w-3.5" /> {t("Edit")}
                        </Button>
                      ) : null}
                      {canManage ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className={customer.isActive ? "text-red-600 hover:bg-red-50" : ""}
                          onClick={() => void toggleActive(customer)}
                        >
                          {customer.isActive ? (
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
        title={editing ? t("Edit customer") : t("New customer")}
        description={t("Contact and tax details are snapshotted onto finalized invoices.")}
        size="lg"
      >
        <CustomerForm
          customer={editing}
          onSubmit={submitCustomer}
          onCancel={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      </Modal>
    </div>
  );
}
