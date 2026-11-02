use sqlx::SqlitePool;
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::models::{Paged, SupplierPayment, SupplierPaymentInput};
use crate::state::{AppState, Session};
use crate::validate::{optional_text, page_params, payment_mode, required_text};

const PAYMENT_SELECT: &str = "SELECT p.id, p.supplier_id, s.name AS supplier_name, \
    p.purchase_invoice_id, pi.internal_reference AS internal_reference, p.payment_date, \
    p.amount_minor, p.payment_mode, p.reference_number, p.status, p.notes, p.created_at, \
    p.reversed_at, p.reversal_reason \
    FROM supplier_payments p LEFT JOIN suppliers s ON s.id = p.supplier_id \
    LEFT JOIN purchase_invoices pi ON pi.id = p.purchase_invoice_id";

async fn fetch_payment(pool: &SqlitePool, id: i64) -> AppResult<SupplierPayment> {
    sqlx::query_as::<_, SupplierPayment>(&format!("{PAYMENT_SELECT} WHERE p.id = ?"))
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound("Supplier payment not found".into()))
}

#[tauri::command]
pub async fn supplier_payment_create(
    state: State<'_, AppState>,
    input: SupplierPaymentInput,
) -> AppResult<SupplierPayment> {
    let session = state.require_permission("purchases.manage").await?;
    create_payment(state.inner(), &session, input).await
}

pub(crate) async fn create_payment(
    state: &AppState,
    session: &Session,
    input: SupplierPaymentInput,
) -> AppResult<SupplierPayment> {
    let date = crate::commands::purchase::parse_date(&input.payment_date, "Payment date")?;
    let payment_date = date.format("%Y-%m-%d").to_string();
    if input.amount_minor <= 0 {
        return Err(AppError::Validation(
            "Payment amount must be greater than zero".into(),
        ));
    }
    let mode = payment_mode(&input.payment_mode)?;
    let notes = optional_text(input.notes);
    let reference_number = optional_text(input.reference_number);

    let mut tx = state.db.begin().await?;
    let supplier: Option<(String, bool)> =
        sqlx::query_as("SELECT name, is_active FROM suppliers WHERE id = ?")
            .bind(input.supplier_id)
            .fetch_optional(&mut *tx)
            .await?;
    let Some((_, is_active)) = supplier else {
        return Err(AppError::Validation(
            "Selected supplier does not exist".into(),
        ));
    };
    if !is_active {
        return Err(AppError::Validation("Selected supplier is inactive".into()));
    }

    if let Some(invoice_id) = input.purchase_invoice_id {
        let invoice: Option<(String, i64, i64, i64)> = sqlx::query_as(
            "SELECT status, supplier_id, grand_total_minor, paid_minor \
             FROM purchase_invoices WHERE id = ?",
        )
        .bind(invoice_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some((status, supplier_id, grand_total, paid_minor)) = invoice else {
            return Err(AppError::Validation(
                "Selected purchase does not exist".into(),
            ));
        };
        if status != "FINALIZED" {
            return Err(AppError::Validation(
                "Payments can only be applied to finalized purchases".into(),
            ));
        }
        if supplier_id != input.supplier_id {
            return Err(AppError::Validation(
                "Payment supplier must match the purchase supplier".into(),
            ));
        }
        let new_paid = paid_minor
            .checked_add(input.amount_minor)
            .ok_or_else(|| AppError::Validation("Payment amount is too large".into()))?;
        if new_paid > grand_total {
            return Err(AppError::Validation(
                "Payment would exceed the purchase balance".into(),
            ));
        }
    }

    let result = sqlx::query(
        "INSERT INTO supplier_payments \
         (supplier_id, purchase_invoice_id, payment_date, amount_minor, payment_mode, \
          reference_number, status, notes, created_by) \
         VALUES (?, ?, ?, ?, ?, ?, 'POSTED', ?, ?)",
    )
    .bind(input.supplier_id)
    .bind(input.purchase_invoice_id)
    .bind(&payment_date)
    .bind(input.amount_minor)
    .bind(&mode)
    .bind(&reference_number)
    .bind(&notes)
    .bind(session.user_id)
    .execute(&mut *tx)
    .await?;

    let payment_id = result.last_insert_rowid();
    if let Some(invoice_id) = input.purchase_invoice_id {
        sqlx::query(
            "UPDATE purchase_invoices SET paid_minor = paid_minor + ?, \
             due_minor = due_minor - ? WHERE id = ?",
        )
        .bind(input.amount_minor)
        .bind(input.amount_minor)
        .bind(invoice_id)
        .execute(&mut *tx)
        .await?;
    }
    sqlx::query(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, reason) \
         VALUES (?, 'supplier_payment.created', 'supplier_payment', ?, ?)",
    )
    .bind(session.user_id)
    .bind(payment_id)
    .bind(notes.as_deref())
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    fetch_payment(&state.db, payment_id).await
}

#[tauri::command]
pub async fn supplier_payment_reverse(
    state: State<'_, AppState>,
    id: i64,
    reason: String,
) -> AppResult<SupplierPayment> {
    let session = state.require_permission("purchases.manage").await?;
    reverse_payment(state.inner(), &session, id, reason).await
}

pub(crate) async fn reverse_payment(
    state: &AppState,
    session: &Session,
    id: i64,
    reason: String,
) -> AppResult<SupplierPayment> {
    let reason = required_text(&reason, "Reversal reason", 500)?;
    let mut tx = state.db.begin().await?;

    let payment = sqlx::query_as::<_, SupplierPayment>(&format!("{PAYMENT_SELECT} WHERE p.id = ?"))
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| AppError::NotFound("Supplier payment not found".into()))?;
    if payment.status != "POSTED" {
        return Err(AppError::Conflict(
            "Only posted supplier payments can be reversed".into(),
        ));
    }

    if let Some(invoice_id) = payment.purchase_invoice_id {
        sqlx::query(
            "UPDATE purchase_invoices SET paid_minor = paid_minor - ?, \
             due_minor = due_minor + ? WHERE id = ?",
        )
        .bind(payment.amount_minor)
        .bind(payment.amount_minor)
        .bind(invoice_id)
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query(
        "UPDATE supplier_payments SET status = 'REVERSED', \
         reversed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), reversal_reason = ? WHERE id = ?",
    )
    .bind(&reason)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, reason) \
         VALUES (?, 'supplier_payment.reversed', 'supplier_payment', ?, ?)",
    )
    .bind(session.user_id)
    .bind(id)
    .bind(Some(reason.as_str()))
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    fetch_payment(&state.db, id).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn supplier_payment_list(
    state: State<'_, AppState>,
    search: Option<String>,
    supplier_id: Option<i64>,
    purchase_invoice_id: Option<i64>,
    status: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
) -> AppResult<Paged<SupplierPayment>> {
    state.require_permission("purchases.view").await?;
    let (page, page_size) = page_params(page, page_size);
    let search = search.unwrap_or_default().trim().to_string();
    let like = format!("%{search}%");
    let status = optional_text(status).unwrap_or_default();
    let date_from = optional_text(date_from).unwrap_or_default();
    let date_to = optional_text(date_to).unwrap_or_default();
    if !status.is_empty() && !["POSTED", "REVERSED"].contains(&status.as_str()) {
        return Err(AppError::Validation("Invalid payment status".into()));
    }
    if !date_from.is_empty() {
        crate::commands::purchase::parse_date(&date_from, "From date")?;
    }
    if !date_to.is_empty() {
        crate::commands::purchase::parse_date(&date_to, "To date")?;
    }
    let supplier_id = supplier_id.unwrap_or(0);
    let purchase_invoice_id = purchase_invoice_id.unwrap_or(0);

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM supplier_payments p \
         LEFT JOIN suppliers s ON s.id = p.supplier_id \
         LEFT JOIN purchase_invoices pi ON pi.id = p.purchase_invoice_id \
         WHERE (? = '' OR s.name LIKE ? OR p.reference_number LIKE ? \
                OR pi.internal_reference LIKE ?) \
           AND (? = '' OR p.status = ?) \
           AND (? = 0 OR p.supplier_id = ?) \
           AND (? = 0 OR p.purchase_invoice_id = ?) \
           AND (? = '' OR p.payment_date >= ?) \
           AND (? = '' OR p.payment_date <= ?)",
    )
    .bind(&search)
    .bind(&like)
    .bind(&like)
    .bind(&like)
    .bind(&status)
    .bind(&status)
    .bind(supplier_id)
    .bind(supplier_id)
    .bind(purchase_invoice_id)
    .bind(purchase_invoice_id)
    .bind(&date_from)
    .bind(&date_from)
    .bind(&date_to)
    .bind(&date_to)
    .fetch_one(&state.db)
    .await?;

    let items = sqlx::query_as::<_, SupplierPayment>(&format!(
        "{PAYMENT_SELECT} \
         WHERE (? = '' OR s.name LIKE ? OR p.reference_number LIKE ? \
                OR pi.internal_reference LIKE ?) \
           AND (? = '' OR p.status = ?) \
           AND (? = 0 OR p.supplier_id = ?) \
           AND (? = 0 OR p.purchase_invoice_id = ?) \
           AND (? = '' OR p.payment_date >= ?) \
           AND (? = '' OR p.payment_date <= ?) \
         ORDER BY p.payment_date DESC, p.id DESC LIMIT ? OFFSET ?"
    ))
    .bind(&search)
    .bind(&like)
    .bind(&like)
    .bind(&like)
    .bind(&status)
    .bind(&status)
    .bind(supplier_id)
    .bind(supplier_id)
    .bind(purchase_invoice_id)
    .bind(purchase_invoice_id)
    .bind(&date_from)
    .bind(&date_from)
    .bind(&date_to)
    .bind(&date_to)
    .bind(page_size)
    .bind((page - 1) * page_size)
    .fetch_all(&state.db)
    .await?;

    Ok(Paged {
        items,
        total,
        page,
        page_size,
    })
}
