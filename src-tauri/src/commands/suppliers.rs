use sqlx::SqlitePool;
use tauri::State;

use crate::auth;
use crate::error::{AppError, AppResult};
use crate::models::{Paged, Supplier, SupplierInput};
use crate::state::AppState;
use crate::validate::{
    non_negative, optional_email, optional_gstin, optional_text, page_params, required_text,
};

const SUPPLIER_COLUMNS: &str = "id, supplier_code, name, phone, email, address, gstin, \
    opening_balance_minor, notes, is_active, created_at, updated_at";

async fn fetch_supplier(pool: &SqlitePool, id: i64) -> AppResult<Supplier> {
    sqlx::query_as::<_, Supplier>(&format!(
        "SELECT {SUPPLIER_COLUMNS} FROM suppliers WHERE id = ?"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Supplier not found".into()))
}

#[tauri::command]
pub async fn supplier_list(
    state: State<'_, AppState>,
    search: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
    include_inactive: Option<bool>,
) -> AppResult<Paged<Supplier>> {
    state.require_permission("suppliers.view").await?;
    let (page, page_size) = page_params(page, page_size);
    let search = search.unwrap_or_default().trim().to_string();
    let like = format!("%{search}%");
    let include_inactive = i64::from(include_inactive.unwrap_or(false));

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM suppliers \
         WHERE (? = 1 OR is_active = 1) \
           AND (? = '' OR name LIKE ? OR IFNULL(phone, '') LIKE ? OR IFNULL(supplier_code, '') LIKE ?)",
    )
    .bind(include_inactive)
    .bind(&search)
    .bind(&like)
    .bind(&like)
    .bind(&like)
    .fetch_one(&state.db)
    .await?;

    let items = sqlx::query_as::<_, Supplier>(&format!(
        "SELECT {SUPPLIER_COLUMNS} FROM suppliers \
         WHERE (? = 1 OR is_active = 1) \
           AND (? = '' OR name LIKE ? OR IFNULL(phone, '') LIKE ? OR IFNULL(supplier_code, '') LIKE ?) \
         ORDER BY name COLLATE NOCASE LIMIT ? OFFSET ?"
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
pub async fn supplier_get(state: State<'_, AppState>, id: i64) -> AppResult<Supplier> {
    state.require_permission("suppliers.view").await?;
    fetch_supplier(&state.db, id).await
}

#[tauri::command]
pub async fn supplier_create(
    state: State<'_, AppState>,
    input: SupplierInput,
) -> AppResult<Supplier> {
    let session = state.require_permission("suppliers.manage").await?;
    let name = required_text(&input.name, "Supplier name", 150)?;
    let email = optional_email(input.email)?;
    let gstin = optional_gstin(input.gstin)?;
    let opening_balance_minor = non_negative(input.opening_balance_minor, "Opening balance")?;
    let supplier_code = optional_text(input.supplier_code);

    let mut tx = state.db.begin().await?;
    if let Some(code) = &supplier_code {
        let exists: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM suppliers WHERE supplier_code = ?")
                .bind(code)
                .fetch_one(&mut *tx)
                .await?;
        if exists > 0 {
            return Err(AppError::Conflict("Supplier code is already in use".into()));
        }
    }

    let result = sqlx::query(
        "INSERT INTO suppliers \
         (supplier_code, name, phone, email, address, gstin, opening_balance_minor, notes) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&supplier_code)
    .bind(&name)
    .bind(optional_text(input.phone))
    .bind(&email)
    .bind(optional_text(input.address))
    .bind(&gstin)
    .bind(opening_balance_minor)
    .bind(optional_text(input.notes))
    .execute(&mut *tx)
    .await?;

    let id = result.last_insert_rowid();
    if supplier_code.is_none() {
        let generated = format!("SUP-{id:05}");
        sqlx::query("UPDATE suppliers SET supplier_code = ? WHERE id = ?")
            .bind(generated)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }

    sqlx::query(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id) \
         VALUES (?, 'supplier.created', 'supplier', ?)",
    )
    .bind(session.user_id)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    fetch_supplier(&state.db, id).await
}

#[tauri::command]
pub async fn supplier_update(
    state: State<'_, AppState>,
    id: i64,
    input: SupplierInput,
) -> AppResult<Supplier> {
    let session = state.require_permission("suppliers.manage").await?;
    let before = fetch_supplier(&state.db, id).await?;

    let name = required_text(&input.name, "Supplier name", 150)?;
    let email = optional_email(input.email)?;
    let gstin = optional_gstin(input.gstin)?;
    let opening_balance_minor = non_negative(input.opening_balance_minor, "Opening balance")?;
    let supplier_code = optional_text(input.supplier_code);

    if let Some(code) = &supplier_code {
        let exists: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM suppliers WHERE supplier_code = ? AND id <> ?",
        )
        .bind(code)
        .bind(id)
        .fetch_one(&state.db)
        .await?;
        if exists > 0 {
            return Err(AppError::Conflict("Supplier code is already in use".into()));
        }
    }

    sqlx::query(
        "UPDATE suppliers SET supplier_code = ?, name = ?, phone = ?, email = ?, address = ?, \
         gstin = ?, opening_balance_minor = ?, notes = ?, \
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    )
    .bind(&supplier_code)
    .bind(&name)
    .bind(optional_text(input.phone))
    .bind(&email)
    .bind(optional_text(input.address))
    .bind(&gstin)
    .bind(opening_balance_minor)
    .bind(optional_text(input.notes))
    .bind(id)
    .execute(&state.db)
    .await?;

    let after = fetch_supplier(&state.db, id).await?;
    auth::audit(
        &state.db,
        Some(session.user_id),
        "supplier.updated",
        Some("supplier"),
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

    fetch_supplier(&state.db, id).await
}

#[tauri::command]
pub async fn supplier_set_active(
    state: State<'_, AppState>,
    id: i64,
    is_active: bool,
) -> AppResult<Supplier> {
    let session = state.require_permission("suppliers.manage").await?;
    fetch_supplier(&state.db, id).await?;

    sqlx::query(
        "UPDATE suppliers SET is_active = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
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
            "supplier.activated"
        } else {
            "supplier.deactivated"
        },
        Some("supplier"),
        Some(id),
        None,
    )
    .await?;

    fetch_supplier(&state.db, id).await
}
