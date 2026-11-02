import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  Package,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getErrorMessage, reportApi } from "@/lib/api";
import { formatPaise } from "@/lib/money";
import { useT } from "@/lib/i18n";
import type { DashboardSummary } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { EmptyState, ErrorBanner, LoadingBlock } from "@/components/ui/feedback";

function localIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthStart(): string {
  const now = new Date();
  return localIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof TrendingUp;
  tone: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{value}</p>
          <p className="mt-1 text-xs text-zinc-500">{hint}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const t = useT();
  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo] = useState(localIsoDate(new Date()));
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await reportApi.dashboard(from, to));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(monthStart(), localIsoDate(new Date()));
  }, [load]);

  const applyRange = () => {
    if (dateFrom > dateTo) {
      setError("From date cannot be after to date");
      return;
    }
    void load(dateFrom, dateTo);
  };

  const chartData = summary
    ? [
        { name: t("Sales"), value: summary.salesMinor },
        { name: t("Collections"), value: summary.collectionsMinor },
        { name: t("Purchases"), value: summary.purchasesMinor },
        { name: t("Expenses"), value: summary.expensesMinor },
      ]
    : [];
  const hasChartData = chartData.some((entry) => entry.value > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-900">{t("Business overview")}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {t("Amounts are recalculated from source records and shown in INR.")}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="from">{t("From")}</Label>
            <Input
              id="from"
              type="date"
              className="mt-1.5 w-40"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="to">{t("To")}</Label>
            <Input
              id="to"
              type="date"
              className="mt-1.5 w-40"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>
          <Button variant="outline" onClick={applyRange}>
            {t("Apply")}
          </Button>
        </div>
      </div>

      {error ? <ErrorBanner message={error} onRetry={() => void load(dateFrom, dateTo)} /> : null}

      {loading && !summary ? (
        <Card>
          <LoadingBlock label={t("Loading dashboard…")} />
        </Card>
      ) : summary ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <KpiCard
              label="Sales"
              value={formatPaise(summary.salesMinor)}
              hint="Finalized invoices in range"
              icon={TrendingUp}
              tone="bg-brand-50 text-brand-700"
            />
            <KpiCard
              label="Collections"
              value={formatPaise(summary.collectionsMinor)}
              hint="Posted payments in range"
              icon={Wallet}
              tone="bg-emerald-50 text-emerald-700"
            />
            <KpiCard
              label="Receivables"
              value={formatPaise(summary.receivablesMinor)}
              hint="Outstanding across all invoices"
              icon={Receipt}
              tone="bg-red-50 text-red-700"
            />
            <KpiCard
              label="Purchases"
              value={formatPaise(summary.purchasesMinor)}
              hint="Finalized purchase invoices"
              icon={ShoppingCart}
              tone="bg-sky-50 text-sky-700"
            />
            <KpiCard
              label="Expenses"
              value={formatPaise(summary.expensesMinor)}
              hint="Recorded expenses in range"
              icon={Receipt}
              tone="bg-zinc-100 text-zinc-700"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-start justify-between">
                <div>
                  <CardTitle>{t("Financial activity")}</CardTitle>
                  <CardDescription>
                    {summary.dateFrom} to {summary.dateTo}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="h-72">
                {hasChartData ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                        tickFormatter={(value: number) => formatPaise(value)}
                      />
                      <Tooltip
                        formatter={(value) => formatPaise(Number(value))}
                        contentStyle={{ borderRadius: 8, borderColor: "#e4e4e7", fontSize: 12 }}
                      />
                      <Bar dataKey="value" name="Amount" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState
                    title={t("No financial activity in this period")}
                    description={t("Finalize a sales invoice, record a payment, or add an expense to populate this chart.")}
                  />
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t("Master data")}</CardTitle>
                  <CardDescription>{t("Active records available for billing.")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-4 py-3">
                    <span className="flex items-center gap-2 text-sm text-zinc-600">
                      <Users className="h-4 w-4" /> {t("Customers")}
                    </span>
                    <span className="text-sm font-semibold">{summary.customersCount}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-4 py-3">
                    <span className="flex items-center gap-2 text-sm text-zinc-600">
                      <Package className="h-4 w-4" /> {t("Items")}
                    </span>
                    <span className="text-sm font-semibold">{summary.itemsCount}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-amber-50 px-4 py-3">
                    <span className="flex items-center gap-2 text-sm text-amber-800">
                      <AlertTriangle className="h-4 w-4" /> {t("Low stock")}
                    </span>
                    <span className="text-sm font-semibold text-amber-900">
                      {summary.lowStockCount}
                    </span>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Link to="/customers" className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        {t("Customers")} <ArrowUpRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                    <Link to="/items" className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        {t("Items")} <ArrowUpRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-brand-200 bg-brand-50">
                <CardContent className="text-sm text-brand-900">
                  <p className="font-semibold">{t("Offline-first records")}</p>
                  <p className="mt-1 text-brand-800">
                    {t("Your shop data stays on this computer and is protected by daily backups.")}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
