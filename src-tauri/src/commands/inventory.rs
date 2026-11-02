use tauri::State;

use crate::error::AppResult;
use crate::models::{Paged, StockMovement, StockSummaryRow};
use crate::state::AppState;
use crate::validate::page_params;

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn stock_summary(
    state: State<'_, AppState>,
    search: Option<String>,
    include_inactive: Option<bool>,
    low_stock_only: Option<bool>,
    page: Option<i64>,
    page_size: Option<i64>,
) -> AppResult<Paged<StockSummaryRow>> {
    state.require_permission("inventory.view").await?;
    let (page, page_size) = page_params(page, page_size);
    let search = search.unwrap_or_default().trim().to_string();
    let like = format!("%{search}%");
    let include_inactive = i64::from(include_inactive.unwrap_or(false));
    let low_stock_only = i64::from(low_stock_only.unwrap_or(false));

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM items i \
         WHERE (? = 1 OR i.is_active = 1) \
           AND (? = '' OR i.name LIKE ? OR i.item_code LIKE ?) \
           AND (? = 0 OR (i.reorder_level_milli > 0 AND \
                COALESCE((SELECT SUM(sm.quantity_milli) FROM stock_movements sm \
                          WHERE sm.item_id = i.id), 0) < i.reorder_level_milli))",
    )
    .bind(include_inactive)
    .bind(&search)
    .bind(&like)
    .bind(&like)
    .bind(low_stock_only)
    .fetch_one(&state.db)
    .await?;

    let items = sqlx::query_as::<_, StockSummaryRow>(
        "SELECT i.id, i.item_code, i.name, u.abbreviation AS unit_abbreviation, \
                COALESCE(SUM(sm.quantity_milli), 0) AS quantity_milli, \
                i.reorder_level_milli, i.is_active \
         FROM items i \
         LEFT JOIN units u ON u.id = i.default_unit_id \
         LEFT JOIN stock_movements sm ON sm.item_id = i.id \
         WHERE (? = 1 OR i.is_active = 1) \
           AND (? = '' OR i.name LIKE ? OR i.item_code LIKE ?) \
         GROUP BY i.id, i.item_code, i.name, u.abbreviation, i.reorder_level_milli, i.is_active \
         HAVING (? = 0 OR (i.reorder_level_milli > 0 \
                AND COALESCE(SUM(sm.quantity_milli), 0) < i.reorder_level_milli)) \
         ORDER BY i.name COLLATE NOCASE LIMIT ? OFFSET ?",
    )
    .bind(include_inactive)
    .bind(&search)
    .bind(&like)
    .bind(&like)
    .bind(low_stock_only)
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
#[allow(clippy::too_many_arguments)]
pub async fn stock_movement_list(
    state: State<'_, AppState>,
    item_id: Option<i64>,
    movement_type: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
) -> AppResult<Paged<StockMovement>> {
    state.require_permission("inventory.view").await?;
    let (page, page_size) = page_params(page, page_size);
    let item_id = item_id.unwrap_or(0);
    let movement_type = movement_type.unwrap_or_default().trim().to_string();
    let date_from = date_from.unwrap_or_default().trim().to_string();
    let date_to = date_to.unwrap_or_default().trim().to_string();
    if !date_from.is_empty() {
        crate::commands::purchase::parse_date(&date_from, "From date")?;
    }
    if !date_to.is_empty() {
        crate::commands::purchase::parse_date(&date_to, "To date")?;
    }

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM stock_movements sm \
         WHERE (? = 0 OR sm.item_id = ?) \
           AND (? = '' OR sm.movement_type = ?) \
           AND (? = '' OR sm.movement_date >= ?) \
           AND (? = '' OR sm.movement_date <= ?)",
    )
    .bind(item_id)
    .bind(item_id)
    .bind(&movement_type)
    .bind(&movement_type)
    .bind(&date_from)
    .bind(&date_from)
    .bind(&date_to)
    .bind(&date_to)
    .fetch_one(&state.db)
    .await?;

    let items = sqlx::query_as::<_, StockMovement>(
        "SELECT sm.id, sm.item_id, i.name AS item_name, sm.movement_type, sm.quantity_milli, \
                u.abbreviation AS unit_abbreviation, sm.source_type, sm.source_id, \
                sm.movement_date, sm.notes, sm.created_at \
         FROM stock_movements sm \
         JOIN items i ON i.id = sm.item_id \
         LEFT JOIN units u ON u.id = sm.unit_id \
         WHERE (? = 0 OR sm.item_id = ?) \
           AND (? = '' OR sm.movement_type = ?) \
           AND (? = '' OR sm.movement_date >= ?) \
           AND (? = '' OR sm.movement_date <= ?) \
         ORDER BY sm.movement_date DESC, sm.id DESC LIMIT ? OFFSET ?",
    )
    .bind(item_id)
    .bind(item_id)
    .bind(&movement_type)
    .bind(&movement_type)
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
