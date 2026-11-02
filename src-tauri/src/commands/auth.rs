use serde::Serialize;
use sqlx::FromRow;
use tauri::State;

use crate::auth;
use crate::error::{AppError, AppResult};
use crate::models::CurrentUser;
use crate::state::{AppState, Session};

#[derive(FromRow)]
struct LoginRow {
    id: i64,
    username: String,
    display_name: String,
    password_hash: String,
    is_active: bool,
    must_change_password: bool,
}

async fn to_current_user(pool: &sqlx::SqlitePool, session: &Session) -> AppResult<CurrentUser> {
    let mut permissions: Vec<String> = session.permissions.iter().cloned().collect();
    permissions.sort();
    let (language, currency_code) = auth::load_effective_preferences(pool, session.user_id).await?;
    Ok(CurrentUser {
        id: session.user_id,
        username: session.username.clone(),
        display_name: session.display_name.clone(),
        must_change_password: session.must_change_password,
        permissions,
        language,
        currency_code,
    })
}

#[tauri::command]
pub async fn auth_login(
    state: State<'_, AppState>,
    username: String,
    password: String,
) -> AppResult<CurrentUser> {
    let username = username.trim();
    if username.is_empty() || password.is_empty() {
        return Err(AppError::Validation(
            "Username and password are required".into(),
        ));
    }

    let row: Option<LoginRow> = sqlx::query_as(
        "SELECT id, username, display_name, password_hash, is_active, must_change_password \
         FROM users WHERE username = ?",
    )
    .bind(username)
    .fetch_optional(&state.db)
    .await?;

    let Some(row) = row else {
        return Err(AppError::Unauthorized);
    };
    if !row.is_active || !auth::verify_password(&row.password_hash, &password) {
        return Err(AppError::Unauthorized);
    }

    let permissions = auth::load_permissions(&state.db, row.id).await?;
    sqlx::query(
        "UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    )
    .bind(row.id)
    .execute(&state.db)
    .await?;
    auth::audit(
        &state.db,
        Some(row.id),
        "auth.login",
        Some("user"),
        Some(row.id),
        None,
    )
    .await?;

    let session = Session {
        user_id: row.id,
        username: row.username,
        display_name: row.display_name,
        must_change_password: row.must_change_password,
        permissions,
    };
    let user = to_current_user(&state.db, &session).await?;
    state.set_session(Some(session)).await;
    Ok(user)
}

#[tauri::command]
pub async fn auth_logout(state: State<'_, AppState>) -> AppResult<()> {
    if let Ok(session) = state.current_session().await {
        auth::audit(
            &state.db,
            Some(session.user_id),
            "auth.logout",
            Some("user"),
            Some(session.user_id),
            None,
        )
        .await?;
    }
    state.set_session(None).await;
    Ok(())
}

#[tauri::command]
pub async fn auth_current_user(state: State<'_, AppState>) -> AppResult<Option<CurrentUser>> {
    match state.current_session().await {
        Ok(session) => Ok(Some(to_current_user(&state.db, &session).await?)),
        Err(AppError::Unauthorized) => Ok(None),
        Err(error) => Err(error),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangePasswordResult {
    pub must_change_password: bool,
}

#[tauri::command]
pub async fn auth_change_password(
    state: State<'_, AppState>,
    current_password: String,
    new_password: String,
) -> AppResult<ChangePasswordResult> {
    let session = state.current_session().await?;

    if new_password.chars().count() < 8 {
        return Err(AppError::Validation(
            "New password must be at least 8 characters".into(),
        ));
    }
    if current_password == new_password {
        return Err(AppError::Validation(
            "New password must be different from the current password".into(),
        ));
    }

    let hash: String = sqlx::query_scalar("SELECT password_hash FROM users WHERE id = ?")
        .bind(session.user_id)
        .fetch_one(&state.db)
        .await?;
    if !auth::verify_password(&hash, &current_password) {
        return Err(AppError::Validation("Current password is incorrect".into()));
    }

    let new_hash = auth::hash_password(&new_password)?;
    sqlx::query(
        "UPDATE users SET password_hash = ?, must_change_password = 0, \
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    )
    .bind(new_hash)
    .bind(session.user_id)
    .execute(&state.db)
    .await?;

    auth::audit(
        &state.db,
        Some(session.user_id),
        "auth.password_changed",
        Some("user"),
        Some(session.user_id),
        None,
    )
    .await?;

    let mut updated = session;
    updated.must_change_password = false;
    state.set_session(Some(updated)).await;
    Ok(ChangePasswordResult {
        must_change_password: false,
    })
}
