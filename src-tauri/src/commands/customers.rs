use sqlx::SqlitePool;
use tauri::State;

use crate::auth;
use crate::error::{AppError, AppResult};
use crate::models::{Customer, CustomerInput, Paged};
use crate::state::AppState;
use crate::validate::{
    non_negative, optional_email, optional_gstin, optional_text, page_params, required_text,
};

const CUSTOMER_COLUMNS: &str = "id, customer_code, name, phone, email, billing_address, \
    shipping_address, gstin, opening_balance_minor, notes, is_active, created_at, updated_at";

async fn fetch_customer(pool: &SqlitePool, id: i64) -> AppResult<Customer> {
    sqlx::query_as::<_, Customer>(&format!(
        "SELECT {CUSTOMER_COLUMNS} FROM customers WHERE id = ?"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Customer not found".into()))
}

#[tauri::command]
pub async fn customer_list(
    state: State<'_, AppState>,
    search: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
    include_inactive: Option<bool>,
) -> AppResult<Paged<Customer>> {
    state.require_permission("customers.view").await?;
    let (page, page_size) = page_params(page, page_size);
    let search = search.unwrap_or_default().trim().to_string();
    let like = format!("%{search}%");
    let include_inactive = i64::from(include_inactive.unwrap_or(false));

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM customers \
         WHERE (? = 1 OR is_active = 1) \
           AND (? = '' OR name LIKE ? OR IFNULL(phone, '') LIKE ? OR IFNULL(customer_code, '') LIKE ?)",
    )
    .bind(include_inactive)
    .bind(&search)
    .bind(&like)
    .bind(&like)
    .bind(&like)
    .fetch_one(&state.db)
    .await?;

    let items = sqlx::query_as::<_, Customer>(&format!(
        "SELECT {CUSTOMER_COLUMNS} FROM customers \
         WHERE (? = 1 OR is_active = 1) \
           AND (? = '' OR name LIKE ? OR IFNULL(phone, '') LIKE ? OR IFNULL(customer_code, '') LIKE ?) \
         ORDER BY name COLLATE NOCASE \
         LIMIT ? OFFSET ?"
    ))
    .bind(include_inactive)
    .bind(&search)
    .bind(&like)
    .bind(&like)
    .bind(&like)
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
pub async fn customer_get(state: State<'_, AppState>, id: i64) -> AppResult<Customer> {
    state.require_permission("customers.view").await?;
    fetch_customer(&state.db, id).await
}

#[tauri::command]
pub async fn customer_create(
    state: State<'_, AppState>,
    input: CustomerInput,
) -> AppResult<Customer> {
    let session = state.require_permission("customers.manage").await?;

    let name = required_text(&input.name, "Customer name", 150)?;
    let email = optional_email(input.email)?;
    let gstin = optional_gstin(input.gstin)?;
    let opening_balance_minor = non_negative(input.opening_balance_minor, "Opening balance")?;
    let customer_code = optional_text(input.customer_code);

    let mut tx = state.db.begin().await?;
    if let Some(code) = &customer_code {
        let exists: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM customers WHERE customer_code = ?")
                .bind(code)
                .fetch_one(&mut *tx)
                .await?;
        if exists > 0 {
            return Err(AppError::Conflict("Customer code is already in use".into()));
        }
    }

    let result = sqlx::query(
        "INSERT INTO customers \
         (customer_code, name, phone, email, billing_address, shipping_address, gstin, \
          opening_balance_minor, notes) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&customer_code)
    .bind(&name)
    .bind(optional_text(input.phone))
    .bind(&email)
    .bind(optional_text(input.billing_address))
    .bind(optional_text(input.shipping_address))
    .bind(&gstin)
    .bind(opening_balance_minor)
    .bind(optional_text(input.notes))
    .execute(&mut *tx)
    .await?;

    let id = result.last_insert_rowid();
    if customer_code.is_none() {
        let generated = format!("CUST-{id:05}");
        sqlx::query("UPDATE customers SET customer_code = ? WHERE id = ?")
            .bind(generated)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }

    sqlx::query(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id) \
         VALUES (?, 'customer.created', 'customer', ?)",
    )
    .bind(session.user_id)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    fetch_customer(&state.db, id).await
}

#[tauri::command]
pub async fn customer_update(
    state: State<'_, AppState>,
    id: i64,
    input: CustomerInput,
) -> AppResult<Customer> {
    let session = state.require_permission("customers.manage").await?;
    let before = fetch_customer(&state.db, id).await?;

    let name = required_text(&input.name, "Customer name", 150)?;
    let email = optional_email(input.email)?;
    let gstin = optional_gstin(input.gstin)?;
    let opening_balance_minor = non_negative(input.opening_balance_minor, "Opening balance")?;
    let customer_code = optional_text(input.customer_code);

    if let Some(code) = &customer_code {
        let exists: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM customers WHERE customer_code = ? AND id <> ?",
        )
        .bind(code)
        .bind(id)
        .fetch_one(&state.db)
        .await?;
        if exists > 0 {
            return Err(AppError::Conflict("Customer code is already in use".into()));
        }
    }

    sqlx::query(
        "UPDATE customers SET customer_code = ?, name = ?, phone = ?, email = ?, \
         billing_address = ?, shipping_address = ?, gstin = ?, opening_balance_minor = ?, \
         notes = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    )
    .bind(&customer_code)
    .bind(&name)
    .bind(optional_text(input.phone))
    .bind(&email)
    .bind(optional_text(input.billing_address))
    .bind(optional_text(input.shipping_address))
    .bind(&gstin)
    .bind(opening_balance_minor)
    .bind(optional_text(input.notes))
    .bind(id)
    .execute(&state.db)
    .await?;

    let after = fetch_customer(&state.db, id).await?;
    auth::audit(
        &state.db,
        Some(session.user_id),
        "customer.updated",
        Some("customer"),
        Some(id),
        Some(
            &serde_json::json!({
                "before": before,
                "after": after,
            })
            .to_string(),
        ),
    )
    .await?;

    fetch_customer(&state.db, id).await
}

#[tauri::command]
pub async fn customer_set_active(
    state: State<'_, AppState>,
    id: i64,
    is_active: bool,
) -> AppResult<Customer> {
    let session = state.require_permission("customers.manage").await?;
    fetch_customer(&state.db, id).await?;

    sqlx::query(
        "UPDATE customers SET is_active = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         WHERE id = ?",
    )
    .bind(i64::from(is_active))
    .bind(id)
    .execute(&state.db)
    .await?;

    auth::audit(
        &state.db,
        Some(session.user_id),
        if is_active {
            "customer.activated"
        } else {
            "customer.deactivated"
        },
        Some("customer"),
        Some(id),
        None,
    )
    .await?;

    fetch_customer(&state.db, id).await
}
