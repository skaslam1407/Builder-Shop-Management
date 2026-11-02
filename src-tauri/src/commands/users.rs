use std::collections::HashSet;

use sqlx::SqlitePool;
use tauri::State;

use crate::auth;
use crate::error::{AppError, AppResult};
use crate::models::{Paged, RoleSummary, UserAccount, UserCreateInput, UserUpdateInput};
use crate::state::AppState;
use crate::validate::{page_params, required_text};

fn validate_username(value: &str) -> AppResult<String> {
    let username = required_text(value, "Username", 50)?.to_lowercase();
    if username.chars().count() < 3
        || !username
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
    {
        return Err(AppError::Validation(
            "Username must be at least 3 characters and use letters, numbers, dot, underscore, or hyphen"
                .into(),
        ));
    }
    Ok(username)
}

fn validate_password(value: &str) -> AppResult<()> {
    if value.chars().count() < 8 {
        return Err(AppError::Validation(
            "Password must be at least 8 characters".into(),
        ));
    }
    Ok(())
}

async fn roles_for(pool: &SqlitePool, user_id: i64) -> AppResult<Vec<RoleSummary>> {
    Ok(sqlx::query_as::<_, RoleSummary>(
        "SELECT r.id, r.name, r.description FROM roles r \
         JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ? ORDER BY r.name",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?)
}

async fn user_for(pool: &SqlitePool, id: i64) -> AppResult<UserAccount> {
    #[allow(clippy::type_complexity)]
    let row: Option<(i64, String, String, bool, bool, Option<String>, String)> = sqlx::query_as(
        "SELECT id, username, display_name, is_active, must_change_password, \
             last_login_at, created_at FROM users WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    let Some((
        id,
        username,
        display_name,
        is_active,
        must_change_password,
        last_login_at,
        created_at,
    )) = row
    else {
        return Err(AppError::NotFound("User not found".into()));
    };
    Ok(UserAccount {
        id,
        username,
        display_name,
        is_active,
        must_change_password,
        last_login_at,
        created_at,
        roles: roles_for(pool, id).await?,
    })
}

async fn normalize_role_ids(pool: &SqlitePool, role_ids: &[i64]) -> AppResult<Vec<i64>> {
    if role_ids.is_empty() {
        return Err(AppError::Validation("At least one role is required".into()));
    }
    let unique: HashSet<i64> = role_ids.iter().copied().collect();
    let mut valid = Vec::new();
    for role_id in unique {
        let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM roles WHERE id = ?")
            .bind(role_id)
            .fetch_one(pool)
            .await?;
        if exists == 0 {
            return Err(AppError::Validation(
                "One or more roles do not exist".into(),
            ));
        }
        valid.push(role_id);
    }
    valid.sort_unstable();
    Ok(valid)
}

async fn is_admin_role(pool: &SqlitePool, role_ids: &[i64]) -> AppResult<bool> {
    for role_id in role_ids {
        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM roles WHERE name = 'Admin' AND id = ?")
                .bind(role_id)
                .fetch_one(pool)
                .await?;
        if count > 0 {
            return Ok(true);
        }
    }
    Ok(false)
}

async fn other_active_admins(pool: &SqlitePool, user_id: i64) -> AppResult<i64> {
    Ok(sqlx::query_scalar(
        "SELECT COUNT(DISTINCT u.id) FROM users u \
         JOIN user_roles ur ON ur.user_id = u.id \
         JOIN roles r ON r.id = ur.role_id \
         WHERE r.name = 'Admin' AND u.is_active = 1 AND u.id <> ?",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?)
}

async fn ensure_admin_preserved(
    pool: &SqlitePool,
    user_id: i64,
    role_ids: &[i64],
    is_active: bool,
) -> AppResult<()> {
    if is_active && is_admin_role(pool, role_ids).await? {
        return Ok(());
    }
    if other_active_admins(pool, user_id).await? == 0 {
        return Err(AppError::Conflict(
            "The last active administrator must keep the Admin role and stay active".into(),
        ));
    }
    Ok(())
}

async fn replace_roles(
    conn: &mut sqlx::SqliteConnection,
    user_id: i64,
    role_ids: &[i64],
) -> AppResult<()> {
    sqlx::query("DELETE FROM user_roles WHERE user_id = ?")
        .bind(user_id)
        .execute(&mut *conn)
        .await?;
    for role_id in role_ids {
        sqlx::query("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)")
            .bind(user_id)
            .bind(role_id)
            .execute(&mut *conn)
            .await?;
    }
    Ok(())
}

async fn list_users(
    pool: &SqlitePool,
    search: &str,
    page: i64,
    page_size: i64,
) -> AppResult<Paged<UserAccount>> {
    let search = search.trim();
    let like = format!("%{search}%");
    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM users WHERE ? = '' OR username LIKE ? OR display_name LIKE ?",
    )
    .bind(search)
    .bind(&like)
    .bind(&like)
    .fetch_one(pool)
    .await?;
    let ids: Vec<i64> = sqlx::query_scalar(
        "SELECT id FROM users WHERE ? = '' OR username LIKE ? OR display_name LIKE ? \
         ORDER BY username COLLATE NOCASE LIMIT ? OFFSET ?",
    )
    .bind(search)
    .bind(&like)
    .bind(&like)
    .bind(page_size)
    .bind((page - 1) * page_size)
    .fetch_all(pool)
    .await?;
    let mut items = Vec::with_capacity(ids.len());
    for id in ids {
        items.push(user_for(pool, id).await?);
    }
    Ok(Paged {
        items,
        total,
        page,
        page_size,
    })
}

async fn create_user(
    pool: &SqlitePool,
    actor_id: i64,
    input: UserCreateInput,
) -> AppResult<UserAccount> {
    let username = validate_username(&input.username)?;
    let display_name = required_text(&input.display_name, "Display name", 100)?;
    validate_password(&input.password)?;
    let role_ids = normalize_role_ids(pool, &input.role_ids).await?;
    let must_change_password = input.must_change_password.unwrap_or(true);

    let exists: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE username = ? COLLATE NOCASE")
            .bind(&username)
            .fetch_one(pool)
            .await?;
    if exists > 0 {
        return Err(AppError::Conflict("Username is already in use".into()));
    }

    let hash = auth::hash_password(&input.password)?;
    let mut tx = pool.begin().await?;
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO users (username, display_name, password_hash, must_change_password) \
         VALUES (?, ?, ?, ?) RETURNING id",
    )
    .bind(&username)
    .bind(&display_name)
    .bind(hash)
    .bind(must_change_password)
    .fetch_one(&mut *tx)
    .await?;
    for role_id in &role_ids {
        sqlx::query("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)")
            .bind(id)
            .bind(role_id)
            .execute(&mut *tx)
            .await?;
    }
    sqlx::query(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id) \
         VALUES (?, 'user.created', 'user', ?)",
    )
    .bind(actor_id)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    user_for(pool, id).await
}

async fn update_user(
    pool: &SqlitePool,
    actor_id: i64,
    id: i64,
    input: UserUpdateInput,
) -> AppResult<UserAccount> {
    let existing = user_for(pool, id).await?;
    let display_name = required_text(&input.display_name, "Display name", 100)?;
    let role_ids = normalize_role_ids(pool, &input.role_ids).await?;
    if id == actor_id && !input.is_active {
        return Err(AppError::Validation(
            "You cannot deactivate your own account".into(),
        ));
    }
    ensure_admin_preserved(pool, id, &role_ids, input.is_active).await?;

    let mut tx = pool.begin().await?;
    sqlx::query(
        "UPDATE users SET display_name = ?, is_active = ?, must_change_password = ?, \
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    )
    .bind(&display_name)
    .bind(input.is_active)
    .bind(
        input
            .must_change_password
            .unwrap_or(existing.must_change_password),
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;
    replace_roles(&mut tx, id, &role_ids).await?;
    sqlx::query(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id) \
         VALUES (?, 'user.updated', 'user', ?)",
    )
    .bind(actor_id)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    user_for(pool, id).await
}

async fn set_active(
    pool: &SqlitePool,
    actor_id: i64,
    id: i64,
    is_active: bool,
) -> AppResult<UserAccount> {
    let existing = user_for(pool, id).await?;
    if id == actor_id && !is_active {
        return Err(AppError::Validation(
            "You cannot deactivate your own account".into(),
        ));
    }
    let role_ids: Vec<i64> = existing.roles.iter().map(|role| role.id).collect();
    ensure_admin_preserved(pool, id, &role_ids, is_active).await?;
    sqlx::query(
        "UPDATE users SET is_active = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         WHERE id = ?",
    )
    .bind(is_active)
    .bind(id)
    .execute(pool)
    .await?;
    auth::audit(
        pool,
        Some(actor_id),
        if is_active {
            "user.activated"
        } else {
            "user.deactivated"
        },
        Some("user"),
        Some(id),
        None,
    )
    .await?;
    user_for(pool, id).await
}

async fn reset_password(
    pool: &SqlitePool,
    actor_id: i64,
    id: i64,
    new_password: &str,
) -> AppResult<()> {
    validate_password(new_password)?;
    user_for(pool, id).await?;
    let hash = auth::hash_password(new_password)?;
    sqlx::query(
        "UPDATE users SET password_hash = ?, must_change_password = 1, \
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    )
    .bind(hash)
    .bind(id)
    .execute(pool)
    .await?;
    auth::audit(
        pool,
        Some(actor_id),
        "user.password_reset",
        Some("user"),
        Some(id),
        None,
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn user_list(
    state: State<'_, AppState>,
    search: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
) -> AppResult<Paged<UserAccount>> {
    state.require_permission("users.manage").await?;
    let (page, page_size) = page_params(page, page_size);
    list_users(&state.db, &search.unwrap_or_default(), page, page_size).await
}

#[tauri::command]
pub async fn role_list(state: State<'_, AppState>) -> AppResult<Vec<RoleSummary>> {
    state.require_permission("users.manage").await?;
    Ok(
        sqlx::query_as::<_, RoleSummary>("SELECT id, name, description FROM roles ORDER BY name")
            .fetch_all(&state.db)
            .await?,
    )
}

#[tauri::command]
pub async fn user_create(
    state: State<'_, AppState>,
    input: UserCreateInput,
) -> AppResult<UserAccount> {
    let session = state.require_permission("users.manage").await?;
    create_user(&state.db, session.user_id, input).await
}

#[tauri::command]
pub async fn user_update(
    state: State<'_, AppState>,
    id: i64,
    input: UserUpdateInput,
) -> AppResult<UserAccount> {
    let session = state.require_permission("users.manage").await?;
    update_user(&state.db, session.user_id, id, input).await
}

#[tauri::command]
pub async fn user_set_active(
    state: State<'_, AppState>,
    id: i64,
    is_active: bool,
) -> AppResult<UserAccount> {
    let session = state.require_permission("users.manage").await?;
    set_active(&state.db, session.user_id, id, is_active).await
}

#[tauri::command]
pub async fn user_reset_password(
    state: State<'_, AppState>,
    id: i64,
    new_password: String,
) -> AppResult<()> {
    let session = state.require_permission("users.manage").await?;
    reset_password(&state.db, session.user_id, id, &new_password).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    async fn admin_id(pool: &SqlitePool) -> i64 {
        sqlx::query_scalar("SELECT id FROM users WHERE username = 'admin'")
            .fetch_one(pool)
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn creates_updates_and_resets_user() {
        let pool = db::connect_memory().await.unwrap();
        auth::ensure_default_admin(&pool).await.unwrap();
        let actor = admin_id(&pool).await;
        let viewer_role: i64 = sqlx::query_scalar("SELECT id FROM roles WHERE name = 'Viewer'")
            .fetch_one(&pool)
            .await
            .unwrap();

        let created = create_user(
            &pool,
            actor,
            UserCreateInput {
                username: "cashier".into(),
                display_name: "Cashier".into(),
                password: "secret123".into(),
                role_ids: vec![viewer_role],
                must_change_password: Some(true),
            },
        )
        .await
        .unwrap();
        assert_eq!(created.username, "cashier");
        assert_eq!(created.roles.len(), 1);

        let updated = update_user(
            &pool,
            actor,
            created.id,
            UserUpdateInput {
                display_name: "Front desk".into(),
                role_ids: vec![viewer_role],
                is_active: false,
                must_change_password: None,
            },
        )
        .await
        .unwrap();
        assert!(!updated.is_active);

        reset_password(&pool, actor, created.id, "newsecret1")
            .await
            .unwrap();
        let must_change: bool =
            sqlx::query_scalar("SELECT must_change_password FROM users WHERE id = ?")
                .bind(created.id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(must_change);
    }

    #[tokio::test]
    async fn protects_the_last_active_admin() {
        let pool = db::connect_memory().await.unwrap();
        auth::ensure_default_admin(&pool).await.unwrap();
        let actor = admin_id(&pool).await;
        let viewer_role: i64 = sqlx::query_scalar("SELECT id FROM roles WHERE name = 'Viewer'")
            .fetch_one(&pool)
            .await
            .unwrap();

        let result = update_user(
            &pool,
            actor,
            actor,
            UserUpdateInput {
                display_name: "Administrator".into(),
                role_ids: vec![viewer_role],
                is_active: true,
                must_change_password: None,
            },
        )
        .await;
        assert!(result.is_err());

        let result = set_active(&pool, actor, actor, false).await;
        assert!(result.is_err());
    }

    #[test]
    fn validates_username_and_password_rules() {
        assert_eq!(validate_username(" Shop.Admin ").unwrap(), "shop.admin");
        assert!(validate_username("no spaces").is_err());
        assert!(validate_username("ab").is_err());
        assert!(validate_password("short").is_err());
    }
}
