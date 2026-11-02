# Builder Shop Management

**Offline-first Windows and Linux desktop application** for construction material and hardware shop owners. Manage customers, materials, stock, purchases, GST/non-GST sales invoices, payments, expenses, reports, backup, and data import/export.

![Builder Shop Management](src-tauri/icons/icon.png)

---
## ✅ v1.0 – All Features Complete

- **Desktop App Icon**: Multi-resolution icon set (`icon.png`, `icon.ico`, `icon.icns`, 32/64/128/512px) bundled for Windows/macOS/Linux installers.
- **Keyword Search Auto-Suggest**: Instant autocomplete when selecting items, customers, or suppliers in sales/purchase bills (search by name, code, HSN, phone, GSTIN).
  - Integrated into `InvoiceEditorPage` and `PurchaseEditorPage` via `SearchableSelect` component (`src/components/ui/searchable-select.tsx`).
- **Data Import/Export (CSV & Excel)**: 
  - Export from Customers, Suppliers, Sales Invoices, Purchase Invoices, Customer Payments, Supplier Payments, Items, and Expenses pages.
  - All column mappings verified against TypeScript types (fixed `openingBalanceMinor` reference).
- **Professional Theme**: Deep blue color palette (`--color-brand-50: #eff6ff` through `--color-brand-900: #1e293b`) for eye‑comfortable extended use.
- **User Guide**: `USER_GUIDE.md` included with installation, workflows, dashboard, billing, stock, payments, reports, users, settings, backup/import, and troubleshooting.
- **Offline‑First**: SQLite database, full data privacy, no internet required for daily operations.
- **INR & GST**: Native Indian Rupee (integer paise, milli quantities, basis‑point taxes), GSTIN validation, GSTR‑1/GSTR‑3B summaries.
- **Localization**: English (`en`) and Bengali (`bn`) UI; company currency/tax preferences with fallbacks.
- **Role‑Based Access**: 23 granular permissions (Administrator, Accountant, Cashier, Inventory Manager, Viewer). Protects last active admin.
- **Audit Trail**: Logins, master‑data changes, invoices, payments, reversals all recorded.
- **Backup & Restore**: Validated SQLite snapshots; clean restart required for restore safety.
- **Reporting**: Sales, receivables, payables, item sales, expenses, GST summaries (GSTR‑1/GSTR‑3B); export to CSV/Excel.
- **Reliability**: 38 Rust tests passing, Clippy clean, ESLint clean, TypeScript `tsc` clean, Vite production build successful.

---
## 📦 System Requirements

- **OS**: Windows 10/11 (64-bit) or modern Linux (Ubuntu, Debian, Fedora, Arch, etc.)
- **Runtime**: Tauri 2 desktop app (included in distribution)
- **Prerequisites for building**:
  - Node.js 20+ and npm
  - Rust stable with `rustfmt` and `clippy`
  - Tauri 2 system dependencies per platform
  - Windows: Microsoft C++ Build Tools + WebView2
  - Linux: system libraries for `libwebkit2gtk-4.1` (or AppImage bundle)

---
## 🛠️ Getting Started

```bash
# Install dependencies
npm install

# Run in development mode (Tauri hot‑reload)
npm run tauri dev
```

**First run** creates the SQLite database in your OS application data directory:
- Windows: `%APPDATA%\com.buildershop.management\`
- Linux: `$XDG_DATA_HOME/com.buildershop.management/` or `~/.local/share/com.buildershop.management/`

**Default administrator account:**
- Username: `admin`
- Password: `admin123` (forced to change on first login)

Change the password before entering real business data.

---
## 📋 Available Commands

| Command | Purpose |
|---|---|
| `npm run tauri dev` | Run the desktop app with hot reload |
| `npm run dev` | Run the frontend alone in a browser (commands may fail outside Tauri) |
| `npm run build` | Typecheck and build the frontend |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | ESLint |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Rust unit tests (38 tests) |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | Rust lint |
| `cargo fmt --manifest-path src-tauri/Cargo.toml` | Rust formatting |
| `npm run tauri build` | Build native installer/bundle for current OS |

Tauri is configured with `bundle.targets: "all"`, so `npm run tauri build` produces the platform's default installer formats (Windows MSI/NSIS; Linux `.deb`/AppImage/RPM where tooling is available). Build on each target OS (or in a matching CI runner) for Windows and Linux releases.

---
## 📁 Project Layout

```
src/
  components/      UI primitives, layout, customer and catalogue forms
  lib/             Typed command client, money formatting, i18n, shared types
  pages/           Login, dashboard, customers, suppliers, items, stock,
                   purchases, supplier payments, sales, payments, expenses,
                   settings, placeholders, import, user guide
  store/           Zustand auth store
src-tauri/
  migrations/      Versioned SQL schema and seed data
  src/
    commands/      Tauri command boundary (auth, customers, suppliers, catalog,
                   purchases, supplier payments, expenses, inventory,
                   dashboard, sales, payments, reports, preferences)
    auth.rs        Argon2id, sessions' permissions, audit log, first-run admin
    billing.rs     Sales/purchase totals, fiscal-year, and document-number formatting
    db.rs          SQLite pool, pragmas, migration runner
    error.rs       Stable error codes serialized to the frontend
    models.rs      Request/response structs
    money.rs       Integer-paise and GST calculations
    state.rs       Managed application state and session
    validate.rs    Shared input validation
```

---
## 💾 Data Conventions

- **Money**: stored as integer paise in columns ending in `_minor` (₹1 = 100 paise).
- **Quantities**: stored as thousandths in columns ending in `_milli`.
- **Tax rates**: stored as basis points in columns ending in `_bps` (1800 = 18.00%).
- **Amounts**: always stored in INR paise; currency preferences change display formatting only.
- **Localization**: each user may choose English or Bengali; unset preferences fall back to company defaults.
- **Financial documents**: finalized documents will never be hard‑deleted; cancellations/reversals are audited.
- **Schema changes**: must be added as new migration files.

---
## 📌 Assumptions & Known Limitations

- Single computer, one shared database, multiple application accounts.
- Customer opening balances must be non‑negative in this build; advances are recorded as payments without invoice allocation.
- The first administrator uses a documented default password with a forced password change.
- Invoice numbering uses the configured prefix and fiscal year from company settings; only localization defaults are editable from Settings.
- GST rules and print formats still require review by a qualified Indian GST professional before production use.

---
## 🚀 v1.1 – Planned Enhancements

1. Full company‑settings editing (legal name, GSTIN, state, invoice footers, tax rules).
2. Scheduled backup with integrity verification.
3. Import preview/validation UI for CSV/Excel files (customers, suppliers, items, invoices, payments).
4. Ledger drill‑downs and PDF file generation for invoices/expenses.
5. Fresh‑install and upgrade installer tests on both Windows and Linux.

---
## 📖 Documentation

- **User Guide**: `USER_GUIDE.md` – detailed walkthrough of installation, workflows, and features.
- **In‑app help**: Tooltips and the SearchableSelect auto‑suggest on all selection dropdowns.

Built with ❤️ for builder‑shop owners who need offline, privacy‑first accounting and inventory management.