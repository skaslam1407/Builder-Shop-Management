use std::path::Path;
use std::time::Duration;

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::SqlitePool;

use crate::error::AppResult;

pub const DATABASE_FILE: &str = "builder-shop.sqlite3";

fn base_options(path: &Path) -> SqliteConnectOptions {
    SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(10))
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
}

pub async fn connect_file(path: &Path) -> AppResult<SqlitePool> {
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(base_options(path))
        .await?;
    migrate(&pool).await?;
    Ok(pool)
}

#[cfg(test)]
pub async fn connect_memory() -> AppResult<SqlitePool> {
    let options = SqliteConnectOptions::new()
        .in_memory(true)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(10));
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await?;
    migrate(&pool).await?;
    Ok(pool)
}

pub async fn migrate(pool: &SqlitePool) -> AppResult<()> {
    sqlx::migrate!("./migrations").run(pool).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn migrations_create_core_tables_and_seed_roles() {
        let pool = connect_memory().await.expect("migrations should run");

        let table_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN \
             ('users', 'customers', 'items', 'sales_invoices', 'payments', 'audit_logs')",
        )
        .fetch_one(&pool)
        .await
        .expect("table count");
        assert_eq!(table_count, 6);

        let role_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM roles")
            .fetch_one(&pool)
            .await
            .expect("role count");
        assert_eq!(role_count, 4);

        let admin_permissions: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM role_permissions rp \
             JOIN roles r ON r.id = rp.role_id WHERE r.name = 'Admin'",
        )
        .fetch_one(&pool)
        .await
        .expect("admin permissions");
        let all_permissions: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM permissions")
            .fetch_one(&pool)
            .await
            .expect("permission count");
        assert_eq!(admin_permissions, all_permissions);
    }

    #[tokio::test]
    async fn invoice_sequence_upsert_allocates_incrementing_numbers() {
        let pool = connect_memory().await.expect("migrations should run");
        let mut previous = 0;
        for _ in 0..3 {
            let next: i64 = sqlx::query_scalar(
                "INSERT INTO invoice_sequences (invoice_type, fiscal_year, next_number) \
                 VALUES ('GST', '2026-27', 1) \
                 ON CONFLICT (invoice_type, fiscal_year) \
                 DO UPDATE SET next_number = next_number + 1 RETURNING next_number",
            )
            .fetch_one(&pool)
            .await
            .expect("sequence should allocate");
            assert_eq!(next, previous + 1);
            previous = next;
        }
    }

    #[tokio::test]
    async fn foreign_keys_are_enabled() {
        let pool = connect_memory().await.expect("migrations should run");
        let violations: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM pragma_foreign_key_check")
            .fetch_one(&pool)
            .await
            .expect("foreign key check");
        assert_eq!(violations, 0);
    }
}
