# Construction Builder Shop Management

Offline-first Windows and Linux desktop application for a construction material shop: customers, materials,
stock, purchases, GST/non-GST sales invoices, payments, expenses, reports, and backups.


## Current status

Phase 1 (foundation), master data, sales/payments, and the purchases/suppliers/expenses slice are
implemented:

- Tauri 2 + React + TypeScript + Tailwind application shell
- SQLite database with SQLx migrations, foreign keys, WAL, and busy timeout
- Argon2id authentication with in-memory sessions and backend-enforced permissions
- Seeded Admin, Manager, Billing Staff, and Viewer roles (23 granular permissions)
- Audit logging for logins, master-data changes, invoices, and payments
- Customer CRUD with search, pagination, activation, GSTIN/email validation, and audit trail
- Supplier CRUD with search, pagination, activation, GSTIN/email validation, and detail summary
- Category, unit, and item CRUD with configurable units, GST defaults, and reorder levels
- Dashboard KPI summary backed by source-record queries
- GST/non-GST invoice drafts with backend recalculation, fiscal-year numbering, finalization
  transactions, stock movements, cancellation reversal, and a print view
- Invoice-specific and advance customer payments with allocation, reversal, and balance tracking
- Purchase invoice drafts/finalization with supplier invoices, purchase numbering, stock-in, and
  cancellation reversal
- Supplier invoice and advance payments with overpayment protection and reversal
- Expense categories and expense recording with payment modes
- Stock summary with low-stock filtering plus a stock movement ledger
- Reports for sales, customer receivables, supplier payables, item sales, GST, expenses, and stock
  valuation with CSV/Excel export (formula-injection guarded) and browser print output
- Per-user interface language (English and Bengali) and display currency preference, with company
  defaults and fallback; all amounts remain stored in INR paise
- Rust tests for money/tax math, numbering allocation, migrations, foreign keys, password hashing,
  validation, an end-to-end sales/payment flow, a purchase/payment/expense flow, report totals, and
  localization preferences

Not yet implemented (schema and permissions are ready): ledger drill-downs, user administration,
full company-settings editing beyond localization defaults, and backup/restore. Import preview and
validation are also pending; their screens currently show a planned-module notice.

## Stack

| Layer | Technology |
|---|---|
| Desktop runtime | Tauri 2 |
| Frontend | React 19 + TypeScript + Vite |
| UI | Tailwind CSS v4, shadcn-style primitives, lucide icons, Recharts |
| Forms | React Hook Form + Zod |
| State | Zustand |
| Backend | Rust |
| Database | SQLite via SQLx |
| Passwords | Argon2id |

All financial and inventory rules, SQL access, and authorization live in Rust. The frontend only
calls typed Tauri commands.

## Prerequisites

- Node.js 20+ and npm
- Rust stable with `rustfmt` and `clippy`
- Tauri 2 system dependencies for your platform
- On Windows: Microsoft C++ Build Tools and WebView2

## Getting started

```bash
npm install
npm run tauri dev
```

On first run the backend creates the database in the platform application data directory:
`builder-shop.sqlite3` (on Linux: `~/.local/share/com.buildershop.management/`).

The seed administrator is **admin / admin123** and is forced to change the password at first login.
Change it before entering real business data.

## Commands

| Command | Purpose |
|---|---|
| `npm run tauri dev` | Run the desktop app with hot reload |
| `npm run dev` | Run the frontend alone in a browser (commands will fail outside Tauri) |
| `npm run build` | Typecheck and build the frontend |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | ESLint |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Rust tests |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | Rust lint |
| `cargo fmt --manifest-path src-tauri/Cargo.toml` | Rust formatting |
| `npm run tauri build` | Build the native installer/bundle for the current OS |

Tauri is configured with `bundle.targets: "all"`, so `npm run tauri build` produces the platform's
default installer formats (Windows MSI/NSIS; Linux `.deb`/AppImage/RPM where tooling is available).
Build on each target OS (or in a matching CI runner) for Windows and Linux releases.

## Project layout

```text
src/
  components/          UI primitives, layout, customer and catalogue forms
  lib/                 Typed command client, money formatting, i18n, shared types
  pages/               Login, dashboard, customers, suppliers, items, stock, purchases,
                       supplier payments, sales, payments, expenses, settings, placeholders
  store/               Zustand auth store
src-tauri/
  migrations/          Versioned SQL schema and seed data
  src/
    commands/          Tauri command boundary (auth, customers, suppliers, catalog, purchases,
                       supplier payments, expenses, inventory, dashboard, sales, payments,
                       reports, preferences)
    auth.rs            Argon2id, sessions' permissions, audit log, first-run admin
    billing.rs         Sales/purchase totals, fiscal-year, and document-number formatting
    db.rs              SQLite pool, pragmas, migration runner
    error.rs           Stable error codes serialized to the frontend
    models.rs          Request/response structs
    money.rs           Integer-paise and GST calculations
    state.rs           Managed application state and session
    validate.rs        Shared input validation
```

## Data conventions

- Money is stored as integer paise in columns ending in `_minor` (₹1 = 100 paise).
- Quantities are stored as thousandths in columns ending in `_milli`.
- Tax rates are stored as basis points in columns ending in `_bps` (1800 = 18.00%).
- Amounts are always stored in INR paise; currency preferences change display formatting only.
- Each user may choose English or Bengali and INR; unset preferences fall back to company defaults.
- Finalized financial documents will never be hard-deleted; cancellations/reversals are audited.
- All schema changes must be added as new migration files.

## Assumptions taken for this first slice

- Single computer, one shared database, multiple application accounts.
- Customer opening balances must be non-negative in this build; customer advances are recorded as
  payments without an invoice allocation.
- The first administrator uses a documented default password and a forced password change.
- Invoice numbering uses the configured prefix and fiscal year from company settings; only the
  localization defaults are editable from Settings so far.
- GST rules and print formats still require review by a qualified Indian GST professional before
  production use.

## Next build phase

1. User administration and full company-settings editing.
2. Backup and restore workflows.
3. Import preview and validation.
4. Ledger drill-downs and PDF file generation.
5. Windows and Linux installer builds plus fresh-install/upgrade tests.
