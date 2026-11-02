use sqlx::{FromRow, SqlitePool};
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::models::{CustomerLedger, LedgerEntry, SupplierLedger};
use crate::state::AppState;

#[derive(Debug, FromRow)]
struct RawLedgerEntry {
    entry_date: String,
    entry_type: String,
    reference: String,
    debit_minor: i64,
    credit_minor: i64,
}

fn accumulate(opening: i64, raw: Vec<RawLedgerEntry>, debit_adds: bool) -> (Vec<LedgerEntry>, i64) {
    let mut balance = opening;
    let mut entries = Vec::with_capacity(raw.len());
    for row in raw {
        balance += if debit_adds {
            row.debit_minor - row.credit_minor
        } else {
            row.credit_minor - row.debit_minor
        };
        entries.push(LedgerEntry {
            entry_date: row.entry_date,
            entry_type: row.entry_type,
            reference: row.reference,
            debit_minor: row.debit_minor,
            credit_minor: row.credit_minor,
            balance_minor: balance,
        });
    }
    (entries, balance)
}

async fn customer_ledger_data(pool: &SqlitePool, customer_id: i64) -> AppResult<CustomerLedger> {
    let customer: Option<(String, i64)> =
        sqlx::query_as("SELECT name, opening_balance_minor FROM customers WHERE id = ?")
            .bind(customer_id)
            .fetch_optional(pool)
            .await?;
    let Some((customer_name, opening_balance_minor)) = customer else {
        return Err(AppError::NotFound("Customer not found".into()));
    };

    let rows = sqlx::query_as::<_, RawLedgerEntry>(
        "SELECT entry_date, entry_type, reference, debit_minor, credit_minor FROM ( \
           SELECT invoice_date AS entry_date, 'Invoice' AS entry_type, \
                  invoice_number AS reference, grand_total_minor AS debit_minor, \
                  0 AS credit_minor, 0 AS sort_group, id AS sort_id \
           FROM sales_invoices WHERE customer_id = ? AND status = 'FINALIZED' \
           UNION ALL \
           SELECT p.payment_date, 'Payment', \
                  COALESCE(si.invoice_number, NULLIF(p.reference_number, ''), 'Advance'), \
                  0, p.amount_minor, 1, p.id \
           FROM payments p LEFT JOIN sales_invoices si ON si.id = p.sales_invoice_id \
           WHERE p.customer_id = ? AND p.status = 'POSTED' \
         ) ORDER BY entry_date, sort_group, sort_id",
    )
    .bind(customer_id)
    .bind(customer_id)
    .fetch_all(pool)
    .await?;

    let (entries, closing_balance_minor) = accumulate(opening_balance_minor, rows, true);
    Ok(CustomerLedger {
        customer_id,
        customer_name,
        opening_balance_minor,
        closing_balance_minor,
        entries,
    })
}

async fn supplier_ledger_data(pool: &SqlitePool, supplier_id: i64) -> AppResult<SupplierLedger> {
    let supplier: Option<(String, i64)> =
        sqlx::query_as("SELECT name, opening_balance_minor FROM suppliers WHERE id = ?")
            .bind(supplier_id)
            .fetch_optional(pool)
            .await?;
    let Some((supplier_name, opening_balance_minor)) = supplier else {
        return Err(AppError::NotFound("Supplier not found".into()));
    };

    let rows = sqlx::query_as::<_, RawLedgerEntry>(
        "SELECT entry_date, entry_type, reference, debit_minor, credit_minor FROM ( \
           SELECT invoice_date AS entry_date, 'Purchase' AS entry_type, \
                  internal_reference AS reference, 0 AS debit_minor, \
                  grand_total_minor AS credit_minor, 0 AS sort_group, id AS sort_id \
           FROM purchase_invoices WHERE supplier_id = ? AND status = 'FINALIZED' \
           UNION ALL \
           SELECT p.payment_date, 'Payment', \
                  COALESCE(pi.internal_reference, NULLIF(p.reference_number, ''), 'Advance'), \
                  p.amount_minor, 0, 1, p.id \
           FROM supplier_payments p \
           LEFT JOIN purchase_invoices pi ON pi.id = p.purchase_invoice_id \
           WHERE p.supplier_id = ? AND p.status = 'POSTED' \
         ) ORDER BY entry_date, sort_group, sort_id",
    )
    .bind(supplier_id)
    .bind(supplier_id)
    .fetch_all(pool)
    .await?;

    let (entries, closing_balance_minor) = accumulate(opening_balance_minor, rows, false);
    Ok(SupplierLedger {
        supplier_id,
        supplier_name,
        opening_balance_minor,
        closing_balance_minor,
        entries,
    })
}

#[tauri::command]
pub async fn customer_ledger(state: State<'_, AppState>, id: i64) -> AppResult<CustomerLedger> {
    state.require_permission("customers.view").await?;
    customer_ledger_data(&state.db, id).await
}

#[tauri::command]
pub async fn supplier_ledger(state: State<'_, AppState>, id: i64) -> AppResult<SupplierLedger> {
    state.require_permission("suppliers.view").await?;
    supplier_ledger_data(&state.db, id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth;
    use crate::db;

    #[tokio::test]
    async fn customer_ledger_applies_invoices_and_payments() {
        let pool = db::connect_memory().await.unwrap();
        auth::ensure_default_admin(&pool).await.unwrap();
        sqlx::query("INSERT INTO customers (name, opening_balance_minor) VALUES ('Ravi', 10000)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO sales_invoices (invoice_number, invoice_type, customer_id, invoice_date, \
             status, customer_name_snapshot, grand_total_minor, created_by) \
             VALUES ('GST-1', 'GST', 1, '2026-04-01', 'FINALIZED', 'Ravi', 50000, 1)",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO payments (customer_id, sales_invoice_id, payment_date, amount_minor, \
             payment_mode, created_by) VALUES (1, 1, '2026-04-02', 20000, 'CASH', 1)",
        )
        .execute(&pool)
        .await
        .unwrap();

        let ledger = customer_ledger_data(&pool, 1).await.unwrap();
        assert_eq!(ledger.opening_balance_minor, 10_000);
        assert_eq!(ledger.closing_balance_minor, 40_000);
        assert_eq!(ledger.entries.len(), 2);
        assert_eq!(ledger.entries[0].balance_minor, 60_000);
        assert_eq!(ledger.entries[1].balance_minor, 40_000);
    }

    #[tokio::test]
    async fn supplier_ledger_applies_purchases_and_payments() {
        let pool = db::connect_memory().await.unwrap();
        auth::ensure_default_admin(&pool).await.unwrap();
        sqlx::query(
            "INSERT INTO suppliers (name, opening_balance_minor) VALUES ('Cement Co', 5000)",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO purchase_invoices (supplier_id, supplier_invoice_number, \
             internal_reference, invoice_date, status, grand_total_minor, created_by) \
             VALUES (1, 'SUP-1', 'PUR-1', '2026-04-01', 'FINALIZED', 30000, 1)",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO supplier_payments (supplier_id, purchase_invoice_id, payment_date, \
             amount_minor, payment_mode, created_by) \
             VALUES (1, 1, '2026-04-02', 10000, 'CASH', 1)",
        )
        .execute(&pool)
        .await
        .unwrap();

        let ledger = supplier_ledger_data(&pool, 1).await.unwrap();
        assert_eq!(ledger.opening_balance_minor, 5_000);
        assert_eq!(ledger.closing_balance_minor, 25_000);
        assert_eq!(ledger.entries.len(), 2);
        assert_eq!(ledger.entries[0].balance_minor, 35_000);
        assert_eq!(ledger.entries[1].balance_minor, 25_000);
    }
}
