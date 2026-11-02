use std::collections::HashSet;
use std::path::PathBuf;

use sqlx::SqlitePool;
use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone)]
pub struct Session {
    pub user_id: i64,
    pub username: String,
    pub display_name: String,
    pub must_change_password: bool,
    pub permissions: HashSet<String>,
}

impl Session {
    pub fn can(&self, permission: &str) -> bool {
        self.permissions.contains(permission)
    }
}

pub struct AppState {
    pub db: SqlitePool,
    pub data_dir: PathBuf,
    session: Mutex<Option<Session>>,
}

impl AppState {
    pub fn new(db: SqlitePool, data_dir: PathBuf) -> Self {
        Self {
            db,
            data_dir,
            session: Mutex::new(None),
        }
    }

    pub async fn set_session(&self, session: Option<Session>) {
        *self.session.lock().await = session;
    }

    pub async fn current_session(&self) -> AppResult<Session> {
        self.session
            .lock()
            .await
            .clone()
            .ok_or(AppError::Unauthorized)
    }

    pub async fn require_permission(&self, permission: &str) -> AppResult<Session> {
        let session = self.current_session().await?;
        if !session.can(permission) {
            return Err(AppError::Forbidden);
        }
        Ok(session)
    }
}
