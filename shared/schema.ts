import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  loginId: text("login_id").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  role: text("role"),
  department: text("department"),
  workStatus: text("work_status").default("재직중"),
  isActive: boolean("is_active").default(true),
  lastLoginAt: timestamp("last_login_at"),
  lastPasswordChangeAt: timestamp("last_password_change_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  lastLoginAt: true,
  lastPasswordChangeAt: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  company: text("company"),
  status: text("status").notNull().default("active"),
  customerType: text("customer_type"),
  customerCategory: text("customer_category"),
  serviceType: text("service_type"),
  managerName: text("manager_name"),
  keepBalanceAdjustment: integer("keep_balance_adjustment").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
});

export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;

export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  name: text("name").notNull(),
  position: text("position"),
  email: text("email"),
  phone: text("phone"),
  isPrimary: boolean("is_primary").default(false),
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
});

export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;

export const dealStages = ["lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"] as const;
export type DealStage = typeof dealStages[number];

export const deals = pgTable("deals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  parentDealId: varchar("parent_deal_id"),
  title: text("title").notNull(),
  customerId: varchar("customer_id").references(() => customers.id),
  value: integer("value").notNull().default(0),
  stage: text("stage").notNull().default("new"),
  probability: integer("probability").notNull().default(0),
  expectedCloseDate: timestamp("expected_close_date"),
  inboundDate: timestamp("inbound_date"),
  contractStartDate: timestamp("contract_start_date"),
  contractEndDate: timestamp("contract_end_date"),
  churnDate: timestamp("churn_date"),
  renewalDueDate: timestamp("renewal_due_date"),
  contractStatus: text("contract_status"),
  notes: text("notes"),
  phone: text("phone"),
  email: text("email"),
  billingAccountNumber: text("billing_account_number"),
  companyName: text("company_name"),
  industry: text("industry"),
  telecomProvider: text("telecom_provider"),
  customerDisposition: text("customer_disposition"),
  customerTypeDetail: text("customer_type_detail"),
  firstProgressStatus: text("first_progress_status"),
  secondProgressStatus: text("second_progress_status"),
  additionalProgressStatus: text("additional_progress_status"),
  acquisitionChannel: text("acquisition_channel"),
  cancellationReason: text("cancellation_reason"),
  salesperson: text("salesperson"),
  preChurnStage: text("pre_churn_stage"),
  lineCount: integer("line_count").default(1),
  cancelledLineCount: integer("cancelled_line_count").default(0),
  productId: varchar("product_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDealSchema = createInsertSchema(deals).omit({
  id: true,
  createdAt: true,
});

export type InsertDeal = z.infer<typeof insertDealSchema>;
export type Deal = typeof deals.$inferSelect;

export const dealTimelines = pgTable("deal_timelines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dealId: varchar("deal_id").notNull().references(() => deals.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  authorId: varchar("author_id").references(() => users.id),
  authorName: text("author_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDealTimelineSchema = createInsertSchema(dealTimelines).omit({
  id: true,
  createdAt: true,
});

export type InsertDealTimeline = z.infer<typeof insertDealTimelineSchema>;
export type DealTimeline = typeof dealTimelines.$inferSelect;

export const regionalManagementFees = pgTable("regional_management_fees", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  feeDate: timestamp("fee_date").notNull(),
  amount: integer("amount").notNull().default(0),
  productName: text("product_name").notNull(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertRegionalManagementFeeSchema = createInsertSchema(regionalManagementFees).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRegionalManagementFee = z.infer<typeof insertRegionalManagementFeeSchema>;
export type RegionalManagementFee = typeof regionalManagementFees.$inferSelect;

export const regionalCustomerLists = pgTable("regional_customer_lists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tier: text("tier").notNull(),
  customerName: text("customer_name").notNull(),
  registrationCount: integer("registration_count").notNull().default(0),
  sameCustomer: text("same_customer"),
  exposureNotice: boolean("exposure_notice").notNull().default(false),
  blogReview: boolean("blog_review").notNull().default(false),
  csTimeline: text("cs_timeline"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertRegionalCustomerListSchema = createInsertSchema(regionalCustomerLists).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRegionalCustomerList = z.infer<typeof insertRegionalCustomerListSchema>;
export type RegionalCustomerList = typeof regionalCustomerLists.$inferSelect;

export const activities = pgTable("activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(),
  description: text("description").notNull(),
  customerId: varchar("customer_id").references(() => customers.id),
  dealId: varchar("deal_id").references(() => deals.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertActivitySchema = createInsertSchema(activities).omit({
  id: true,
  createdAt: true,
});

export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activities.$inferSelect;

export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractId: varchar("contract_id").references(() => contracts.id),
  depositDate: timestamp("deposit_date").notNull(),
  customerName: text("customer_name").notNull(),
  manager: text("manager").notNull(),
  amount: integer("amount").notNull().default(0),
  depositConfirmed: boolean("deposit_confirmed").default(false),
  paymentMethod: text("payment_method"),
  invoiceIssued: boolean("invoice_issued").default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
});

export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

export const systemLogTypes = [
  "login",
  "logout",
  "register",
  "profile_update",
  "password_change",
  "government_update",
  "data_export",
  "settings_change",
  "contract_update",
  "excel_upload",
  "data_backup",
] as const;
export type SystemLogType = typeof systemLogTypes[number];

export const systemLogs = pgTable("system_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  loginId: text("login_id").notNull(),
  userName: text("user_name").notNull(),
  action: text("action").notNull(),
  actionType: text("action_type").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSystemLogSchema = createInsertSchema(systemLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertSystemLog = z.infer<typeof insertSystemLogSchema>;
export type SystemLog = typeof systemLogs.$inferSelect;

export const productCategories = [
  "슬롯",
  "타지역상품",
  "바이럴상품",
  "기타",
] as const;
export type ProductCategory = typeof productCategories[number];

export const vatTypes = ["부가세별도", "부가세포함", "면세"] as const;
export type VatType = typeof vatTypes[number];

export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  category: text("category").notNull(),
  unitPrice: integer("unit_price").notNull().default(0),
  unit: text("unit"),
  baseDays: integer("base_days").default(0),
  workCost: integer("work_cost").default(0),
  purchasePrice: integer("purchase_price").default(0),
  vatType: text("vat_type").default("부가세별도"),
  worker: text("worker"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const productRateHistories = pgTable("product_rate_histories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  productName: text("product_name").notNull(),
  effectiveFrom: timestamp("effective_from").notNull(),
  unitPrice: integer("unit_price").notNull().default(0),
  workCost: integer("work_cost").default(0),
  baseDays: integer("base_days").default(0),
  vatType: text("vat_type").default("부가세별도"),
  worker: text("worker"),
  changedBy: text("changed_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
});

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

export const insertProductRateHistorySchema = createInsertSchema(productRateHistories).omit({
  id: true,
  createdAt: true,
});

export type InsertProductRateHistory = z.infer<typeof insertProductRateHistorySchema>;
export type ProductRateHistory = typeof productRateHistories.$inferSelect;

export const contracts = pgTable("contracts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractNumber: text("contract_number").notNull(),
  contractDate: timestamp("contract_date").notNull(),
  contractName: text("contract_name"),
  managerId: varchar("manager_id").references(() => users.id),
  managerName: text("manager_name").notNull(),
  customerId: varchar("customer_id").references(() => customers.id),
  customerName: text("customer_name").notNull(),
  products: text("products"),
  cost: integer("cost").notNull().default(0),
  days: integer("days").default(0),
  quantity: integer("quantity").default(0),
  addQuantity: integer("add_quantity").default(0),
  extendQuantity: integer("extend_quantity").default(0),
  paymentConfirmed: boolean("payment_confirmed").default(false),
  paymentMethod: text("payment_method"),
  depositBank: text("deposit_bank"),
  invoiceIssued: text("invoice_issued"),
  worker: text("worker"),
  workCost: integer("work_cost").default(0),
  notes: text("notes"),
  disbursementStatus: text("disbursement_status"),
  executionPaymentStatus: text("execution_payment_status").default("입금전"),
  userIdentifier: text("user_identifier"),
  productDetailsJson: text("product_details_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertContractSchema = createInsertSchema(contracts).omit({
  id: true,
  createdAt: true,
});

export type InsertContract = z.infer<typeof insertContractSchema>;
export type Contract = typeof contracts.$inferSelect;
export type ContractWithFinancials = Contract & {
  totalRefund: number;
  lastRefundDate: string | null;
  totalKeep: number;
  lastKeepDate: string | null;
  refundCount: number;
  keepCount: number;
};

export const refunds = pgTable("refunds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractId: varchar("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
  itemId: text("item_id"),
  userIdentifier: text("user_identifier"),
  productName: text("product_name"),
  days: integer("days").default(0),
  addQuantity: integer("add_quantity").default(0),
  extendQuantity: integer("extend_quantity").default(0),
  targetAmount: integer("target_amount").default(0),
  amount: integer("amount").notNull(),
  quantity: integer("quantity").default(0),
  refundDays: integer("refund_days").default(0),
  account: text("account"),
  slot: text("slot"),
  reason: text("reason"),
  worker: text("worker"),
  previousPaymentMethod: text("previous_payment_method"),
  refundStatus: text("refund_status"),
  refundDate: timestamp("refund_date").notNull(),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertRefundSchema = createInsertSchema(refunds).omit({
  id: true,
  createdAt: true,
});

export type InsertRefund = z.infer<typeof insertRefundSchema>;
export type Refund = typeof refunds.$inferSelect;
export type RefundWithContract = Refund & {
  contractNumber: string;
  customerName: string;
  contractDate: Date | string | null;
  userIdentifier: string | null;
  products: string | null;
  days: number | null;
  addQuantity: number | null;
  extendQuantity: number | null;
  managerName: string | null;
  contractCost: number | null;
  itemId: string | null;
  targetAmount: number | null;
  refundStatus: string | null;
};

export const keeps = pgTable("keeps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractId: varchar("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
  itemId: text("item_id"),
  userIdentifier: text("user_identifier"),
  productName: text("product_name"),
  days: integer("days").default(0),
  addQuantity: integer("add_quantity").default(0),
  extendQuantity: integer("extend_quantity").default(0),
  targetAmount: integer("target_amount").default(0),
  amount: integer("amount").notNull(),
  keepDate: timestamp("keep_date").notNull(),
  reason: text("reason"),
  worker: text("worker"),
  previousPaymentMethod: text("previous_payment_method"),
  keepStatus: text("keep_status"),
  decisionBy: text("decision_by"),
  decisionAt: timestamp("decision_at"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertKeepSchema = createInsertSchema(keeps).omit({
  id: true,
  createdAt: true,
});

export type InsertKeep = z.infer<typeof insertKeepSchema>;
export type Keep = typeof keeps.$inferSelect;
export type KeepWithContract = Keep & {
  contractNumber: string;
  customerName: string;
  userIdentifier: string | null;
  products: string | null;
  days: number | null;
  addQuantity: number | null;
  extendQuantity: number | null;
  managerName: string | null;
  contractCost: number | null;
  itemId: string | null;
  targetAmount: number | null;
  keepStatus: string | null;
  decisionBy: string | null;
  decisionAt: Date | string | null;
};

export const deposits = pgTable("deposits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  depositDate: timestamp("deposit_date").notNull(),
  depositorName: text("depositor_name").notNull(),
  depositAmount: integer("deposit_amount").notNull().default(0),
  depositBank: text("deposit_bank"),
  notes: text("notes"),
  confirmedAmount: integer("confirmed_amount").default(0),
  totalContractAmount: integer("total_contract_amount").default(0),
  contractId: varchar("contract_id").references(() => contracts.id),
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDepositSchema = createInsertSchema(deposits).omit({
  id: true,
  createdAt: true,
});

export type InsertDeposit = z.infer<typeof insertDepositSchema>;
export type Deposit = typeof deposits.$inferSelect;

export const notices = pgTable("notices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  content: text("content").notNull(),
  authorId: varchar("author_id").references(() => users.id),
  authorName: text("author_name").notNull(),
  isPinned: boolean("is_pinned").default(false),
  viewCount: integer("view_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertNoticeSchema = createInsertSchema(notices).omit({
  id: true,
  viewCount: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertNotice = z.infer<typeof insertNoticeSchema>;
export type Notice = typeof notices.$inferSelect;

export const pagePermissions = pgTable("page_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  pageKey: text("page_key").notNull(),
});

export const insertPagePermissionSchema = createInsertSchema(pagePermissions).omit({
  id: true,
});

export type InsertPagePermission = z.infer<typeof insertPagePermissionSchema>;
export type PagePermission = typeof pagePermissions.$inferSelect;

export const systemSettings = pgTable("system_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  settingKey: text("setting_key").notNull().unique(),
  settingValue: text("setting_value").notNull().default(""),
});

export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({
  id: true,
});

export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;
export type SystemSetting = typeof systemSettings.$inferSelect;

export const databaseBackups = pgTable("database_backups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  label: text("label"),
  createdByName: text("created_by_name").notNull(),
  createdByUserId: varchar("created_by_user_id"),
  tableCounts: text("table_counts"),
  sizeBytes: integer("size_bytes").default(0),
  data: text("data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDatabaseBackupSchema = createInsertSchema(databaseBackups).omit({
  id: true,
  createdAt: true,
});

export type InsertDatabaseBackup = z.infer<typeof insertDatabaseBackupSchema>;
export type DatabaseBackup = typeof databaseBackups.$inferSelect;

export const quotations = pgTable("quotations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quotationNumber: text("quotation_number").notNull(),
  quotationDate: timestamp("quotation_date").notNull(),
  validUntil: timestamp("valid_until"),
  customerName: text("customer_name").notNull(),
  customerCompany: text("customer_company"),
  customerPhone: text("customer_phone"),
  customerEmail: text("customer_email"),
  projectName: text("project_name"),
  bankType: text("bank_type").default("bank1"),
  items: text("items").notNull(),
  subtotal: integer("subtotal").notNull().default(0),
  vatAmount: integer("vat_amount").notNull().default(0),
  totalAmount: integer("total_amount").notNull().default(0),
  notes: text("notes"),
  createdById: varchar("created_by_id").references(() => users.id),
  createdByName: text("created_by_name").notNull(),
  createdByEmail: text("created_by_email"),
  createdByPhone: text("created_by_phone"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertQuotationSchema = createInsertSchema(quotations).omit({
  id: true,
  createdAt: true,
});

export type InsertQuotation = z.infer<typeof insertQuotationSchema>;
export type Quotation = typeof quotations.$inferSelect;

export interface QuotationItem {
  productName: string;
  category: string;
  description: string;
  quantity: number;
  unitPrice: number;
  unitPriceText?: string;
  amount: number;
  vatType: string;
  remark: string;
}

export const importBatches = pgTable("import_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  userName: text("user_name").notNull(),
  fileName: text("file_name").notNull(),
  sheetName: text("sheet_name"),
  sheetType: text("sheet_type").notNull(),
  status: text("status").notNull().default("pending"),
  totalRows: integer("total_rows").default(0),
  validRows: integer("valid_rows").default(0),
  errorRows: integer("error_rows").default(0),
  importedRows: integer("imported_rows").default(0),
  mappingConfig: text("mapping_config"),
  errorDetails: text("error_details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertImportBatchSchema = createInsertSchema(importBatches).omit({
  id: true,
  createdAt: true,
});
export type InsertImportBatch = z.infer<typeof insertImportBatchSchema>;
export type ImportBatch = typeof importBatches.$inferSelect;

export const importStagingRows = pgTable("import_staging_rows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  batchId: varchar("batch_id").notNull().references(() => importBatches.id, { onDelete: "cascade" }),
  rowIndex: integer("row_index").notNull(),
  rawData: text("raw_data").notNull(),
  contractDate: timestamp("contract_date"),
  customerName: text("customer_name"),
  userIdentifier: text("user_identifier"),
  managerName: text("manager_name"),
  productName: text("product_name"),
  unitPrice: integer("unit_price").default(0),
  days: integer("days").default(0),
  quantity: integer("quantity").default(1),
  cost: integer("cost").default(0),
  workCost: integer("work_cost").default(0),
  workerName: text("worker_name"),
  supplyAmount: integer("supply_amount").default(0),
  vatAmount: integer("vat_amount").default(0),
  paymentConfirmed: text("payment_confirmed"),
  invoiceIssued: text("invoice_issued"),
  disbursementStatus: text("disbursement_status"),
  notes: text("notes"),
  errors: text("errors"),
  isValid: boolean("is_valid").default(true),
  isDuplicate: boolean("is_duplicate").default(false),
});

export const insertImportStagingRowSchema = createInsertSchema(importStagingRows).omit({
  id: true,
});
export type InsertImportStagingRow = z.infer<typeof insertImportStagingRowSchema>;
export type ImportStagingRow = typeof importStagingRows.$inferSelect;

export const importMappings = pgTable("import_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  name: text("name").notNull(),
  sheetType: text("sheet_type").notNull(),
  mappingConfig: text("mapping_config").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertImportMappingSchema = createInsertSchema(importMappings).omit({
  id: true,
  createdAt: true,
});
export type InsertImportMapping = z.infer<typeof insertImportMappingSchema>;
export type ImportMapping = typeof importMappings.$inferSelect;

export const allPages = [
  { key: "sales_analytics", label: "매출분석", path: "/analytics/sales" },
  { key: "deals", label: "고객DB", path: "/deals" },
  { key: "regional_customer_list", label: "고객리스트", path: "/regional-customer-list" },
  { key: "regional_unpaids", label: "미납", path: "/regional-unpaids" },
  { key: "regional_unpaid_db", label: "미납DB", path: "/regional-unpaid-db" },
  { key: "regional_management_fees", label: "관리비", path: "/regional-management-fees" },
  { key: "activities", label: "활동관리", path: "/activities" },
  { key: "timeline", label: "타임라인", path: "/timeline" },
  { key: "contracts", label: "계약관리", path: "/contracts" },
  { key: "refunds", label: "환불관리", path: "/refunds" },
  { key: "payments", label: "매출관리", path: "/payments" },
  { key: "receivables", label: "미수금관리", path: "/receivables" },
  { key: "deposit_confirmations", label: "입금확인", path: "/deposit-confirmations" },
  { key: "customers", label: "고객관리", path: "/customers" },
  { key: "products", label: "상품", path: "/products" },
  { key: "quotations", label: "견적서", path: "/quotations" },
  { key: "notice", label: "공지사항", path: "/notice" },
  { key: "users", label: "사용자관리", path: "/settings/users" },
  { key: "org_chart", label: "조직도", path: "/settings/org" },
  { key: "system_logs", label: "시스템로그", path: "/settings/logs" },
  { key: "permissions", label: "권한설정", path: "/settings/permissions" },
  { key: "system_settings", label: "시스템설정", path: "/settings/system" },
  { key: "backup", label: "백업관리", path: "/settings/backup" },
] as const;

export const departmentDefaultPages: Record<string, string[]> = {
  "마케팅팀": ["contracts", "customers", "deposit_confirmations", "products", "org_chart", "sales_analytics", "notice"],
  "타지역팀": ["deals", "regional_customer_list", "regional_unpaids", "regional_unpaid_db", "regional_management_fees", "sales_analytics", "products", "quotations", "notice"],
  "경영지원팀": ["sales_analytics", "payments", "receivables", "deposit_confirmations", "notice"],
  "경영지원실": ["sales_analytics", "payments", "receivables", "deposit_confirmations", "notice"],
};


