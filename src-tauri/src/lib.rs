mod auth;
mod billing;
mod commands;
mod db;
mod error;
mod models;
mod money;
mod state;
mod validate;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            let data_dir = handle.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            commands::backup::apply_pending_restore(&data_dir)?;
            let db_dir = data_dir.clone();
            let pool = tauri::async_runtime::block_on(async move {
                let pool = db::connect_file(&db_dir.join(db::DATABASE_FILE)).await?;
                if auth::ensure_default_admin(&pool).await? {
                    eprintln!(
                        "First run: administrator account created. Change the default password immediately."
                    );
                }
                Ok::<_, Box<dyn std::error::Error>>(pool)
            })?;

            app.manage(state::AppState::new(pool, data_dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth::auth_login,
            commands::auth::auth_logout,
            commands::auth::auth_current_user,
            commands::auth::auth_change_password,
            commands::preferences::preferences_get,
            commands::preferences::preferences_update,
            commands::preferences::company_localization_update,
            commands::users::user_list,
            commands::users::role_list,
            commands::users::user_create,
            commands::users::user_update,
            commands::users::user_set_active,
            commands::users::user_reset_password,
            commands::settings::company_settings_get,
            commands::settings::company_settings_update,
            commands::backup::backup_list,
            commands::backup::backup_create,
            commands::backup::backup_validate,
            commands::backup::backup_restore,
            commands::imports::import_validate,
            commands::imports::import_commit,
            commands::ledger::customer_ledger,
            commands::ledger::supplier_ledger,
            commands::customers::customer_list,
            commands::customers::customer_get,
            commands::customers::customer_create,
            commands::customers::customer_update,
            commands::customers::customer_set_active,
            commands::catalog::category_list,
            commands::catalog::category_create,
            commands::catalog::category_update,
            commands::catalog::category_set_active,
            commands::catalog::unit_list,
            commands::catalog::unit_create,
            commands::catalog::unit_update,
            commands::catalog::unit_set_active,
            commands::catalog::item_list,
            commands::catalog::item_get,
            commands::catalog::item_create,
            commands::catalog::item_update,
            commands::catalog::item_set_active,
            commands::dashboard::dashboard_summary,
            commands::sales::sales_invoice_calculate_preview,
            commands::sales::sales_invoice_create_draft,
            commands::sales::sales_invoice_update_draft,
            commands::sales::sales_invoice_finalize,
            commands::sales::sales_invoice_cancel,
            commands::sales::sales_invoice_get,
            commands::sales::sales_invoice_list,
            commands::sales::sales_invoice_print_data,
            commands::payments::payment_create,
            commands::payments::payment_reverse,
            commands::payments::payment_list,
            commands::suppliers::supplier_list,
            commands::suppliers::supplier_get,
            commands::suppliers::supplier_create,
            commands::suppliers::supplier_update,
            commands::suppliers::supplier_set_active,
            commands::purchase::purchase_calculate_preview,
            commands::purchase::purchase_create_draft,
            commands::purchase::purchase_update_draft,
            commands::purchase::purchase_finalize,
            commands::purchase::purchase_cancel,
            commands::purchase::purchase_get,
            commands::purchase::purchase_list,
            commands::supplier_payments::supplier_payment_create,
            commands::supplier_payments::supplier_payment_reverse,
            commands::supplier_payments::supplier_payment_list,
            commands::expenses::expense_category_list,
            commands::expenses::expense_category_create,
            commands::expenses::expense_category_update,
            commands::expenses::expense_category_set_active,
            commands::expenses::expense_create,
            commands::expenses::expense_list,
            commands::inventory::stock_summary,
            commands::inventory::stock_movement_list,
            commands::reports::sales_report,
            commands::reports::receivables_report,
            commands::reports::payables_report,
            commands::reports::item_sales_report,
            commands::reports::expense_report,
            commands::reports::gst_report,
            commands::reports::stock_report,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
