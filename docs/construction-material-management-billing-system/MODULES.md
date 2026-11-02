# Module Specifications

## Dashboard
- KPI cards: sales, collections, receivables, purchases, expenses.
- Date filters: today, this week, this month, custom range.
- Charts: sales trend, payment mode split, top items.
- Respect the logged-in user's report permissions.

## Customers
- CRUD, search, active/inactive status.
- Customer details and transaction ledger.
- Outstanding balance derived from invoices, payments, and adjustments; avoid manually editing computed balances.

## Suppliers
- CRUD, purchase history, payment history, payable balance.

## Items and inventory
- Category, item code, description, default unit, rates, HSN, tax setup, reorder level.
- Stock ledger with source document and quantity delta.
- Unit conversions should be explicit and validated.

## Billing
- Search/select customer and items.
- Add multiple lines, edit quantities/rates/discounts.
- Backend recalculation and validation.
- Draft, finalize, print, reprint, cancel.
- Preserve invoice snapshots and audit trail.

## Payments
- Partial payments and advance payments.
- Payment allocation to invoices.
- Reversal with reason and permission check.
- Receipt printing/export can be added after core payment workflow.

## Reports
- Filter by date range, customer, supplier, item, invoice type, and status.
- Export respects user permissions.
- Report totals must be calculated from source records or a verified reporting query.

## User administration
- Manage users, roles, and permissions.
- Prevent removal/deactivation of the last active administrator.
- Record role and account changes in audit logs.

## Backup and restore
- Manual backup and restore workflow.
- Validate SQLite integrity before restore.
- Create a pre-restore backup.
- Never overwrite the live database without explicit confirmation.
