use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use chrono::Utc;
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::ConnectOptions;
use tauri::State;

use crate::auth;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::models::{BackupInfo, BackupValidation, RestoreResult};
use crate::state::AppState;

const BACKUP_DIR: &str = "backups";
const PENDING_RESTORE: &str = "restore-pending.sqlite3";

fn backups_dir(data_dir: &Path) -> PathBuf {
    data_dir.join(BACKUP_DIR)
}

fn validate_backup_name(name: &str) -> AppResult<String> {
    let name = name.trim();
    if name.is_empty()
        || !name.ends_with(".sqlite3")
        || name.contains('/')
        || name.contains('\\')
        || name.contains("..")
    {
        return Err(AppError::Validation("Invalid backup name".into()));
    }
    Ok(name.to_string())
}

fn timestamp_name(prefix: &str) -> String {
    format!("{prefix}-{}.sqlite3", Utc::now().format("%Y%m%d-%H%M%S"))
}

fn metadata_info(path: &Path) -> AppResult<BackupInfo> {
    let metadata = fs::metadata(path)?;
    let modified = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);
    let created_at: chrono::DateTime<Utc> = modified.into();
    Ok(BackupInfo {
        name: path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("backup.sqlite3")
            .to_string(),
        size_bytes: metadata.len() as i64,
        created_at: created_at.to_rfc3339(),
    })
}

pub async fn create_backup(pool: &sqlx::SqlitePool, data_dir: &Path) -> AppResult<BackupInfo> {
    let dir = backups_dir(data_dir);
    fs::create_dir_all(&dir)?;
    let mut path = dir.join(timestamp_name("backup"));
    let mut attempts = 1;
    while path.exists() {
        path = dir.join(format!(
            "{}-{attempts}.sqlite3",
            timestamp_name("backup").trim_end_matches(".sqlite3")
        ));
        attempts += 1;
    }

    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(pool)
        .await?;
    let source = data_dir.join(db::DATABASE_FILE);
    if !source.exists() {
        return Err(AppError::Internal(
            "Database file is not available for backup".into(),
        ));
    }
    fs::copy(&source, &path)?;
    metadata_info(&path)
}

pub async fn validate_backup(path: &Path) -> AppResult<BackupValidation> {
    let options = SqliteConnectOptions::new()
        .filename(path)
        .read_only(true)
        .create_if_missing(false);
    let mut conn = options.connect().await.map_err(|_| {
        AppError::Validation("Backup file could not be opened as a SQLite database".into())
    })?;
    let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_one(&mut conn)
        .await
        .unwrap_or_else(|_| "failed".to_string());
    let table_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN \
         ('users', 'company_settings', 'customers', 'sales_invoices', 'purchase_invoices', 'payments')",
    )
    .fetch_one(&mut conn)
    .await
    .unwrap_or(0);
    let valid = integrity.eq_ignore_ascii_case("ok") && table_count == 6;
    Ok(BackupValidation {
        name: path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_string(),
        valid,
        message: if valid {
            "Backup is valid and ready to restore".to_string()
        } else {
            "Backup integrity check failed or required tables are missing".to_string()
        },
        table_count,
    })
}

pub fn apply_pending_restore(data_dir: &Path) -> AppResult<Option<PathBuf>> {
    let pending = data_dir.join(PENDING_RESTORE);
    if !pending.exists() {
        return Ok(None);
    }
    let current = data_dir.join(db::DATABASE_FILE);
    let dir = backups_dir(data_dir);
    fs::create_dir_all(&dir)?;
    if current.exists() {
        let safety = dir.join(timestamp_name("pre-restore"));
        fs::copy(&current, &safety)?;
    }
    for suffix in ["-wal", "-shm"] {
        let sidecar = PathBuf::from(format!("{}{suffix}", current.display()));
        if sidecar.exists() {
            let _ = fs::remove_file(sidecar);
        }
    }
    if current.exists() {
        fs::remove_file(&current)?;
    }
    fs::rename(&pending, &current)?;
    Ok(Some(current))
}

async fn list_backups(data_dir: &Path) -> AppResult<Vec<BackupInfo>> {
    let dir = backups_dir(data_dir);
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut items = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) == Some("sqlite3") {
            items.push(metadata_info(&path)?);
        }
    }
    items.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(items)
}

#[tauri::command]
pub async fn backup_list(state: State<'_, AppState>) -> AppResult<Vec<BackupInfo>> {
    state.require_permission("backup.manage").await?;
    list_backups(&state.data_dir).await
}

#[tauri::command]
pub async fn backup_create(state: State<'_, AppState>) -> AppResult<BackupInfo> {
    let session = state.require_permission("backup.manage").await?;
    let info = create_backup(&state.db, &state.data_dir).await?;
    auth::audit(
        &state.db,
        Some(session.user_id),
        "backup.created",
        Some("backup"),
        None,
        Some(&info.name),
    )
    .await?;
    Ok(info)
}

#[tauri::command]
pub async fn backup_validate(
    state: State<'_, AppState>,
    name: String,
) -> AppResult<BackupValidation> {
    state.require_permission("backup.manage").await?;
    let name = validate_backup_name(&name)?;
    validate_backup(&backups_dir(&state.data_dir).join(name)).await
}

#[tauri::command]
pub async fn backup_restore(state: State<'_, AppState>, name: String) -> AppResult<RestoreResult> {
    let session = state.require_permission("backup.manage").await?;
    let name = validate_backup_name(&name)?;
    let source = backups_dir(&state.data_dir).join(&name);
    let validation = validate_backup(&source).await?;
    if !validation.valid {
        return Err(AppError::Validation(validation.message));
    }
    let pending = state.data_dir.join(PENDING_RESTORE);
    if pending.exists() {
        fs::remove_file(&pending)?;
    }
    fs::copy(&source, &pending)?;
    auth::audit(
        &state.db,
        Some(session.user_id),
        "backup.restore_staged",
        Some("backup"),
        None,
        Some(&name),
    )
    .await?;
    Ok(RestoreResult {
        staged: true,
        message:
            "Backup validated and staged. Close and reopen the application to finish the restore."
                .to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth;
    use crate::db;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("builder-shop-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[tokio::test]
    async fn creates_lists_validates_and_stages_backup() {
        let dir = temp_dir();
        let pool = db::connect_file(&dir.join(db::DATABASE_FILE))
            .await
            .unwrap();
        auth::ensure_default_admin(&pool).await.unwrap();
        let info = create_backup(&pool, &dir).await.unwrap();
        assert!(info.name.ends_with(".sqlite3"));

        let items = list_backups(&dir).await.unwrap();
        assert_eq!(items.len(), 1);
        let validation = validate_backup(&backups_dir(&dir).join(&info.name))
            .await
            .unwrap();
        assert!(validation.valid);
        assert_eq!(validation.table_count, 6);

        let source = backups_dir(&dir).join(&info.name);
        let pending = dir.join(PENDING_RESTORE);
        fs::copy(source, &pending).unwrap();
        pool.close().await;
        let restored = apply_pending_restore(&dir).unwrap();
        assert!(restored.is_some());
        assert!(!pending.exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn rejects_invalid_backup_names_and_files() {
        assert!(validate_backup_name("../escape.sqlite3").is_err());
        assert!(validate_backup_name("notes.txt").is_err());
        let dir = temp_dir();
        let path = dir.join("bad.sqlite3");
        fs::write(&path, b"not a database").unwrap();
        let validation = validate_backup(&path).await.unwrap();
        assert!(!validation.valid);
        fs::remove_dir_all(dir).unwrap();
    }
}
