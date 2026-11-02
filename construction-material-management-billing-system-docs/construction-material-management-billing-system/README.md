# Construction Material Management & Billing System

An offline-first Windows desktop application for managing a construction material shop: customers, suppliers, materials, stock, purchases, GST/non-GST sales invoices, payments, expenses, reports, and backups.

## Project goals

- Work without an internet connection during normal shop operations.
- Support multiple application users on one Windows computer.
- Support GST and non-GST invoices.
- Maintain reliable customer, supplier, inventory, and payment records.
- Print invoices and export business data.
- Provide dashboard summaries and daily, monthly, and yearly reports.
- Protect financial records with permissions, audit logs, backups, and transaction-safe database operations.

## Proposed technology stack

| Layer | Technology |
|---|---|
| Desktop runtime | Tauri 2 |
| Frontend | React + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| Backend | Rust |
| Database | SQLite |
| Database access | SQLx (Rust backend only) |
| Charts | Recharts |
| Forms and validation | React Hook Form + Zod |
| State | Zustand |
| Excel | ExcelJS |
| CSV | Papa Parse |
| Word export | docx |
| PDF / printing | HTML print layout and/or a maintained PDF solution |
| Password hashing | Argon2id |
| Packaging | Windows installer via Tauri |

Keep database access in the Rust backend through SQLx. The React frontend should call typed Tauri commands; do not mix direct frontend database access with Rust database access.

## Core modules

1. Dashboard
2. Customers and customer ledger
3. Suppliers and supplier ledger
4. Material categories, items, and configurable units
5. Inventory and stock movement history
6. Purchase invoices and supplier payments
7. GST and non-GST sales billing
8. Customer payments and outstanding balances
9. Expenses
10. Reports and charts
11. User accounts, roles, and permissions
12. Import/export
13. Company and invoice settings
14. Backup, restore, and audit logs

## Getting started

1. Read `PRD.md`, `REQUIREMENTS.md`, and `ARCHITECTURE.md`.
2. Review `DATABASE_SCHEMA.md` and `DATABASE_ERD.md`.
3. Follow `DEVELOPMENT_PLAN.md` and `TASKS.md`.
4. Apply the security and testing requirements before releasing a build.

## Important business rules

- Store monetary values as integer paise or use a decimal-safe representation. Never use binary floating-point for financial calculations.
- Use database transactions for invoice, payment, and stock updates.
- Do not hard-delete finalized invoices. Use cancellation/reversal workflows with reasons.
- Keep stock and payment histories as ledger-style records.
- Invoice numbers must be unique and generated safely.
- Back up the database regularly and test restoration.
- GST rates, HSN/SAC configuration, invoice wording, and tax treatment must be reviewed by a qualified Indian GST professional before production use.

## Initial release target

The MVP should include login, dashboard, customer CRUD, item CRUD, GST/non-GST invoice creation, invoice printing, payment tracking, basic daily/monthly reports, and backup/restore.
