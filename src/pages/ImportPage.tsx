import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { getErrorMessage, importApi } from "@/lib/api";
import type { ImportResult, ImportRowResult } from "@/lib/types";
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
import { ErrorBanner, LoadingBlock, SuccessBanner } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

type Entity = "customers" | "suppliers" | "items";

interface ImportConfig {
  label: string;
  headers: string[];
  sample: string[];
  permissionHint: string;
}

const configs: Record<Entity, ImportConfig> = {
  customers: {
    label: "Customers",
    headers: [
      "Name",
      "Phone",
      "Email",
      "GSTIN",
      "Billing address",
      "Shipping address",
      "Opening balance",
      "Notes",
    ],
    sample: [
      "Ravi Kumar",
      "9876543210",
      "ravi@example.com",
      "",
      "Main Road",
      "",
      "0",
      "",
    ],
    permissionHint: "Requires customers.manage",
  },
  suppliers: {
    label: "Suppliers",
    headers: ["Name", "Phone", "Email", "GSTIN", "Address", "Opening balance", "Notes"],
    sample: ["Cement Co", "9876543210", "", "", "Industrial Area", "0", ""],
    permissionHint: "Requires suppliers.manage",
  },
  items: {
    label: "Items",
    headers: [
      "Item code",
      "Name",
      "Category",
      "Unit",
      "Purchase rate",
      "Selling rate",
      "HSN",
      "GST %",
      "Reorder level",
      "Description",
    ],
    sample: ["CEM-001", "OPC Cement", "Cement", "BAG", "400", "450", "2523", "18", "10", "50kg"],
    permissionHint: "Requires catalog.manage; category and unit must already exist",
  },
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseSpreadsheetXml(text: string): string[][] {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("Could not parse Excel XML file");
  }
  const rows: string[][] = [];
  const rowNodes = Array.from(doc.getElementsByTagNameNS("*", "Row"));
  for (const rowNode of rowNodes) {
    const cells = Array.from(rowNode.getElementsByTagNameNS("*", "Cell")).map((cell) => {
      const data = cell.getElementsByTagNameNS("*", "Data")[0];
      return data?.textContent ?? "";
    });
    rows.push(cells);
  }
  return rows;
}

function cleanCell(value: string): string {
  const trimmed = value.trim();
  return /^'[=+\-@\t\r]/.test(trimmed) ? trimmed.slice(1) : trimmed;
}

export function ImportPage() {
  const [entity, setEntity] = useState<Entity>("customers");
  const [rows, setRows] = useState<string[][]>([]);
  const [validation, setValidation] = useState<ImportRowResult[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const config = configs[entity];
  const validCount = useMemo(
    () => validation.filter((row) => row.valid).length,
    [validation],
  );
  const canCommit =
    rows.length > 0 && validation.length === rows.length && validCount === rows.length;

  const reset = () => {
    setRows([]);
    setValidation([]);
    setFileName(null);
    setResult(null);
    setError(null);
  };

  const switchEntity = (next: Entity) => {
    setEntity(next);
    reset();
  };

  const handleFile = async (file: File) => {
    setError(null);
    setResult(null);
    setValidation([]);
    setFileName(file.name);
    if (file.size > 4 * 1024 * 1024) {
      setError("File is too large. Keep imports under 4 MB.");
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const text = await file.text();
      const parsed = file.name.toLowerCase().endsWith(".csv")
        ? parseCsv(text)
        : parseSpreadsheetXml(text);
      let dataRows = parsed.map((row) => row.map(cleanCell));
      const first = dataRows[0];
      if (
        first &&
        first.length === config.headers.length &&
        first.every(
          (value, index) =>
            value.trim().toLowerCase() === config.headers[index].toLowerCase(),
        )
      ) {
        dataRows = dataRows.slice(1);
      }
      dataRows = dataRows.filter((row) => row.some((value) => value.trim().length > 0));
      if (dataRows.length === 0) {
        throw new Error("No data rows found in the file");
      }
      dataRows = dataRows.map((row) => {
        const next = [...row];
        while (next.length < config.headers.length) next.push("");
        return next.slice(0, config.headers.length);
      });
      setRows(dataRows);
      setValidation(await importApi.validate(entity, dataRows));
    } catch (err) {
      setRows([]);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const commit = async () => {
    if (!canCommit) return;
    setCommitting(true);
    setError(null);
    try {
      const imported = await importApi.commit(entity, rows);
      setResult(imported);
      setValidation(imported.rows);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCommitting(false);
    }
  };

  const downloadTemplate = () => {
    const csv = [config.headers, config.sample]
      .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${entity}-import-template.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-zinc-900">{t("Import data")}</h2>
        <p className="mt-1 text-sm text-zinc-500">
          {t("Preview and validate CSV or Excel XML before committing records.")}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(configs) as Entity[]).map((key) => (
          <Button
            key={key}
            variant={entity === key ? "default" : "outline"}
            size="sm"
            onClick={() => switchEntity(key)}
          >
            {t(configs[key].label)}
          </Button>
        ))}
      </div>

      {error ? <ErrorBanner message={error} /> : null}
      {result ? (
        <SuccessBanner
          message={`Imported ${result.imported} rows${result.skipped ? `; skipped ${result.skipped} blank rows` : ""}.`}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("Upload file")}</CardTitle>
          <CardDescription>
            {t("Expected columns")}: {config.headers.join(", ")}. {t(config.permissionHint)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50">
              <Upload className="h-4 w-4" />
              {t("Choose CSV or Excel XML")}
              <input
                type="file"
                accept=".csv,.xls,.xml,text/csv,application/vnd.ms-excel,application/xml"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleFile(file);
                  event.target.value = "";
                }}
              />
            </label>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4" /> {t("Download template")}
            </Button>
            {fileName ? (
              <span className="text-xs text-zinc-500">
                <FileSpreadsheet className="mr-1 inline h-3.5 w-3.5" />
                {fileName}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-zinc-500">
            {t("Header row is optional. Blank rows are ignored. Excel support uses SpreadsheetML XML exported by this app.")}
          </p>
        </CardContent>
      </Card>

      {loading ? <LoadingBlock label={t("Validating rows…")} /> : null}

      {rows.length > 0 && !loading ? (
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>{t("Preview")}</CardTitle>
              <CardDescription>
                {t("Rows")}: {rows.length} · {t("Valid")}: {validCount} · {t("Invalid")}:{" "}
                {rows.length - validCount}
              </CardDescription>
            </div>
            <Button onClick={() => void commit()} disabled={!canCommit || committing}>
              {committing ? t("Importing…") : t("Import valid rows")}
            </Button>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Row")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                  <TableHead>{t("Validation")}</TableHead>
                  <TableHead>{t("Values")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 100).map((row, index) => {
                  const status = validation[index];
                  return (
                    <TableRow key={index} className={cn(!status?.valid && "bg-red-50/40")}>
                      <TableCell className="text-xs text-zinc-500">{index + 1}</TableCell>
                      <TableCell>
                        {status ? (
                          <Badge variant={status.valid ? "success" : "danger"}>
                            {status.valid ? t("Valid") : t("Invalid")}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-600">
                        {status?.message ?? ""}
                      </TableCell>
                      <TableCell className="max-w-md truncate text-xs text-zinc-500">
                        {row.join(" · ")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {rows.length > 100 ? (
              <p className="px-5 py-3 text-xs text-zinc-500">
                {t("Showing first 100 rows only; all rows will be validated and imported.")}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
