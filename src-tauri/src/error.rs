use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Validation(String),
    #[error("You must sign in to continue")]
    Unauthorized,
    #[error("You do not have permission to perform this action")]
    Forbidden,
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    Conflict(String),
    #[error("A database error occurred")]
    Database(#[from] sqlx::Error),
    #[error("A database migration error occurred")]
    Migration(#[from] sqlx::migrate::MigrateError),
    #[error("An internal error occurred")]
    Internal(String),
    #[error("A file system error occurred")]
    Io(#[from] std::io::Error),
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            AppError::Validation(_) => "VALIDATION_ERROR",
            AppError::Unauthorized => "UNAUTHORIZED",
            AppError::Forbidden => "FORBIDDEN",
            AppError::NotFound(_) => "NOT_FOUND",
            AppError::Conflict(_) => "CONFLICT",
            AppError::Database(_) | AppError::Migration(_) => "DATABASE_ERROR",
            AppError::Internal(_) => "INTERNAL_ERROR",
            AppError::Io(_) => "IO_ERROR",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("code", self.code())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;
