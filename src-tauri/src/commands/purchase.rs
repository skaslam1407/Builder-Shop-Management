use chrono::NaiveDate;
use sqlx::{Sqlite, SqlitePool, Transaction};
use tauri::State;
use uuid::Uuid;

use crate::billing::{compute_purchase, fiscal_year_for};
use crate::error::{AppError, AppResult};
use crate::models::{
    Paged, PurchaseInvoice, PurchaseInvoiceHeader, PurchaseInvoiceInput, PurchaseInvoiceLine,
    PurchaseInvoiceLineInput, PurchaseInvoiceSummary, PurchasePreview, SupplierPayment,
};
use crate::state::{AppState, Session};
use crate::validate::{optional_text, page_params, required_text};

const HEADER_SELECT: &str = "SELECT p.id, p.supplier_id, s.name AS supplier_name, \
    p.supplier_invoice_number, p.internal_reference, p.invoice_date, p.status, p.subtotal_minor, \
    p.discount_minor, p.tax_minor, p.grand_total_minor, p.paid_minor, p.due_minor, p.notes, \
    p.created_by, p.created_at, p.finalized_at, p.cancelled_at, p.cancellation_reason \
    FROM purchase_invoices p LEFT JOIN suppliers s ON s.id = p.supplier_id";

const LINE_SELECT: &str = "SELECT l.id, l.purchase_invoice_id, l.item_id, \
    l.description_snapshot, l.unit_id, u.abbreviation AS unit_abbreviation, l.quantity_milli, \
    l.rate_minor, l.discount_minor, l.taxable_minor, l.tax_rate_bps, l.tax_minor, \
    l.line_total_minor \
    FROM purchase_invoice_items l LEFT JOIN units u ON u.id = l.unit_id";

const PAYMENT_SELECT: &str = "SELECT p.id, p.supplier_id, s.name AS supplier_name, \
    p.purchase_invoice_id, pi.internal_reference AS internal_reference, p.payment_date, \
    p.amount_minor, p.payment_mode, p.reference_number, p.status, p.notes, p.created_at, \
    p.reversed_at, p.reversal_reason \
    FROM supplier_payments p LEFT JOIN suppliers s ON s.id = p.supplier_id \
    LEFT JOIN purchase_invoices pi ON pi.id = p.purchase_invoice_id";

const SUMMARY_SELECT: &str = "SELECT p.id, p.supplier_id, s.name AS supplier_name, \
    p.supplier_invoice_number, p.internal_reference, p.invoice_date, p.status, \
    p.grand_total_minor, p.paid_minor, p.due_minor, p.created_at \
    FROM purchase_invoices p LEFT JOIN suppliers s ON s.id = p.supplier_id";

#[derive(sqlx::FromRow)]
struct ItemDefaults {
    name: String,
    default_unit_id: Option<i64>,
    default_tax_rate_bps: i64,
    is_active: bool,
}

struct ResolvedLine {
    item_id: Option<i64>,
    description: String,
    unit_id: Option<i64>,
    quantity_milli: i64,
    rate_minor: i64,
    discount_minor: i64,
    tax_rate_bps: i64,
}

impl ResolvedLine {
    fn as_input(&self) -> PurchaseInvoiceLineInput {
        PurchaseInvoiceLineInput {
            item_id: self.item_id,
            description: Some(self.description.clone()),
            unit_id: self.unit_id,
            quantity_milli: self.quantity_milli,
            rate_minor: self.rate_minor,
            discount_minor: Some(self.discount_minor),
            tax_rate_bps: Some(self.tax_rate_bps),
        }
    }
}

pub(crate) fn parse_date(value: &str, field: &str) -> AppResult<NaiveDate> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| AppError::Validation(format!("{field} must be a valid date (YYYY-MM-DD)")))
}

async fn ensure_unit(pool: &SqlitePool, unit_id: Option<i64>) -> AppResult<()> {
    let Some(unit_id) = unit_id else {
        return Ok(());
    };
    let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM units WHERE id = ?")
        .bind(unit_id)
        .fetch_one(pool)
        .await?;
    if exists == 0 {
        return Err(AppError::Validation("Selected unit does not exist".into()));
    }
    Ok(())
}

async fn resolve_lines(
    pool: &SqlitePool,
    lines: &[PurchaseInvoiceLineInput],
) -> AppResult<Vec<ResolvedLine>> {
    if lines.is_empty() {
        return Err(AppError::Validation(
            "A purchase must have at least one line".into(),
        ));
    }

    let mut resolved = Vec::with_capacity(lines.len());
    for (index, line) in lines.iter().enumerate() {
        let row_number = index + 1;
        let (item_id, description, unit_id, tax_rate_bps);

        if let Some(id) = line.item_id {
            let item: Option<ItemDefaults> = sqlx::query_as(
                "SELECT name, default_unit_id, default_tax_rate_bps, is_active \
                 FROM items WHERE id = ?",
            )
            .bind(id)
            .fetch_optional(pool)
            .await?;
            let Some(item) = item else {
                return Err(AppError::Validation(format!(
                    "Item on line {row_number} does not exist"
                )));
            };
            if !item.is_active {
                return Err(AppError::Validation(format!(
                    "Item on line {row_number} is inactive"
                )));
            }
            item_id = Some(id);
            description =
                optional_text(line.description.clone()).unwrap_or_else(|| item.name.clone());
            unit_id = line.unit_id.or(item.default_unit_id);
            tax_rate_bps = line.tax_rate_bps.unwrap_or(item.default_tax_rate_bps);
        } else {
            item_id = None;
            description = required_text(
                line.description.as_deref().unwrap_or(""),
                &format!("Line {row_number} description"),
                200,
            )?;
            unit_id = line.unit_id;
            tax_rate_bps = line.tax_rate_bps.unwrap_or(0);
        }

        ensure_unit(pool, unit_id).await?;
        resolved.push(ResolvedLine {
            item_id,
            description,
            unit_id,
            quantity_milli: line.quantity_milli,
            rate_minor: line.rate_minor,
            discount_minor: line.discount_minor.unwrap_or(0),
            tax_rate_bps,
        });
    }

    Ok(resolved)
}

async fn insert_lines(
    tx: &mut Transaction<'_, Sqlite>,
    invoice_id: i64,
    resolved: &[ResolvedLine],
    preview: &PurchasePreview,
) -> AppResult<()> {
    for (index, (line, computed)) in resolved.iter().zip(preview.lines.iter()).enumerate() {
        sqlx::query(
            "INSERT INTO purchase_invoice_items \
             (purchase_invoice_id, line_number, item_id, description_snapshot, unit_id, \
              quantity_milli, rate_minor, discount_minor, taxable_minor, tax_rate_bps, tax_minor, \
              line_total_minor) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(invoice_id)
        .bind(index as i64)
        .bind(line.item_id)
        .bind(&line.description)
        .bind(line.unit_id)
        .bind(line.quantity_milli)
        .bind(line.rate_minor)
        .bind(line.discount_minor)
        .bind(computed.taxable_minor)
        .bind(line.tax_rate_bps)
        .bind(computed.tax_minor)
        .bind(computed.line_total_minor)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

async fn audit_tx(
    tx: &mut Transaction<'_, Sqlite>,
    user_id: i64,
    action: &str,
    invoice_id: i64,
    reason: Option<&str>,
) -> AppResult<()> {
    sqlx::query(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, reason) \
         VALUES (?, ?, 'purchase_invoice', ?, ?)",
    )
    .bind(user_id)
    .bind(action)
    .bind(invoice_id)
    .bind(reason)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn resolve_supplier(pool: &SqlitePool, supplier_id: i64) -> AppResult<String> {
    let supplier: Option<(String, bool)> =
        sqlx::query_as("SELECT name, is_active FROM suppliers WHERE id = ?")
            .bind(supplier_id)
            .fetch_optional(pool)
            .await?;
    let Some((name, is_active)) = supplier else {
        return Err(AppError::Validation(
            "Selected supplier does not exist".into(),
        ));
    };
    if !is_active {
        return Err(AppError::Validation("Selected supplier is inactive".into()));
    }
    Ok(name)
}

pub(crate) async fn fetch_purchase(pool: &SqlitePool, id: i64) -> AppResult<PurchaseInvoice> {
    let header =
        sqlx::query_as::<_, PurchaseInvoiceHeader>(&format!("{HEADER_SELECT} WHERE p.id = ?"))
            .bind(id)
            .fetch_optional(pool)
            .await?
            .ok_or_else(|| AppError::NotFound("Purchase invoice not found".into()))?;

    let lines = sqlx::query_as::<_, PurchaseInvoiceLine>(&format!(
        "{LINE_SELECT} WHERE l.purchase_invoice_id = ? ORDER BY l.line_number, l.id"
    ))
    .bind(id)
    .fetch_all(pool)
    .await?;

    let payments = sqlx::query_as::<_, SupplierPayment>(&format!(
        "{PAYMENT_SELECT} WHERE p.purchase_invoice_id = ? ORDER BY p.payment_date DESC, p.id DESC"
    ))
    .bind(id)
    .fetch_all(pool)
    .await?;

    Ok(PurchaseInvoice {
        header,
        lines,
        payments,
    })
}

#[tauri::command]
pub async fn purchase_calculate_preview(
    state: State<'_, AppState>,
    input: PurchaseInvoiceInput,
) -> AppResult<PurchasePreview> {
    state.require_permission("purchases.view").await?;
    parse_date(&input.invoice_date, "Invoice date")?;
    let resolved = resolve_lines(&state.db, &input.lines).await?;
    let inputs: Vec<PurchaseInvoiceLineInput> =
        resolved.iter().map(ResolvedLine::as_input).collect();
    compute_purchase(&inputs)
}

#[tauri::command]
pub async fn purchase_create_draft(
    state: State<'_, AppState>,
    input: PurchaseInvoiceInput,
) -> AppResult<PurchaseInvoice> {
    let session = state.require_permission("purchases.manage").await?;
    create_draft(state.inner(), &session, input).await
}

pub(crate) async fn create_draft(
    state: &AppState,
    session: &Session,
    input: PurchaseInvoiceInput,
) -> AppResult<PurchaseInvoice> {
    parse_date(&input.invoice_date, "Invoice date")?;
    let supplier_name = resolve_supplier(&state.db, input.supplier_id).await?;
    let supplier_invoice_number = required_text(
        &input.supplier_invoice_number,
        "Supplier invoice number",
        100,
    )?;
    let resolved = resolve_lines(&state.db, &input.lines).await?;
    let inputs: Vec<PurchaseInvoiceLineInput> =
        resolved.iter().map(ResolvedLine::as_input).collect();
    let preview = compute_purchase(&inputs)?;

    let mut tx = state.db.begin().await?;
    let temp_reference = format!("DRAFT-{}", Uuid::new_v4());
    let result = sqlx::query(
        "INSERT INTO purchase_invoices \
         (supplier_id, supplier_invoice_number, internal_reference, invoice_date, status, \
          subtotal_minor, discount_minor, tax_minor, grand_total_minor, paid_minor, due_minor, \
          notes, created_by) \
         VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, 0, ?, ?, ?)",
    )
    .bind(input.supplier_id)
    .bind(&supplier_invoice_number)
    .bind(&temp_reference)
    .bind(&input.invoice_date)
    .bind(preview.subtotal_minor)
    .bind(preview.discount_minor)
    .bind(preview.tax_minor)
    .bind(preview.grand_total_minor)
    .bind(preview.grand_total_minor)
    .bind(optional_text(input.notes.clone()))
    .bind(session.user_id)
    .execute(&mut *tx)
    .await?;

    let id = result.last_insert_rowid();
    insert_lines(&mut tx, id, &resolved, &preview).await?;
    audit_tx(
        &mut tx,
        session.user_id,
        "purchase_invoice.created",
        id,
        Some(&supplier_name),
    )
    .await?;
    tx.commit().await?;

    fetch_purchase(&state.db, id).await
}

#[tauri::command]
pub async fn purchase_update_draft(
    state: State<'_, AppState>,
    id: i64,
    input: PurchaseInvoiceInput,
) -> AppResult<PurchaseInvoice> {
    let session = state.require_permission("purchases.manage").await?;
    update_draft(state.inner(), &session, id, input).await
}

pub(crate) async fn update_draft(
    state: &AppState,
    session: &Session,
    id: i64,
    input: PurchaseInvoiceInput,
) -> AppResult<PurchaseInvoice> {
    parse_date(&input.invoice_date, "Invoice date")?;
    resolve_supplier(&state.db, input.supplier_id).await?;
    let supplier_invoice_number = required_text(
        &input.supplier_invoice_number,
        "Supplier invoice number",
        100,
    )?;
    let resolved = resolve_lines(&state.db, &input.lines).await?;
    let inputs: Vec<PurchaseInvoiceLineInput> =
        resolved.iter().map(ResolvedLine::as_input).collect();
    let preview = compute_purchase(&inputs)?;

    let mut tx = state.db.begin().await?;
    let status: Option<String> =
        sqlx::query_scalar("SELECT status FROM purchase_invoices WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let Some(status) = status else {
        return Err(AppError::NotFound("Purchase invoice not found".into()));
    };
    if status != "DRAFT" {
        return Err(AppError::Conflict(
            "Only draft purchases can be edited".into(),
        ));
    }

    sqlx::query(
        "UPDATE purchase_invoices SET supplier_id = ?, supplier_invoice_number = ?, \
         invoice_date = ?, subtotal_minor = ?, discount_minor = ?, tax_minor = ?, \
         grand_total_minor = ?, paid_minor = 0, due_minor = ?, notes = ? WHERE id = ?",
    )
    .bind(input.supplier_id)
    .bind(&supplier_invoice_number)
    .bind(&input.invoice_date)
    .bind(preview.subtotal_minor)
    .bind(preview.discount_minor)
    .bind(preview.tax_minor)
    .bind(preview.grand_total_minor)
    .bind(preview.grand_total_minor)
    .bind(optional_text(input.notes.clone()))
    .bind(id)
    .execute(&mut *tx)
    .await?;

    sqlx::query("DELETE FROM purchase_invoice_items WHERE purchase_invoice_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    insert_lines(&mut tx, id, &resolved, &preview).await?;
    audit_tx(
        &mut tx,
        session.user_id,
        "purchase_invoice.updated",
        id,
        None,
    )
    .await?;
    tx.commit().await?;

    fetch_purchase(&state.db, id).await
}

#[tauri::command]
pub async fn purchase_finalize(state: State<'_, AppState>, id: i64) -> AppResult<PurchaseInvoice> {
    let session = state.require_permission("purchases.manage").await?;
    finalize_invoice(state.inner(), &session, id).await
}

pub(crate) async fn finalize_invoice(
    state: &AppState,
    session: &Session,
    id: i64,
) -> AppResult<PurchaseInvoice> {
    let mut tx = state.db.begin().await?;

    let header =
        sqlx::query_as::<_, PurchaseInvoiceHeader>(&format!("{HEADER_SELECT} WHERE p.id = ?"))
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or_else(|| AppError::NotFound("Purchase invoice not found".into()))?;
    if header.status != "DRAFT" {
        return Err(AppError::Conflict(
            "Only draft purchases can be finalized".into(),
        ));
    }

    let lines = sqlx::query_as::<_, PurchaseInvoiceLine>(&format!(
        "{LINE_SELECT} WHERE l.purchase_invoice_id = ? ORDER BY l.line_number, l.id"
    ))
    .bind(id)
    .fetch_all(&mut *tx)
    .await?;
    if lines.is_empty() {
        return Err(AppError::Validation(
            "A purchase must have at least one line".into(),
        ));
    }

    let inputs: Vec<PurchaseInvoiceLineInput> = lines
        .iter()
        .map(|line| PurchaseInvoiceLineInput {
            item_id: line.item_id,
            description: Some(line.description_snapshot.clone()),
            unit_id: line.unit_id,
            quantity_milli: line.quantity_milli,
            rate_minor: line.rate_minor,
            discount_minor: Some(line.discount_minor),
            tax_rate_bps: Some(line.tax_rate_bps),
        })
        .collect();
    let preview = compute_purchase(&inputs)?;

    let invoice_date = parse_date(&header.invoice_date, "Invoice date")?;
    let fiscal_year = fiscal_year_for(invoice_date, 4);
    let sequence: i64 = sqlx::query_scalar(
        "INSERT INTO purchase_sequences (fiscal_year, next_number) VALUES (?, 1) \
         ON CONFLICT (fiscal_year) DO UPDATE SET next_number = next_number + 1 \
         RETURNING next_number",
    )
    .bind(&fiscal_year)
    .fetch_one(&mut *tx)
    .await?;
    let internal_reference = format!("PUR/{fiscal_year}/{sequence:05}");

    for (line, computed) in lines.iter().zip(preview.lines.iter()) {
        sqlx::query(
            "UPDATE purchase_invoice_items SET taxable_minor = ?, tax_minor = ?, \
             line_total_minor = ? WHERE id = ?",
        )
        .bind(computed.taxable_minor)
        .bind(computed.tax_minor)
        .bind(computed.line_total_minor)
        .bind(line.id)
        .execute(&mut *tx)
        .await?;
    }

    for line in &lines {
        if let Some(item_id) = line.item_id {
            sqlx::query(
                "INSERT INTO stock_movements \
                 (item_id, movement_type, quantity_milli, unit_id, source_type, source_id, \
                  movement_date, notes, created_by) \
                 VALUES (?, 'PURCHASE', ?, ?, 'PURCHASE_INVOICE', ?, ?, ?, ?)",
            )
            .bind(item_id)
            .bind(line.quantity_milli)
            .bind(line.unit_id)
            .bind(id)
            .bind(&header.invoice_date)
            .bind(format!("Purchase {internal_reference}"))
            .bind(session.user_id)
            .execute(&mut *tx)
            .await?;
        }
    }

    sqlx::query(
        "UPDATE purchase_invoices SET internal_reference = ?, status = 'FINALIZED', \
         subtotal_minor = ?, discount_minor = ?, tax_minor = ?, grand_total_minor = ?, \
         due_minor = ?, finalized_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    )
    .bind(&internal_reference)
    .bind(preview.subtotal_minor)
    .bind(preview.discount_minor)
    .bind(preview.tax_minor)
    .bind(preview.grand_total_minor)
    .bind(preview.grand_total_minor)
    .bind(id)
    .execute(&mut *tx)
    .await?;

    audit_tx(
        &mut tx,
        session.user_id,
        "purchase_invoice.finalized",
        id,
        Some(&internal_reference),
    )
    .await?;
    tx.commit().await?;

    fetch_purchase(&state.db, id).await
}

#[tauri::command]
pub async fn purchase_cancel(
    state: State<'_, AppState>,
    id: i64,
    reason: String,
) -> AppResult<PurchaseInvoice> {
    let session = state.require_permission("purchases.manage").await?;
    cancel_invoice(state.inner(), &session, id, reason).await
}

pub(crate) async fn cancel_invoice(
    state: &AppState,
    session: &Session,
    id: i64,
    reason: String,
) -> AppResult<PurchaseInvoice> {
    let reason = required_text(&reason, "Cancellation reason", 500)?;
    let mut tx = state.db.begin().await?;

    let header =
        sqlx::query_as::<_, PurchaseInvoiceHeader>(&format!("{HEADER_SELECT} WHERE p.id = ?"))
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or_else(|| AppError::NotFound("Purchase invoice not found".into()))?;
    if header.status != "FINALIZED" {
        return Err(AppError::Conflict(
            "Only finalized purchases can be cancelled".into(),
        ));
    }

    let posted_payments: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM supplier_payments WHERE purchase_invoice_id = ? AND status = 'POSTED'",
    )
    .bind(id)
    .fetch_one(&mut *tx)
    .await?;
    if posted_payments > 0 {
        return Err(AppError::Conflict(
            "Reverse all posted supplier payments before cancelling this purchase".into(),
        ));
    }

    let lines = sqlx::query_as::<_, PurchaseInvoiceLine>(&format!(
        "{LINE_SELECT} WHERE l.purchase_invoice_id = ? ORDER BY l.line_number, l.id"
    ))
    .bind(id)
    .fetch_all(&mut *tx)
    .await?;

    for line in &lines {
        if let Some(item_id) = line.item_id {
            sqlx::query(
                "INSERT INTO stock_movements \
                 (item_id, movement_type, quantity_milli, unit_id, source_type, source_id, \
                  movement_date, notes, created_by) \
                 VALUES (?, 'PURCHASE_CANCELLED', ?, ?, 'PURCHASE_INVOICE_CANCELLATION', ?, ?, ?, ?)",
            )
            .bind(item_id)
            .bind(-line.quantity_milli)
            .bind(line.unit_id)
            .bind(id)
            .bind(&header.invoice_date)
            .bind(format!("Cancellation of {}", header.internal_reference))
            .bind(session.user_id)
            .execute(&mut *tx)
            .await?;
        }
    }

    sqlx::query(
        "UPDATE purchase_invoices SET status = 'CANCELLED', paid_minor = 0, due_minor = 0, \
         cancelled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), cancellation_reason = ? WHERE id = ?",
    )
    .bind(&reason)
    .bind(id)
    .execute(&mut *tx)
    .await?;

    audit_tx(
        &mut tx,
        session.user_id,
        "purchase_invoice.cancelled",
        id,
        Some(&reason),
    )
    .await?;
    tx.commit().await?;

    fetch_purchase(&state.db, id).await
}

#[tauri::command]
pub async fn purchase_get(state: State<'_, AppState>, id: i64) -> AppResult<PurchaseInvoice> {
    state.require_permission("purchases.view").await?;
    fetch_purchase(&state.db, id).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn purchase_list(
    state: State<'_, AppState>,
    search: Option<String>,
    status: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
    supplier_id: Option<i64>,
    page: Option<i64>,
    page_size: Option<i64>,
) -> AppResult<Paged<PurchaseInvoiceSummary>> {
    state.require_permission("purchases.view").await?;
    let (page, page_size) = page_params(page, page_size);
    let search = search.unwrap_or_default().trim().to_string();
    let like = format!("%{search}%");
    let status = optional_text(status).unwrap_or_default();
    let date_from = optional_text(date_from).unwrap_or_default();
    let date_to = optional_text(date_to).unwrap_or_default();
    if !status.is_empty() && !["DRAFT", "FINALIZED", "CANCELLED"].contains(&status.as_str()) {
        return Err(AppError::Validation("Invalid purchase status".into()));
    }
    if !date_from.is_empty() {
        parse_date(&date_from, "From date")?;
    }
    if !date_to.is_empty() {
        parse_date(&date_to, "To date")?;
    }
    let supplier_id = supplier_id.unwrap_or(0);

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM purchase_invoices p LEFT JOIN suppliers s ON s.id = p.supplier_id \
         WHERE (? = '' OR p.internal_reference LIKE ? OR p.supplier_invoice_number LIKE ? \
                OR s.name LIKE ?) \
           AND (? = '' OR p.status = ?) \
           AND (? = '' OR p.invoice_date >= ?) \
           AND (? = '' OR p.invoice_date <= ?) \
           AND (? = 0 OR p.supplier_id = ?)",
    )
    .bind(&search)
    .bind(&like)
    .bind(&like)
    .bind(&like)
    .bind(&status)
    .bind(&status)
    .bind(&date_from)
    .bind(&date_from)
    .bind(&date_to)
    .bind(&date_to)
    .bind(supplier_id)
    .bind(supplier_id)
    .fetch_one(&state.db)
    .await?;

    let items = sqlx::query_as::<_, PurchaseInvoiceSummary>(&format!(
        "{SUMMARY_SELECT} \
         WHERE (? = '' OR p.internal_reference LIKE ? OR p.supplier_invoice_number LIKE ? \
                OR s.name LIKE ?) \
           AND (? = '' OR p.status = ?) \
           AND (? = '' OR p.invoice_date >= ?) \
           AND (? = '' OR p.invoice_date <= ?) \
           AND (? = 0 OR p.supplier_id = ?) \
         ORDER BY p.invoice_date DESC, p.id DESC LIMIT ? OFFSET ?"
    ))
    .bind(&search)
    .bind(&like)
    .bind(&like)
    .bind(&like)
    .bind(&status)
    .bind(&status)
    .bind(&date_from)
    .bind(&date_from)
    .bind(&date_to)
    .bind(&date_to)
    .bind(supplier_id)
    .bind(supplier_id)
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

#[cfg(test)]
mod flow_tests {
    use super::*;
    use crate::auth;
    use crate::commands::expenses::create_expense;
    use crate::commands::supplier_payments::{create_payment, reverse_payment};
    use crate::db;
    use crate::models::{ExpenseInput, SupplierPaymentInput};

    async fn setup() -> (AppState, Session) {
        let pool = db::connect_memory().await.expect("database should open");
        auth::ensure_default_admin(&pool)
            .await
            .expect("admin should be seeded");
        let permissions = auth::load_permissions(&pool, 1)
            .await
            .expect("permissions should load");
        (
            AppState::new(pool, std::env::temp_dir()),
            Session {
                user_id: 1,
                username: "admin".into(),
                display_name: "Administrator".into(),
                must_change_password: false,
                permissions,
            },
        )
    }

    async fn fixtures(state: &AppState) -> (i64, i64) {
        let unit_id: i64 = sqlx::query_scalar(
            "INSERT INTO units (name, abbreviation, precision) VALUES ('Bag', 'bag', 3) RETURNING id",
        )
        .fetch_one(&state.db)
        .await
        .expect("unit");
        let item_id: i64 = sqlx::query_scalar(
            "INSERT INTO items (item_code, name, default_unit_id, purchase_rate_minor, selling_rate_minor, default_tax_rate_bps) \
             VALUES ('CEM001', 'Cement Bag', ?, 5000, 6000, 1800) RETURNING id",
        )
        .bind(unit_id)
        .fetch_one(&state.db)
        .await
        .expect("item");
        let supplier_id: i64 = sqlx::query_scalar(
            "INSERT INTO suppliers (name, phone, gstin) VALUES ('Cement Supplier', '9999999999', '27AABCU9603R1ZM') RETURNING id",
        )
        .fetch_one(&state.db)
        .await
        .expect("supplier");
        (item_id, supplier_id)
    }

    fn purchase_input(item_id: i64, supplier_id: i64) -> PurchaseInvoiceInput {
        PurchaseInvoiceInput {
            supplier_id,
            supplier_invoice_number: "SUP-2026-001".into(),
            invoice_date: "2026-05-10".into(),
            notes: Some("Test purchase".into()),
            lines: vec![PurchaseInvoiceLineInput {
                item_id: Some(item_id),
                description: None,
                unit_id: None,
                quantity_milli: 10_000,
                rate_minor: 5_000,
                discount_minor: Some(0),
                tax_rate_bps: Some(1_800),
            }],
        }
    }

    #[tokio::test]
    async fn full_purchase_payment_and_expense_flow() {
        let (state, session) = setup().await;
        let (item_id, supplier_id) = fixtures(&state).await;

        let draft = create_draft(&state, &session, purchase_input(item_id, supplier_id))
            .await
            .expect("purchase draft");
        assert_eq!(draft.header.status, "DRAFT");
        assert!(draft.header.internal_reference.starts_with("DRAFT-"));
        assert_eq!(draft.header.grand_total_minor, 59_000);

        let finalized = finalize_invoice(&state, &session, draft.header.id)
            .await
            .expect("purchase should finalize");
        assert_eq!(finalized.header.status, "FINALIZED");
        assert_eq!(finalized.header.internal_reference, "PUR/2026-27/00001");
        assert_eq!(finalized.header.due_minor, 59_000);

        let stock: i64 = sqlx::query_scalar(
            "SELECT quantity_milli FROM stock_movements WHERE item_id = ? AND movement_type = 'PURCHASE'",
        )
        .bind(item_id)
        .fetch_one(&state.db)
        .await
        .expect("purchase movement");
        assert_eq!(stock, 10_000);

        let overpay = create_payment(
            &state,
            &session,
            SupplierPaymentInput {
                supplier_id,
                purchase_invoice_id: Some(finalized.header.id),
                payment_date: "2026-05-11".into(),
                amount_minor: 99_999,
                payment_mode: "BANK_TRANSFER".into(),
                reference_number: None,
                notes: None,
            },
        )
        .await
        .expect_err("overpayment must fail");
        assert!(matches!(overpay, AppError::Validation(_)));

        let payment = create_payment(
            &state,
            &session,
            SupplierPaymentInput {
                supplier_id,
                purchase_invoice_id: Some(finalized.header.id),
                payment_date: "2026-05-11".into(),
                amount_minor: 20_000,
                payment_mode: "BANK_TRANSFER".into(),
                reference_number: Some("NEFT-1".into()),
                notes: None,
            },
        )
        .await
        .expect("supplier payment");
        assert_eq!(payment.amount_minor, 20_000);

        let paid = fetch_purchase(&state.db, finalized.header.id)
            .await
            .expect("purchase reload");
        assert_eq!(paid.header.paid_minor, 20_000);
        assert_eq!(paid.header.due_minor, 39_000);

        let cancel_err = cancel_invoice(
            &state,
            &session,
            finalized.header.id,
            "Supplier recall".into(),
        )
        .await
        .expect_err("posted payment must block cancellation");
        assert!(matches!(cancel_err, AppError::Conflict(_)));

        reverse_payment(&state, &session, payment.id, "Wrong bank entry".into())
            .await
            .expect("payment reversal");
        let restored = fetch_purchase(&state.db, finalized.header.id)
            .await
            .expect("purchase reload");
        assert_eq!(restored.header.paid_minor, 0);
        assert_eq!(restored.header.due_minor, 59_000);

        let cancelled = cancel_invoice(
            &state,
            &session,
            finalized.header.id,
            "Supplier recall".into(),
        )
        .await
        .expect("purchase cancellation");
        assert_eq!(cancelled.header.status, "CANCELLED");

        let reversal: i64 = sqlx::query_scalar(
            "SELECT quantity_milli FROM stock_movements WHERE item_id = ? AND movement_type = 'PURCHASE_CANCELLED'",
        )
        .bind(item_id)
        .fetch_one(&state.db)
        .await
        .expect("cancellation movement");
        assert_eq!(reversal, -10_000);

        let second = create_draft(&state, &session, purchase_input(item_id, supplier_id))
            .await
            .expect("second purchase");
        let second = finalize_invoice(&state, &session, second.header.id)
            .await
            .expect("second purchase should finalize");
        assert_eq!(second.header.internal_reference, "PUR/2026-27/00002");

        let net_stock: i64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM(quantity_milli), 0) FROM stock_movements WHERE item_id = ?",
        )
        .bind(item_id)
        .fetch_one(&state.db)
        .await
        .expect("net stock");
        assert_eq!(net_stock, 10_000);

        let advance = create_payment(
            &state,
            &session,
            SupplierPaymentInput {
                supplier_id,
                purchase_invoice_id: None,
                payment_date: "2026-05-12".into(),
                amount_minor: 5_000,
                payment_mode: "CASH".into(),
                reference_number: None,
                notes: Some("Advance".into()),
            },
        )
        .await
        .expect("advance payment");
        assert!(advance.purchase_invoice_id.is_none());

        let category_id: i64 =
            sqlx::query_scalar("SELECT id FROM expense_categories WHERE name = 'Rent'")
                .fetch_one(&state.db)
                .await
                .expect("seeded category");
        let expense = create_expense(
            &state,
            &session,
            ExpenseInput {
                expense_category_id: Some(category_id),
                expense_date: "2026-05-12".into(),
                description: "Shop rent".into(),
                amount_minor: 25_000,
                payment_mode: "UPI".into(),
                reference_number: Some("UPI-RENT".into()),
                notes: None,
            },
        )
        .await
        .expect("expense should record");
        assert_eq!(expense.amount_minor, 25_000);
        assert_eq!(expense.category_name.as_deref(), Some("Rent"));

        let bad_expense = create_expense(
            &state,
            &session,
            ExpenseInput {
                expense_category_id: None,
                expense_date: "2026-05-12".into(),
                description: "Zero".into(),
                amount_minor: 0,
                payment_mode: "CASH".into(),
                reference_number: None,
                notes: None,
            },
        )
        .await
        .expect_err("zero expense must fail");
        assert!(matches!(bad_expense, AppError::Validation(_)));
    }
}
