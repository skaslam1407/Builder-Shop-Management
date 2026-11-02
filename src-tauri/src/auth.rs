use std::collections::HashSet;

use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::{Algorithm, Argon2, Params, Version};
use sqlx::SqlitePool;

use crate::error::{AppError, AppResult};

pub const DEFAULT_ADMIN_USERNAME: &str = "admin";
pub const DEFAULT_ADMIN_PASSWORD: &str = "admin123";

fn argon2() -> Argon2<'static> {
    Argon2::new(Algorithm::Argon2id, Version::V0x13, Params::default())
}

pub fn hash_password(password: &str) -> AppResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    argon2()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|_| AppError::Internal("Could not hash password".into()))
}

pub fn verify_password(hash: &str, password: &str) -> bool {
    match PasswordHash::new(hash) {
        Ok(parsed) => argon2()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok(),
        Err(_) => false,
    }
}

pub async fn load_effective_preferences(
    pool: &SqlitePool,
    user_id: i64,
) -> AppResult<(String, String)> {
    let row: (Option<String>, Option<String>, String, String) = sqlx::query_as(
        "SELECT u.preferred_language, u.preferred_currency_code, c.language_code, c.currency_code \
         FROM users u CROSS JOIN company_settings c WHERE u.id = ? AND c.id = 1",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    Ok((row.0.unwrap_or(row.2), row.1.unwrap_or(row.3)))
}

pub async fn load_permissions(pool: &SqlitePool, user_id: i64) -> AppResult<HashSet<String>> {
    let keys: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT p.permission_key \
         FROM permissions p \
         JOIN role_permissions rp ON rp.permission_id = p.id \
         JOIN user_roles ur ON ur.role_id = rp.role_id \
         WHERE ur.user_id = ?",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    Ok(keys.into_iter().collect())
}

/// Creates the initial administrator when the database has no users.
/// Returns `true` when an account was created.
pub async fn ensure_default_admin(pool: &SqlitePool) -> AppResult<bool> {
    let user_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(pool)
        .await?;
    if user_count > 0 {
        return Ok(false);
    }

    let hash = hash_password(DEFAULT_ADMIN_PASSWORD)?;
    let mut tx = pool.begin().await?;
    let user_id: i64 = sqlx::query_scalar(
        "INSERT INTO users (username, display_name, password_hash, must_change_password) \
         VALUES (?, ?, ?, 1) RETURNING id",
    )
    .bind(DEFAULT_ADMIN_USERNAME)
    .bind("Administrator")
    .bind(hash)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO user_roles (user_id, role_id) \
         SELECT ?, id FROM roles WHERE name = 'Admin'",
    )
    .bind(user_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, reason) \
         VALUES (?, 'user.created', 'user', ?, 'Default administrator account created')",
    )
    .bind(user_id)
    .bind(user_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(true)
}

pub async fn audit(
    pool: &SqlitePool,
    user_id: Option<i64>,
    action: &str,
    entity_type: Option<&str>,
    entity_id: Option<i64>,
    reason: Option<&str>,
) -> AppResult<()> {
    sqlx::query(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, reason) \
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(user_id)
    .bind(action)
    .bind(entity_type)
    .bind(entity_id)
    .bind(reason)
    .execute(pool)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    #[test]
    fn password_hash_round_trips() {
        let hash = hash_password("correct horse battery staple").unwrap();
        assert!(verify_password(&hash, "correct horse battery staple"));
        assert!(!verify_password(&hash, "wrong password"));
        assert!(hash.starts_with("$argon2id$"));
    }

    #[tokio::test]
    async fn default_admin_is_created_once_and_has_all_permissions() {
        let pool = db::connect_memory().await.unwrap();
        assert!(ensure_default_admin(&pool).await.unwrap());
        assert!(!ensure_default_admin(&pool).await.unwrap());

        let user_id: i64 = sqlx::query_scalar("SELECT id FROM users WHERE username = 'admin'")
            .fetch_one(&pool)
            .await
            .unwrap();
        let permissions = load_permissions(&pool, user_id).await.unwrap();
        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM permissions")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(permissions.len() as i64, total);
    }
}
