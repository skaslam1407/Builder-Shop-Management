use sqlx::SqlitePool;
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::models::{
    ExpenseReport, ExpenseReportRow, GstRateRow, GstReport, ItemSalesReport, ItemSalesRow,
    PayableRow, PayablesReport, ReceivableRow, ReceivablesReport, SalesReport, SalesReportRow,
    StockReport, StockReportRow,
};
use crate::money::round_div_half_up;
use crate::state::AppState;

fn date_range(date_from: &str, date_to: &str) -> AppResult<(String, String)> {
    let from = crate::commands::purchase::parse_date(date_from, "From date")?;
    let to = crate::commands::purchase::parse_date(date_to, "To date")?;
    if from > to {
        return Err(AppError::Validation(
            "From date cannot be after to date".into(),
        ));
    }
    Ok((
        from.format("%Y-%m-%d").to_string(),
        to.format("%Y-%m-%d").to_string(),
    ))
}

fn clean_search(search: Option<String>) -> String {
    search.unwrap_or_default().trim().to_string()
}

async fn sales_report_data(
    pool: &SqlitePool,
    date_from: &str,
    date_to: &str,
    granularity: &str,
) -> AppResult<SalesReport> {
    let (date_from, date_to) = date_range(date_from, date_to)?;
    let period_expression = match granularity {
        "day" => "invoice_date",
        "month" => "substr(invoice_date, 1, 7)",
        "year" => "substr(invoice_date, 1, 4)",
        _ => {
            return Err(AppError::Validation(
                "Granularity must be day, month, or year".into(),
            ));
        }
    };

    let summary: (i64, i64, i64, i64, i64, i64) = sqlx::query_as(
        "SELECT COUNT(*), COALESCE(SUM(subtotal_minor), 0), COALESCE(SUM(discount_minor), 0), \
                COALESCE(SUM(taxable_minor), 0), \
                COALESCE(SUM(cgst_minor + sgst_minor + igst_minor + other_tax_minor), 0), \
                COALESCE(SUM(grand_total_minor), 0) \
         FROM sales_invoices \
         WHERE status = 'FINALIZED' AND invoice_date BETWEEN ? AND ?",
    )
    .bind(&date_from)
    .bind(&date_to)
    .fetch_one(pool)
    .await?;

    let rows = sqlx::query_as::<_, SalesReportRow>(&format!(
        "SELECT {period_expression} AS period, COUNT(*) AS invoice_count, \
                COALESCE(SUM(subtotal_minor), 0) AS subtotal_minor, \
                COALESCE(SUM(discount_minor), 0) AS discount_minor, \
                COALESCE(SUM(taxable_minor), 0) AS taxable_minor, \
                COALESCE(SUM(cgst_minor + sgst_minor + igst_minor + other_tax_minor), 0) AS tax_minor, \
                COALESCE(SUM(grand_total_minor), 0) AS grand_total_minor \
         FROM sales_invoices \
         WHERE status = 'FINALIZED' AND invoice_date BETWEEN ? AND ? \
         GROUP BY period ORDER BY period"
    ))
    .bind(&date_from)
    .bind(&date_to)
    .fetch_all(pool)
    .await?;

    let collected_minor: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount_minor), 0) FROM payments \
         WHERE status = 'POSTED' AND payment_date BETWEEN ? AND ?",
    )
    .bind(&date_from)
    .bind(&date_to)
    .fetch_one(pool)
    .await?;

    Ok(SalesReport {
        date_from,
        date_to,
        granularity: granularity.to_string(),
        invoice_count: summary.0,
        subtotal_minor: summary.1,
        discount_minor: summary.2,
        taxable_minor: summary.3,
        tax_minor: summary.4,
        grand_total_minor: summary.5,
        collected_minor,
        rows,
    })
}

async fn receivables_report_data(
    pool: &SqlitePool,
    date_to: &str,
    search: Option<String>,
) -> AppResult<ReceivablesReport> {
    let date_to = crate::commands::purchase::parse_date(date_to, "As of date")?
        .format("%Y-%m-%d")
        .to_string();
    let search = clean_search(search);
    let like = format!("%{search}%");

    let rows = sqlx::query_as::<_, ReceivableRow>(
        "SELECT c.id AS customer_id, c.customer_code, c.name AS customer_name, c.phone, \
                COALESCE(i.invoice_count, 0) AS invoice_count, \
                COALESCE(i.billed_minor, 0) AS billed_minor, \
                COALESCE(i.due_minor, 0) AS due_minor, \
                c.opening_balance_minor, \
                c.opening_balance_minor + COALESCE(i.due_minor, 0) AS outstanding_minor, \
                i.last_invoice_date \
         FROM customers c \
         LEFT JOIN ( \
             SELECT customer_id, COUNT(*) AS invoice_count, \
                    COALESCE(SUM(grand_total_minor), 0) AS billed_minor, \
                    COALESCE(SUM(due_minor), 0) AS due_minor, \
                    MAX(invoice_date) AS last_invoice_date \
             FROM sales_invoices \
             WHERE status = 'FINALIZED' AND customer_id IS NOT NULL AND invoice_date <= ? \
             GROUP BY customer_id \
         ) i ON i.customer_id = c.id \
         WHERE (? = '' OR c.name LIKE ? OR IFNULL(c.customer_code, '') LIKE ? \
                OR IFNULL(c.phone, '') LIKE ?) \
           AND (c.opening_balance_minor > 0 OR COALESCE(i.due_minor, 0) > 0) \
         ORDER BY outstanding_minor DESC, c.name COLLATE NOCASE",
    )
    .bind(&date_to)
    .bind(&search)
    .bind(&like)
    .bind(&like)
    .bind(&like)
    .fetch_all(pool)
    .await?;

    let customer_count = rows.len() as i64;
    let invoice_count = rows.iter().map(|row| row.invoice_count).sum();
    let due_minor = rows.iter().map(|row| row.due_minor).sum();
    let opening_balance_minor = rows.iter().map(|row| row.opening_balance_minor).sum();
    let outstanding_minor = rows.iter().map(|row| row.outstanding_minor).sum();

    Ok(ReceivablesReport {
        date_to,
        customer_count,
        invoice_count,
        due_minor,
        opening_balance_minor,
        outstanding_minor,
        rows,
    })
}

async fn payables_report_data(
    pool: &SqlitePool,
    date_to: &str,
    search: Option<String>,
) -> AppResult<PayablesReport> {
    let date_to = crate::commands::purchase::parse_date(date_to, "As of date")?
        .format("%Y-%m-%d")
        .to_string();
    let search = clean_search(search);
    let like = format!("%{search}%");

    let rows = sqlx::query_as::<_, PayableRow>(
        "SELECT s.id AS supplier_id, s.supplier_code, s.name AS supplier_name, s.phone, \
                COALESCE(i.invoice_count, 0) AS invoice_count, \
                COALESCE(i.billed_minor, 0) AS billed_minor, \
                COALESCE(i.due_minor, 0) AS due_minor, \
                s.opening_balance_minor, \
                s.opening_balance_minor + COALESCE(i.due_minor, 0) AS outstanding_minor, \
                i.last_invoice_date \
         FROM suppliers s \
         LEFT JOIN ( \
             SELECT supplier_id, COUNT(*) AS invoice_count, \
                    COALESCE(SUM(grand_total_minor), 0) AS billed_minor, \
                    COALESCE(SUM(due_minor), 0) AS due_minor, \
                    MAX(invoice_date) AS last_invoice_date \
             FROM purchase_invoices \
             WHERE status = 'FINALIZED' AND invoice_date <= ? \
             GROUP BY supplier_id \
         ) i ON i.supplier_id = s.id \
         WHERE (? = '' OR s.name LIKE ? OR IFNULL(s.supplier_code, '') LIKE ? \
                OR IFNULL(s.phone, '') LIKE ?) \
           AND (s.opening_balance_minor > 0 OR COALESCE(i.due_minor, 0) > 0) \
         ORDER BY outstanding_minor DESC, s.name COLLATE NOCASE",
    )
    .bind(&date_to)
    .bind(&search)
    .bind(&like)
    .bind(&like)
    .bind(&like)
    .fetch_all(pool)
    .await?;

    let supplier_count = rows.len() as i64;
    let invoice_count = rows.iter().map(|row| row.invoice_count).sum();
    let due_minor = rows.iter().map(|row| row.due_minor).sum();
    let opening_balance_minor = rows.iter().map(|row| row.opening_balance_minor).sum();
    let outstanding_minor = rows.iter().map(|row| row.outstanding_minor).sum();

    Ok(PayablesReport {
        date_to,
        supplier_count,
        invoice_count,
        due_minor,
        opening_balance_minor,
        outstanding_minor,
        rows,
    })
}

async fn item_sales_report_data(
    pool: &SqlitePool,
    date_from: &str,
    date_to: &str,
    search: Option<String>,
) -> AppResult<ItemSalesReport> {
    let (date_from, date_to) = date_range(date_from, date_to)?;
    let search = clean_search(search);
    let like = format!("%{search}%");

    let rows = sqlx::query_as::<_, ItemSalesRow>(
        "SELECT l.item_id, i.item_code, COALESCE(i.name, l.description_snapshot) AS item_name, \
                COALESCE(SUM(l.quantity_milli), 0) AS quantity_milli, \
                COALESCE(SUM(l.line_total_minor), 0) AS sales_minor, \
                COUNT(DISTINCT l.sales_invoice_id) AS invoice_count \
         FROM sales_invoice_items l \
         JOIN sales_invoices si ON si.id = l.sales_invoice_id \
         LEFT JOIN items i ON i.id = l.item_id \
         WHERE si.status = 'FINALIZED' AND si.invoice_date BETWEEN ? AND ? \
           AND (? = '' OR COALESCE(i.name, l.description_snapshot) LIKE ? \
                OR IFNULL(i.item_code, '') LIKE ?) \
         GROUP BY l.item_id, COALESCE(i.name, l.description_snapshot), i.item_code \
         ORDER BY sales_minor DESC, item_name COLLATE NOCASE",
    )
    .bind(&date_from)
    .bind(&date_to)
    .bind(&search)
    .bind(&like)
    .bind(&like)
    .fetch_all(pool)
    .await?;

    let item_count = rows.len() as i64;
    let quantity_milli = rows.iter().map(|row| row.quantity_milli).sum();
    let sales_minor = rows.iter().map(|row| row.sales_minor).sum();

    Ok(ItemSalesReport {
        date_from,
        date_to,
        item_count,
        quantity_milli,
        sales_minor,
        rows,
    })
}

async fn expense_report_data(
    pool: &SqlitePool,
    date_from: &str,
    date_to: &str,
) -> AppResult<ExpenseReport> {
    let (date_from, date_to) = date_range(date_from, date_to)?;

    let rows = sqlx::query_as::<_, ExpenseReportRow>(
        "SELECT e.expense_category_id AS category_id, \
                COALESCE(c.name, 'Uncategorized') AS category_name, \
                COUNT(*) AS entry_count, COALESCE(SUM(e.amount_minor), 0) AS amount_minor \
         FROM expenses e LEFT JOIN expense_categories c ON c.id = e.expense_category_id \
         WHERE e.expense_date BETWEEN ? AND ? \
         GROUP BY e.expense_category_id, COALESCE(c.name, 'Uncategorized') \
         ORDER BY amount_minor DESC",
    )
    .bind(&date_from)
    .bind(&date_to)
    .fetch_all(pool)
    .await?;

    let entry_count = rows.iter().map(|row| row.entry_count).sum();
    let total_minor = rows.iter().map(|row| row.amount_minor).sum();

    Ok(ExpenseReport {
        date_from,
        date_to,
        entry_count,
        total_minor,
        rows,
    })
}

async fn gst_report_data(
    pool: &SqlitePool,
    date_from: &str,
    date_to: &str,
) -> AppResult<GstReport> {
    let (date_from, date_to) = date_range(date_from, date_to)?;

    let summary: (i64, i64, i64, i64, i64) = sqlx::query_as(
        "SELECT COUNT(*), COALESCE(SUM(taxable_minor), 0), COALESCE(SUM(cgst_minor), 0), \
                COALESCE(SUM(sgst_minor), 0), COALESCE(SUM(igst_minor), 0) \
         FROM sales_invoices \
         WHERE status = 'FINALIZED' AND invoice_type = 'GST' AND invoice_date BETWEEN ? AND ?",
    )
    .bind(&date_from)
    .bind(&date_to)
    .fetch_one(pool)
    .await?;

    let non_gst_sales_minor: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(grand_total_minor), 0) FROM sales_invoices \
         WHERE status = 'FINALIZED' AND invoice_type = 'NON_GST' AND invoice_date BETWEEN ? AND ?",
    )
    .bind(&date_from)
    .bind(&date_to)
    .fetch_one(pool)
    .await?;

    let rows = sqlx::query_as::<_, GstRateRow>(
        "SELECT l.tax_rate_bps, COALESCE(SUM(l.taxable_minor), 0) AS taxable_minor, \
                COALESCE(SUM(l.cgst_minor + l.sgst_minor + l.igst_minor), 0) AS tax_minor \
         FROM sales_invoice_items l JOIN sales_invoices si ON si.id = l.sales_invoice_id \
         WHERE si.status = 'FINALIZED' AND si.invoice_type = 'GST' \
           AND si.invoice_date BETWEEN ? AND ? \
         GROUP BY l.tax_rate_bps ORDER BY l.tax_rate_bps",
    )
    .bind(&date_from)
    .bind(&date_to)
    .fetch_all(pool)
    .await?;

    let total_tax_minor = summary.2 + summary.3 + summary.4;

    Ok(GstReport {
        date_from,
        date_to,
        gst_invoice_count: summary.0,
        taxable_minor: summary.1,
        cgst_minor: summary.2,
        sgst_minor: summary.3,
        igst_minor: summary.4,
        total_tax_minor,
        non_gst_sales_minor,
        rows,
    })
}

async fn stock_report_data(pool: &SqlitePool, search: Option<String>) -> AppResult<StockReport> {
    let search = clean_search(search);
    let like = format!("%{search}%");

    let raw_rows = sqlx::query_as::<_, StockReportRow>(
        "SELECT i.id, i.item_code, i.name, u.abbreviation AS unit_abbreviation, \
                COALESCE(SUM(sm.quantity_milli), 0) AS quantity_milli, \
                i.reorder_level_milli, i.purchase_rate_minor, \
                0 AS stock_value_minor, i.is_active \
         FROM items i \
         LEFT JOIN units u ON u.id = i.default_unit_id \
         LEFT JOIN stock_movements sm ON sm.item_id = i.id \
         WHERE (? = '' OR i.name LIKE ? OR i.item_code LIKE ?) \
         GROUP BY i.id, i.item_code, i.name, u.abbreviation, i.reorder_level_milli, \
                  i.purchase_rate_minor, i.is_active \
         ORDER BY i.name COLLATE NOCASE",
    )
    .bind(&search)
    .bind(&like)
    .bind(&like)
    .fetch_all(pool)
    .await?;

    let mut rows = Vec::with_capacity(raw_rows.len());
    for row in raw_rows {
        let stock_value_minor = if row.quantity_milli > 0 {
            round_div_half_up(
                row.quantity_milli.saturating_mul(row.purchase_rate_minor),
                1_000,
            )
        } else {
            0
        };
        rows.push(StockReportRow {
            stock_value_minor,
            ..row
        });
    }

    let item_count = rows.len() as i64;
    let total_value_minor = rows.iter().map(|row| row.stock_value_minor).sum();
    let low_stock_count = rows
        .iter()
        .filter(|row| {
            row.is_active
                && row.reorder_level_milli > 0
                && row.quantity_milli < row.reorder_level_milli
        })
        .count() as i64;

    Ok(StockReport {
        item_count,
        total_value_minor,
        low_stock_count,
        rows,
    })
}

#[tauri::command]
pub async fn sales_report(
    state: State<'_, AppState>,
    date_from: String,
    date_to: String,
    granularity: String,
) -> AppResult<SalesReport> {
    state.require_permission("reports.view").await?;
    sales_report_data(&state.db, &date_from, &date_to, &granularity).await
}

#[tauri::command]
pub async fn receivables_report(
    state: State<'_, AppState>,
    date_to: String,
    search: Option<String>,
) -> AppResult<ReceivablesReport> {
    state.require_permission("reports.view").await?;
    receivables_report_data(&state.db, &date_to, search).await
}

#[tauri::command]
pub async fn payables_report(
    state: State<'_, AppState>,
    date_to: String,
    search: Option<String>,
) -> AppResult<PayablesReport> {
    state.require_permission("reports.view").await?;
    payables_report_data(&state.db, &date_to, search).await
}

#[tauri::command]
pub async fn item_sales_report(
    state: State<'_, AppState>,
    date_from: String,
    date_to: String,
    search: Option<String>,
) -> AppResult<ItemSalesReport> {
    state.require_permission("reports.view").await?;
    item_sales_report_data(&state.db, &date_from, &date_to, search).await
}

#[tauri::command]
pub async fn expense_report(
    state: State<'_, AppState>,
    date_from: String,
    date_to: String,
) -> AppResult<ExpenseReport> {
    state.require_permission("reports.view").await?;
    expense_report_data(&state.db, &date_from, &date_to).await
}

#[tauri::command]
pub async fn gst_report(
    state: State<'_, AppState>,
    date_from: String,
    date_to: String,
) -> AppResult<GstReport> {
    state.require_permission("reports.view").await?;
    gst_report_data(&state.db, &date_from, &date_to).await
}

#[tauri::command]
pub async fn stock_report(
    state: State<'_, AppState>,
    search: Option<String>,
) -> AppResult<StockReport> {
    state.require_permission("reports.view").await?;
    stock_report_data(&state.db, search).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    async fn seed(pool: &SqlitePool) {
        sqlx::query(
            "INSERT INTO users (username, display_name, password_hash) VALUES ('admin', 'Admin', 'x')",
        )
        .execute(pool)
        .await
        .expect("user");
        let unit_id: i64 = sqlx::query_scalar(
            "INSERT INTO units (name, abbreviation, precision) VALUES ('Bag', 'bag', 3) RETURNING id",
        )
        .fetch_one(pool)
        .await
        .expect("unit");
        let item_id: i64 = sqlx::query_scalar(
            "INSERT INTO items (item_code, name, default_unit_id, purchase_rate_minor, selling_rate_minor, default_tax_rate_bps, reorder_level_milli) \
             VALUES ('CEM001', 'Cement', ?, 5000, 6000, 1800, 20000) RETURNING id",
        )
        .bind(unit_id)
        .fetch_one(pool)
        .await
        .expect("item");
        let customer_id: i64 = sqlx::query_scalar(
            "INSERT INTO customers (name, opening_balance_minor) VALUES ('Customer A', 1000) RETURNING id",
        )
        .fetch_one(pool)
        .await
        .expect("customer");
        let supplier_id: i64 =
            sqlx::query_scalar("INSERT INTO suppliers (name) VALUES ('Supplier A') RETURNING id")
                .fetch_one(pool)
                .await
                .expect("supplier");
        sqlx::query(
            "INSERT INTO sales_invoices \
             (invoice_number, invoice_type, customer_id, invoice_date, status, \
              customer_name_snapshot, subtotal_minor, taxable_minor, cgst_minor, sgst_minor, \
              grand_total_minor, paid_minor, due_minor, created_by) \
             VALUES ('GST/2026-27/00001', 'GST', ?, '2026-05-10', 'FINALIZED', 'Customer A', \
                     10000, 10000, 900, 900, 11800, 1800, 10000, 1)",
        )
        .bind(customer_id)
        .execute(pool)
        .await
        .expect("sales invoice");
        let invoice_id: i64 = sqlx::query_scalar("SELECT last_insert_rowid()")
            .fetch_one(pool)
            .await
            .expect("invoice id");
        sqlx::query(
            "INSERT INTO sales_invoice_items \
             (sales_invoice_id, line_number, item_id, description_snapshot, quantity_milli, \
              rate_minor, taxable_minor, tax_rate_bps, cgst_minor, sgst_minor, line_total_minor) \
             VALUES (?, 0, ?, 'Cement', 10000, 1000, 10000, 1800, 900, 900, 11800)",
        )
        .bind(invoice_id)
        .bind(item_id)
        .execute(pool)
        .await
        .expect("sales line");
        sqlx::query(
            "INSERT INTO payments \
             (customer_id, sales_invoice_id, payment_date, amount_minor, payment_mode, status, created_by) \
             VALUES (?, ?, '2026-05-11', 1800, 'CASH', 'POSTED', 1)",
        )
        .bind(customer_id)
        .bind(invoice_id)
        .execute(pool)
        .await
        .expect("payment");
        sqlx::query(
            "INSERT INTO purchase_invoices \
             (internal_reference, supplier_id, supplier_invoice_number, invoice_date, status, \
              subtotal_minor, grand_total_minor, paid_minor, due_minor, created_by) \
             VALUES ('PUR/2026-27/00001', ?, 'SUP-1', '2026-05-09', 'FINALIZED', \
                     20000, 20000, 5000, 15000, 1)",
        )
        .bind(supplier_id)
        .execute(pool)
        .await
        .expect("purchase");
        let category_id: i64 =
            sqlx::query_scalar("SELECT id FROM expense_categories WHERE name = 'Rent'")
                .fetch_one(pool)
                .await
                .expect("expense category");
        sqlx::query(
            "INSERT INTO expenses \
             (expense_category_id, expense_date, description, amount_minor, payment_mode, created_by) \
             VALUES (?, '2026-05-12', 'Rent', 5000, 'CASH', 1)",
        )
        .bind(category_id)
        .execute(pool)
        .await
        .expect("expense");
        sqlx::query(
            "INSERT INTO stock_movements \
             (item_id, movement_type, quantity_milli, unit_id, source_type, movement_date, created_by) \
             VALUES (?, 'PURCHASE', 30000, ?, 'PURCHASE_INVOICE', '2026-05-09', 1)",
        )
        .bind(item_id)
        .bind(unit_id)
        .execute(pool)
        .await
        .expect("stock");
    }

    #[tokio::test]
    async fn reports_return_expected_totals() {
        let pool = db::connect_memory().await.expect("database");
        seed(&pool).await;

        let sales = sales_report_data(&pool, "2026-05-01", "2026-05-31", "month")
            .await
            .expect("sales report");
        assert_eq!(sales.invoice_count, 1);
        assert_eq!(sales.grand_total_minor, 11_800);
        assert_eq!(sales.tax_minor, 1_800);
        assert_eq!(sales.collected_minor, 1_800);
        assert_eq!(sales.rows.len(), 1);
        assert_eq!(sales.rows[0].period, "2026-05");

        let receivables = receivables_report_data(&pool, "2026-05-31", None)
            .await
            .expect("receivables");
        assert_eq!(receivables.customer_count, 1);
        assert_eq!(receivables.due_minor, 10_000);
        assert_eq!(receivables.outstanding_minor, 11_000);

        let payables = payables_report_data(&pool, "2026-05-31", None)
            .await
            .expect("payables");
        assert_eq!(payables.supplier_count, 1);
        assert_eq!(payables.due_minor, 15_000);

        let items = item_sales_report_data(&pool, "2026-05-01", "2026-05-31", None)
            .await
            .expect("item sales");
        assert_eq!(items.item_count, 1);
        assert_eq!(items.quantity_milli, 10_000);
        assert_eq!(items.sales_minor, 11_800);

        let expenses = expense_report_data(&pool, "2026-05-01", "2026-05-31")
            .await
            .expect("expenses");
        assert_eq!(expenses.entry_count, 1);
        assert_eq!(expenses.total_minor, 5_000);

        let gst = gst_report_data(&pool, "2026-05-01", "2026-05-31")
            .await
            .expect("gst");
        assert_eq!(gst.total_tax_minor, 1_800);
        assert_eq!(gst.rows.len(), 1);

        let stock = stock_report_data(&pool, None).await.expect("stock");
        assert_eq!(stock.item_count, 1);
        assert_eq!(stock.rows[0].quantity_milli, 30_000);
        assert_eq!(stock.rows[0].stock_value_minor, 150_000);
        assert_eq!(stock.low_stock_count, 0);
    }
}
