use tauri::State;

use crate::auth;
use crate::error::{AppError, AppResult};
use crate::models::{CompanySettings, CompanySettingsInput};
use crate::state::AppState;
use crate::validate::{optional_email, optional_gstin, optional_text, required_text};

const COMPANY_COLUMNS: &str = "id, company_name, address, phone, email, gstin, state_code, \
    logo_path, invoice_footer, language_code, currency_code, prices_include_tax, \
    gst_invoice_prefix, non_gst_invoice_prefix, fiscal_year_start_month, allow_negative_stock";

async fn fetch_settings(pool: &sqlx::SqlitePool) -> AppResult<CompanySettings> {
    sqlx::query_as::<_, CompanySettings>(&format!(
        "SELECT {COMPANY_COLUMNS} FROM company_settings WHERE id = 1"
    ))
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

fn validate_language(value: &str) -> AppResult<String> {
    let value = value.trim().to_lowercase();
    if !matches!(value.as_str(), "en" | "bn") {
        return Err(AppError::Validation(format!(
            "Unsupported language: {value}"
        )));
    }
    Ok(value)
}

fn validate_currency(value: &str) -> AppResult<String> {
    let value = value.trim().to_uppercase();
    if value != "INR" {
        return Err(AppError::Validation(format!(
            "Unsupported currency: {value}"
        )));
    }
    Ok(value)
}

fn validate_state_code(value: Option<String>) -> AppResult<Option<String>> {
    let value = optional_text(value);
    if let Some(code) = &value {
        if code.chars().count() != 2 || !code.chars().all(|c| c.is_ascii_digit()) {
            return Err(AppError::Validation(
                "State code must be a 2-digit GST state code".into(),
            ));
        }
    }
    Ok(value)
}

async fn update_settings(
    pool: &sqlx::SqlitePool,
    actor_id: i64,
    input: CompanySettingsInput,
) -> AppResult<CompanySettings> {
    let company_name = required_text(&input.company_name, "Company name", 200)?;
    let email = optional_email(input.email)?;
    let gstin = optional_gstin(input.gstin)?;
    let state_code = validate_state_code(input.state_code)?;
    let language = validate_language(&input.language_code)?;
    let currency = validate_currency(&input.currency_code)?;
    let gst_prefix = required_text(&input.gst_invoice_prefix, "GST invoice prefix", 20)?
        .to_uppercase()
        .replace(' ', "-");
    let non_gst_prefix =
        required_text(&input.non_gst_invoice_prefix, "Non-GST invoice prefix", 20)?
            .to_uppercase()
            .replace(' ', "-");
    if !(1..=12).contains(&input.fiscal_year_start_month) {
        return Err(AppError::Validation(
            "Fiscal year start month must be between 1 and 12".into(),
        ));
    }

    sqlx::query(
        "UPDATE company_settings SET company_name = ?, address = ?, phone = ?, email = ?, \
         gstin = ?, state_code = ?, logo_path = ?, invoice_footer = ?, language_code = ?, \
         currency_code = ?, prices_include_tax = ?, gst_invoice_prefix = ?, \
         non_gst_invoice_prefix = ?, fiscal_year_start_month = ?, allow_negative_stock = ?, \
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1",
    )
    .bind(&company_name)
    .bind(optional_text(input.address))
    .bind(optional_text(input.phone))
    .bind(&email)
    .bind(&gstin)
    .bind(&state_code)
    .bind(optional_text(input.logo_path))
    .bind(optional_text(input.invoice_footer))
    .bind(&language)
    .bind(&currency)
    .bind(input.prices_include_tax)
    .bind(&gst_prefix)
    .bind(&non_gst_prefix)
    .bind(input.fiscal_year_start_month)
    .bind(input.allow_negative_stock)
    .execute(pool)
    .await?;

    auth::audit(
        pool,
        Some(actor_id),
        "company.settings_updated",
        Some("company_settings"),
        Some(1),
        None,
    )
    .await?;

    fetch_settings(pool).await
}

#[tauri::command]
pub async fn company_settings_get(state: State<'_, AppState>) -> AppResult<CompanySettings> {
    state.require_permission("settings.manage").await?;
    fetch_settings(&state.db).await
}

#[tauri::command]
pub async fn company_settings_update(
    state: State<'_, AppState>,
    input: CompanySettingsInput,
) -> AppResult<CompanySettings> {
    let session = state.require_permission("settings.manage").await?;
    match update_settings(&state.db, session.user_id, input).await {
        Ok(settings) => Ok(settings),
        Err(error) => Err(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn sample() -> CompanySettingsInput {
        CompanySettingsInput {
            company_name: "Builder Shop".into(),
            address: Some("Market Road".into()),
            phone: Some("9999999999".into()),
            email: Some("shop@example.com".into()),
            gstin: Some("27AABCU9603R1ZM".into()),
            state_code: Some("27".into()),
            logo_path: None,
            invoice_footer: Some("Thank you".into()),
            language_code: "bn".into(),
            currency_code: "INR".into(),
            prices_include_tax: false,
            gst_invoice_prefix: "gst".into(),
            non_gst_invoice_prefix: "inv".into(),
            fiscal_year_start_month: 4,
            allow_negative_stock: true,
        }
    }

    #[tokio::test]
    async fn updates_company_settings_and_normalizes_prefixes() {
        let pool = db::connect_memory().await.unwrap();
        auth::ensure_default_admin(&pool).await.unwrap();
        let settings = update_settings(&pool, 1, sample()).await.unwrap();
        assert_eq!(settings.company_name, "Builder Shop");
        assert_eq!(settings.gst_invoice_prefix, "GST");
        assert_eq!(settings.language_code, "bn");
    }

    #[tokio::test]
    async fn rejects_invalid_company_settings() {
        let pool = db::connect_memory().await.unwrap();
        auth::ensure_default_admin(&pool).await.unwrap();
        let mut input = sample();
        input.state_code = Some("9".into());
        assert!(update_settings(&pool, 1, input).await.is_err());

        let mut input = sample();
        input.fiscal_year_start_month = 13;
        assert!(update_settings(&pool, 1, input).await.is_err());

        let mut input = sample();
        input.currency_code = "USD".into();
        assert!(update_settings(&pool, 1, input).await.is_err());
    }
}
