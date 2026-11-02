use crate::error::{AppError, AppResult};

pub fn required_text(value: &str, field: &str, max_len: usize) -> AppResult<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation(format!("{field} is required")));
    }
    if trimmed.chars().count() > max_len {
        return Err(AppError::Validation(format!(
            "{field} must be at most {max_len} characters"
        )));
    }
    Ok(trimmed.to_string())
}

pub fn optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|v| {
        let trimmed = v.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

pub fn optional_email(value: Option<String>) -> AppResult<Option<String>> {
    let value = optional_text(value);
    if let Some(email) = &value {
        let parts: Vec<&str> = email.split('@').collect();
        if parts.len() != 2 || parts[0].is_empty() || !parts[1].contains('.') {
            return Err(AppError::Validation("Email address is not valid".into()));
        }
    }
    Ok(value)
}

pub fn optional_gstin(value: Option<String>) -> AppResult<Option<String>> {
    let value = optional_text(value).map(|v| v.to_uppercase());
    if let Some(gstin) = &value {
        if gstin.chars().count() != 15 {
            return Err(AppError::Validation(
                "GSTIN must be exactly 15 characters".into(),
            ));
        }
    }
    Ok(value)
}

pub fn non_negative(value: Option<i64>, field: &str) -> AppResult<i64> {
    let value = value.unwrap_or(0);
    if value < 0 {
        return Err(AppError::Validation(format!("{field} cannot be negative")));
    }
    Ok(value)
}

pub fn page_params(page: Option<i64>, page_size: Option<i64>) -> (i64, i64) {
    let page = page.unwrap_or(1).max(1);
    let page_size = page_size.unwrap_or(25).clamp(1, 200);
    (page, page_size)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn required_text_trims_and_rejects_blank() {
        assert_eq!(required_text("  Cement ", "Name", 50).unwrap(), "Cement");
        assert!(required_text("   ", "Name", 50).is_err());
    }

    #[test]
    fn gstin_validation_requires_fifteen_characters() {
        assert!(optional_gstin(Some("27aabcU9603R1zm".into())).is_ok());
        assert!(optional_gstin(Some("ABC".into())).is_err());
        assert!(optional_gstin(None).unwrap().is_none());
    }

    #[test]
    fn page_params_are_bounded() {
        assert_eq!(page_params(Some(0), Some(0)), (1, 1));
        assert_eq!(page_params(None, Some(10_000)), (1, 200));
        assert_eq!(page_params(Some(3), Some(50)), (3, 50));
    }
}

pub fn payment_mode(value: &str) -> AppResult<String> {
    const ALLOWED: [&str; 6] = ["CASH", "UPI", "BANK_TRANSFER", "CHEQUE", "CARD", "OTHER"];
    let normalized = value.trim().to_uppercase().replace([' ', '-'], "_");
    if ALLOWED.contains(&normalized.as_str()) {
        Ok(normalized)
    } else {
        Err(AppError::Validation(
            "Payment mode must be Cash, UPI, Bank transfer, Cheque, Card, or Other".into(),
        ))
    }
}

#[cfg(test)]
mod payment_mode_tests {
    use super::*;

    #[test]
    fn payment_modes_are_normalized() {
        assert_eq!(payment_mode("Cash").unwrap(), "CASH");
        assert_eq!(payment_mode("bank transfer").unwrap(), "BANK_TRANSFER");
        assert_eq!(payment_mode("UPI").unwrap(), "UPI");
        assert!(payment_mode("crypto").is_err());
    }
}
