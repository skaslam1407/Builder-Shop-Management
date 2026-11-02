# Implementation Task Board

Use one task per pull request/agent task where possible. Each task must include implementation, tests, and evidence.

## Foundation
- [x] Scaffold Tauri 2 + React + TypeScript.
- [x] Add formatting, linting, type checking, and test scripts.
- [x] Create application layout and navigation.
- [x] Add typed frontend-to-backend command layer.
- [ ] Configure application data directory and logging. (data directory done; structured logging pending)

## Database
- [x] Configure SQLx + SQLite.
- [x] Enable foreign keys and busy timeout.
- [x] Add migration runner.
- [x] Add initial schema migrations.
- [x] Add migration tests and database integrity checks.

## Authentication and permissions
- [ ] Add user and role repositories. (queries and role seeding done; repository layer pending)
- [x] Add Argon2id password hashing.
- [x] Add login/logout/session handling.
- [x] Add backend permission middleware/helpers.
- [x] Add audit log service.
- [x] Seed Admin, Manager, Billing Staff, and Viewer roles.

## Master data
- [x] Categories CRUD.
- [x] Units CRUD.
- [x] Items CRUD and search.
- [ ] Customers CRUD and ledger. (CRUD done; ledger pending)
- [ ] Suppliers CRUD and ledger. (CRUD done; ledger summary pending)

## Purchases and inventory
- [x] Purchase invoice draft/finalize.
- [x] Purchase invoice lines.
- [x] Stock movement service.
- [x] Stock ledger and stock summary.
- [x] Supplier payment workflow.

## Expenses
- [x] Expense category management.
- [x] Expense recording with payment modes.
- [x] Expense reporting and exports.

## Sales and payments
- [x] Invoice draft workflow.
- [x] GST/non-GST invoice validation.
- [x] Backend-safe money and tax calculation.
- [x] Invoice numbering service.
- [x] Invoice finalization transaction.
- [x] Invoice cancellation/reversal.
- [x] Payment recording and allocation.
- [x] Payment reversal.
- [x] Invoice print template.

## Reports and exports
- [x] Dashboard KPIs.
- [x] Daily/monthly/yearly sales reports.
- [x] Customer outstanding report.
- [x] Supplier payable report.
- [x] Item sales and stock reports.
- [x] Expense and GST summary reports.
- [x] CSV export.
- [x] Excel export.
- [ ] Import preview and validation.
- [x] Print output. (browser print dialog)

## Localization and preferences
- [x] Per-user language and display-currency preferences.
- [x] English and Bengali UI translations with reusable translation helper.
- [x] Company-default language and currency fallback.
- [x] Locale-aware money, quantity, tax, and date formatting.
- [x] Settings screens for personal preferences and company localization defaults.
- [x] Backend preference validation and fallback tests.
- [ ] Additional languages (for example Hindi) when required.

## Release
- [ ] Backup creation.
- [ ] Restore validation and workflow.
- [ ] Role/permission test suite.
- [ ] Security review.
- [ ] Windows installer build.
- [ ] Linux package build (deb/AppImage/RPM).
- [ ] Fresh-install and upgrade tests.
- [ ] User guide and release notes.
