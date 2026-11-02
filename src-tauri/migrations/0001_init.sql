-- Initial schema for the Construction Material Management & Billing System.
-- Monetary columns end in `_minor` and store integer paise (INR 1 = 100 paise).
-- Quantities end in `_milli` and store integer thousandths of a unit.
-- Tax rates end in `_bps` and store basis points (1800 = 18.00%).
-- Timestamps are stored as ISO-8601 UTC strings.

CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_login_at TEXT
);

CREATE TABLE roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    permission_key TEXT NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE user_roles (
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE role_permissions (
    role_id INTEGER NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_code TEXT UNIQUE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    billing_address TEXT,
    shipping_address TEXT,
    gstin TEXT,
    opening_balance_minor INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_customers_name ON customers (name);
CREATE INDEX idx_customers_phone ON customers (phone);

CREATE TABLE suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_code TEXT UNIQUE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    gstin TEXT,
    opening_balance_minor INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_suppliers_name ON suppliers (name);

CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    abbreviation TEXT NOT NULL UNIQUE,
    precision INTEGER NOT NULL DEFAULT 0 CHECK (precision BETWEEN 0 AND 6),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category_id INTEGER REFERENCES categories (id),
    default_unit_id INTEGER REFERENCES units (id),
    description TEXT,
    purchase_rate_minor INTEGER NOT NULL DEFAULT 0 CHECK (purchase_rate_minor >= 0),
    selling_rate_minor INTEGER NOT NULL DEFAULT 0 CHECK (selling_rate_minor >= 0),
    hsn_code TEXT,
    default_tax_rate_bps INTEGER NOT NULL DEFAULT 0 CHECK (default_tax_rate_bps BETWEEN 0 AND 10000),
    reorder_level_milli INTEGER NOT NULL DEFAULT 0 CHECK (reorder_level_milli >= 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_items_name ON items (name);
CREATE INDEX idx_items_category ON items (category_id);

CREATE TABLE stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES items (id),
    movement_type TEXT NOT NULL,
    quantity_milli INTEGER NOT NULL,
    unit_id INTEGER REFERENCES units (id),
    source_type TEXT,
    source_id INTEGER,
    movement_date TEXT NOT NULL,
    notes TEXT,
    created_by INTEGER NOT NULL REFERENCES users (id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_stock_movements_item_date ON stock_movements (item_id, movement_date);
CREATE INDEX idx_stock_movements_source ON stock_movements (source_type, source_id);

CREATE TABLE purchase_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES suppliers (id),
    supplier_invoice_number TEXT NOT NULL,
    internal_reference TEXT NOT NULL UNIQUE,
    invoice_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'FINALIZED', 'CANCELLED')),
    subtotal_minor INTEGER NOT NULL DEFAULT 0,
    discount_minor INTEGER NOT NULL DEFAULT 0,
    tax_minor INTEGER NOT NULL DEFAULT 0,
    grand_total_minor INTEGER NOT NULL DEFAULT 0,
    paid_minor INTEGER NOT NULL DEFAULT 0,
    due_minor INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_by INTEGER NOT NULL REFERENCES users (id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    finalized_at TEXT,
    cancelled_at TEXT,
    cancellation_reason TEXT
);

CREATE INDEX idx_purchase_invoices_supplier ON purchase_invoices (supplier_id, invoice_date);
CREATE INDEX idx_purchase_invoices_date ON purchase_invoices (invoice_date);

CREATE TABLE purchase_invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_invoice_id INTEGER NOT NULL REFERENCES purchase_invoices (id),
    item_id INTEGER REFERENCES items (id),
    description_snapshot TEXT NOT NULL,
    unit_id INTEGER REFERENCES units (id),
    quantity_milli INTEGER NOT NULL CHECK (quantity_milli > 0),
    rate_minor INTEGER NOT NULL CHECK (rate_minor >= 0),
    discount_minor INTEGER NOT NULL DEFAULT 0,
    taxable_minor INTEGER NOT NULL DEFAULT 0,
    tax_rate_bps INTEGER NOT NULL DEFAULT 0,
    tax_minor INTEGER NOT NULL DEFAULT 0,
    line_total_minor INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_purchase_invoice_items_invoice ON purchase_invoice_items (purchase_invoice_id);

CREATE TABLE sales_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT NOT NULL UNIQUE,
    invoice_type TEXT NOT NULL CHECK (invoice_type IN ('GST', 'NON_GST')),
    customer_id INTEGER REFERENCES customers (id),
    invoice_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'FINALIZED', 'CANCELLED')),
    customer_name_snapshot TEXT NOT NULL,
    customer_address_snapshot TEXT,
    customer_gstin_snapshot TEXT,
    place_of_supply TEXT,
    subtotal_minor INTEGER NOT NULL DEFAULT 0,
    discount_minor INTEGER NOT NULL DEFAULT 0,
    taxable_minor INTEGER NOT NULL DEFAULT 0,
    cgst_minor INTEGER NOT NULL DEFAULT 0,
    sgst_minor INTEGER NOT NULL DEFAULT 0,
    igst_minor INTEGER NOT NULL DEFAULT 0,
    other_tax_minor INTEGER NOT NULL DEFAULT 0,
    grand_total_minor INTEGER NOT NULL DEFAULT 0,
    paid_minor INTEGER NOT NULL DEFAULT 0,
    due_minor INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    terms TEXT,
    created_by INTEGER NOT NULL REFERENCES users (id),
    finalized_by INTEGER REFERENCES users (id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    finalized_at TEXT,
    cancelled_at TEXT,
    cancellation_reason TEXT
);

CREATE INDEX idx_sales_invoices_customer ON sales_invoices (customer_id, invoice_date);
CREATE INDEX idx_sales_invoices_date ON sales_invoices (invoice_date);
CREATE INDEX idx_sales_invoices_status ON sales_invoices (status);

CREATE TABLE sales_invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sales_invoice_id INTEGER NOT NULL REFERENCES sales_invoices (id),
    item_id INTEGER REFERENCES items (id),
    description_snapshot TEXT NOT NULL,
    hsn_code_snapshot TEXT,
    unit_id INTEGER REFERENCES units (id),
    quantity_milli INTEGER NOT NULL CHECK (quantity_milli > 0),
    rate_minor INTEGER NOT NULL CHECK (rate_minor >= 0),
    discount_minor INTEGER NOT NULL DEFAULT 0,
    taxable_minor INTEGER NOT NULL DEFAULT 0,
    tax_rate_bps INTEGER NOT NULL DEFAULT 0,
    cgst_minor INTEGER NOT NULL DEFAULT 0,
    sgst_minor INTEGER NOT NULL DEFAULT 0,
    igst_minor INTEGER NOT NULL DEFAULT 0,
    line_total_minor INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_sales_invoice_items_invoice ON sales_invoice_items (sales_invoice_id);
CREATE INDEX idx_sales_invoice_items_item ON sales_invoice_items (item_id);

CREATE TABLE payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers (id),
    sales_invoice_id INTEGER REFERENCES sales_invoices (id),
    payment_date TEXT NOT NULL,
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    payment_mode TEXT NOT NULL,
    reference_number TEXT,
    status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'REVERSED')),
    notes TEXT,
    created_by INTEGER NOT NULL REFERENCES users (id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    reversed_at TEXT,
    reversal_reason TEXT
);

CREATE INDEX idx_payments_customer ON payments (customer_id, payment_date);
CREATE INDEX idx_payments_invoice ON payments (sales_invoice_id);

CREATE TABLE supplier_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES suppliers (id),
    purchase_invoice_id INTEGER REFERENCES purchase_invoices (id),
    payment_date TEXT NOT NULL,
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    payment_mode TEXT NOT NULL,
    reference_number TEXT,
    status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'REVERSED')),
    notes TEXT,
    created_by INTEGER NOT NULL REFERENCES users (id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    reversed_at TEXT,
    reversal_reason TEXT
);

CREATE INDEX idx_supplier_payments_supplier ON supplier_payments (supplier_id, payment_date);

CREATE TABLE expense_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_category_id INTEGER REFERENCES expense_categories (id),
    expense_date TEXT NOT NULL,
    description TEXT NOT NULL,
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    payment_mode TEXT NOT NULL,
    reference_number TEXT,
    notes TEXT,
    created_by INTEGER NOT NULL REFERENCES users (id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_expenses_date ON expenses (expense_date);

CREATE TABLE company_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    company_name TEXT NOT NULL DEFAULT '',
    address TEXT,
    phone TEXT,
    email TEXT,
    gstin TEXT,
    state_code TEXT,
    logo_path TEXT,
    invoice_footer TEXT,
    currency_code TEXT NOT NULL DEFAULT 'INR',
    prices_include_tax INTEGER NOT NULL DEFAULT 0 CHECK (prices_include_tax IN (0, 1)),
    gst_invoice_prefix TEXT NOT NULL DEFAULT 'GST',
    non_gst_invoice_prefix TEXT NOT NULL DEFAULT 'INV',
    fiscal_year_start_month INTEGER NOT NULL DEFAULT 4 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO company_settings (id) VALUES (1);

CREATE TABLE gst_configurations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tax_rate_bps INTEGER NOT NULL CHECK (tax_rate_bps BETWEEN 0 AND 10000),
    effective_from TEXT NOT NULL,
    effective_to TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE invoice_sequences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_type TEXT NOT NULL CHECK (invoice_type IN ('GST', 'NON_GST')),
    fiscal_year TEXT NOT NULL,
    next_number INTEGER NOT NULL DEFAULT 1,
    UNIQUE (invoice_type, fiscal_year)
);

CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users (id),
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id INTEGER,
    before_json TEXT,
    after_json TEXT,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_audit_logs_created ON audit_logs (created_at);
CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id);

-- Seed permissions.
INSERT INTO permissions (permission_key, description) VALUES
    ('dashboard.view', 'View dashboard'),
    ('customers.view', 'View customers and ledger'),
    ('customers.manage', 'Create and edit customers'),
    ('suppliers.view', 'View suppliers and ledger'),
    ('suppliers.manage', 'Create and edit suppliers'),
    ('catalog.view', 'View categories, units, and items'),
    ('catalog.manage', 'Create and edit categories, units, and items'),
    ('inventory.view', 'View stock and stock movements'),
    ('inventory.manage', 'Post stock adjustments'),
    ('purchases.view', 'View purchases'),
    ('purchases.manage', 'Create, finalize, and cancel purchases'),
    ('sales.view', 'View sales invoices'),
    ('sales.manage', 'Create, finalize, and cancel sales invoices'),
    ('payments.view', 'View payments'),
    ('payments.manage', 'Create and reverse payments'),
    ('expenses.view', 'View expenses'),
    ('expenses.manage', 'Create and edit expenses'),
    ('reports.view', 'View reports'),
    ('reports.export', 'Export reports'),
    ('users.manage', 'Manage users and roles'),
    ('settings.manage', 'Manage company and invoice settings'),
    ('backup.manage', 'Create and restore backups'),
    ('audit.view', 'View audit logs');

INSERT INTO roles (name, description) VALUES
    ('Admin', 'Full system access'),
    ('Manager', 'Day-to-day business management'),
    ('Billing Staff', 'Billing and collections'),
    ('Viewer', 'Read-only access');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'Admin';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'Manager'
  AND p.permission_key NOT IN ('users.manage', 'settings.manage', 'backup.manage', 'audit.view');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'Billing Staff'
  AND p.permission_key IN (
    'dashboard.view', 'customers.view', 'customers.manage', 'catalog.view',
    'inventory.view', 'sales.view', 'sales.manage', 'payments.view', 'payments.manage'
  );

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'Viewer' AND p.permission_key LIKE '%.view';

INSERT INTO expense_categories (name) VALUES
    ('Rent'),
    ('Utilities'),
    ('Salaries'),
    ('Transport'),
    ('Maintenance'),
    ('Other');
