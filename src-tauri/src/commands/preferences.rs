use sqlx::SqlitePool;
use tauri::State;

use crate::auth;
use crate::error::{AppError, AppResult};
use crate::models::{CompanyLocalization, UserPreferences};
use crate::state::AppState;

const ALLOWED_LANGUAGES: &[&str] = &["en", "bn"];
const ALLOWED_CURRENCIES: &[&str] = &["INR"];
const ALLOWED_COMPANY_LANGUAGES: &[&str] = &["en", "bn"];
const ALLOWED_COMPANY_CURRENCIES: &[&str] = &["INR"];

fn validate_language(value: &str, allowed: &[&str]) -> AppResult<String> {
    let value = value.trim().to_lowercase();
    if !allowed.contains(&value.as_str()) {
        return Err(AppError::Validation(format!(
            "Unsupported language: {value}"
        )));
    }
    Ok(value)
}

fn validate_currency(value: &str, allowed: &[&str]) -> AppResult<String> {
    let value = value.trim().to_uppercase();
    if !allowed.contains(&value.as_str()) {
        return Err(AppError::Validation(format!(
            "Unsupported currency: {value}"
        )));
    }
    Ok(value)
}

async fn preferences_for(pool: &SqlitePool, user_id: i64) -> AppResult<UserPreferences> {
    let row: (Option<String>, Option<String>, String, String) = sqlx::query_as(
        "SELECT u.preferred_language, u.preferred_currency_code, c.language_code, c.currency_code \
         FROM users u CROSS JOIN company_settings c WHERE u.id = ? AND c.id = 1",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    Ok(UserPreferences {
        language: row.0.clone().unwrap_or_else(|| row.2.clone()),
        currency_code: row.1.clone().unwrap_or_else(|| row.3.clone()),
        language_override: row.0,
        currency_override: row.1,
        company_language: row.2,
        company_currency_code: row.3,
    })
}

#[tauri::command]
pub async fn preferences_get(state: State<'_, AppState>) -> AppResult<UserPreferences> {
    let session = state.current_session().await?;
    preferences_for(&state.db, session.user_id).await
}

#[tauri::command]
pub async fn preferences_update(
    state: State<'_, AppState>,
    language: Option<String>,
    currency_code: Option<String>,
) -> AppResult<UserPreferences> {
    let session = state.current_session().await?;
    let language = language
        .as_deref()
        .map(|value| validate_language(value, ALLOWED_LANGUAGES))
        .transpose()?;
    let currency = currency_code
        .as_deref()
        .map(|value| validate_currency(value, ALLOWED_CURRENCIES))
        .transpose()?;

    sqlx::query(
        "UPDATE users SET preferred_language = ?, preferred_currency_code = ?, \
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    )
    .bind(&language)
    .bind(&currency)
    .bind(session.user_id)
    .execute(&state.db)
    .await?;

    auth::audit(
        &state.db,
        Some(session.user_id),
        "user.preferences_updated",
        Some("user"),
        Some(session.user_id),
        None,
    )
    .await?;

    preferences_for(&state.db, session.user_id).await
}

#[tauri::command]
pub async fn company_localization_update(
    state: State<'_, AppState>,
    language_code: String,
    currency_code: String,
) -> AppResult<CompanyLocalization> {
    let session = state.require_permission("settings.manage").await?;
    let language = validate_language(&language_code, ALLOWED_COMPANY_LANGUAGES)?;
    let currency = validate_currency(&currency_code, ALLOWED_COMPANY_CURRENCIES)?;

    sqlx::query(
        "UPDATE company_settings SET language_code = ?, currency_code = ?, \
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1",
    )
    .bind(&language)
    .bind(&currency)
    .execute(&state.db)
    .await?;

    auth::audit(
        &state.db,
        Some(session.user_id),
        "company.localization_updated",
        Some("company_settings"),
        Some(1),
        None,
    )
    .await?;

    Ok(CompanyLocalization {
        language_code: language,
        currency_code: currency,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    #[tokio::test]
    async fn preferences_fall_back_to_company_defaults() {
        let pool = db::connect_memory().await.expect("database");
        auth::ensure_default_admin(&pool)
            .await
            .expect("admin should be seeded");

        let defaults = preferences_for(&pool, 1).await.expect("preferences");
        assert_eq!(defaults.language, "en");
        assert_eq!(defaults.currency_code, "INR");
        assert!(defaults.language_override.is_none());

        sqlx::query("UPDATE users SET preferred_language = 'bn' WHERE id = 1")
            .execute(&pool)
            .await
            .expect("override");
        let bengali = preferences_for(&pool, 1).await.expect("preferences");
        assert_eq!(bengali.language, "bn");
        assert_eq!(bengali.company_language, "en");

        sqlx::query("UPDATE company_settings SET language_code = 'bn' WHERE id = 1")
            .execute(&pool)
            .await
            .expect("company default");
        sqlx::query("UPDATE users SET preferred_language = NULL WHERE id = 1")
            .execute(&pool)
            .await
            .expect("clear override");
        let inherited = preferences_for(&pool, 1).await.expect("preferences");
        assert_eq!(inherited.language, "bn");
        assert_eq!(inherited.language_override, None);
    }

    #[test]
    fn validates_supported_languages_and_currencies() {
        assert_eq!(validate_language(" bn ", ALLOWED_LANGUAGES).unwrap(), "bn");
        assert_eq!(validate_currency("inr", ALLOWED_CURRENCIES).unwrap(), "INR");
        assert!(validate_language("hi", ALLOWED_LANGUAGES).is_err());
        assert!(validate_currency("USD", ALLOWED_CURRENCIES).is_err());
    }
}
