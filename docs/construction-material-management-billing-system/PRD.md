# Product Requirements Document (PRD)

## 1. Product overview
A Windows desktop application for construction material shop operations, designed to work offline and support multiple app users on a shared computer.

## 2. User problems
- Manual invoices take time and are prone to calculation errors.
- Customer balances and payment history are difficult to track.
- Material stock and purchase records are fragmented.
- Daily/monthly sales totals require manual calculation.
- Invoice copies and historical records are difficult to retrieve.

## 3. User roles

| Role | Typical permissions |
|---|---|
| Admin | Full access, users, settings, backup, cancellation |
| Manager | Customers, suppliers, items, purchases, sales, reports |
| Billing Staff | Customers, sales invoices, payments, invoice printing |
| Viewer | Read-only dashboard, ledgers, and reports |

Permissions must be configurable rather than relying only on role-name checks.

## 4. Functional requirements

### Dashboard
- Show today's sales, collections, outstanding receivables, purchases, and expenses.
- Show sales trends and top-selling materials.
- Provide date-range filters.

### Customers
- Create, view, edit, search, and deactivate customers.
- Store contact details, billing address, optional GSTIN, opening balance, and notes.
- Show invoice and payment history.
- Show current outstanding balance.

### Suppliers
- Maintain supplier contact and tax details.
- Track purchase invoices, payments, and outstanding dues.

### Items and units
- Maintain item name, SKU/code, category, description, purchase rate, selling rate, tax configuration, and reorder level.
- Support configurable units and unit conversions where required.
- Example units: Bag, Piece, Kg, Ton, CFT, Brass, Square Feet, Box, Litre, Meter.
- Do not hardcode a fixed list of units.

### Inventory
- Track opening stock, purchases, sales, returns, and adjustments.
- Maintain stock movement history with source document references.
- Prevent negative stock where configured, with an authorized override if the business requires it.

### Purchases
- Record supplier, invoice number/date, item lines, quantities, rates, taxes, discounts, and totals.
- Increase stock only when the purchase is posted/confirmed.
- Track supplier payments and due amounts.

### Sales billing
- Create GST and non-GST invoices.
- Support customer selection, item search, quantity, unit, rate, discount, tax, and payment details.
- Support draft, submitted/finalized, and cancelled states.
- Print and reprint invoices.
- Maintain unique invoice numbering, optionally with separate series for GST and non-GST invoices.

### Payments
- Record cash, UPI, bank transfer, cheque, and other payment modes.
- Support partial and multiple payments against an invoice.
- Keep payment allocation and reversal history.
- Calculate paid, due, and overpaid amounts safely.

### Expenses
- Record expense category, date, amount, payment mode, reference, and notes.
- Include expenses in relevant reports.

### Reports
- Daily, monthly, and yearly sales.
- Collections and outstanding receivables.
- Customer-wise ledger.
- Supplier-wise ledger and dues.
- Item-wise sales and stock.
- Purchase and expense summaries.
- GST summary for review and reconciliation.
- CSV and Excel export.

### User management
- Create, disable, and reset app user accounts.
- Assign roles and granular permissions.
- Record important actions in an audit log.

### Settings
- Company name, address, phone, email, logo, GSTIN, state, invoice footer, currency, and invoice series.
- Configurable tax rates and inclusive/exclusive price behavior.
- Configurable print layout.

### Backup and restore
- Create manual backups.
- Support scheduled/local reminder-based backups if feasible.
- Restore only after validating the backup and confirming the operation.
- Keep backup files outside the application installation directory.

## 5. Non-functional requirements
- Offline operation for all core workflows.
- Responsive UI for common desktop resolutions.
- Secure local authentication.
- Reliable database transactions and migrations.
- Fast search and report filtering for expected shop data volumes.
- Clear error messages and recoverable failure states.
- Logs must not expose passwords, tokens, or sensitive customer data unnecessarily.

## 6. Acceptance principles
Each feature must include validation, permission checks, error handling, tests, and user-facing feedback. See `TESTING.md`.
