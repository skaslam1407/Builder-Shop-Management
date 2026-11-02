# Builder Shop Management — User Guide

Welcome to **Builder Shop Management**, an offline-first, high-performance desktop application designed for construction material and hardware shop owners. Built with Tauri 2, React, TypeScript, and SQLite, it runs natively on **Windows** and **Linux** with complete data privacy and local storage.

---

## 1. System Requirements & Architecture

- **Operating Systems**: 
  - **Windows**: Windows 10 or 11 (64-bit).
  - **Linux**: Ubuntu, Debian, Fedora, Arch, or any modern distribution supporting AppImage or `.deb` packages.
- **Offline-First**: All data is stored locally in an encrypted SQLite database on your computer (`<app_data_dir>/builder_shop.sqlite3`). No internet connection is required for daily billing, stock tracking, or reports.
- **Currency & Taxation**: Native Indian Rupee (`₹` / INR) in integer paise (`*_minor`), milli quantities (`*_milli`), basis-point taxes (`*_bps`), and GSTR-1/GSTR-3B summary reports.

---

## 2. Installation & Desktop App Icon

### Windows
1. Download the `.msi` or `.exe` installer from the release assets.
2. Run the installer. The custom **Builder Shop** brand icon will appear on your desktop and taskbar.
3. Open **Builder Shop Management** from your desktop shortcut or Start Menu.

### Linux
1. Download the `.deb` package (for Debian/Ubuntu) or `.AppImage` (for universal Linux execution).
2. For `.deb`: Install via `sudo dpkg -i builder-shop-management_*.deb`.
3. For `.AppImage`: Make executable (`chmod +x *.AppImage`) and run.
4. The application icon is integrated into your desktop application launcher.

---

## 3. First-Run & Sign-In

1. **Default Administrator Account**:
   - **Username**: `admin`
   - **Password**: `admin123`
2. **Forced Password Change**: On your very first sign-in, the system requires you to update the default password for security.
3. **Database Setup**: The app automatically runs versioned SQL migrations and seeds default roles (`Administrator`, `Accountant`, `Cashier`, `Inventory Manager`, `Viewer`).

---

## 4. Core Workflows & Features

### A. Dashboard
- View real-time revenue, outstanding receivables, payables, low-stock item alerts, and recent transactions for any selected date range.

### B. Catalog & Stock Management
- **Categories & Units**: Organize building materials (Cement, TMT Steel, Bricks, Aggregates, Plumbing) with custom units (`BAG`, `MT`, `PCS`, `SQFT`, `BOX`).
- **Items**: Track purchase rates, selling rates, HSN codes, default tax rates (0%, 5%, 12%, 18%, 28%), and reorder levels.
- **Stock Ledger**: View stock-on-hand and full movement history (purchases, sales, adjustments).

### C. Creating Bills (Sales & Purchases) with Keyword Search Auto-Suggest
- **Instant Auto-Suggest**: When creating a Sales or Purchase invoice, clicking the **Item** or **Customer/Supplier** dropdown allows you to type keywords (such as item name, code, HSN, customer name, phone, or GSTIN). Matching records are instantly auto-suggested for immediate selection.
- **Sales Invoices (`/sales`)**:
  - Support for **GST** (intra-state CGST/SGST or inter-state IGST) and **Non-GST** invoices.
  - Auto-generated serial invoice numbers with configurable prefixes.
  - Draft saving and immutable finalization.
- **Purchase Invoices (`/purchases`)**:
  - Record supplier purchases, supplier invoice numbers, and receive stock upon finalization.

### D. Payments & Expenses
- **Customer Receipts (`/payments`)**: Allocate payments against specific finalized invoices or keep them as advance deposits.
- **Supplier Payments (`/supplier-payments`)**: Settle purchase dues via Cash, Bank Transfer, Cheque, or UPI.
- **Expenses (`/expenses`)**: Track shop operating expenses (Rent, Electricity, Transport, Salaries) categorized by type.

### E. Reports & GSTR Summary (`/reports`)
- Comprehensive reports for Sales Summary, Receivables (Customer Dues), Payables (Supplier Dues), Item Sales, Expense Reports, and GST Summary (GSTR-1 & GSTR-3B).
- Export reports to CSV or Excel SpreadsheetML XML.

### F. User Administration & Roles (`/users`)
- **RBAC**: Create user accounts, assign granular permissions (`users.manage`, `settings.manage`, `backup.manage`, etc.), and control account activation.
- **Security**: Protects against deactivating yourself or removing the last active administrator.

### G. Company Settings (`/settings`)
- Configure legal company name, address, phone, email, GSTIN, state code, invoice footers, tax inclusion rules, and negative stock permissions.
- Switch between **English (`en`)** and **Bengali (`bn`)** localization instantly.

### H. Backup & Restore (`/backup`)
- Create validated SQLite snapshots stored safely in your application data folder (`backups/`).
- Verify database integrity before staging a restore. Restores require a clean application restart for safety.

### I. Data Import (`/import`)
- Import Customers, Suppliers, and Items in bulk using CSV or Excel XML files with live validation feedback and all-or-nothing transactions.

---

## 5. Support & Troubleshooting

- **Logs & Audit Trail**: All sensitive financial mutations and logins are written to the local audit log.
- **Database Location**: SQLite database file is stored in your OS application support directory:
  - *Windows*: `%APPDATA%\com.buildershop.management\`
  - *Linux*: `$XDG_DATA_HOME/com.buildershop.management/` or `~/.local/share/com.buildershop.management/`
- **Reinstalling / Upgrading**: Upgrading preserves your local SQLite database automatically. Always create a manual backup via the Backup page before major updates.
