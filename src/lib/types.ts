export type LanguageCode = "en" | "bn";
export type CurrencyCode = "INR";

export interface CurrentUser {
  id: number;
  username: string;
  displayName: string;
  mustChangePassword: boolean;
  permissions: string[];
  language: LanguageCode;
  currencyCode: CurrencyCode;
}

export interface UserPreferences {
  language: LanguageCode;
  currencyCode: CurrencyCode;
  languageOverride: LanguageCode | null;
  currencyOverride: CurrencyCode | null;
  companyLanguage: LanguageCode;
  companyCurrencyCode: CurrencyCode;
}

export interface CompanyLocalization {
  languageCode: LanguageCode;
  currencyCode: CurrencyCode;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Customer {
  id: number;
  customerCode: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  billingAddress: string | null;
  shippingAddress: string | null;
  gstin: string | null;
  openingBalanceMinor: number;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerInput {
  customerCode?: string;
  name: string;
  phone?: string;
  email?: string;
  billingAddress?: string;
  shippingAddress?: string;
  gstin?: string;
  openingBalanceMinor: number;
  notes?: string;
}

export interface Category {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryInput {
  name: string;
  description?: string;
}

export interface Unit {
  id: number;
  name: string;
  abbreviation: string;
  precision: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UnitInput {
  name: string;
  abbreviation: string;
  precision: number;
}

export interface Item {
  id: number;
  itemCode: string;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  defaultUnitId: number | null;
  unitAbbreviation: string | null;
  description: string | null;
  purchaseRateMinor: number;
  sellingRateMinor: number;
  hsnCode: string | null;
  defaultTaxRateBps: number;
  reorderLevelMilli: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ItemInput {
  itemCode: string;
  name: string;
  categoryId?: number;
  defaultUnitId?: number;
  description?: string;
  purchaseRateMinor: number;
  sellingRateMinor: number;
  hsnCode?: string;
  defaultTaxRateBps: number;
  reorderLevelMilli: number;
}

export interface DashboardSummary {
  dateFrom: string;
  dateTo: string;
  salesMinor: number;
  collectionsMinor: number;
  purchasesMinor: number;
  expensesMinor: number;
  receivablesMinor: number;
  customersCount: number;
  itemsCount: number;
  lowStockCount: number;
}

export type InvoiceType = "GST" | "NON_GST";
export type InvoiceStatus = "DRAFT" | "FINALIZED" | "CANCELLED";
export type PaymentMode = "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | "CARD" | "OTHER";

export interface SalesInvoiceLineInput {
  itemId?: number;
  description?: string;
  hsnCode?: string;
  unitId?: number;
  quantityMilli: number;
  rateMinor: number;
  discountMinor?: number;
  taxRateBps?: number;
}

export interface SalesInvoiceInput {
  invoiceType: InvoiceType;
  customerId?: number;
  invoiceDate: string;
  placeOfSupply?: string;
  isInterState?: boolean;
  notes?: string;
  terms?: string;
  lines: SalesInvoiceLineInput[];
}

export interface InvoiceLinePreview {
  index: number;
  taxableMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  taxMinor: number;
  lineTotalMinor: number;
}

export interface InvoicePreview {
  subtotalMinor: number;
  discountMinor: number;
  taxableMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  otherTaxMinor: number;
  grandTotalMinor: number;
  lines: InvoiceLinePreview[];
}

export interface SalesInvoiceSummary {
  id: number;
  invoiceNumber: string;
  invoiceType: InvoiceType;
  customerId: number | null;
  customerNameSnapshot: string;
  invoiceDate: string;
  status: InvoiceStatus;
  grandTotalMinor: number;
  paidMinor: number;
  dueMinor: number;
  createdAt: string;
}

export interface SalesInvoiceHeader {
  id: number;
  invoiceNumber: string;
  invoiceType: InvoiceType;
  customerId: number | null;
  invoiceDate: string;
  status: InvoiceStatus;
  customerNameSnapshot: string;
  customerAddressSnapshot: string | null;
  customerGstinSnapshot: string | null;
  placeOfSupply: string | null;
  isInterState: boolean;
  subtotalMinor: number;
  discountMinor: number;
  taxableMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  otherTaxMinor: number;
  grandTotalMinor: number;
  paidMinor: number;
  dueMinor: number;
  notes: string | null;
  terms: string | null;
  createdBy: number;
  finalizedBy: number | null;
  createdAt: string;
  finalizedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

export interface SalesInvoiceLine {
  id: number;
  salesInvoiceId: number;
  lineNumber: number;
  itemId: number | null;
  descriptionSnapshot: string;
  hsnCodeSnapshot: string | null;
  unitId: number | null;
  unitAbbreviation: string | null;
  quantityMilli: number;
  rateMinor: number;
  discountMinor: number;
  taxableMinor: number;
  taxRateBps: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  lineTotalMinor: number;
}

export interface Payment {
  id: number;
  customerId: number;
  customerName: string | null;
  salesInvoiceId: number | null;
  invoiceNumber: string | null;
  paymentDate: string;
  amountMinor: number;
  paymentMode: string;
  referenceNumber: string | null;
  status: "POSTED" | "REVERSED";
  notes: string | null;
  createdAt: string;
  reversedAt: string | null;
  reversalReason: string | null;
}

export interface PaymentInput {
  customerId: number;
  salesInvoiceId?: number;
  paymentDate: string;
  amountMinor: number;
  paymentMode: PaymentMode;
  referenceNumber?: string;
  notes?: string;
}

export interface FinalizeSalesInvoiceInput {
  initialPaymentMinor?: number;
  paymentMode?: PaymentMode;
  referenceNumber?: string;
}

export interface CompanySettings {
  id: number;
  companyName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  stateCode: string | null;
  logoPath: string | null;
  invoiceFooter: string | null;
  languageCode: string;
  currencyCode: string;
  pricesIncludeTax: boolean;
  gstInvoicePrefix: string;
  nonGstInvoicePrefix: string;
  fiscalYearStartMonth: number;
  allowNegativeStock: boolean;
}

export interface SalesInvoice extends SalesInvoiceHeader {
  lines: SalesInvoiceLine[];
  payments: Payment[];
}

export interface SalesInvoicePrintData {
  invoice: SalesInvoice;
  company: CompanySettings;
}

export interface Supplier {
  id: number;
  supplierCode: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  gstin: string | null;
  openingBalanceMinor: number;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierInput {
  supplierCode?: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  openingBalanceMinor: number;
  notes?: string;
}

export interface PurchaseInvoiceLineInput {
  itemId?: number;
  description?: string;
  unitId?: number;
  quantityMilli: number;
  rateMinor: number;
  discountMinor?: number;
  taxRateBps?: number;
}

export interface PurchaseInvoiceInput {
  supplierId: number;
  supplierInvoiceNumber: string;
  invoiceDate: string;
  notes?: string;
  lines: PurchaseInvoiceLineInput[];
}

export interface PurchaseLinePreview {
  index: number;
  taxableMinor: number;
  taxMinor: number;
  lineTotalMinor: number;
}

export interface PurchasePreview {
  subtotalMinor: number;
  discountMinor: number;
  taxableMinor: number;
  taxMinor: number;
  grandTotalMinor: number;
  lines: PurchaseLinePreview[];
}

export interface PurchaseInvoiceSummary {
  id: number;
  supplierId: number;
  supplierName: string | null;
  supplierInvoiceNumber: string;
  internalReference: string;
  invoiceDate: string;
  status: InvoiceStatus;
  grandTotalMinor: number;
  paidMinor: number;
  dueMinor: number;
  createdAt: string;
}

export interface PurchaseInvoiceHeader {
  id: number;
  supplierId: number;
  supplierName: string | null;
  supplierInvoiceNumber: string;
  internalReference: string;
  invoiceDate: string;
  status: InvoiceStatus;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  grandTotalMinor: number;
  paidMinor: number;
  dueMinor: number;
  notes: string | null;
  createdBy: number;
  createdAt: string;
  finalizedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

export interface PurchaseInvoiceLine {
  id: number;
  purchaseInvoiceId: number;
  itemId: number | null;
  descriptionSnapshot: string;
  unitId: number | null;
  unitAbbreviation: string | null;
  quantityMilli: number;
  rateMinor: number;
  discountMinor: number;
  taxableMinor: number;
  taxRateBps: number;
  taxMinor: number;
  lineTotalMinor: number;
}

export interface SupplierPayment {
  id: number;
  supplierId: number;
  supplierName: string | null;
  purchaseInvoiceId: number | null;
  internalReference: string | null;
  paymentDate: string;
  amountMinor: number;
  paymentMode: string;
  referenceNumber: string | null;
  status: "POSTED" | "REVERSED";
  notes: string | null;
  createdAt: string;
  reversedAt: string | null;
  reversalReason: string | null;
}

export interface SupplierPaymentInput {
  supplierId: number;
  purchaseInvoiceId?: number;
  paymentDate: string;
  amountMinor: number;
  paymentMode: PaymentMode;
  referenceNumber?: string;
  notes?: string;
}

export interface PurchaseInvoice extends PurchaseInvoiceHeader {
  lines: PurchaseInvoiceLine[];
  payments: SupplierPayment[];
}

export interface ExpenseCategory {
  id: number;
  name: string;
  isActive: boolean;
}

export interface Expense {
  id: number;
  expenseCategoryId: number | null;
  categoryName: string | null;
  expenseDate: string;
  description: string;
  amountMinor: number;
  paymentMode: string;
  referenceNumber: string | null;
  notes: string | null;
  createdBy: number;
  createdAt: string;
}

export interface ExpenseInput {
  expenseCategoryId?: number;
  expenseDate: string;
  description: string;
  amountMinor: number;
  paymentMode: PaymentMode;
  referenceNumber?: string;
  notes?: string;
}

export interface StockSummaryRow {
  id: number;
  itemCode: string;
  name: string;
  unitAbbreviation: string | null;
  quantityMilli: number;
  reorderLevelMilli: number;
  isActive: boolean;
}

export interface StockMovement {
  id: number;
  itemId: number;
  itemName: string | null;
  movementType: string;
  quantityMilli: number;
  unitAbbreviation: string | null;
  sourceType: string | null;
  sourceId: number | null;
  movementDate: string;
  notes: string | null;
  createdAt: string;
}

export interface SalesReportRow {
  period: string;
  invoiceCount: number;
  subtotalMinor: number;
  discountMinor: number;
  taxableMinor: number;
  taxMinor: number;
  grandTotalMinor: number;
}

export interface SalesReport {
  dateFrom: string;
  dateTo: string;
  granularity: "day" | "month" | "year";
  invoiceCount: number;
  subtotalMinor: number;
  discountMinor: number;
  taxableMinor: number;
  taxMinor: number;
  grandTotalMinor: number;
  collectedMinor: number;
  rows: SalesReportRow[];
}

export interface ReceivableRow {
  customerId: number;
  customerCode: string | null;
  customerName: string;
  phone: string | null;
  invoiceCount: number;
  billedMinor: number;
  dueMinor: number;
  openingBalanceMinor: number;
  outstandingMinor: number;
  lastInvoiceDate: string | null;
}

export interface ReceivablesReport {
  dateTo: string;
  customerCount: number;
  invoiceCount: number;
  dueMinor: number;
  openingBalanceMinor: number;
  outstandingMinor: number;
  rows: ReceivableRow[];
}

export interface PayableRow {
  supplierId: number;
  supplierCode: string | null;
  supplierName: string;
  phone: string | null;
  invoiceCount: number;
  billedMinor: number;
  dueMinor: number;
  openingBalanceMinor: number;
  outstandingMinor: number;
  lastInvoiceDate: string | null;
}

export interface PayablesReport {
  dateTo: string;
  supplierCount: number;
  invoiceCount: number;
  dueMinor: number;
  openingBalanceMinor: number;
  outstandingMinor: number;
  rows: PayableRow[];
}

export interface ItemSalesRow {
  itemId: number | null;
  itemCode: string | null;
  itemName: string;
  quantityMilli: number;
  salesMinor: number;
  invoiceCount: number;
}

export interface ItemSalesReport {
  dateFrom: string;
  dateTo: string;
  itemCount: number;
  quantityMilli: number;
  salesMinor: number;
  rows: ItemSalesRow[];
}

export interface ExpenseReportRow {
  categoryId: number | null;
  categoryName: string;
  entryCount: number;
  amountMinor: number;
}

export interface ExpenseReport {
  dateFrom: string;
  dateTo: string;
  entryCount: number;
  totalMinor: number;
  rows: ExpenseReportRow[];
}

export interface GstRateRow {
  taxRateBps: number;
  taxableMinor: number;
  taxMinor: number;
}

export interface GstReport {
  dateFrom: string;
  dateTo: string;
  gstInvoiceCount: number;
  taxableMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  totalTaxMinor: number;
  nonGstSalesMinor: number;
  rows: GstRateRow[];
}

export interface StockReportRow {
  id: number;
  itemCode: string;
  name: string;
  unitAbbreviation: string | null;
  quantityMilli: number;
  reorderLevelMilli: number;
  purchaseRateMinor: number;
  stockValueMinor: number;
  isActive: boolean;
}

export interface StockReport {
  itemCount: number;
  totalValueMinor: number;
  lowStockCount: number;
  rows: StockReportRow[];
}

export interface RoleSummary {
  id: number;
  name: string;
  description: string | null;
}

export interface UserAccount {
  id: number;
  username: string;
  displayName: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roles: RoleSummary[];
}

export interface UserCreateInput {
  username: string;
  displayName: string;
  password: string;
  roleIds: number[];
  mustChangePassword: boolean;
}

export interface UserUpdateInput {
  displayName: string;
  roleIds: number[];
  isActive: boolean;
  mustChangePassword: boolean;
}

export interface CompanySettingsInput {
  companyName: string;
  address?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  stateCode?: string;
  logoPath?: string;
  invoiceFooter?: string;
  languageCode: string;
  currencyCode: string;
  pricesIncludeTax: boolean;
  gstInvoicePrefix: string;
  nonGstInvoicePrefix: string;
  fiscalYearStartMonth: number;
  allowNegativeStock: boolean;
}

export interface BackupInfo {
  name: string;
  sizeBytes: number;
  createdAt: string;
}

export interface BackupValidation {
  name: string;
  valid: boolean;
  message: string;
  tableCount: number;
}

export interface RestoreResult {
  staged: boolean;
  message: string;
}

export interface ImportRowResult {
  rowNumber: number;
  valid: boolean;
  message: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  rows: ImportRowResult[];
}

export interface LedgerEntry {
  entryDate: string;
  entryType: string;
  reference: string;
  debitMinor: number;
  creditMinor: number;
  balanceMinor: number;
}

export interface CustomerLedger {
  customerId: number;
  customerName: string;
  openingBalanceMinor: number;
  closingBalanceMinor: number;
  entries: LedgerEntry[];
}

export interface SupplierLedger {
  supplierId: number;
  supplierName: string;
  openingBalanceMinor: number;
  closingBalanceMinor: number;
  entries: LedgerEntry[];
}
