use tauri::State;

use crate::error::{AppError, AppResult};
use crate::models::{ImportResult, ImportRowResult};
use crate::state::AppState;
use crate::validate::{optional_email, optional_gstin, optional_text, required_text};

#[derive(Debug, Clone, Copy)]
enum ImportEntity {
    Customers,
    Suppliers,
    Items,
}

impl ImportEntity {
    fn parse(value: &str) -> AppResult<Self> {
        match value.trim().to_lowercase().as_str() {
            "customers" => Ok(Self::Customers),
            "suppliers" => Ok(Self::Suppliers),
            "items" => Ok(Self::Items),
            _ => Err(AppError::Validation(
                "Import type must be customers, suppliers, or items".into(),
            )),
        }
    }

    fn permission(self) -> &'static str {
        match self {
            Self::Customers => "customers.manage",
            Self::Suppliers => "suppliers.manage",
            Self::Items => "catalog.manage",
        }
    }

    fn columns(self) -> usize {
        match self {
            Self::Customers => 8,
            Self::Suppliers => 7,
            Self::Items => 10,
        }
    }
}

fn is_blank_row(values: &[String]) -> bool {
    values.iter().all(|value| value.trim().is_empty())
}

fn parse_number(value: &str, field: &str, max: Option<f64>) -> AppResult<f64> {
    let value = value.trim().replace(',', "");
    if value.is_empty() {
        return Ok(0.0);
    }
    let parsed: f64 = value
        .parse()
        .map_err(|_| AppError::Validation(format!("{field} must be a number")))?;
    if !parsed.is_finite() || parsed < 0.0 {
        return Err(AppError::Validation(format!("{field} cannot be negative")));
    }
    if let Some(max) = max {
        if parsed > max {
            return Err(AppError::Validation(format!("{field} cannot exceed {max}")));
        }
    }
    Ok(parsed)
}

fn money_minor(value: &str, field: &str) -> AppResult<i64> {
    Ok((parse_number(value, field, None)? * 100.0).round() as i64)
}

async fn category_id(conn: &mut sqlx::SqliteConnection, name: &str) -> AppResult<Option<i64>> {
    let name = name.trim();
    if name.is_empty() {
        return Ok(None);
    }
    sqlx::query_scalar("SELECT id FROM categories WHERE name = ? COLLATE NOCASE")
        .bind(name)
        .fetch_optional(&mut *conn)
        .await?
        .ok_or_else(|| AppError::Validation(format!("Unknown category: {name}")))
        .map(Some)
}

async fn unit_id(conn: &mut sqlx::SqliteConnection, abbreviation: &str) -> AppResult<Option<i64>> {
    let abbreviation = abbreviation.trim();
    if abbreviation.is_empty() {
        return Ok(None);
    }
    sqlx::query_scalar("SELECT id FROM units WHERE abbreviation = ? COLLATE NOCASE")
        .bind(abbreviation)
        .fetch_optional(&mut *conn)
        .await?
        .ok_or_else(|| AppError::Validation(format!("Unknown unit: {abbreviation}")))
        .map(Some)
}

async fn validate_row(
    conn: &mut sqlx::SqliteConnection,
    entity: ImportEntity,
    row: &[String],
) -> AppResult<String> {
    if row.len() != entity.columns() {
        return Err(AppError::Validation(format!(
            "Expected {} columns, found {}",
            entity.columns(),
            row.len()
        )));
    }
    if is_blank_row(row) {
        return Ok("Blank row will be skipped".into());
    }
    match entity {
        ImportEntity::Customers => {
            required_text(&row[0], "Customer name", 150)?;
            optional_email(Some(row[2].clone()))?;
            optional_gstin(Some(row[3].clone()))?;
            money_minor(&row[6], "Opening balance")?;
            Ok("Ready to import".into())
        }
        ImportEntity::Suppliers => {
            required_text(&row[0], "Supplier name", 150)?;
            optional_email(Some(row[2].clone()))?;
            optional_gstin(Some(row[3].clone()))?;
            money_minor(&row[5], "Opening balance")?;
            Ok("Ready to import".into())
        }
        ImportEntity::Items => {
            required_text(&row[0], "Item code", 50)?;
            required_text(&row[1], "Item name", 150)?;
            category_id(conn, &row[2]).await?;
            unit_id(conn, &row[3]).await?;
            money_minor(&row[4], "Purchase rate")?;
            money_minor(&row[5], "Selling rate")?;
            parse_number(&row[7], "Tax rate", Some(100.0))?;
            parse_number(&row[8], "Reorder level", None)?;
            let code = row[0].trim();
            let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM items WHERE item_code = ?")
                .bind(code)
                .fetch_one(&mut *conn)
                .await?;
            if exists > 0 {
                return Err(AppError::Validation(format!(
                    "Item code already exists: {code}"
                )));
            }
            Ok("Ready to import".into())
        }
    }
}

async fn insert_row(
    conn: &mut sqlx::SqliteConnection,
    entity: ImportEntity,
    row: &[String],
) -> AppResult<()> {
    match entity {
        ImportEntity::Customers => {
            let name = required_text(&row[0], "Customer name", 150)?;
            let email = optional_email(Some(row[2].clone()))?;
            let gstin = optional_gstin(Some(row[3].clone()))?;
            let opening = money_minor(&row[6], "Opening balance")?;
            let result = sqlx::query(
                "INSERT INTO customers (name, phone, email, gstin, billing_address, \
                 shipping_address, opening_balance_minor, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&name)
            .bind(optional_text(Some(row[1].clone())))
            .bind(email)
            .bind(gstin)
            .bind(optional_text(Some(row[4].clone())))
            .bind(optional_text(Some(row[5].clone())))
            .bind(opening)
            .bind(optional_text(Some(row[7].clone())))
            .execute(&mut *conn)
            .await?;
            let id = result.last_insert_rowid();
            let code = format!("CUS-{id:05}");
            sqlx::query("UPDATE customers SET customer_code = ? WHERE id = ?")
                .bind(code)
                .bind(id)
                .execute(&mut *conn)
                .await?;
        }
        ImportEntity::Suppliers => {
            let name = required_text(&row[0], "Supplier name", 150)?;
            let email = optional_email(Some(row[2].clone()))?;
            let gstin = optional_gstin(Some(row[3].clone()))?;
            let opening = money_minor(&row[5], "Opening balance")?;
            let result = sqlx::query(
                "INSERT INTO suppliers (name, phone, email, gstin, address, \
                 opening_balance_minor, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&name)
            .bind(optional_text(Some(row[1].clone())))
            .bind(email)
            .bind(gstin)
            .bind(optional_text(Some(row[4].clone())))
            .bind(opening)
            .bind(optional_text(Some(row[6].clone())))
            .execute(&mut *conn)
            .await?;
            let id = result.last_insert_rowid();
            let code = format!("SUP-{id:05}");
            sqlx::query("UPDATE suppliers SET supplier_code = ? WHERE id = ?")
                .bind(code)
                .bind(id)
                .execute(&mut *conn)
                .await?;
        }
        ImportEntity::Items => {
            let item_code = required_text(&row[0], "Item code", 50)?;
            let name = required_text(&row[1], "Item name", 150)?;
            let category = category_id(conn, &row[2]).await?;
            let unit = unit_id(conn, &row[3]).await?;
            let purchase = money_minor(&row[4], "Purchase rate")?;
            let selling = money_minor(&row[5], "Selling rate")?;
            let tax_bps = (parse_number(&row[7], "Tax rate", Some(100.0))? * 100.0).round() as i64;
            let reorder_milli =
                (parse_number(&row[8], "Reorder level", None)? * 1000.0).round() as i64;
            sqlx::query(
                "INSERT INTO items (item_code, name, category_id, default_unit_id, \
                 purchase_rate_minor, selling_rate_minor, hsn_code, default_tax_rate_bps, \
                 reorder_level_milli, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&item_code)
            .bind(&name)
            .bind(category)
            .bind(unit)
            .bind(purchase)
            .bind(selling)
            .bind(optional_text(Some(row[6].clone())))
            .bind(tax_bps)
            .bind(reorder_milli)
            .bind(optional_text(Some(row[9].clone())))
            .execute(&mut *conn)
            .await?;
        }
    }
    Ok(())
}

async fn validate_all(
    state: &AppState,
    entity: ImportEntity,
    rows: &[Vec<String>],
) -> AppResult<Vec<ImportRowResult>> {
    let mut conn = state.db.acquire().await?;
    let mut results = Vec::with_capacity(rows.len());
    for (index, row) in rows.iter().enumerate() {
        let row_number = (index + 1) as i64;
        let result = validate_row(&mut conn, entity, row).await;
        results.push(ImportRowResult {
            row_number,
            valid: result.is_ok(),
            message: result.unwrap_or_else(|error| error.to_string()),
        });
    }
    Ok(results)
}

#[tauri::command]
pub async fn import_validate(
    state: State<'_, AppState>,
    entity: String,
    rows: Vec<Vec<String>>,
) -> AppResult<Vec<ImportRowResult>> {
    let import_entity = ImportEntity::parse(&entity)?;
    state.require_permission(import_entity.permission()).await?;
    if rows.is_empty() {
        return Err(AppError::Validation("No rows to validate".into()));
    }
    validate_all(&state, import_entity, &rows).await
}

#[tauri::command]
pub async fn import_commit(
    state: State<'_, AppState>,
    entity: String,
    rows: Vec<Vec<String>>,
) -> AppResult<ImportResult> {
    let import_entity = ImportEntity::parse(&entity)?;
    let session = state.require_permission(import_entity.permission()).await?;
    if rows.is_empty() {
        return Err(AppError::Validation("No rows to import".into()));
    }
    let validation = validate_all(&state, import_entity, &rows).await?;
    if let Some(invalid) = validation.iter().find(|row| !row.valid) {
        return Err(AppError::Validation(format!(
            "Row {}: {}",
            invalid.row_number, invalid.message
        )));
    }

    let mut tx = state.db.begin().await?;
    let mut imported = 0;
    let mut skipped = 0;
    for row in &rows {
        if is_blank_row(row) {
            skipped += 1;
            continue;
        }
        insert_row(&mut tx, import_entity, row).await?;
        imported += 1;
    }
    sqlx::query(
        "INSERT INTO audit_logs (user_id, action, entity_type, reason) \
         VALUES (?, 'data.imported', 'import', ?)",
    )
    .bind(session.user_id)
    .bind(format!("{entity}: {imported} rows"))
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(ImportResult {
        imported,
        skipped,
        rows: validation,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth;
    use crate::db;

    fn state_with(pool: sqlx::SqlitePool) -> AppState {
        AppState::new(pool, std::env::temp_dir())
    }

    #[tokio::test]
    async fn imports_customers_and_reports_invalid_rows() {
        let pool = db::connect_memory().await.unwrap();
        auth::ensure_default_admin(&pool).await.unwrap();
        let state = state_with(pool);
        let rows = vec![vec![
            "Ravi Kumar".into(),
            "9999999999".into(),
            "ravi@example.com".into(),
            "".into(),
            "Main road".into(),
            "".into(),
            "125.50".into(),
            "Imported".into(),
        ]];
        let result = validate_all(&state, ImportEntity::Customers, &rows)
            .await
            .unwrap();
        assert!(result[0].valid);
        let mut tx = state.db.begin().await.unwrap();
        for row in &rows {
            insert_row(&mut tx, ImportEntity::Customers, row)
                .await
                .unwrap();
        }
        tx.commit().await.unwrap();
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM customers")
            .fetch_one(&state.db)
            .await
            .unwrap();
        assert_eq!(count, 1);
        let opening: i64 = sqlx::query_scalar("SELECT opening_balance_minor FROM customers")
            .fetch_one(&state.db)
            .await
            .unwrap();
        assert_eq!(opening, 12_550);

        let bad = vec![vec!["".into(); 8]];
        let result = validate_all(&state, ImportEntity::Customers, &bad)
            .await
            .unwrap();
        assert!(!result[0].valid || result[0].message.contains("Blank"));
    }

    #[tokio::test]
    async fn imports_items_with_master_lookups() {
        let pool = db::connect_memory().await.unwrap();
        auth::ensure_default_admin(&pool).await.unwrap();
        sqlx::query("INSERT INTO categories (name) VALUES ('Cement')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO units (name, abbreviation) VALUES ('Bag', 'BAG')")
            .execute(&pool)
            .await
            .unwrap();
        let state = state_with(pool);
        let rows = vec![vec![
            "CEM-001".into(),
            "OPC Cement".into(),
            "Cement".into(),
            "BAG".into(),
            "400".into(),
            "450".into(),
            "2523".into(),
            "18".into(),
            "10".into(),
            "50kg bag".into(),
        ]];
        let result = validate_all(&state, ImportEntity::Items, &rows)
            .await
            .unwrap();
        assert!(result[0].valid, "{}", result[0].message);
        let mut tx = state.db.begin().await.unwrap();
        insert_row(&mut tx, ImportEntity::Items, &rows[0])
            .await
            .unwrap();
        tx.commit().await.unwrap();
        let row: (i64, i64, i64) = sqlx::query_as(
            "SELECT purchase_rate_minor, default_tax_rate_bps, reorder_level_milli FROM items",
        )
        .fetch_one(&state.db)
        .await
        .unwrap();
        assert_eq!(row, (40_000, 1_800, 10_000));
    }
}
