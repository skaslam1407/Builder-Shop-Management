use chrono::NaiveDate;
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::models::DashboardSummary;
use crate::state::AppState;

fn validate_date(value: &str, field: &str) -> AppResult<String> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| AppError::Validation(format!("{field} must be a valid date (YYYY-MM-DD)")))?;
    Ok(value.to_string())
}

#[tauri::command]
pub async fn dashboard_summary(
    state: State<'_, AppState>,
    date_from: String,
    date_to: String,
) -> AppResult<DashboardSummary> {
    state.require_permission("dashboard.view").await?;

    let date_from = validate_date(&date_from, "From date")?;
    let date_to = validate_date(&date_to, "To date")?;
    if date_from > date_to {
        return Err(AppError::Validation(
            "From date cannot be after to date".into(),
        ));
    }

    let sales_minor: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(grand_total_minor), 0) FROM sales_invoices \
         WHERE status = 'FINALIZED' AND invoice_date BETWEEN ? AND ?",
    )
    .bind(&date_from)
    .bind(&date_to)
    .fetch_one(&state.db)
    .await?;

    let collections_minor: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount_minor), 0) FROM payments \
         WHERE status = 'POSTED' AND payment_date BETWEEN ? AND ?",
    )
    .bind(&date_from)
    .bind(&date_to)
    .fetch_one(&state.db)
    .await?;

    let purchases_minor: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(grand_total_minor), 0) FROM purchase_invoices \
         WHERE status = 'FINALIZED' AND invoice_date BETWEEN ? AND ?",
    )
    .bind(&date_from)
    .bind(&date_to)
    .fetch_one(&state.db)
    .await?;

    let expenses_minor: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount_minor), 0) FROM expenses \
         WHERE expense_date BETWEEN ? AND ?",
    )
    .bind(&date_from)
    .bind(&date_to)
    .fetch_one(&state.db)
    .await?;

    let receivables_minor: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(due_minor), 0) FROM sales_invoices WHERE status = 'FINALIZED'",
    )
    .fetch_one(&state.db)
    .await?;

    let customers_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM customers WHERE is_active = 1")
            .fetch_one(&state.db)
            .await?;

    let items_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM items WHERE is_active = 1")
        .fetch_one(&state.db)
        .await?;

    let low_stock_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM items i \
         WHERE i.is_active = 1 AND i.reorder_level_milli > 0 \
           AND COALESCE((SELECT SUM(sm.quantity_milli) FROM stock_movements sm \
                         WHERE sm.item_id = i.id), 0) < i.reorder_level_milli",
    )
    .fetch_one(&state.db)
    .await?;

    Ok(DashboardSummary {
        date_from,
        date_to,
        sales_minor,
        collections_minor,
        purchases_minor,
        expenses_minor,
        receivables_minor,
        customers_count,
        items_count,
        low_stock_count,
    })
}
