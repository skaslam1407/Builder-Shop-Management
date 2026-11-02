export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number;
}

function guardFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function csvCell(value: string | number | null | undefined): string {
  if (typeof value === "number") return String(value);
  const text = guardFormula(String(value ?? ""));
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCsv<T>(
  filename: string,
  columns: ExportColumn<T>[],
  rows: T[],
): void {
  const lines = [columns.map((column) => csvCell(column.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(column.value(row))).join(","));
  }
  download(`${filename}.csv`, lines.join("\r\n"), "text/csv;charset=utf-8");
}

export function exportExcel<T>(
  filename: string,
  sheetName: string,
  columns: ExportColumn<T>[],
  rows: T[],
): void {
  const headerRow = columns
    .map(
      (column) =>
        `<Cell><Data ss:Type="String">${escapeXml(guardFormula(column.header))}</Data></Cell>`,
    )
    .join("");

  const bodyRows = rows
    .map((row) => {
      const cells = columns
        .map((column) => {
          const value = column.value(row);
          if (typeof value === "number") {
            return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
          }
          return `<Cell><Data ss:Type="String">${escapeXml(
            guardFormula(String(value ?? "")),
          )}</Data></Cell>`;
        })
        .join("");
      return `<Row>${cells}</Row>`;
    })
    .join("");

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="${escapeXml(sheetName)}"><Table>
<Row>${headerRow}</Row>${bodyRows}
</Table></Worksheet></Workbook>`;

  download(`${filename}.xls`, xml, "application/vnd.ms-excel");
}

export function printReport(): void {
  window.print();
}
