-- Sales billing and payments support.
-- Negative stock is allowed by default so bills can be issued before purchases are entered;
-- this flag is stored so the policy can be tightened from settings later.

ALTER TABLE company_settings ADD COLUMN allow_negative_stock INTEGER NOT NULL DEFAULT 1;

ALTER TABLE sales_invoices ADD COLUMN is_inter_state INTEGER NOT NULL DEFAULT 0;

ALTER TABLE sales_invoice_items ADD COLUMN line_number INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_sales_invoice_items_line ON sales_invoice_items (sales_invoice_id, line_number);
CREATE INDEX idx_payments_status ON payments (status);
CREATE INDEX idx_purchase_invoices_status ON purchase_invoices (status);
