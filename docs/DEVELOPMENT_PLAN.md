# Development Plan

## Phase 0 — Discovery and decisions
- Confirm GST invoice rules with a qualified professional.
- Decide stock-negative policy, returns, unit conversion, invoice numbering, and Windows account sharing.
- Finalize MVP acceptance criteria.

## Phase 1 — Foundation
- Create Tauri 2 + React + TypeScript project.
- Configure linting, formatting, strict TypeScript, Rust formatting, and tests.
- Build app shell, navigation, theme, and error handling.
- Configure secure application data directory.

## Phase 2 — Database and authentication
- Add SQLite and SQLx.
- Add versioned migrations and seed default roles.
- Implement login, logout, password hashing, session handling, and permission checks.
- Add audit logging.

## Phase 3 — Master data
- Implement categories, units, items, customers, and suppliers.
- Add search, pagination, validation, and active/inactive states.

## Phase 4 — Purchases and inventory
- Implement purchase invoices and purchase lines.
- Implement stock movements and stock ledger.
- Add supplier payments and payable reporting.

## Phase 5 — Sales billing
- Implement GST and non-GST invoice drafts.
- Implement backend tax/total calculation.
- Implement invoice finalization, stock movement, payment allocation, and cancellation/reversal.
- Add invoice printing.

## Phase 6 — Reports and dashboard
- Add daily/monthly/yearly reports.
- Add customer/supplier ledgers and item reports.
- Add dashboard charts and filters.

## Phase 7 — Import/export
- Add CSV and Excel import/export with preview and validation.
- Add PDF/print support.
- Add Word export only for reports/templates where it provides business value.

## Phase 8 — Hardening and release
- Backup/restore and integrity checks.
- Security review and permission tests.
- Performance tests with realistic data.
- Windows installer, upgrade/migration testing, and user guide.

## MVP release gate
Do not call the MVP complete until login, customer/item management, invoice creation, printing, payment tracking, daily/monthly reporting, and backup/restore pass acceptance tests.
