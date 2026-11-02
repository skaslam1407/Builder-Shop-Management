import { useCallback, useEffect, useState } from "react";
import { DatabaseBackup, RotateCcw, ShieldCheck } from "lucide-react";
import { backupApi, getErrorMessage } from "@/lib/api";
import type { BackupInfo, BackupValidation } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, ErrorBanner, LoadingBlock, SuccessBanner } from "@/components/ui/feedback";
import { t } from "@/lib/i18n";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function BackupPage() {
  const [items, setItems] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [validations, setValidations] = useState<Record<string, BackupValidation>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await backupApi.list());
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy("create");
    setError(null);
    setMessage(null);
    try {
      const info = await backupApi.create();
      setMessage(`Backup created: ${info.name}`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const validate = async (backup: BackupInfo) => {
    setBusy(backup.name);
    setError(null);
    try {
      const result = await backupApi.validate(backup.name);
      setValidations((current) => ({ ...current, [backup.name]: result }));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const restore = async (backup: BackupInfo) => {
    if (
      !window.confirm(
        `Restore ${backup.name}? The app will make a safety copy, then restore after you close and reopen it.`,
      )
    ) {
      return;
    }
    setBusy(backup.name);
    setError(null);
    setMessage(null);
    try {
      const result = await backupApi.restore(backup.name);
      setMessage(result.message);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-900">{t("Backup & Restore")}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {t("Create validated SQLite snapshots and stage safe restores.")}
          </p>
        </div>
        <Button onClick={() => void create()} disabled={busy === "create"}>
          <DatabaseBackup className="h-4 w-4" />
          {busy === "create" ? t("Creating…") : t("Create backup")}
        </Button>
      </div>

      {error ? <ErrorBanner message={error} /> : null}
      {message ? <SuccessBanner message={message} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("Available backups")}</CardTitle>
          <CardDescription>
            {t("Backups live in the application data folder. A restore is applied on next launch.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {loading ? (
            <LoadingBlock label={t("Loading backups…")} />
          ) : items.length === 0 ? (
            <EmptyState
              title={t("No backups yet")}
              description={t("Create your first backup before entering production data.")}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Backup")}</TableHead>
                  <TableHead>{t("Created")}</TableHead>
                  <TableHead className="text-right">{t("Size")}</TableHead>
                  <TableHead>{t("Validation")}</TableHead>
                  <TableHead className="text-right">{t("Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((backup) => {
                  const validation = validations[backup.name];
                  return (
                    <TableRow key={backup.name}>
                      <TableCell className="font-mono text-xs">{backup.name}</TableCell>
                      <TableCell className="text-xs text-zinc-500">
                        {new Date(backup.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBytes(backup.sizeBytes)}
                      </TableCell>
                      <TableCell>
                        {validation ? (
                          <Badge variant={validation.valid ? "success" : "danger"}>
                            {validation.valid ? t("Valid") : t("Invalid")}
                          </Badge>
                        ) : (
                          <span className="text-xs text-zinc-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy === backup.name}
                            onClick={() => void validate(backup)}
                          >
                            <ShieldCheck className="h-3.5 w-3.5" /> {t("Validate")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy === backup.name}
                            onClick={() => void restore(backup)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> {t("Restore")}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Restore safety")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-zinc-600 md:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 p-4">
            <p className="font-medium text-zinc-900">{t("Integrity checked")}</p>
            <p className="mt-1 text-xs">{t("SQLite integrity and required tables are verified before staging.")}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-4">
            <p className="font-medium text-zinc-900">{t("Pre-restore copy")}</p>
            <p className="mt-1 text-xs">{t("The current database is backed up automatically on next launch.")}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-4">
            <p className="font-medium text-zinc-900">{t("Restart required")}</p>
            <p className="mt-1 text-xs">{t("Close the app completely, then reopen it to apply the restore.")}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
