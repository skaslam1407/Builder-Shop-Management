-- Purchase and expense workflow support.

ALTER TABLE purchase_invoice_items ADD COLUMN line_number INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_purchase_invoice_items_line
    ON purchase_invoice_items (purchase_invoice_id, line_number);

CREATE TABLE purchase_sequences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fiscal_year TEXT NOT NULL UNIQUE,
    next_number INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_supplier_payments_invoice ON supplier_payments (purchase_invoice_id);
CREATE INDEX idx_supplier_payments_status ON supplier_payments (status);
CREATE INDEX idx_expenses_category ON expenses (expense_category_id);
