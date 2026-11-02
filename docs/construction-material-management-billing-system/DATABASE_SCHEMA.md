# Database Schema Proposal

This is a logical starting point. Refine field types, constraints, indexes, and migration order during implementation.

## Core tables

### users
- id (PK)
- username (UNIQUE)
- display_name
- password_hash
- is_active
- created_at, updated_at
- last_login_at

### roles
- id (PK)
- name (UNIQUE)
- description

### permissions
- id (PK)
- permission_key (UNIQUE)
- description

### user_roles
- user_id (FK users)
- role_id (FK roles)
- composite PK (user_id, role_id)

### role_permissions
- role_id (FK roles)
- permission_id (FK permissions)
- composite PK (role_id, permission_id)

### customers
- id (PK)
- customer_code (UNIQUE, nullable if generated)
- name
- phone, email
- billing_address
- shipping_address
- gstin (nullable)
- opening_balance_minor
- notes
- is_active
- created_at, updated_at

### suppliers
- id (PK)
- supplier_code (UNIQUE)
- name
- phone, email
- address
- gstin
- opening_balance_minor
- is_active
- created_at, updated_at

### categories
- id (PK)
- name (UNIQUE)
- description

### units
- id (PK)
- name
- abbreviation (UNIQUE)
- precision
- is_active

### items
- id (PK)
- item_code (UNIQUE)
- name
- category_id (FK categories)
- default_unit_id (FK units)
- description
- purchase_rate_minor
- selling_rate_minor
- hsn_code
- default_tax_rate
- reorder_level
- is_active
- created_at, updated_at

### stock_movements
- id (PK)
- item_id (FK items)
- movement_type
- quantity_delta (decimal-safe quantity)
- unit_id (FK units)
- source_type, source_id
- movement_date
- notes
- created_by (FK users)
- created_at

### purchase_invoices
- id (PK)
- supplier_id (FK suppliers)
- supplier_invoice_number
- internal_reference (UNIQUE)
- invoice_date
- status
- subtotal_minor, discount_minor, tax_minor, grand_total_minor
- paid_minor, due_minor
- notes
- created_by, created_at

### purchase_invoice_items
- id (PK)
- purchase_invoice_id (FK purchase_invoices)
- item_id (FK items)
- description_snapshot
- unit_id (FK units)
- quantity
- rate_minor
- discount_minor
- taxable_minor
- tax_rate
- tax_minor
- line_total_minor

### sales_invoices
- id (PK)
- invoice_number (UNIQUE)
- invoice_type (GST / NON_GST)
- customer_id (FK customers, nullable for walk-in if allowed)
- invoice_date
- status (DRAFT / FINALIZED / CANCELLED)
- customer_name_snapshot
- customer_address_snapshot
- customer_gstin_snapshot
- place_of_supply
- subtotal_minor, discount_minor, taxable_minor
- cgst_minor, sgst_minor, igst_minor, other_tax_minor
- grand_total_minor
- paid_minor, due_minor
- notes, terms
- created_by, finalized_by
- created_at, finalized_at, cancelled_at
- cancellation_reason

### sales_invoice_items
- id (PK)
- sales_invoice_id (FK sales_invoices)
- item_id (FK items, nullable for custom line if allowed)
- description_snapshot
- hsn_code_snapshot
- unit_id (FK units)
- quantity
- rate_minor
- discount_minor
- taxable_minor
- tax_rate
- cgst_minor, sgst_minor, igst_minor
- line_total_minor

### payments
- id (PK)
- customer_id (FK customers)
- sales_invoice_id (FK sales_invoices, nullable for advance/unallocated payment)
- payment_date
- amount_minor
- payment_mode
- reference_number
- status
- notes
- created_by, created_at
- reversed_at, reversal_reason

### supplier_payments
- id (PK)
- supplier_id (FK suppliers)
- purchase_invoice_id (FK purchase_invoices, nullable)
- payment_date
- amount_minor
- payment_mode
- reference_number
- status
- created_by, created_at

### expenses
- id (PK)
- expense_category_id (FK expense_categories)
- expense_date
- description
- amount_minor
- payment_mode
- reference_number
- created_by, created_at

### expense_categories
- id (PK)
- name (UNIQUE)
- is_active

### company_settings
- id (PK)
- company_name
- address
- phone, email
- gstin
- state_code
- logo_path
- invoice_footer
- currency_code
- updated_at

### gst_configurations
- id (PK)
- name
- tax_rate
- effective_from
- effective_to
- is_active

### audit_logs
- id (PK)
- user_id (FK users)
- action
- entity_type
- entity_id
- before_json
- after_json
- reason
- created_at

## Data modeling notes
- Monetary columns ending in `_minor` represent integer paise (₹1 = 100 paise).
- Quantities need a deliberate decimal strategy; do not assume all materials use whole numbers.
- Snapshot customer/item/tax descriptions on finalized invoices so historical printouts do not change when master data changes.
- Consider a separate invoice sequence table for safe numbering by invoice type/year.
- Use reversal records for payments and stock movements rather than deleting posted history.
- Add `created_at`, `updated_at`, and user references consistently where useful.
- Enable SQLite foreign keys on every connection.
