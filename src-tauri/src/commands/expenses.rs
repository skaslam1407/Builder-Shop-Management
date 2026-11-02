use tauri::State;

use crate::error::{AppError, AppResult};
use crate::models::{Expense, ExpenseCategory, ExpenseCategoryInput, ExpenseInput, Paged};
use crate::state::{AppState, Session};
use crate::validate::{optional_text, page_params, payment_mode, required_text};

const EXPENSE_SELECT: &str = "SELECT e.id, e.expense_category_id, c.name AS category_name, \
    e.expense_date, e.description, e.amount_minor, e.payment_mode, e.reference_number, e.notes, \
    e.created_by, e.created_at \
    FROM expenses e LEFT JOIN expense_categories c ON c.id = e.expense_category_id";

#[tauri::command]
pub async fn expense_category_list(
    state: State<'_, AppState>,
    include_inactive: Option<bool>,
) -> AppResult<Vec<ExpenseCategory>> {
    state.require_permission("expenses.view").await?;
    let include_inactive = i64::from(include_inactive.unwrap_or(false));
    let categories = sqlx::query_as::<_, ExpenseCategory>(
        "SELECT id, name, is_active FROM expense_categories \
         WHERE (? = 1 OR is_active = 1) ORDER BY name COLLATE NOCASE",
    )
    .bind(include_inactive)
    .fetch_all(&state.db)
    .await?;
    Ok(categories)
}

#[tauri::command]
pub async fn expense_category_create(
    state: State<'_, AppState>,
    input: ExpenseCategoryInput,
) -> AppResult<ExpenseCategory> {
    let session = state.require_permission("expenses.manage").await?;
    let name = required_text(&input.name, "Category name", 100)?;
    let mut tx = state.db.begin().await?;
    let exists: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM expense_categories WHERE name = ? COLLATE NOCASE")
            .bind(&name)
            .fetch_one(&mut *tx)
            .await?;
    if exists > 0 {
        return Err(AppError::Conflict(
            "An expense category with this name already exists".into(),
        ));
    }
    let id: i64 =
        sqlx::query_scalar("INSERT INTO expense_categories (name) VALUES (?) RETURNING id")
            .bind(&name)
            .fetch_one(&mut *tx)
            .await?;
    sqlx::query(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id) \
         VALUES (?, 'expense_category.created', 'expense_category', ?)",
    )
    .bind(session.user_id)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    Ok(sqlx::query_as::<_, ExpenseCategory>(
        "SELECT id, name, is_active FROM expense_categories WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?)
}

#[tauri::command]
pub async fn expense_category_update(
    state: State<'_, AppState>,
    id: i64,
    input: ExpenseCategoryInput,
) -> AppResult<ExpenseCategory> {
    let session = state.require_permission("expenses.manage").await?;
    let name = required_text(&input.name, "Category name", 100)?;
    let exists: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM expense_categories WHERE name = ? COLLATE NOCASE AND id <> ?",
    )
    .bind(&name)
    .bind(id)
    .fetch_one(&state.db)
    .await?;
    if exists > 0 {
        return Err(AppError::Conflict(
            "An expense category with this name already exists".into(),
        ));
    }
    let result = sqlx::query("UPDATE expense_categories SET name = ? WHERE id = ?")
        .bind(&name)
        .bind(id)
        .execute(&state.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Expense category not found".into()));
    }
    crate::auth::audit(
        &state.db,
        Some(session.user_id),
        "expense_category.updated",
        Some("expense_category"),
        Some(id),
        None,
    )
    .await?;

    Ok(sqlx::query_as::<_, ExpenseCategory>(
        "SELECT id, name, is_active FROM expense_categories WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?)
}

#[tauri::command]
pub async fn expense_category_set_active(
    state: State<'_, AppState>,
    id: i64,
    is_active: bool,
) -> AppResult<ExpenseCategory> {
    let session = state.require_permission("expenses.manage").await?;
    let result = sqlx::query("UPDATE expense_categories SET is_active = ? WHERE id = ?")
        .bind(i64::from(is_active))
        .bind(id)
        .execute(&state.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Expense category not found".into()));
    }
    crate::auth::audit(
        &state.db,
        Some(session.user_id),
        if is_active {
            "expense_category.activated"
        } else {
            "expense_category.deactivated"
        },
        Some("expense_category"),
        Some(id),
        None,
    )
    .await?;

    Ok(sqlx::query_as::<_, ExpenseCategory>(
        "SELECT id, name, is_active FROM expense_categories WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?)
}

#[tauri::command]
pub async fn expense_create(state: State<'_, AppState>, input: ExpenseInput) -> AppResult<Expense> {
    let session = state.require_permission("expenses.manage").await?;
    create_expense(state.inner(), &session, input).await
}

pub(crate) async fn create_expense(
    state: &AppState,
    session: &Session,
    input: ExpenseInput,
) -> AppResult<Expense> {
    let date = crate::commands::purchase::parse_date(&input.expense_date, "Expense date")?;
    let expense_date = date.format("%Y-%m-%d").to_string();
    let description = required_text(&input.description, "Description", 300)?;
    if input.amount_minor <= 0 {
        return Err(AppError::Validation(
            "Expense amount must be greater than zero".into(),
        ));
    }
    let mode = payment_mode(&input.payment_mode)?;
    let notes = optional_text(input.notes);
    let reference_number = optional_text(input.reference_number);

    if let Some(category_id) = input.expense_category_id {
        let active: Option<bool> =
            sqlx::query_scalar("SELECT is_active FROM expense_categories WHERE id = ?")
                .bind(category_id)
                .fetch_optional(&state.db)
                .await?;
        match active {
            None => {
                return Err(AppError::Validation(
                    "Selected expense category does not exist".into(),
                ));
            }
            Some(false) => {
                return Err(AppError::Validation(
                    "Selected expense category is inactive".into(),
                ));
            }
            Some(true) => {}
        }
    }

    let mut tx = state.db.begin().await?;
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO expenses \
         (expense_category_id, expense_date, description, amount_minor, payment_mode, \
          reference_number, notes, created_by) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(input.expense_category_id)
    .bind(&expense_date)
    .bind(&description)
    .bind(input.amount_minor)
    .bind(&mode)
    .bind(&reference_number)
    .bind(&notes)
    .bind(session.user_id)
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id) \
         VALUES (?, 'expense.created', 'expense', ?)",
    )
    .bind(session.user_id)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    Ok(
        sqlx::query_as::<_, Expense>(&format!("{EXPENSE_SELECT} WHERE e.id = ?"))
            .bind(id)
            .fetch_one(&state.db)
            .await?,
    )
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn expense_list(
    state: State<'_, AppState>,
    search: Option<String>,
    category_id: Option<i64>,
    date_from: Option<String>,
    date_to: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
) -> AppResult<Paged<Expense>> {
    state.require_permission("expenses.view").await?;
    let (page, page_size) = page_params(page, page_size);
    let search = search.unwrap_or_default().trim().to_string();
    let like = format!("%{search}%");
    let date_from = optional_text(date_from).unwrap_or_default();
    let date_to = optional_text(date_to).unwrap_or_default();
    if !date_from.is_empty() {
        crate::commands::purchase::parse_date(&date_from, "From date")?;
    }
    if !date_to.is_empty() {
        crate::commands::purchase::parse_date(&date_to, "To date")?;
    }
    let category_id = category_id.unwrap_or(0);

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM expenses e LEFT JOIN expense_categories c ON c.id = e.expense_category_id \
         WHERE (? = '' OR e.description LIKE ? OR IFNULL(c.name, '') LIKE ? \
                OR IFNULL(e.reference_number, '') LIKE ?) \
           AND (? = 0 OR e.expense_category_id = ?) \
           AND (? = '' OR e.expense_date >= ?) \
           AND (? = '' OR e.expense_date <= ?)",
    )
    .bind(&search)
    .bind(&like)
    .bind(&like)
    .bind(&like)
    .bind(category_id)
    .bind(category_id)
    .bind(&date_from)
    .bind(&date_from)
    .bind(&date_to)
    .bind(&date_to)
    .fetch_one(&state.db)
    .await?;

    let items = sqlx::query_as::<_, Expense>(&format!(
        "{EXPENSE_SELECT} \
         WHERE (? = '' OR e.description LIKE ? OR IFNULL(c.name, '') LIKE ? \
                OR IFNULL(e.reference_number, '') LIKE ?) \
           AND (? = 0 OR e.expense_category_id = ?) \
           AND (? = '' OR e.expense_date >= ?) \
           AND (? = '' OR e.expense_date <= ?) \
         ORDER BY e.expense_date DESC, e.id DESC LIMIT ? OFFSET ?"
    ))
    .bind(&search)
    .bind(&like)
    .bind(&like)
    .bind(&like)
    .bind(category_id)
    .bind(category_id)
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
