import { invoke } from "@tauri-apps/api/core";
import type {
  BackupInfo,
  BackupValidation,
  Category,
  CategoryInput,
  CompanyLocalization,
  CompanySettings,
  CompanySettingsInput,
  CurrentUser,
  Customer,
  CustomerInput,
  CustomerLedger,
  DashboardSummary,
  Item,
  ItemInput,
  Expense,
  ExpenseCategory,
  ExpenseInput,
  ExpenseReport,
  FinalizeSalesInvoiceInput,
  GstReport,
  ImportResult,
  ImportRowResult,
  InvoicePreview,
  Paged,
  Payment,
  PaymentInput,
  ItemSalesReport,
  PayablesReport,
  PurchaseInvoice,
  PurchaseInvoiceInput,
  PurchaseInvoiceSummary,
  PurchasePreview,
  ReceivablesReport,
  RestoreResult,
  SalesInvoice,
  SalesInvoiceInput,
  SalesInvoicePrintData,
  SalesInvoiceSummary,
  SalesReport,
  StockMovement,
  StockReport,
  StockSummaryRow,
  Supplier,
  SupplierInput,
  SupplierLedger,
  SupplierPayment,
  SupplierPaymentInput,
  Unit,
  UnitInput,
  UserAccount,
  UserCreateInput,
  UserPreferences,
  UserUpdateInput,
  RoleSummary,
} from "./types";

export interface ApiError {
  code: string;
  message: string;
}

export function getErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const maybe = error as Partial<ApiError>;
    if (typeof maybe.message === "string") return maybe.message;
    if (error instanceof Error) return error.message;
  }
  return "Something went wrong. Please try again.";
}

export const authApi = {
  login: (username: string, password: string) =>
    invoke<CurrentUser>("auth_login", { username, password }),
  logout: () => invoke<void>("auth_logout"),
  currentUser: () => invoke<CurrentUser | null>("auth_current_user"),
  changePassword: (currentPassword: string, newPassword: string) =>
    invoke<{ mustChangePassword: boolean }>("auth_change_password", {
      currentPassword,
      newPassword,
    }),
};

export const preferencesApi = {
  get: () => invoke<UserPreferences>("preferences_get"),
  update: (language: string | null, currencyCode: string | null) =>
    invoke<UserPreferences>("preferences_update", { language, currencyCode }),
  updateCompany: (languageCode: string, currencyCode: string) =>
    invoke<CompanyLocalization>("company_localization_update", {
      languageCode,
      currencyCode,
    }),
};

export const userApi = {
  list: (params: { search?: string; page?: number; pageSize?: number }) =>
    invoke<Paged<UserAccount>>("user_list", params),
  roles: () => invoke<RoleSummary[]>("role_list"),
  create: (input: UserCreateInput) => invoke<UserAccount>("user_create", { input }),
  update: (id: number, input: UserUpdateInput) =>
    invoke<UserAccount>("user_update", { id, input }),
  setActive: (id: number, isActive: boolean) =>
    invoke<UserAccount>("user_set_active", { id, isActive }),
  resetPassword: (id: number, newPassword: string) =>
    invoke<void>("user_reset_password", { id, newPassword }),
};

export const companyApi = {
  get: () => invoke<CompanySettings>("company_settings_get"),
  update: (input: CompanySettingsInput) =>
    invoke<CompanySettings>("company_settings_update", { input }),
};

export const backupApi = {
  list: () => invoke<BackupInfo[]>("backup_list"),
  create: () => invoke<BackupInfo>("backup_create"),
  validate: (name: string) => invoke<BackupValidation>("backup_validate", { name }),
  restore: (name: string) => invoke<RestoreResult>("backup_restore", { name }),
};

export const importApi = {
  validate: (entity: string, rows: string[][]) =>
    invoke<ImportRowResult[]>("import_validate", { entity, rows }),
  commit: (entity: string, rows: string[][]) =>
    invoke<ImportResult>("import_commit", { entity, rows }),
};

export const ledgerApi = {
  customer: (id: number) => invoke<CustomerLedger>("customer_ledger", { id }),
  supplier: (id: number) => invoke<SupplierLedger>("supplier_ledger", { id }),
};

export const customerApi = {
  list: (params: {
    search?: string;
    page?: number;
    pageSize?: number;
    includeInactive?: boolean;
  }) => invoke<Paged<Customer>>("customer_list", params),
  get: (id: number) => invoke<Customer>("customer_get", { id }),
  create: (input: CustomerInput) => invoke<Customer>("customer_create", { input }),
  update: (id: number, input: CustomerInput) =>
    invoke<Customer>("customer_update", { id, input }),
  setActive: (id: number, isActive: boolean) =>
    invoke<Customer>("customer_set_active", { id, isActive }),
};

export const catalogApi = {
  categories: (includeInactive = false) =>
    invoke<Category[]>("category_list", { includeInactive }),
  createCategory: (input: CategoryInput) => invoke<Category>("category_create", { input }),
  updateCategory: (id: number, input: CategoryInput) =>
    invoke<Category>("category_update", { id, input }),
  setCategoryActive: (id: number, isActive: boolean) =>
    invoke<Category>("category_set_active", { id, isActive }),
  units: (includeInactive = false) => invoke<Unit[]>("unit_list", { includeInactive }),
  createUnit: (input: UnitInput) => invoke<Unit>("unit_create", { input }),
  updateUnit: (id: number, input: UnitInput) => invoke<Unit>("unit_update", { id, input }),
  setUnitActive: (id: number, isActive: boolean) =>
    invoke<Unit>("unit_set_active", { id, isActive }),
  items: (params: {
    search?: string;
    categoryId?: number;
    page?: number;
    pageSize?: number;
    includeInactive?: boolean;
  }) => invoke<Paged<Item>>("item_list", params),
  getItem: (id: number) => invoke<Item>("item_get", { id }),
  createItem: (input: ItemInput) => invoke<Item>("item_create", { input }),
  updateItem: (id: number, input: ItemInput) => invoke<Item>("item_update", { id, input }),
  setItemActive: (id: number, isActive: boolean) =>
    invoke<Item>("item_set_active", { id, isActive }),
};

export const reportApi = {
  dashboard: (dateFrom: string, dateTo: string) =>
    invoke<DashboardSummary>("dashboard_summary", { dateFrom, dateTo }),
  sales: (dateFrom: string, dateTo: string, granularity: "day" | "month" | "year") =>
    invoke<SalesReport>("sales_report", { dateFrom, dateTo, granularity }),
  receivables: (dateTo: string, search?: string) =>
    invoke<ReceivablesReport>("receivables_report", { dateTo, search }),
  payables: (dateTo: string, search?: string) =>
    invoke<PayablesReport>("payables_report", { dateTo, search }),
  itemSales: (dateFrom: string, dateTo: string, search?: string) =>
    invoke<ItemSalesReport>("item_sales_report", { dateFrom, dateTo, search }),
  expenses: (dateFrom: string, dateTo: string) =>
    invoke<ExpenseReport>("expense_report", { dateFrom, dateTo }),
  gst: (dateFrom: string, dateTo: string) =>
    invoke<GstReport>("gst_report", { dateFrom, dateTo }),
  stock: (search?: string) => invoke<StockReport>("stock_report", { search }),
};


export const salesApi = {
  list: (params: {
    search?: string;
    status?: string;
    invoiceType?: string;
    dateFrom?: string;
    dateTo?: string;
    customerId?: number;
    page?: number;
    pageSize?: number;
  }) => invoke<Paged<SalesInvoiceSummary>>("sales_invoice_list", params),
  get: (id: number) => invoke<SalesInvoice>("sales_invoice_get", { id }),
  preview: (input: SalesInvoiceInput) =>
    invoke<InvoicePreview>("sales_invoice_calculate_preview", { input }),
  createDraft: (input: SalesInvoiceInput) =>
    invoke<SalesInvoice>("sales_invoice_create_draft", { input }),
  updateDraft: (id: number, input: SalesInvoiceInput) =>
    invoke<SalesInvoice>("sales_invoice_update_draft", { id, input }),
  finalize: (id: number, input: FinalizeSalesInvoiceInput) =>
    invoke<SalesInvoice>("sales_invoice_finalize", { id, input }),
  cancel: (id: number, reason: string) =>
    invoke<SalesInvoice>("sales_invoice_cancel", { id, reason }),
  printData: (id: number) => invoke<SalesInvoicePrintData>("sales_invoice_print_data", { id }),
};

export const paymentApi = {
  list: (params: {
    search?: string;
    customerId?: number;
    salesInvoiceId?: number;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
  }) => invoke<Paged<Payment>>("payment_list", params),
  create: (input: PaymentInput) => invoke<Payment>("payment_create", { input }),
  reverse: (id: number, reason: string) => invoke<Payment>("payment_reverse", { id, reason }),
};


export const supplierApi = {
  list: (params: {
    search?: string;
    page?: number;
    pageSize?: number;
    includeInactive?: boolean;
  }) => invoke<Paged<Supplier>>("supplier_list", params),
  get: (id: number) => invoke<Supplier>("supplier_get", { id }),
  create: (input: SupplierInput) => invoke<Supplier>("supplier_create", { input }),
  update: (id: number, input: SupplierInput) =>
    invoke<Supplier>("supplier_update", { id, input }),
  setActive: (id: number, isActive: boolean) =>
    invoke<Supplier>("supplier_set_active", { id, isActive }),
};

export const purchaseApi = {
  list: (params: {
    search?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    supplierId?: number;
    page?: number;
    pageSize?: number;
  }) => invoke<Paged<PurchaseInvoiceSummary>>("purchase_list", params),
  get: (id: number) => invoke<PurchaseInvoice>("purchase_get", { id }),
  preview: (input: PurchaseInvoiceInput) =>
    invoke<PurchasePreview>("purchase_calculate_preview", { input }),
  createDraft: (input: PurchaseInvoiceInput) =>
    invoke<PurchaseInvoice>("purchase_create_draft", { input }),
  updateDraft: (id: number, input: PurchaseInvoiceInput) =>
    invoke<PurchaseInvoice>("purchase_update_draft", { id, input }),
  finalize: (id: number) => invoke<PurchaseInvoice>("purchase_finalize", { id }),
  cancel: (id: number, reason: string) =>
    invoke<PurchaseInvoice>("purchase_cancel", { id, reason }),
};

export const supplierPaymentApi = {
  list: (params: {
    search?: string;
    supplierId?: number;
    purchaseInvoiceId?: number;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
  }) => invoke<Paged<SupplierPayment>>("supplier_payment_list", params),
  create: (input: SupplierPaymentInput) =>
    invoke<SupplierPayment>("supplier_payment_create", { input }),
  reverse: (id: number, reason: string) =>
    invoke<SupplierPayment>("supplier_payment_reverse", { id, reason }),
};

export const expenseApi = {
  categories: (includeInactive = false) =>
    invoke<ExpenseCategory[]>("expense_category_list", { includeInactive }),
  createCategory: (input: { name: string }) =>
    invoke<ExpenseCategory>("expense_category_create", { input }),
  updateCategory: (id: number, input: { name: string }) =>
    invoke<ExpenseCategory>("expense_category_update", { id, input }),
  setCategoryActive: (id: number, isActive: boolean) =>
    invoke<ExpenseCategory>("expense_category_set_active", { id, isActive }),
  list: (params: {
    search?: string;
    categoryId?: number;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
  }) => invoke<Paged<Expense>>("expense_list", params),
  create: (input: ExpenseInput) => invoke<Expense>("expense_create", { input }),
};

export const inventoryApi = {
  summary: (params: {
    search?: string;
    includeInactive?: boolean;
    lowStockOnly?: boolean;
    page?: number;
    pageSize?: number;
  }) => invoke<Paged<StockSummaryRow>>("stock_summary", params),
  movements: (params: {
    itemId?: number;
    movementType?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
  }) => invoke<Paged<StockMovement>>("stock_movement_list", params),
};
