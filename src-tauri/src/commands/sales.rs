use chrono::NaiveDate;
use sqlx::{Sqlite, SqlitePool, Transaction};
use tauri::State;
use uuid::Uuid;

use crate::billing::{compute_invoice, fiscal_year_for, format_invoice_number};
use crate::error::{AppError, AppResult};
use crate::models::{
    CompanySettings, FinalizeSalesInvoiceInput, InvoicePreview, Paged, SalesInvoice,
    SalesInvoiceHeader, SalesInvoiceInput, SalesInvoiceLine, SalesInvoiceLineInput,
    SalesInvoicePrintData, SalesInvoiceSummary,
};
use crate::state::{AppState, Session};
use crate::validate::{optional_text, page_params, payment_mode, required_text};

const INVOICE_COLUMNS: &str = "id, invoice_number, invoice_type, customer_id, invoice_date, \
    status, customer_name_snapshot, customer_address_snapshot, customer_gstin_snapshot, \
    place_of_supply, is_inter_state, subtotal_minor, discount_minor, taxable_minor, cgst_minor, \
    sgst_minor, igst_minor, other_tax_minor, grand_total_minor, paid_minor, due_minor, notes, \
    terms, created_by, finalized_by, created_at, finalized_at, cancelled_at, cancellation_reason";

const LINE_SELECT: &str = "SELECT l.id, l.sales_invoice_id, l.line_number, l.item_id, \
    l.description_snapshot, l.hsn_code_snapshot, l.unit_id, u.abbreviation AS unit_abbreviation, \
    l.quantity_milli, l.rate_minor, l.discount_minor, l.taxable_minor, l.tax_rate_bps, \
    l.cgst_minor, l.sgst_minor, l.igst_minor, l.line_total_minor \
    FROM sales_invoice_items l LEFT JOIN units u ON u.id = l.unit_id";

const PAYMENT_SELECT: &str = "SELECT p.id, p.customer_id, c.name AS customer_name, \
    p.sales_invoice_id, si.invoice_number AS invoice_number, p.payment_date, p.amount_minor, \
    p.payment_mode, p.reference_number, p.status, p.notes, p.created_at, p.reversed_at, \
    p.reversal_reason \
    FROM payments p LEFT JOIN customers c ON c.id = p.customer_id \
    LEFT JOIN sales_invoices si ON si.id = p.sales_invoice_id";

const COMPANY_COLUMNS: &str = "id, company_name, address, phone, email, gstin, state_code, \
    logo_path, invoice_footer, language_code, currency_code, prices_include_tax, \
    gst_invoice_prefix, non_gst_invoice_prefix, fiscal_year_start_month, allow_negative_stock";

const SUMMARY_COLUMNS: &str = "id, invoice_number, invoice_type, customer_id, \
    customer_name_snapshot, invoice_date, status, grand_total_minor, paid_minor, due_minor, \
    created_at";

#[derive(sqlx::FromRow)]
struct ItemDefaults {
    name: String,
    hsn_code: Option<String>,
    default_unit_id: Option<i64>,
    default_tax_rate_bps: i64,
    is_active: bool,
}

#[derive(sqlx::FromRow)]
struct CustomerSnapshotRow {
    name: String,
    billing_address: Option<String>,
    gstin: Option<String>,
    is_active: bool,
}

struct ResolvedLine {
    item_id: Option<i64>,
    description: String,
    hsn_code: Option<String>,
    unit_id: Option<i64>,
    quantity_milli: i64,
    rate_minor: i64,
    discount_minor: i64,
    tax_rate_bps: i64,
}

impl ResolvedLine {
    fn as_input(&self) -> SalesInvoiceLineInput {
        SalesInvoiceLineInput {
            item_id: self.item_id,
            description: Some(self.description.clone()),
            hsn_code: self.hsn_code.clone(),
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

async fn resolve_customer(
    pool: &SqlitePool,
    invoice_type: &str,
    customer_id: Option<i64>,
) -> AppResult<(Option<i64>, String, Option<String>, Option<String>)> {
    match customer_id {
        Some(id) => {
            let customer: Option<CustomerSnapshotRow> = sqlx::query_as(
                "SELECT name, billing_address, gstin, is_active FROM customers WHERE id = ?",
            )
            .bind(id)
            .fetch_optional(pool)
            .await?;
            let Some(customer) = customer else {
                return Err(AppError::Validation(
                    "Selected customer does not exist".into(),
                ));
            };
            if !customer.is_active {
                return Err(AppError::Validation("Selected customer is inactive".into()));
            }
            Ok((
                Some(id),
                customer.name,
                customer.billing_address,
                customer.gstin,
            ))
        }
        None if invoice_type == "GST" => Err(AppError::Validation(
            "A customer is required for a GST invoice".into(),
        )),
        None => Ok((None, "Walk-in Customer".into(), None, None)),
    }
}

async fn resolve_lines(
    pool: &SqlitePool,
    invoice_type: &str,
    lines: &[SalesInvoiceLineInput],
) -> AppResult<Vec<ResolvedLine>> {
    if lines.is_empty() {
        return Err(AppError::Validation(
            "An invoice must have at least one line".into(),
        ));
    }

    let mut resolved = Vec::with_capacity(lines.len());
    for (index, line) in lines.iter().enumerate() {
        let row_number = index + 1;
        let unit_id;
        let description;
        let hsn_code;
        let tax_rate_bps;
        let item_id;

        if let Some(id) = line.item_id {
            let item: Option<ItemDefaults> = sqlx::query_as(
                "SELECT name, hsn_code, default_unit_id, default_tax_rate_bps, is_active \
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
            description = optional_text(line.description.clone()).unwrap_or(item.name);
            hsn_code = optional_text(line.hsn_code.clone()).or(item.hsn_code);
            unit_id = line.unit_id.or(item.default_unit_id);
            tax_rate_bps = if invoice_type == "GST" {
                line.tax_rate_bps.unwrap_or(item.default_tax_rate_bps)
            } else {
                0
            };
            item_id = Some(id);
        } else {
            description = required_text(
                line.description.as_deref().unwrap_or(""),
                &format!("Line {row_number} description"),
                200,
            )?;
            hsn_code = optional_text(line.hsn_code.clone());
            unit_id = line.unit_id;
            tax_rate_bps = if invoice_type == "GST" {
                line.tax_rate_bps.unwrap_or(0)
            } else {
                0
            };
            item_id = None;
        }

        ensure_unit(pool, unit_id).await?;

        resolved.push(ResolvedLine {
            item_id,
            description,
            hsn_code,
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
    preview: &InvoicePreview,
) -> AppResult<()> {
    for (index, (line, computed)) in resolved.iter().zip(preview.lines.iter()).enumerate() {
        sqlx::query(
            "INSERT INTO sales_invoice_items \
             (sales_invoice_id, line_number, item_id, description_snapshot, hsn_code_snapshot, \
              unit_id, quantity_milli, rate_minor, discount_minor, taxable_minor, tax_rate_bps, \
              cgst_minor, sgst_minor, igst_minor, line_total_minor) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(invoice_id)
        .bind(index as i64)
        .bind(line.item_id)
        .bind(&line.description)
        .bind(&line.hsn_code)
        .bind(line.unit_id)
        .bind(line.quantity_milli)
        .bind(line.rate_minor)
        .bind(line.discount_minor)
        .bind(computed.taxable_minor)
        .bind(line.tax_rate_bps)
        .bind(computed.cgst_minor)
        .bind(computed.sgst_minor)
        .bind(computed.igst_minor)
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
         VALUES (?, ?, 'sales_invoice', ?, ?)",
    )
    .bind(user_id)
    .bind(action)
    .bind(invoice_id)
    .bind(reason)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub(crate) async fn fetch_invoice(pool: &SqlitePool, id: i64) -> AppResult<SalesInvoice> {
    let header = sqlx::query_as::<_, SalesInvoiceHeader>(&format!(
        "SELECT {INVOICE_COLUMNS} FROM sales_invoices WHERE id = ?"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Sales invoice not found".into()))?;

    let lines = sqlx::query_as::<_, SalesInvoiceLine>(&format!(
        "{LINE_SELECT} WHERE l.sales_invoice_id = ? ORDER BY l.line_number, l.id"
    ))
    .bind(id)
    .fetch_all(pool)
    .await?;

    let payments = sqlx::query_as::<_, crate::models::Payment>(&format!(
        "{PAYMENT_SELECT} WHERE p.sales_invoice_id = ? ORDER BY p.payment_date DESC, p.id DESC"
    ))
    .bind(id)
    .fetch_all(pool)
    .await?;

    Ok(SalesInvoice {
        header,
        lines,
        payments,
    })
}

#[tauri::command]
pub async fn sales_invoice_calculate_preview(
    state: State<'_, AppState>,
    input: SalesInvoiceInput,
) -> AppResult<InvoicePreview> {
    state.require_permission("sales.view").await?;
    parse_date(&input.invoice_date, "Invoice date")?;
    let resolved = resolve_lines(&state.db, &input.invoice_type, &input.lines).await?;
    let inputs: Vec<SalesInvoiceLineInput> = resolved.iter().map(ResolvedLine::as_input).collect();
    compute_invoice(
        &input.invoice_type,
        input.is_inter_state.unwrap_or(false),
        &inputs,
    )
}

#[tauri::command]
pub async fn sales_invoice_create_draft(
    state: State<'_, AppState>,
    input: SalesInvoiceInput,
) -> AppResult<SalesInvoice> {
    let session = state.require_permission("sales.manage").await?;
    create_draft(state.inner(), &session, input).await
}

pub(crate) async fn create_draft(
    state: &AppState,
    session: &Session,
    input: SalesInvoiceInput,
) -> AppResult<SalesInvoice> {
    parse_date(&input.invoice_date, "Invoice date")?;
    let is_inter_state = input.is_inter_state.unwrap_or(false);
    let resolved = resolve_lines(&state.db, &input.invoice_type, &input.lines).await?;
    let (customer_id, customer_name, customer_address, customer_gstin) =
        resolve_customer(&state.db, &input.invoice_type, input.customer_id).await?;
    let inputs: Vec<SalesInvoiceLineInput> = resolved.iter().map(ResolvedLine::as_input).collect();
    let preview = compute_invoice(&input.invoice_type, is_inter_state, &inputs)?;

    let mut tx = state.db.begin().await?;
    let temp_number = format!("DRAFT-{}", Uuid::new_v4());
    let result = sqlx::query(
        "INSERT INTO sales_invoices \
         (invoice_number, invoice_type, customer_id, invoice_date, status, customer_name_snapshot, \
          customer_address_snapshot, customer_gstin_snapshot, place_of_supply, is_inter_state, \
          subtotal_minor, discount_minor, taxable_minor, cgst_minor, sgst_minor, igst_minor, \
          other_tax_minor, grand_total_minor, paid_minor, due_minor, notes, terms, created_by) \
         VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)",
    )
    .bind(&temp_number)
    .bind(&input.invoice_type)
    .bind(customer_id)
    .bind(&input.invoice_date)
    .bind(&customer_name)
    .bind(&customer_address)
    .bind(&customer_gstin)
    .bind(optional_text(input.place_of_supply))
    .bind(i64::from(is_inter_state))
    .bind(preview.subtotal_minor)
    .bind(preview.discount_minor)
    .bind(preview.taxable_minor)
    .bind(preview.cgst_minor)
    .bind(preview.sgst_minor)
    .bind(preview.igst_minor)
    .bind(preview.other_tax_minor)
    .bind(preview.grand_total_minor)
    .bind(preview.grand_total_minor)
    .bind(optional_text(input.notes))
    .bind(optional_text(input.terms))
    .bind(session.user_id)
    .execute(&mut *tx)
    .await?;

    let id = result.last_insert_rowid();
    insert_lines(&mut tx, id, &resolved, &preview).await?;
    audit_tx(&mut tx, session.user_id, "sales_invoice.created", id, None).await?;
    tx.commit().await?;

    fetch_invoice(&state.db, id).await
}

#[tauri::command]
pub async fn sales_invoice_update_draft(
    state: State<'_, AppState>,
    id: i64,
    input: SalesInvoiceInput,
) -> AppResult<SalesInvoice> {
    let session = state.require_permission("sales.manage").await?;
    update_draft(state.inner(), &session, id, input).await
}

pub(crate) async fn update_draft(
    state: &AppState,
    session: &Session,
    id: i64,
    input: SalesInvoiceInput,
) -> AppResult<SalesInvoice> {
    parse_date(&input.invoice_date, "Invoice date")?;
    let is_inter_state = input.is_inter_state.unwrap_or(false);
    let resolved = resolve_lines(&state.db, &input.invoice_type, &input.lines).await?;
    let (customer_id, customer_name, customer_address, customer_gstin) =
        resolve_customer(&state.db, &input.invoice_type, input.customer_id).await?;
    let inputs: Vec<SalesInvoiceLineInput> = resolved.iter().map(ResolvedLine::as_input).collect();
    let preview = compute_invoice(&input.invoice_type, is_inter_state, &inputs)?;

    let mut tx = state.db.begin().await?;
    let status: Option<String> =
        sqlx::query_scalar("SELECT status FROM sales_invoices WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let Some(status) = status else {
        return Err(AppError::NotFound("Sales invoice not found".into()));
    };
    if status != "DRAFT" {
        return Err(AppError::Conflict(
            "Only draft invoices can be edited".into(),
        ));
    }

    sqlx::query(
        "UPDATE sales_invoices SET invoice_type = ?, customer_id = ?, invoice_date = ?, \
         customer_name_snapshot = ?, customer_address_snapshot = ?, customer_gstin_snapshot = ?, \
         place_of_supply = ?, is_inter_state = ?, subtotal_minor = ?, discount_minor = ?, \
         taxable_minor = ?, cgst_minor = ?, sgst_minor = ?, igst_minor = ?, other_tax_minor = ?, \
         grand_total_minor = ?, paid_minor = 0, due_minor = ?, notes = ?, terms = ? WHERE id = ?",
    )
    .bind(&input.invoice_type)
    .bind(customer_id)
    .bind(&input.invoice_date)
    .bind(&customer_name)
    .bind(&customer_address)
    .bind(&customer_gstin)
    .bind(optional_text(input.place_of_supply))
    .bind(i64::from(is_inter_state))
    .bind(preview.subtotal_minor)
    .bind(preview.discount_minor)
    .bind(preview.taxable_minor)
    .bind(preview.cgst_minor)
    .bind(preview.sgst_minor)
    .bind(preview.igst_minor)
    .bind(preview.other_tax_minor)
    .bind(preview.grand_total_minor)
    .bind(preview.grand_total_minor)
    .bind(optional_text(input.notes))
    .bind(optional_text(input.terms))
    .bind(id)
    .execute(&mut *tx)
    .await?;

    sqlx::query("DELETE FROM sales_invoice_items WHERE sales_invoice_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    insert_lines(&mut tx, id, &resolved, &preview).await?;
    audit_tx(&mut tx, session.user_id, "sales_invoice.updated", id, None).await?;
    tx.commit().await?;

    fetch_invoice(&state.db, id).await
}

#[tauri::command]
pub async fn sales_invoice_finalize(
    state: State<'_, AppState>,
    id: i64,
    input: FinalizeSalesInvoiceInput,
) -> AppResult<SalesInvoice> {
    let session = state.require_permission("sales.manage").await?;
    finalize_invoice(state.inner(), &session, id, input).await
}

pub(crate) async fn finalize_invoice(
    state: &AppState,
    session: &Session,
    id: i64,
    input: FinalizeSalesInvoiceInput,
) -> AppResult<SalesInvoice> {
    let mut tx = state.db.begin().await?;

    let header = sqlx::query_as::<_, SalesInvoiceHeader>(&format!(
        "SELECT {INVOICE_COLUMNS} FROM sales_invoices WHERE id = ?"
    ))
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("Sales invoice not found".into()))?;
    if header.status != "DRAFT" {
        return Err(AppError::Conflict(
            "Only draft invoices can be finalized".into(),
        ));
    }

    let lines = sqlx::query_as::<_, SalesInvoiceLine>(&format!(
        "{LINE_SELECT} WHERE l.sales_invoice_id = ? ORDER BY l.line_number, l.id"
    ))
    .bind(id)
    .fetch_all(&mut *tx)
    .await?;
    if lines.is_empty() {
        return Err(AppError::Validation(
            "An invoice must have at least one line".into(),
        ));
    }

    let inputs: Vec<SalesInvoiceLineInput> = lines
        .iter()
        .map(|line| SalesInvoiceLineInput {
            item_id: line.item_id,
            description: Some(line.description_snapshot.clone()),
            hsn_code: line.hsn_code_snapshot.clone(),
            unit_id: line.unit_id,
            quantity_milli: line.quantity_milli,
            rate_minor: line.rate_minor,
            discount_minor: Some(line.discount_minor),
            tax_rate_bps: Some(line.tax_rate_bps),
        })
        .collect();
    let preview = compute_invoice(&header.invoice_type, header.is_inter_state, &inputs)?;

    let invoice_date = parse_date(&header.invoice_date, "Invoice date")?;
    let settings = sqlx::query_as::<_, CompanySettings>(&format!(
        "SELECT {COMPANY_COLUMNS} FROM company_settings WHERE id = 1"
    ))
    .fetch_one(&mut *tx)
    .await?;

    let fiscal_year = fiscal_year_for(invoice_date, settings.fiscal_year_start_month as u32);
    let sequence: i64 = sqlx::query_scalar(
        "INSERT INTO invoice_sequences (invoice_type, fiscal_year, next_number) VALUES (?, ?, 1) \
         ON CONFLICT (invoice_type, fiscal_year) DO UPDATE SET next_number = next_number + 1 \
         RETURNING next_number",
    )
    .bind(&header.invoice_type)
    .bind(&fiscal_year)
    .fetch_one(&mut *tx)
    .await?;

    let configured_prefix = if header.invoice_type == "GST" {
        &settings.gst_invoice_prefix
    } else {
        &settings.non_gst_invoice_prefix
    };
    let fallback_prefix = if header.invoice_type == "GST" {
        "GST"
    } else {
        "INV"
    };
    let prefix = if configured_prefix.trim().is_empty() {
        fallback_prefix
    } else {
        configured_prefix.trim()
    };
    let invoice_number = format_invoice_number(prefix, &fiscal_year, sequence);

    for (line, computed) in lines.iter().zip(preview.lines.iter()) {
        sqlx::query(
            "UPDATE sales_invoice_items SET taxable_minor = ?, cgst_minor = ?, sgst_minor = ?, \
             igst_minor = ?, line_total_minor = ? WHERE id = ?",
        )
        .bind(computed.taxable_minor)
        .bind(computed.cgst_minor)
        .bind(computed.sgst_minor)
        .bind(computed.igst_minor)
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
                 VALUES (?, 'SALE', ?, ?, 'SALES_INVOICE', ?, ?, ?, ?)",
            )
            .bind(item_id)
            .bind(-line.quantity_milli)
            .bind(line.unit_id)
            .bind(id)
            .bind(&header.invoice_date)
            .bind(format!("Invoice {invoice_number}"))
            .bind(session.user_id)
            .execute(&mut *tx)
            .await?;
        }
    }

    let initial_payment = input.initial_payment_minor.unwrap_or(0);
    if initial_payment < 0 {
        return Err(AppError::Validation(
            "Initial payment cannot be negative".into(),
        ));
    }
    if initial_payment > preview.grand_total_minor {
        return Err(AppError::Validation(
            "Initial payment cannot exceed the invoice total".into(),
        ));
    }
    if initial_payment > 0 {
        let customer_id = header
            .customer_id
            .ok_or_else(|| AppError::Validation("An initial payment requires a customer".into()))?;
        let mode = payment_mode(input.payment_mode.as_deref().unwrap_or(""))?;
        sqlx::query(
            "INSERT INTO payments \
             (customer_id, sales_invoice_id, payment_date, amount_minor, payment_mode, \
              reference_number, status, created_by) \
             VALUES (?, ?, ?, ?, ?, ?, 'POSTED', ?)",
        )
        .bind(customer_id)
        .bind(id)
        .bind(&header.invoice_date)
        .bind(initial_payment)
        .bind(mode)
        .bind(optional_text(input.reference_number))
        .bind(session.user_id)
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query(
        "UPDATE sales_invoices SET invoice_number = ?, status = 'FINALIZED', subtotal_minor = ?, \
         discount_minor = ?, taxable_minor = ?, cgst_minor = ?, sgst_minor = ?, igst_minor = ?, \
         other_tax_minor = ?, grand_total_minor = ?, paid_minor = ?, due_minor = ?, \
         finalized_by = ?, finalized_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    )
    .bind(&invoice_number)
    .bind(preview.subtotal_minor)
    .bind(preview.discount_minor)
    .bind(preview.taxable_minor)
    .bind(preview.cgst_minor)
    .bind(preview.sgst_minor)
    .bind(preview.igst_minor)
    .bind(preview.other_tax_minor)
    .bind(preview.grand_total_minor)
    .bind(initial_payment)
    .bind(preview.grand_total_minor - initial_payment)
    .bind(session.user_id)
    .bind(id)
    .execute(&mut *tx)
    .await?;

    audit_tx(
        &mut tx,
        session.user_id,
        "sales_invoice.finalized",
        id,
        Some(&invoice_number),
    )
    .await?;
    tx.commit().await?;

    fetch_invoice(&state.db, id).await
}

#[tauri::command]
pub async fn sales_invoice_cancel(
    state: State<'_, AppState>,
    id: i64,
    reason: String,
) -> AppResult<SalesInvoice> {
    let session = state.require_permission("sales.manage").await?;
    cancel_invoice(state.inner(), &session, id, reason).await
}

pub(crate) async fn cancel_invoice(
    state: &AppState,
    session: &Session,
    id: i64,
    reason: String,
) -> AppResult<SalesInvoice> {
    let reason = required_text(&reason, "Cancellation reason", 500)?;

    let mut tx = state.db.begin().await?;
    let header = sqlx::query_as::<_, SalesInvoiceHeader>(&format!(
        "SELECT {INVOICE_COLUMNS} FROM sales_invoices WHERE id = ?"
    ))
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("Sales invoice not found".into()))?;
    if header.status != "FINALIZED" {
        return Err(AppError::Conflict(
            "Only finalized invoices can be cancelled".into(),
        ));
    }

    let posted_payments: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM payments WHERE sales_invoice_id = ? AND status = 'POSTED'",
    )
    .bind(id)
    .fetch_one(&mut *tx)
    .await?;
    if posted_payments > 0 {
        return Err(AppError::Conflict(
            "Reverse all posted payments before cancelling this invoice".into(),
        ));
    }

    let lines = sqlx::query_as::<_, SalesInvoiceLine>(&format!(
        "{LINE_SELECT} WHERE l.sales_invoice_id = ? ORDER BY l.line_number, l.id"
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
                 VALUES (?, 'SALE_CANCELLED', ?, ?, 'SALES_INVOICE_CANCELLATION', ?, ?, ?, ?)",
            )
            .bind(item_id)
            .bind(line.quantity_milli)
            .bind(line.unit_id)
            .bind(id)
            .bind(&header.invoice_date)
            .bind(format!("Cancellation of {}", header.invoice_number))
            .bind(session.user_id)
            .execute(&mut *tx)
            .await?;
        }
    }

    sqlx::query(
        "UPDATE sales_invoices SET status = 'CANCELLED', paid_minor = 0, due_minor = 0, \
         cancelled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), cancellation_reason = ? WHERE id = ?",
    )
    .bind(&reason)
    .bind(id)
    .execute(&mut *tx)
    .await?;

    audit_tx(
        &mut tx,
        session.user_id,
        "sales_invoice.cancelled",
        id,
        Some(&reason),
    )
    .await?;
    tx.commit().await?;

    fetch_invoice(&state.db, id).await
}

#[tauri::command]
pub async fn sales_invoice_get(state: State<'_, AppState>, id: i64) -> AppResult<SalesInvoice> {
    state.require_permission("sales.view").await?;
    fetch_invoice(&state.db, id).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn sales_invoice_list(
    state: State<'_, AppState>,
    search: Option<String>,
    status: Option<String>,
    invoice_type: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
    customer_id: Option<i64>,
    page: Option<i64>,
    page_size: Option<i64>,
) -> AppResult<Paged<SalesInvoiceSummary>> {
    state.require_permission("sales.view").await?;
    let (page, page_size) = page_params(page, page_size);
    let search = search.unwrap_or_default().trim().to_string();
    let like = format!("%{search}%");
    let status = optional_text(status).unwrap_or_default();
    let invoice_type = optional_text(invoice_type).unwrap_or_default();
    let date_from = optional_text(date_from).unwrap_or_default();
    let date_to = optional_text(date_to).unwrap_or_default();
    if !status.is_empty() && !["DRAFT", "FINALIZED", "CANCELLED"].contains(&status.as_str()) {
        return Err(AppError::Validation("Invalid invoice status".into()));
    }
    if !invoice_type.is_empty() && !["GST", "NON_GST"].contains(&invoice_type.as_str()) {
        return Err(AppError::Validation("Invalid invoice type".into()));
    }
    if !date_from.is_empty() {
        parse_date(&date_from, "From date")?;
    }
    if !date_to.is_empty() {
        parse_date(&date_to, "To date")?;
    }
    let customer_id = customer_id.unwrap_or(0);

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sales_invoices \
         WHERE (? = '' OR invoice_number LIKE ? OR customer_name_snapshot LIKE ?) \
           AND (? = '' OR status = ?) \
           AND (? = '' OR invoice_type = ?) \
           AND (? = '' OR invoice_date >= ?) \
           AND (? = '' OR invoice_date <= ?) \
           AND (? = 0 OR customer_id = ?)",
    )
    .bind(&search)
    .bind(&like)
    .bind(&like)
    .bind(&status)
    .bind(&status)
    .bind(&invoice_type)
    .bind(&invoice_type)
    .bind(&date_from)
    .bind(&date_from)
    .bind(&date_to)
    .bind(&date_to)
    .bind(customer_id)
    .bind(customer_id)
    .fetch_one(&state.db)
    .await?;

    let items = sqlx::query_as::<_, SalesInvoiceSummary>(&format!(
        "SELECT {SUMMARY_COLUMNS} FROM sales_invoices \
         WHERE (? = '' OR invoice_number LIKE ? OR customer_name_snapshot LIKE ?) \
           AND (? = '' OR status = ?) \
           AND (? = '' OR invoice_type = ?) \
           AND (? = '' OR invoice_date >= ?) \
           AND (? = '' OR invoice_date <= ?) \
           AND (? = 0 OR customer_id = ?) \
         ORDER BY invoice_date DESC, id DESC LIMIT ? OFFSET ?"
    ))
    .bind(&search)
    .bind(&like)
    .bind(&like)
    .bind(&status)
    .bind(&status)
    .bind(&invoice_type)
    .bind(&invoice_type)
    .bind(&date_from)
    .bind(&date_from)
    .bind(&date_to)
    .bind(&date_to)
    .bind(customer_id)
    .bind(customer_id)
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

#[tauri::command]
pub async fn sales_invoice_print_data(
    state: State<'_, AppState>,
    id: i64,
) -> AppResult<SalesInvoicePrintData> {
    state.require_permission("sales.view").await?;
    let invoice = fetch_invoice(&state.db, id).await?;
    let company = sqlx::query_as::<_, CompanySettings>(&format!(
        "SELECT {COMPANY_COLUMNS} FROM company_settings WHERE id = 1"
    ))
    .fetch_one(&state.db)
    .await?;
    Ok(SalesInvoicePrintData { invoice, company })
}

#[cfg(test)]
mod flow_tests {
    use super::*;
    use crate::auth;
    use crate::commands::payments::{create_payment, reverse_payment};
    use crate::db;
    use crate::models::PaymentInput;

    async fn setup() -> (AppState, Session) {
        let pool = db::connect_memory().await.expect("database should open");
        auth::ensure_default_admin(&pool)
            .await
            .expect("admin should be seeded");
        let permissions = auth::load_permissions(&pool, 1)
            .await
            .expect("permissions should load");
        let session = Session {
            user_id: 1,
            username: "admin".into(),
            display_name: "Administrator".into(),
            must_change_password: false,
            permissions,
        };
        (AppState::new(pool, std::env::temp_dir()), session)
    }

    async fn fixtures(state: &AppState) -> (i64, i64) {
        let unit_id: i64 = sqlx::query_scalar(
            "INSERT INTO units (name, abbreviation, precision) VALUES ('Bag', 'bag', 3) RETURNING id",
        )
        .fetch_one(&state.db)
        .await
        .expect("unit");
        let item_id: i64 = sqlx::query_scalar(
            "INSERT INTO items (item_code, name, default_unit_id, selling_rate_minor, hsn_code, default_tax_rate_bps) \
             VALUES ('CEM001', 'Cement Bag', ?, 10000, '2523', 1800) RETURNING id",
        )
        .bind(unit_id)
        .fetch_one(&state.db)
        .await
        .expect("item");
        let customer_id: i64 = sqlx::query_scalar(
            "INSERT INTO customers (name, billing_address, gstin) VALUES ('Test Customer', 'Pune', '27AABCU9603R1ZM') RETURNING id",
        )
        .fetch_one(&state.db)
        .await
        .expect("customer");
        (item_id, customer_id)
    }

    fn invoice_input(
        item_id: i64,
        customer_id: Option<i64>,
        invoice_type: &str,
    ) -> SalesInvoiceInput {
        SalesInvoiceInput {
            invoice_type: invoice_type.into(),
            customer_id,
            invoice_date: "2026-05-10".into(),
            place_of_supply: Some("Maharashtra".into()),
            is_inter_state: Some(false),
            notes: None,
            terms: None,
            lines: vec![SalesInvoiceLineInput {
                item_id: Some(item_id),
                description: Some("Cement Bag".into()),
                hsn_code: Some("2523".into()),
                unit_id: None,
                quantity_milli: 1_500,
                rate_minor: 10_000,
                discount_minor: Some(500),
                tax_rate_bps: Some(1_800),
            }],
        }
    }

    #[tokio::test]
    async fn full_sales_and_payment_flow() {
        let (state, session) = setup().await;
        let (item_id, customer_id) = fixtures(&state).await;

        let draft = create_draft(
            &state,
            &session,
            invoice_input(item_id, Some(customer_id), "GST"),
        )
        .await
        .expect("draft should be created");
        assert_eq!(draft.header.status, "DRAFT");
        assert!(draft.header.invoice_number.starts_with("DRAFT-"));
        assert_eq!(draft.header.grand_total_minor, 17_110);

        let finalized = finalize_invoice(
            &state,
            &session,
            draft.header.id,
            FinalizeSalesInvoiceInput {
                initial_payment_minor: Some(5_000),
                payment_mode: Some("CASH".into()),
                reference_number: None,
            },
        )
        .await
        .expect("invoice should finalize");
        assert_eq!(finalized.header.status, "FINALIZED");
        assert_eq!(finalized.header.invoice_number, "GST/2026-27/00001");
        assert_eq!(finalized.header.paid_minor, 5_000);
        assert_eq!(finalized.header.due_minor, 12_110);
        assert_eq!(finalized.payments.len(), 1);

        let stock: i64 = sqlx::query_scalar(
            "SELECT quantity_milli FROM stock_movements WHERE item_id = ? AND movement_type = 'SALE'",
        )
        .bind(item_id)
        .fetch_one(&state.db)
        .await
        .expect("sale movement");
        assert_eq!(stock, -1_500);

        let second = create_draft(
            &state,
            &session,
            invoice_input(item_id, Some(customer_id), "GST"),
        )
        .await
        .expect("second draft");
        let second = finalize_invoice(
            &state,
            &session,
            second.header.id,
            FinalizeSalesInvoiceInput {
                initial_payment_minor: None,
                payment_mode: None,
                reference_number: None,
            },
        )
        .await
        .expect("second invoice should finalize");
        assert_eq!(second.header.invoice_number, "GST/2026-27/00002");
        assert_eq!(second.header.due_minor, 17_110);

        let cancel_err = cancel_invoice(
            &state,
            &session,
            finalized.header.id,
            "Customer returned goods".into(),
        )
        .await
        .expect_err("posted payment must block cancellation");
        assert!(matches!(cancel_err, AppError::Conflict(_)));

        let payment_id = finalized.payments[0].id;
        reverse_payment(&state, &session, payment_id, "Payment bounced".into())
            .await
            .expect("payment should reverse");
        let after_reversal = fetch_invoice(&state.db, finalized.header.id)
            .await
            .expect("invoice reload");
        assert_eq!(after_reversal.header.paid_minor, 0);
        assert_eq!(after_reversal.header.due_minor, 17_110);

        let cancelled = cancel_invoice(
            &state,
            &session,
            finalized.header.id,
            "Customer returned goods".into(),
        )
        .await
        .expect("invoice should cancel");
        assert_eq!(cancelled.header.status, "CANCELLED");
        assert_eq!(cancelled.header.due_minor, 0);

        let reversal: i64 = sqlx::query_scalar(
            "SELECT quantity_milli FROM stock_movements WHERE item_id = ? AND movement_type = 'SALE_CANCELLED'",
        )
        .bind(item_id)
        .fetch_one(&state.db)
        .await
        .expect("cancellation movement");
        assert_eq!(reversal, 1_500);

        let overpay = create_payment(
            &state,
            &session,
            PaymentInput {
                customer_id,
                sales_invoice_id: Some(second.header.id),
                payment_date: "2026-05-11".into(),
                amount_minor: 999_999,
                payment_mode: "UPI".into(),
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
            PaymentInput {
                customer_id,
                sales_invoice_id: Some(second.header.id),
                payment_date: "2026-05-11".into(),
                amount_minor: 1_000,
                payment_mode: "UPI".into(),
                reference_number: Some("UPI-123".into()),
                notes: None,
            },
        )
        .await
        .expect("payment should post");
        assert_eq!(payment.amount_minor, 1_000);
        let paid_invoice = fetch_invoice(&state.db, second.header.id)
            .await
            .expect("invoice reload");
        assert_eq!(paid_invoice.header.paid_minor, 1_000);
        assert_eq!(paid_invoice.header.due_minor, 16_110);

        reverse_payment(&state, &session, payment.id, "Wrong entry".into())
            .await
            .expect("payment should reverse");
        let restored = fetch_invoice(&state.db, second.header.id)
            .await
            .expect("invoice reload");
        assert_eq!(restored.header.paid_minor, 0);
        assert_eq!(restored.header.due_minor, 17_110);

        let walk_in = create_draft(&state, &session, invoice_input(item_id, None, "NON_GST"))
            .await
            .expect("non-GST walk-in draft");
        let walk_in = finalize_invoice(
            &state,
            &session,
            walk_in.header.id,
            FinalizeSalesInvoiceInput {
                initial_payment_minor: None,
                payment_mode: None,
                reference_number: None,
            },
        )
        .await
        .expect("walk-in invoice should finalize");
        assert_eq!(walk_in.header.invoice_number, "INV/2026-27/00001");
        assert_eq!(walk_in.header.grand_total_minor, 14_500);
    }
}
