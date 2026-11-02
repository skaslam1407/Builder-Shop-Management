# Backend Command API Design

Tauri commands are the frontend/backend boundary. Names and payloads below are illustrative; define concrete Rust request/response types during implementation.

## Authentication
- `auth_login`
- `auth_logout`
- `auth_current_user`
- `auth_change_password`

## Customers
- `customer_list`
- `customer_get`
- `customer_create`
- `customer_update`
- `customer_deactivate`
- `customer_ledger`

## Items
- `item_list`
- `item_get`
- `item_create`
- `item_update`
- `item_deactivate`
- `item_stock_summary`

## Sales invoices
- `sales_invoice_create_draft`
- `sales_invoice_update_draft`
- `sales_invoice_calculate_preview`
- `sales_invoice_finalize`
- `sales_invoice_get`
- `sales_invoice_list`
- `sales_invoice_cancel`
- `sales_invoice_print_data`

## Payments
- `payment_create`
- `payment_list`
- `payment_reverse`

## Reports
- `report_dashboard`
- `report_sales_summary`
- `report_customer_outstanding`
- `report_item_sales`
- `report_stock`

## Backup
- `backup_create`
- `backup_validate`
- `backup_restore`

## API rules
- Use typed request/response structs.
- Validate all input in Rust.
- Enforce permission checks for every protected command.
- Return structured errors with stable error codes.
- Never return password hashes or secret fields.
- Use pagination and filters for list/report commands.
- Do not expose a generic `execute_sql` command.
