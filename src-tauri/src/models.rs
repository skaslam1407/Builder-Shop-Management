use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Paged<T> {
    pub items: Vec<T>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentUser {
    pub id: i64,
    pub username: String,
    pub display_name: String,
    pub must_change_password: bool,
    pub permissions: Vec<String>,
    pub language: String,
    pub currency_code: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Customer {
    pub id: i64,
    pub customer_code: Option<String>,
    pub name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub billing_address: Option<String>,
    pub shipping_address: Option<String>,
    pub gstin: Option<String>,
    pub opening_balance_minor: i64,
    pub notes: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerInput {
    pub customer_code: Option<String>,
    pub name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub billing_address: Option<String>,
    pub shipping_address: Option<String>,
    pub gstin: Option<String>,
    pub opening_balance_minor: Option<i64>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryInput {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Unit {
    pub id: i64,
    pub name: String,
    pub abbreviation: String,
    pub precision: i64,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitInput {
    pub name: String,
    pub abbreviation: String,
    pub precision: Option<i64>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: i64,
    pub item_code: String,
    pub name: String,
    pub category_id: Option<i64>,
    pub category_name: Option<String>,
    pub default_unit_id: Option<i64>,
    pub unit_abbreviation: Option<String>,
    pub description: Option<String>,
    pub purchase_rate_minor: i64,
    pub selling_rate_minor: i64,
    pub hsn_code: Option<String>,
    pub default_tax_rate_bps: i64,
    pub reorder_level_milli: i64,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemInput {
    pub item_code: String,
    pub name: String,
    pub category_id: Option<i64>,
    pub default_unit_id: Option<i64>,
    pub description: Option<String>,
    pub purchase_rate_minor: Option<i64>,
    pub selling_rate_minor: Option<i64>,
    pub hsn_code: Option<String>,
    pub default_tax_rate_bps: Option<i64>,
    pub reorder_level_milli: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardSummary {
    pub date_from: String,
    pub date_to: String,
    pub sales_minor: i64,
    pub collections_minor: i64,
    pub purchases_minor: i64,
    pub expenses_minor: i64,
    pub receivables_minor: i64,
    pub customers_count: i64,
    pub items_count: i64,
    pub low_stock_count: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesInvoiceLineInput {
    pub item_id: Option<i64>,
    pub description: Option<String>,
    pub hsn_code: Option<String>,
    pub unit_id: Option<i64>,
    pub quantity_milli: i64,
    pub rate_minor: i64,
    pub discount_minor: Option<i64>,
    pub tax_rate_bps: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesInvoiceInput {
    pub invoice_type: String,
    pub customer_id: Option<i64>,
    pub invoice_date: String,
    pub place_of_supply: Option<String>,
    pub is_inter_state: Option<bool>,
    pub notes: Option<String>,
    pub terms: Option<String>,
    pub lines: Vec<SalesInvoiceLineInput>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceLinePreview {
    pub index: i64,
    pub taxable_minor: i64,
    pub cgst_minor: i64,
    pub sgst_minor: i64,
    pub igst_minor: i64,
    pub tax_minor: i64,
    pub line_total_minor: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoicePreview {
    pub subtotal_minor: i64,
    pub discount_minor: i64,
    pub taxable_minor: i64,
    pub cgst_minor: i64,
    pub sgst_minor: i64,
    pub igst_minor: i64,
    pub other_tax_minor: i64,
    pub grand_total_minor: i64,
    pub lines: Vec<InvoiceLinePreview>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SalesInvoiceSummary {
    pub id: i64,
    pub invoice_number: String,
    pub invoice_type: String,
    pub customer_id: Option<i64>,
    pub customer_name_snapshot: String,
    pub invoice_date: String,
    pub status: String,
    pub grand_total_minor: i64,
    pub paid_minor: i64,
    pub due_minor: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SalesInvoiceHeader {
    pub id: i64,
    pub invoice_number: String,
    pub invoice_type: String,
    pub customer_id: Option<i64>,
    pub invoice_date: String,
    pub status: String,
    pub customer_name_snapshot: String,
    pub customer_address_snapshot: Option<String>,
    pub customer_gstin_snapshot: Option<String>,
    pub place_of_supply: Option<String>,
    pub is_inter_state: bool,
    pub subtotal_minor: i64,
    pub discount_minor: i64,
    pub taxable_minor: i64,
    pub cgst_minor: i64,
    pub sgst_minor: i64,
    pub igst_minor: i64,
    pub other_tax_minor: i64,
    pub grand_total_minor: i64,
    pub paid_minor: i64,
    pub due_minor: i64,
    pub notes: Option<String>,
    pub terms: Option<String>,
    pub created_by: i64,
    pub finalized_by: Option<i64>,
    pub created_at: String,
    pub finalized_at: Option<String>,
    pub cancelled_at: Option<String>,
    pub cancellation_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SalesInvoiceLine {
    pub id: i64,
    pub sales_invoice_id: i64,
    pub line_number: i64,
    pub item_id: Option<i64>,
    pub description_snapshot: String,
    pub hsn_code_snapshot: Option<String>,
    pub unit_id: Option<i64>,
    pub unit_abbreviation: Option<String>,
    pub quantity_milli: i64,
    pub rate_minor: i64,
    pub discount_minor: i64,
    pub taxable_minor: i64,
    pub tax_rate_bps: i64,
    pub cgst_minor: i64,
    pub sgst_minor: i64,
    pub igst_minor: i64,
    pub line_total_minor: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Payment {
    pub id: i64,
    pub customer_id: i64,
    pub customer_name: Option<String>,
    pub sales_invoice_id: Option<i64>,
    pub invoice_number: Option<String>,
    pub payment_date: String,
    pub amount_minor: i64,
    pub payment_mode: String,
    pub reference_number: Option<String>,
    pub status: String,
    pub notes: Option<String>,
    pub created_at: String,
    pub reversed_at: Option<String>,
    pub reversal_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentInput {
    pub customer_id: i64,
    pub sales_invoice_id: Option<i64>,
    pub payment_date: String,
    pub amount_minor: i64,
    pub payment_mode: String,
    pub reference_number: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinalizeSalesInvoiceInput {
    pub initial_payment_minor: Option<i64>,
    pub payment_mode: Option<String>,
    pub reference_number: Option<String>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CompanySettings {
    pub id: i64,
    pub company_name: String,
    pub address: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub gstin: Option<String>,
    pub state_code: Option<String>,
    pub logo_path: Option<String>,
    pub invoice_footer: Option<String>,
    pub language_code: String,
    pub currency_code: String,
    pub prices_include_tax: bool,
    pub gst_invoice_prefix: String,
    pub non_gst_invoice_prefix: String,
    pub fiscal_year_start_month: i64,
    pub allow_negative_stock: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserPreferences {
    pub language: String,
    pub currency_code: String,
    pub language_override: Option<String>,
    pub currency_override: Option<String>,
    pub company_language: String,
    pub company_currency_code: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanyLocalization {
    pub language_code: String,
    pub currency_code: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesInvoice {
    #[serde(flatten)]
    pub header: SalesInvoiceHeader,
    pub lines: Vec<SalesInvoiceLine>,
    pub payments: Vec<Payment>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesInvoicePrintData {
    pub invoice: SalesInvoice,
    pub company: CompanySettings,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Supplier {
    pub id: i64,
    pub supplier_code: Option<String>,
    pub name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub gstin: Option<String>,
    pub opening_balance_minor: i64,
    pub notes: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupplierInput {
    pub supplier_code: Option<String>,
    pub name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub gstin: Option<String>,
    pub opening_balance_minor: Option<i64>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseCategory {
    pub id: i64,
    pub name: String,
    pub is_active: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseCategoryInput {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Expense {
    pub id: i64,
    pub expense_category_id: Option<i64>,
    pub category_name: Option<String>,
    pub expense_date: String,
    pub description: String,
    pub amount_minor: i64,
    pub payment_mode: String,
    pub reference_number: Option<String>,
    pub notes: Option<String>,
    pub created_by: i64,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseInput {
    pub expense_category_id: Option<i64>,
    pub expense_date: String,
    pub description: String,
    pub amount_minor: i64,
    pub payment_mode: String,
    pub reference_number: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseInvoiceSummary {
    pub id: i64,
    pub supplier_id: i64,
    pub supplier_name: Option<String>,
    pub supplier_invoice_number: String,
    pub internal_reference: String,
    pub invoice_date: String,
    pub status: String,
    pub grand_total_minor: i64,
    pub paid_minor: i64,
    pub due_minor: i64,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseInvoiceLineInput {
    pub item_id: Option<i64>,
    pub description: Option<String>,
    pub unit_id: Option<i64>,
    pub quantity_milli: i64,
    pub rate_minor: i64,
    pub discount_minor: Option<i64>,
    pub tax_rate_bps: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseInvoiceInput {
    pub supplier_id: i64,
    pub supplier_invoice_number: String,
    pub invoice_date: String,
    pub notes: Option<String>,
    pub lines: Vec<PurchaseInvoiceLineInput>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseInvoiceLine {
    pub id: i64,
    pub purchase_invoice_id: i64,
    pub item_id: Option<i64>,
    pub description_snapshot: String,
    pub unit_id: Option<i64>,
    pub unit_abbreviation: Option<String>,
    pub quantity_milli: i64,
    pub rate_minor: i64,
    pub discount_minor: i64,
    pub taxable_minor: i64,
    pub tax_rate_bps: i64,
    pub tax_minor: i64,
    pub line_total_minor: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseInvoiceHeader {
    pub id: i64,
    pub supplier_id: i64,
    pub supplier_name: Option<String>,
    pub supplier_invoice_number: String,
    pub internal_reference: String,
    pub invoice_date: String,
    pub status: String,
    pub subtotal_minor: i64,
    pub discount_minor: i64,
    pub tax_minor: i64,
    pub grand_total_minor: i64,
    pub paid_minor: i64,
    pub due_minor: i64,
    pub notes: Option<String>,
    pub created_by: i64,
    pub created_at: String,
    pub finalized_at: Option<String>,
    pub cancelled_at: Option<String>,
    pub cancellation_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SupplierPayment {
    pub id: i64,
    pub supplier_id: i64,
    pub supplier_name: Option<String>,
    pub purchase_invoice_id: Option<i64>,
    pub internal_reference: Option<String>,
    pub payment_date: String,
    pub amount_minor: i64,
    pub payment_mode: String,
    pub reference_number: Option<String>,
    pub status: String,
    pub notes: Option<String>,
    pub created_at: String,
    pub reversed_at: Option<String>,
    pub reversal_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupplierPaymentInput {
    pub supplier_id: i64,
    pub purchase_invoice_id: Option<i64>,
    pub payment_date: String,
    pub amount_minor: i64,
    pub payment_mode: String,
    pub reference_number: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseInvoice {
    #[serde(flatten)]
    pub header: PurchaseInvoiceHeader,
    pub lines: Vec<PurchaseInvoiceLine>,
    pub payments: Vec<SupplierPayment>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseLinePreview {
    pub index: i64,
    pub taxable_minor: i64,
    pub tax_minor: i64,
    pub line_total_minor: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchasePreview {
    pub subtotal_minor: i64,
    pub discount_minor: i64,
    pub taxable_minor: i64,
    pub tax_minor: i64,
    pub grand_total_minor: i64,
    pub lines: Vec<PurchaseLinePreview>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct StockSummaryRow {
    pub id: i64,
    pub item_code: String,
    pub name: String,
    pub unit_abbreviation: Option<String>,
    pub quantity_milli: i64,
    pub reorder_level_milli: i64,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct StockMovement {
    pub id: i64,
    pub item_id: i64,
    pub item_name: Option<String>,
    pub movement_type: String,
    pub quantity_milli: i64,
    pub unit_abbreviation: Option<String>,
    pub source_type: Option<String>,
    pub source_id: Option<i64>,
    pub movement_date: String,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SalesReportRow {
    pub period: String,
    pub invoice_count: i64,
    pub subtotal_minor: i64,
    pub discount_minor: i64,
    pub taxable_minor: i64,
    pub tax_minor: i64,
    pub grand_total_minor: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesReport {
    pub date_from: String,
    pub date_to: String,
    pub granularity: String,
    pub invoice_count: i64,
    pub subtotal_minor: i64,
    pub discount_minor: i64,
    pub taxable_minor: i64,
    pub tax_minor: i64,
    pub grand_total_minor: i64,
    pub collected_minor: i64,
    pub rows: Vec<SalesReportRow>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ReceivableRow {
    pub customer_id: i64,
    pub customer_code: Option<String>,
    pub customer_name: String,
    pub phone: Option<String>,
    pub invoice_count: i64,
    pub billed_minor: i64,
    pub due_minor: i64,
    pub opening_balance_minor: i64,
    pub outstanding_minor: i64,
    pub last_invoice_date: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceivablesReport {
    pub date_to: String,
    pub customer_count: i64,
    pub invoice_count: i64,
    pub due_minor: i64,
    pub opening_balance_minor: i64,
    pub outstanding_minor: i64,
    pub rows: Vec<ReceivableRow>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PayableRow {
    pub supplier_id: i64,
    pub supplier_code: Option<String>,
    pub supplier_name: String,
    pub phone: Option<String>,
    pub invoice_count: i64,
    pub billed_minor: i64,
    pub due_minor: i64,
    pub opening_balance_minor: i64,
    pub outstanding_minor: i64,
    pub last_invoice_date: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PayablesReport {
    pub date_to: String,
    pub supplier_count: i64,
    pub invoice_count: i64,
    pub due_minor: i64,
    pub opening_balance_minor: i64,
    pub outstanding_minor: i64,
    pub rows: Vec<PayableRow>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ItemSalesRow {
    pub item_id: Option<i64>,
    pub item_code: Option<String>,
    pub item_name: String,
    pub quantity_milli: i64,
    pub sales_minor: i64,
    pub invoice_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemSalesReport {
    pub date_from: String,
    pub date_to: String,
    pub item_count: i64,
    pub quantity_milli: i64,
    pub sales_minor: i64,
    pub rows: Vec<ItemSalesRow>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseReportRow {
    pub category_id: Option<i64>,
    pub category_name: String,
    pub entry_count: i64,
    pub amount_minor: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseReport {
    pub date_from: String,
    pub date_to: String,
    pub entry_count: i64,
    pub total_minor: i64,
    pub rows: Vec<ExpenseReportRow>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct GstRateRow {
    pub tax_rate_bps: i64,
    pub taxable_minor: i64,
    pub tax_minor: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GstReport {
    pub date_from: String,
    pub date_to: String,
    pub gst_invoice_count: i64,
    pub taxable_minor: i64,
    pub cgst_minor: i64,
    pub sgst_minor: i64,
    pub igst_minor: i64,
    pub total_tax_minor: i64,
    pub non_gst_sales_minor: i64,
    pub rows: Vec<GstRateRow>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct StockReportRow {
    pub id: i64,
    pub item_code: String,
    pub name: String,
    pub unit_abbreviation: Option<String>,
    pub quantity_milli: i64,
    pub reorder_level_milli: i64,
    pub purchase_rate_minor: i64,
    pub stock_value_minor: i64,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StockReport {
    pub item_count: i64,
    pub total_value_minor: i64,
    pub low_stock_count: i64,
    pub rows: Vec<StockReportRow>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct RoleSummary {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserAccount {
    pub id: i64,
    pub username: String,
    pub display_name: String,
    pub is_active: bool,
    pub must_change_password: bool,
    pub last_login_at: Option<String>,
    pub created_at: String,
    pub roles: Vec<RoleSummary>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserCreateInput {
    pub username: String,
    pub display_name: String,
    pub password: String,
    pub role_ids: Vec<i64>,
    pub must_change_password: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserUpdateInput {
    pub display_name: String,
    pub role_ids: Vec<i64>,
    pub is_active: bool,
    pub must_change_password: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanySettingsInput {
    pub company_name: String,
    pub address: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub gstin: Option<String>,
    pub state_code: Option<String>,
    pub logo_path: Option<String>,
    pub invoice_footer: Option<String>,
    pub language_code: String,
    pub currency_code: String,
    pub prices_include_tax: bool,
    pub gst_invoice_prefix: String,
    pub non_gst_invoice_prefix: String,
    pub fiscal_year_start_month: i64,
    pub allow_negative_stock: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub name: String,
    pub size_bytes: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupValidation {
    pub name: String,
    pub valid: bool,
    pub message: String,
    pub table_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResult {
    pub staged: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportRowResult {
    pub row_number: i64,
    pub valid: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported: i64,
    pub skipped: i64,
    pub rows: Vec<ImportRowResult>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct LedgerEntry {
    pub entry_date: String,
    pub entry_type: String,
    pub reference: String,
    pub debit_minor: i64,
    pub credit_minor: i64,
    pub balance_minor: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerLedger {
    pub customer_id: i64,
    pub customer_name: String,
    pub opening_balance_minor: i64,
    pub closing_balance_minor: i64,
    pub entries: Vec<LedgerEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupplierLedger {
    pub supplier_id: i64,
    pub supplier_name: String,
    pub opening_balance_minor: i64,
    pub closing_balance_minor: i64,
    pub entries: Vec<LedgerEntry>,
}
