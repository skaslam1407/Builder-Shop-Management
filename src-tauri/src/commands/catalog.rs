use sqlx::SqlitePool;
use tauri::State;

use crate::auth;
use crate::error::{AppError, AppResult};
use crate::models::{Category, CategoryInput, Item, ItemInput, Paged, Unit, UnitInput};
use crate::state::AppState;
use crate::validate::{non_negative, optional_text, page_params, required_text};

const CATEGORY_COLUMNS: &str = "id, name, description, is_active, created_at, updated_at";
const UNIT_COLUMNS: &str = "id, name, abbreviation, precision, is_active, created_at, updated_at";
const ITEM_SELECT: &str = "SELECT i.id, i.item_code, i.name, i.category_id, \
    c.name AS category_name, i.default_unit_id, u.abbreviation AS unit_abbreviation, \
    i.description, i.purchase_rate_minor, i.selling_rate_minor, i.hsn_code, \
    i.default_tax_rate_bps, i.reorder_level_milli, i.is_active, i.created_at, i.updated_at \
    FROM items i \
    LEFT JOIN categories c ON c.id = i.category_id \
    LEFT JOIN units u ON u.id = i.default_unit_id";

async fn fetch_category(pool: &SqlitePool, id: i64) -> AppResult<Category> {
    sqlx::query_as::<_, Category>(&format!(
        "SELECT {CATEGORY_COLUMNS} FROM categories WHERE id = ?"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Category not found".into()))
}

async fn fetch_unit(pool: &SqlitePool, id: i64) -> AppResult<Unit> {
    sqlx::query_as::<_, Unit>(&format!("SELECT {UNIT_COLUMNS} FROM units WHERE id = ?"))
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound("Unit not found".into()))
}

async fn fetch_item(pool: &SqlitePool, id: i64) -> AppResult<Item> {
    sqlx::query_as::<_, Item>(&format!("{ITEM_SELECT} WHERE i.id = ?"))
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound("Item not found".into()))
}

async fn ensure_reference(
    pool: &SqlitePool,
    table: &str,
    id: Option<i64>,
    label: &str,
) -> AppResult<()> {
    let Some(id) = id else {
        return Ok(());
    };
    let exists: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table} WHERE id = ?"))
        .bind(id)
        .fetch_one(pool)
        .await?;
    if exists == 0 {
        return Err(AppError::Validation(format!("{label} does not exist")));
    }
    Ok(())
}

#[tauri::command]
pub async fn category_list(
    state: State<'_, AppState>,
    include_inactive: Option<bool>,
) -> AppResult<Vec<Category>> {
    state.require_permission("catalog.view").await?;
    let include_inactive = i64::from(include_inactive.unwrap_or(false));
    let categories = sqlx::query_as::<_, Category>(&format!(
        "SELECT {CATEGORY_COLUMNS} FROM categories \
         WHERE (? = 1 OR is_active = 1) ORDER BY name COLLATE NOCASE"
    ))
    .bind(include_inactive)
    .fetch_all(&state.db)
    .await?;
    Ok(categories)
}

#[tauri::command]
pub async fn category_create(
    state: State<'_, AppState>,
    input: CategoryInput,
) -> AppResult<Category> {
    let session = state.require_permission("catalog.manage").await?;
    let name = required_text(&input.name, "Category name", 100)?;

    let exists: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM categories WHERE name = ? COLLATE NOCASE")
            .bind(&name)
            .fetch_one(&state.db)
            .await?;
    if exists > 0 {
        return Err(AppError::Conflict("Category name is already in use".into()));
    }

    let result = sqlx::query("INSERT INTO categories (name, description) VALUES (?, ?)")
        .bind(&name)
        .bind(optional_text(input.description))
        .execute(&state.db)
        .await?;
    let id = result.last_insert_rowid();
    auth::audit(
        &state.db,
        Some(session.user_id),
        "category.created",
        Some("category"),
        Some(id),
        None,
    )
    .await?;
    fetch_category(&state.db, id).await
}

#[tauri::command]
pub async fn category_update(
    state: State<'_, AppState>,
    id: i64,
    input: CategoryInput,
) -> AppResult<Category> {
    let session = state.require_permission("catalog.manage").await?;
    let before = fetch_category(&state.db, id).await?;
    let name = required_text(&input.name, "Category name", 100)?;

    let exists: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM categories WHERE name = ? COLLATE NOCASE AND id <> ?",
    )
    .bind(&name)
    .bind(id)
    .fetch_one(&state.db)
    .await?;
    if exists > 0 {
        return Err(AppError::Conflict("Category name is already in use".into()));
    }

    sqlx::query(
        "UPDATE categories SET name = ?, description = ?, \
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    )
    .bind(&name)
    .bind(optional_text(input.description))
    .bind(id)
    .execute(&state.db)
    .await?;

    auth::audit(
        &state.db,
        Some(session.user_id),
        "category.updated",
        Some("category"),
        Some(id),
        Some(&serde_json::json!({ "before": before }).to_string()),
    )
    .await?;
    fetch_category(&state.db, id).await
}

#[tauri::command]
pub async fn category_set_active(
    state: State<'_, AppState>,
    id: i64,
    is_active: bool,
) -> AppResult<Category> {
    let session = state.require_permission("catalog.manage").await?;
    fetch_category(&state.db, id).await?;
    sqlx::query(
        "UPDATE categories SET is_active = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         WHERE id = ?",
    )
    .bind(i64::from(is_active))
    .bind(id)
    .execute(&state.db)
    .await?;
    auth::audit(
        &state.db,
        Some(session.user_id),
        "category.status_changed",
        Some("category"),
        Some(id),
        None,
    )
    .await?;
    fetch_category(&state.db, id).await
}

#[tauri::command]
pub async fn unit_list(
    state: State<'_, AppState>,
    include_inactive: Option<bool>,
) -> AppResult<Vec<Unit>> {
    state.require_permission("catalog.view").await?;
    let include_inactive = i64::from(include_inactive.unwrap_or(false));
    let units = sqlx::query_as::<_, Unit>(&format!(
        "SELECT {UNIT_COLUMNS} FROM units \
         WHERE (? = 1 OR is_active = 1) ORDER BY name COLLATE NOCASE"
    ))
    .bind(include_inactive)
    .fetch_all(&state.db)
    .await?;
    Ok(units)
}

#[tauri::command]
pub async fn unit_create(state: State<'_, AppState>, input: UnitInput) -> AppResult<Unit> {
    let session = state.require_permission("catalog.manage").await?;
    let name = required_text(&input.name, "Unit name", 50)?;
    let abbreviation = required_text(&input.abbreviation, "Unit abbreviation", 20)?;
    let precision = input.precision.unwrap_or(0);
    if !(0..=6).contains(&precision) {
        return Err(AppError::Validation(
            "Unit precision must be between 0 and 6".into(),
        ));
    }

    let exists: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM units WHERE abbreviation = ? COLLATE NOCASE")
            .bind(&abbreviation)
            .fetch_one(&state.db)
            .await?;
    if exists > 0 {
        return Err(AppError::Conflict(
            "Unit abbreviation is already in use".into(),
        ));
    }

    let result = sqlx::query("INSERT INTO units (name, abbreviation, precision) VALUES (?, ?, ?)")
        .bind(&name)
        .bind(&abbreviation)
        .bind(precision)
        .execute(&state.db)
        .await?;
    let id = result.last_insert_rowid();
    auth::audit(
        &state.db,
        Some(session.user_id),
        "unit.created",
        Some("unit"),
        Some(id),
        None,
    )
    .await?;
    fetch_unit(&state.db, id).await
}

#[tauri::command]
pub async fn unit_update(state: State<'_, AppState>, id: i64, input: UnitInput) -> AppResult<Unit> {
    let session = state.require_permission("catalog.manage").await?;
    let before = fetch_unit(&state.db, id).await?;
    let name = required_text(&input.name, "Unit name", 50)?;
    let abbreviation = required_text(&input.abbreviation, "Unit abbreviation", 20)?;
    let precision = input.precision.unwrap_or(0);
    if !(0..=6).contains(&precision) {
        return Err(AppError::Validation(
            "Unit precision must be between 0 and 6".into(),
        ));
    }

    let exists: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM units WHERE abbreviation = ? COLLATE NOCASE AND id <> ?",
    )
    .bind(&abbreviation)
    .bind(id)
    .fetch_one(&state.db)
    .await?;
    if exists > 0 {
        return Err(AppError::Conflict(
            "Unit abbreviation is already in use".into(),
        ));
    }

    sqlx::query(
        "UPDATE units SET name = ?, abbreviation = ?, precision = ?, \
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    )
    .bind(&name)
    .bind(&abbreviation)
    .bind(precision)
    .bind(id)
    .execute(&state.db)
    .await?;

    auth::audit(
        &state.db,
        Some(session.user_id),
        "unit.updated",
        Some("unit"),
        Some(id),
        Some(&serde_json::json!({ "before": before }).to_string()),
    )
    .await?;
    fetch_unit(&state.db, id).await
}

#[tauri::command]
pub async fn unit_set_active(
    state: State<'_, AppState>,
    id: i64,
    is_active: bool,
) -> AppResult<Unit> {
    let session = state.require_permission("catalog.manage").await?;
    fetch_unit(&state.db, id).await?;
    sqlx::query(
        "UPDATE units SET is_active = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         WHERE id = ?",
    )
    .bind(i64::from(is_active))
    .bind(id)
    .execute(&state.db)
    .await?;
    auth::audit(
        &state.db,
        Some(session.user_id),
        "unit.status_changed",
        Some("unit"),
        Some(id),
        None,
    )
    .await?;
    fetch_unit(&state.db, id).await
}

#[tauri::command]
pub async fn item_list(
    state: State<'_, AppState>,
    search: Option<String>,
    category_id: Option<i64>,
    page: Option<i64>,
    page_size: Option<i64>,
    include_inactive: Option<bool>,
) -> AppResult<Paged<Item>> {
    state.require_permission("catalog.view").await?;
    let (page, page_size) = page_params(page, page_size);
    let search = search.unwrap_or_default().trim().to_string();
    let like = format!("%{search}%");
    let category_id = category_id.unwrap_or(0);
    let include_inactive = i64::from(include_inactive.unwrap_or(false));

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM items i \
         WHERE (? = 1 OR i.is_active = 1) \
           AND (? = 0 OR i.category_id = ?) \
           AND (? = '' OR i.name LIKE ? OR i.item_code LIKE ? OR IFNULL(i.hsn_code, '') LIKE ?)",
    )
    .bind(include_inactive)
    .bind(category_id)
    .bind(category_id)
    .bind(&search)
    .bind(&like)
    .bind(&like)
    .bind(&like)
    .fetch_one(&state.db)
    .await?;

    let items = sqlx::query_as::<_, Item>(&format!(
        "{ITEM_SELECT} \
         WHERE (? = 1 OR i.is_active = 1) \
           AND (? = 0 OR i.category_id = ?) \
           AND (? = '' OR i.name LIKE ? OR i.item_code LIKE ? OR IFNULL(i.hsn_code, '') LIKE ?) \
         ORDER BY i.name COLLATE NOCASE \
         LIMIT ? OFFSET ?"
    ))
    .bind(include_inactive)
    .bind(category_id)
    .bind(category_id)
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
pub async fn item_get(state: State<'_, AppState>, id: i64) -> AppResult<Item> {
    state.require_permission("catalog.view").await?;
    fetch_item(&state.db, id).await
}

#[tauri::command]
pub async fn item_create(state: State<'_, AppState>, input: ItemInput) -> AppResult<Item> {
    let session = state.require_permission("catalog.manage").await?;
    let item_code = required_text(&input.item_code, "Item code", 50)?;
    let name = required_text(&input.name, "Item name", 150)?;
    let purchase_rate_minor = non_negative(input.purchase_rate_minor, "Purchase rate")?;
    let selling_rate_minor = non_negative(input.selling_rate_minor, "Selling rate")?;
    let default_tax_rate_bps = input.default_tax_rate_bps.unwrap_or(0);
    if !(0..=10_000).contains(&default_tax_rate_bps) {
        return Err(AppError::Validation(
            "Tax rate must be between 0 and 100%".into(),
        ));
    }
    let reorder_level_milli = non_negative(input.reorder_level_milli, "Reorder level")?;

    ensure_reference(&state.db, "categories", input.category_id, "Category").await?;
    ensure_reference(&state.db, "units", input.default_unit_id, "Unit").await?;

    let exists: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM items WHERE item_code = ? COLLATE NOCASE")
            .bind(&item_code)
            .fetch_one(&state.db)
            .await?;
    if exists > 0 {
        return Err(AppError::Conflict("Item code is already in use".into()));
    }

    let result = sqlx::query(
        "INSERT INTO items \
         (item_code, name, category_id, default_unit_id, description, purchase_rate_minor, \
          selling_rate_minor, hsn_code, default_tax_rate_bps, reorder_level_milli) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&item_code)
    .bind(&name)
    .bind(input.category_id)
    .bind(input.default_unit_id)
    .bind(optional_text(input.description))
    .bind(purchase_rate_minor)
    .bind(selling_rate_minor)
    .bind(optional_text(input.hsn_code))
    .bind(default_tax_rate_bps)
    .bind(reorder_level_milli)
    .execute(&state.db)
    .await?;
    let id = result.last_insert_rowid();

    auth::audit(
        &state.db,
        Some(session.user_id),
        "item.created",
        Some("item"),
        Some(id),
        None,
    )
    .await?;
    fetch_item(&state.db, id).await
}

#[tauri::command]
pub async fn item_update(state: State<'_, AppState>, id: i64, input: ItemInput) -> AppResult<Item> {
    let session = state.require_permission("catalog.manage").await?;
    let before = fetch_item(&state.db, id).await?;
    let item_code = required_text(&input.item_code, "Item code", 50)?;
    let name = required_text(&input.name, "Item name", 150)?;
    let purchase_rate_minor = non_negative(input.purchase_rate_minor, "Purchase rate")?;
    let selling_rate_minor = non_negative(input.selling_rate_minor, "Selling rate")?;
    let default_tax_rate_bps = input.default_tax_rate_bps.unwrap_or(0);
    if !(0..=10_000).contains(&default_tax_rate_bps) {
        return Err(AppError::Validation(
            "Tax rate must be between 0 and 100%".into(),
        ));
    }
    let reorder_level_milli = non_negative(input.reorder_level_milli, "Reorder level")?;

    ensure_reference(&state.db, "categories", input.category_id, "Category").await?;
    ensure_reference(&state.db, "units", input.default_unit_id, "Unit").await?;

    let exists: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM items WHERE item_code = ? COLLATE NOCASE AND id <> ?",
    )
    .bind(&item_code)
    .bind(id)
    .fetch_one(&state.db)
    .await?;
    if exists > 0 {
        return Err(AppError::Conflict("Item code is already in use".into()));
    }

    sqlx::query(
        "UPDATE items SET item_code = ?, name = ?, category_id = ?, default_unit_id = ?, \
         description = ?, purchase_rate_minor = ?, selling_rate_minor = ?, hsn_code = ?, \
         default_tax_rate_bps = ?, reorder_level_milli = ?, \
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    )
    .bind(&item_code)
    .bind(&name)
    .bind(input.category_id)
    .bind(input.default_unit_id)
    .bind(optional_text(input.description))
    .bind(purchase_rate_minor)
    .bind(selling_rate_minor)
    .bind(optional_text(input.hsn_code))
    .bind(default_tax_rate_bps)
    .bind(reorder_level_milli)
    .bind(id)
    .execute(&state.db)
    .await?;

    auth::audit(
        &state.db,
        Some(session.user_id),
        "item.updated",
        Some("item"),
        Some(id),
        Some(&serde_json::json!({ "before": before }).to_string()),
    )
    .await?;
    fetch_item(&state.db, id).await
}

#[tauri::command]
pub async fn item_set_active(
    state: State<'_, AppState>,
    id: i64,
    is_active: bool,
) -> AppResult<Item> {
    let session = state.require_permission("catalog.manage").await?;
    fetch_item(&state.db, id).await?;
    sqlx::query(
        "UPDATE items SET is_active = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         WHERE id = ?",
    )
    .bind(i64::from(is_active))
    .bind(id)
    .execute(&state.db)
    .await?;
    auth::audit(
        &state.db,
        Some(session.user_id),
        "item.status_changed",
        Some("item"),
        Some(id),
        None,
    )
    .await?;
    fetch_item(&state.db, id).await
}
