import { db } from "./db";
import { and, asc, count, desc, eq, ilike, inArray, lte, gte, or, sql } from "drizzle-orm";
import {
  users,
  customers,
  contacts,
  deals,
  activities,
  payments,
  systemLogs,
  products,
  productRateHistories,
  contracts,
  refunds,
  keeps,
  regionalManagementFees,
  regionalCustomerLists,
  deposits,
  notices,
  pagePermissions,
  systemSettings,
  type User,
  type InsertUser,
  type Customer,
  type InsertCustomer,
  type Contact,
  type InsertContact,
  type Deal,
  type InsertDeal,
  type Activity,
  type InsertActivity,
  type Payment,
  type InsertPayment,
  type SystemLog,
  type InsertSystemLog,
  type Product,
  type InsertProduct,
  type ProductRateHistory,
  type InsertProductRateHistory,
  type Contract,
  type InsertContract,
  type Refund,
  type InsertRefund,
  type RefundWithContract,
  type Keep,
  type InsertKeep,
  type KeepWithContract,
  type RegionalManagementFee,
  type InsertRegionalManagementFee,
  type RegionalCustomerList,
  type InsertRegionalCustomerList,
  type ContractWithFinancials,
  type Deposit,
  type InsertDeposit,
  type Notice,
  type InsertNotice,
  type PagePermission,
  type InsertPagePermission,
  type SystemSetting,
  dealTimelines,
  type DealTimeline,
  type InsertDealTimeline,
  databaseBackups,
  type DatabaseBackup,
  type InsertDatabaseBackup,
  quotations,
  type Quotation,
  type InsertQuotation,
  importBatches,
  importStagingRows,
  importMappings,
  type ImportBatch,
  type InsertImportBatch,
  type ImportStagingRow,
  type InsertImportStagingRow,
  type ImportMapping,
  type InsertImportMapping,
} from "@shared/schema";
import { matchesKoreanSearch } from "@shared/korean-search";
import { decryptRecordFields, encryptRecordFields, STORAGE_PII_FIELDS } from "./pii-security";

export interface IStorage {
  getUsers(): Promise<User[]>;
  getUser(id: string): Promise<User | undefined>;
  getUserByLoginId(loginId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<void>;
  
  getCustomers(): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: string, customer: Partial<InsertCustomer>): Promise<Customer | undefined>;
  deleteCustomer(id: string): Promise<void>;
  
  getContacts(customerId?: string): Promise<Contact[]>;
  getContact(id: string): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: string, contact: Partial<InsertContact>): Promise<Contact | undefined>;
  deleteContact(id: string): Promise<void>;
  
  getDeals(): Promise<Deal[]>;
  getDeal(id: string): Promise<Deal | undefined>;
  createDeal(deal: InsertDeal): Promise<Deal>;
  updateDeal(id: string, deal: Partial<InsertDeal>): Promise<Deal | undefined>;
  deleteDeal(id: string): Promise<void>;
  
  getActivities(): Promise<Activity[]>;
  getActivity(id: string): Promise<Activity | undefined>;
  createActivity(activity: InsertActivity): Promise<Activity>;
  deleteActivity(id: string): Promise<void>;
  
  getStats(): Promise<{
    totalCustomers: number;
    totalDeals: number;
    totalValue: number;
    wonDeals: number;
  }>;
  
  getPayments(): Promise<Payment[]>;
  getPayment(id: string): Promise<Payment | undefined>;
  getPaymentByContractId(contractId: string): Promise<Payment | undefined>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePayment(id: string, payment: Partial<InsertPayment>): Promise<Payment | undefined>;
  updatePaymentByContractId(contractId: string, payment: Partial<InsertPayment>): Promise<Payment | undefined>;
  deletePayment(id: string): Promise<void>;
  
  getSystemLogs(): Promise<SystemLog[]>;
  createSystemLog(log: InsertSystemLog): Promise<SystemLog>;
  
  getProducts(): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: string, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: string): Promise<void>;
  getProductRateHistories(productId?: string): Promise<ProductRateHistory[]>;
  createProductRateHistory(history: InsertProductRateHistory): Promise<ProductRateHistory>;
  
  getContracts(): Promise<Contract[]>;
  getContractsPaged(params: ContractPagedQuery): Promise<ContractPagedResult>;
  getContract(id: string): Promise<Contract | undefined>;
  createContract(contract: InsertContract): Promise<Contract>;
  updateContract(id: string, contract: Partial<InsertContract>): Promise<Contract | undefined>;
  deleteContract(id: string): Promise<void>;
  
  getContractsWithFinancials(): Promise<ContractWithFinancials[]>;
  
  getAllRefunds(): Promise<RefundWithContract[]>;
  getRefund(id: string): Promise<Refund | undefined>;
  getRefundsByContract(contractId: string, itemId?: string): Promise<Refund[]>;
  createRefund(refund: InsertRefund): Promise<Refund>;
  updateRefundStatuses(ids: string[], refundStatus: string): Promise<number>;
  deleteRefund(id: string): Promise<void>;

  getAllKeeps(): Promise<KeepWithContract[]>;
  getKeep(id: string): Promise<Keep | undefined>;
  getKeepsByContract(contractId: string, itemId?: string): Promise<Keep[]>;
  createKeep(keep: InsertKeep): Promise<Keep>;
  updateKeep(id: string, keep: Partial<InsertKeep>): Promise<Keep | undefined>;
  deleteKeep(id: string): Promise<void>;

  getRegionalManagementFees(): Promise<RegionalManagementFee[]>;
  getRegionalManagementFee(id: string): Promise<RegionalManagementFee | undefined>;
  createRegionalManagementFee(fee: InsertRegionalManagementFee): Promise<RegionalManagementFee>;
  updateRegionalManagementFee(id: string, fee: Partial<InsertRegionalManagementFee>): Promise<RegionalManagementFee | undefined>;
  deleteRegionalManagementFee(id: string): Promise<void>;

  getRegionalCustomerLists(): Promise<RegionalCustomerList[]>;
  getRegionalCustomerList(id: string): Promise<RegionalCustomerList | undefined>;
  createRegionalCustomerList(item: InsertRegionalCustomerList): Promise<RegionalCustomerList>;
  updateRegionalCustomerList(id: string, item: Partial<InsertRegionalCustomerList>): Promise<RegionalCustomerList | undefined>;
  deleteRegionalCustomerList(id: string): Promise<void>;
  
  getDeposits(): Promise<Deposit[]>;
  getDeposit(id: string): Promise<Deposit | undefined>;
  createDeposit(deposit: InsertDeposit): Promise<Deposit>;
  createDeposits(depositList: InsertDeposit[]): Promise<Deposit[]>;
  updateDeposit(id: string, deposit: Partial<InsertDeposit>): Promise<Deposit | undefined>;
  deleteDeposit(id: string): Promise<void>;

  getPagePermissions(): Promise<PagePermission[]>;
  getPagePermissionsByUser(userId: string): Promise<PagePermission[]>;
  setPagePermissions(userId: string, pageKeys: string[]): Promise<void>;
  
  getSystemSettings(): Promise<SystemSetting[]>;
  getSystemSetting(key: string): Promise<SystemSetting | undefined>;
  setSystemSetting(key: string, value: string): Promise<SystemSetting>;
  setSystemSettingsBulk(settings: Record<string, string>): Promise<void>;

  getDealTimelines(dealId: string): Promise<DealTimeline[]>;
  createDealTimeline(timeline: InsertDealTimeline): Promise<DealTimeline>;
  deleteDealTimeline(id: string): Promise<void>;

  getNotices(): Promise<Notice[]>;
  getNotice(id: string): Promise<Notice | undefined>;
  createNotice(notice: InsertNotice): Promise<Notice>;
  updateNotice(id: string, notice: Partial<InsertNotice>): Promise<Notice | undefined>;
  deleteNotice(id: string): Promise<void>;
  incrementNoticeViewCount(id: string): Promise<void>;

  getBackups(): Promise<Omit<DatabaseBackup, 'data'>[]>;
  getBackup(id: string): Promise<DatabaseBackup | undefined>;
  createBackup(backup: InsertDatabaseBackup): Promise<DatabaseBackup>;
  deleteBackup(id: string): Promise<void>;

  getQuotations(): Promise<Quotation[]>;
  getQuotation(id: string): Promise<Quotation | undefined>;
  createQuotation(quotation: InsertQuotation): Promise<Quotation>;
  updateQuotation(id: string, quotation: Partial<InsertQuotation>): Promise<Quotation | undefined>;
  deleteQuotation(id: string): Promise<void>;
  getNextQuotationNumber(): Promise<string>;

  getImportBatches(): Promise<ImportBatch[]>;
  getImportBatch(id: string): Promise<ImportBatch | undefined>;
  createImportBatch(batch: InsertImportBatch): Promise<ImportBatch>;
  updateImportBatch(id: string, batch: Partial<InsertImportBatch>): Promise<ImportBatch | undefined>;
  deleteImportBatch(id: string): Promise<void>;

  getImportStagingRows(batchId: string): Promise<ImportStagingRow[]>;
  createImportStagingRows(rows: InsertImportStagingRow[]): Promise<ImportStagingRow[]>;
  deleteImportStagingRows(batchId: string): Promise<void>;

  getImportMappings(userId?: string): Promise<ImportMapping[]>;
  createImportMapping(mapping: InsertImportMapping): Promise<ImportMapping>;
  deleteImportMapping(id: string): Promise<void>;
}

export type ContractPagedQuery = {
  page: number;
  pageSize: number;
  search?: string;
  managerName?: string;
  customerName?: string;
  productCategory?: string;
  paymentMethod?: string;
  sort?: "contractDateDesc" | "contractDateAsc" | "customerNameAsc";
  startDate?: Date;
  endDate?: Date;
};

export type ContractPagedResult = {
  items: Contract[];
  total: number;
  page: number;
  pageSize: number;
};

function normalizeCompactText(value: string): string {
  return String(value || "").replace(/\s+/g, "").trim();
}

const USER_PII_FIELDS = [...STORAGE_PII_FIELDS.users];
const CUSTOMER_PII_FIELDS = [...STORAGE_PII_FIELDS.customers];
const CONTACT_PII_FIELDS = [...STORAGE_PII_FIELDS.contacts];
const DEAL_PII_FIELDS = [...STORAGE_PII_FIELDS.deals];
const PAYMENT_PII_FIELDS = [...STORAGE_PII_FIELDS.payments];
const SYSTEM_LOG_PII_FIELDS = [...STORAGE_PII_FIELDS.systemLogs];
const CONTRACT_PII_FIELDS = [...STORAGE_PII_FIELDS.contracts];
const REFUND_PII_FIELDS = [...STORAGE_PII_FIELDS.refunds];
const KEEP_PII_FIELDS = [...STORAGE_PII_FIELDS.keeps];
const DEPOSIT_PII_FIELDS = [...STORAGE_PII_FIELDS.deposits];
const QUOTATION_PII_FIELDS = [...STORAGE_PII_FIELDS.quotations];

function encryptPiiRow<T extends Record<string, any>>(row: T, fields: readonly string[]): T {
  return encryptRecordFields(row, fields);
}

function decryptPiiRow<T extends Record<string, any>>(row: T, fields: readonly string[]): T {
  return decryptRecordFields(row, fields);
}

export class DatabaseStorage implements IStorage {
  async getUsers(): Promise<User[]> {
    const results = await db.select().from(users).orderBy(desc(users.createdAt));
    return results.map((row) => decryptPiiRow(row, USER_PII_FIELDS));
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user ? decryptPiiRow(user, USER_PII_FIELDS) : undefined;
  }

  async getUserByLoginId(loginId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.loginId, loginId));
    return user ? decryptPiiRow(user, USER_PII_FIELDS) : undefined;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(encryptPiiRow(user, USER_PII_FIELDS)).returning();
    return decryptPiiRow(created, USER_PII_FIELDS);
  }

  async updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined> {
    const [updated] = await db.update(users).set(encryptPiiRow(user, USER_PII_FIELDS)).where(eq(users.id, id)).returning();
    return updated ? decryptPiiRow(updated, USER_PII_FIELDS) : undefined;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async getCustomers(): Promise<Customer[]> {
    const results = await db.select().from(customers).orderBy(desc(customers.createdAt));
    return results.map((row) => decryptPiiRow(row, CUSTOMER_PII_FIELDS));
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer ? decryptPiiRow(customer, CUSTOMER_PII_FIELDS) : undefined;
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    const [created] = await db.insert(customers).values(encryptPiiRow(customer, CUSTOMER_PII_FIELDS)).returning();
    return decryptPiiRow(created, CUSTOMER_PII_FIELDS);
  }

  async updateCustomer(id: string, customer: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const [updated] = await db
      .update(customers)
      .set(encryptPiiRow(customer, CUSTOMER_PII_FIELDS))
      .where(eq(customers.id, id))
      .returning();
    return updated ? decryptPiiRow(updated, CUSTOMER_PII_FIELDS) : undefined;
  }

  async deleteCustomer(id: string): Promise<void> {
    await db.delete(activities).where(eq(activities.customerId, id));
    await db.delete(deals).where(eq(deals.customerId, id));
    await db.delete(contacts).where(eq(contacts.customerId, id));
    await db.delete(customers).where(eq(customers.id, id));
  }

  async getContacts(customerId?: string): Promise<Contact[]> {
    if (customerId) {
      const results = await db.select().from(contacts).where(eq(contacts.customerId, customerId));
      return results.map((row) => decryptPiiRow(row, CONTACT_PII_FIELDS));
    }
    const results = await db.select().from(contacts);
    return results.map((row) => decryptPiiRow(row, CONTACT_PII_FIELDS));
  }

  async getContact(id: string): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    return contact ? decryptPiiRow(contact, CONTACT_PII_FIELDS) : undefined;
  }

  async createContact(contact: InsertContact): Promise<Contact> {
    const [created] = await db.insert(contacts).values(encryptPiiRow(contact, CONTACT_PII_FIELDS)).returning();
    return decryptPiiRow(created, CONTACT_PII_FIELDS);
  }

  async updateContact(id: string, contact: Partial<InsertContact>): Promise<Contact | undefined> {
    const [updated] = await db
      .update(contacts)
      .set(encryptPiiRow(contact, CONTACT_PII_FIELDS))
      .where(eq(contacts.id, id))
      .returning();
    return updated ? decryptPiiRow(updated, CONTACT_PII_FIELDS) : undefined;
  }

  async deleteContact(id: string): Promise<void> {
    await db.delete(contacts).where(eq(contacts.id, id));
  }

  async getDeals(): Promise<Deal[]> {
    const results = await db.select().from(deals).orderBy(desc(deals.createdAt));
    return results.map((row) => decryptPiiRow(row, DEAL_PII_FIELDS));
  }

  async getDeal(id: string): Promise<Deal | undefined> {
    const [deal] = await db.select().from(deals).where(eq(deals.id, id));
    return deal ? decryptPiiRow(deal, DEAL_PII_FIELDS) : undefined;
  }

  async createDeal(deal: InsertDeal): Promise<Deal> {
    const [created] = await db.insert(deals).values(encryptPiiRow(deal, DEAL_PII_FIELDS)).returning();
    return decryptPiiRow(created, DEAL_PII_FIELDS);
  }

  async updateDeal(id: string, deal: Partial<InsertDeal>): Promise<Deal | undefined> {
    const [updated] = await db.update(deals).set(encryptPiiRow(deal, DEAL_PII_FIELDS)).where(eq(deals.id, id)).returning();
    return updated ? decryptPiiRow(updated, DEAL_PII_FIELDS) : undefined;
  }

  async deleteDeal(id: string): Promise<void> {
    await db.delete(activities).where(eq(activities.dealId, id));
    await db.delete(deals).where(eq(deals.id, id));
  }

  async getActivities(): Promise<Activity[]> {
    return db.select().from(activities).orderBy(desc(activities.createdAt));
  }

  async getActivity(id: string): Promise<Activity | undefined> {
    const [activity] = await db.select().from(activities).where(eq(activities.id, id));
    return activity;
  }

  async createActivity(activity: InsertActivity): Promise<Activity> {
    const [created] = await db.insert(activities).values(activity).returning();
    return created;
  }

  async deleteActivity(id: string): Promise<void> {
    await db.delete(activities).where(eq(activities.id, id));
  }

  async getStats(): Promise<{
    totalCustomers: number;
    totalDeals: number;
    totalValue: number;
    wonDeals: number;
  }> {
    const [customerCount] = await db.select({ count: sql<number>`count(*)` }).from(customers);
    const [dealStats] = await db.select({
      count: sql<number>`count(*)`,
      totalValue: sql<number>`coalesce(sum(${deals.value}), 0)`,
      wonDeals: sql<number>`count(*) filter (where ${deals.stage} = 'closed_won')`,
    }).from(deals);

    return {
      totalCustomers: Number(customerCount?.count || 0),
      totalDeals: Number(dealStats?.count || 0),
      totalValue: Number(dealStats?.totalValue || 0),
      wonDeals: Number(dealStats?.wonDeals || 0),
    };
  }

  async getPayments(): Promise<Payment[]> {
    const results = await db.select().from(payments).orderBy(desc(payments.depositDate));
    return results.map((row) => decryptPiiRow(row, PAYMENT_PII_FIELDS));
  }

  async getPayment(id: string): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    return payment ? decryptPiiRow(payment, PAYMENT_PII_FIELDS) : undefined;
  }

  async getPaymentByContractId(contractId: string): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.contractId, contractId));
    return payment ? decryptPiiRow(payment, PAYMENT_PII_FIELDS) : undefined;
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [created] = await db.insert(payments).values(encryptPiiRow(payment, PAYMENT_PII_FIELDS)).returning();
    return decryptPiiRow(created, PAYMENT_PII_FIELDS);
  }

  async updatePayment(id: string, payment: Partial<InsertPayment>): Promise<Payment | undefined> {
    const [updated] = await db
      .update(payments)
      .set(encryptPiiRow(payment, PAYMENT_PII_FIELDS))
      .where(eq(payments.id, id))
      .returning();
    return updated ? decryptPiiRow(updated, PAYMENT_PII_FIELDS) : undefined;
  }

  async updatePaymentByContractId(contractId: string, payment: Partial<InsertPayment>): Promise<Payment | undefined> {
    const [updated] = await db
      .update(payments)
      .set(encryptPiiRow(payment, PAYMENT_PII_FIELDS))
      .where(eq(payments.contractId, contractId))
      .returning();
    return updated ? decryptPiiRow(updated, PAYMENT_PII_FIELDS) : undefined;
  }

  async deletePayment(id: string): Promise<void> {
    await db.delete(payments).where(eq(payments.id, id));
  }

  async getSystemLogs(): Promise<SystemLog[]> {
    const results = await db.select().from(systemLogs).orderBy(desc(systemLogs.createdAt));
    return results.map((row) => decryptPiiRow(row, SYSTEM_LOG_PII_FIELDS));
  }

  async createSystemLog(log: InsertSystemLog): Promise<SystemLog> {
    const [created] = await db.insert(systemLogs).values(encryptPiiRow(log, SYSTEM_LOG_PII_FIELDS)).returning();
    return decryptPiiRow(created, SYSTEM_LOG_PII_FIELDS);
  }

  async getProducts(): Promise<Product[]> {
    return db.select().from(products).orderBy(desc(products.createdAt));
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [created] = await db.insert(products).values(product).returning();
    return created;
  }

  async updateProduct(id: string, product: Partial<InsertProduct>): Promise<Product | undefined> {
    const [updated] = await db.update(products).set(product).where(eq(products.id, id)).returning();
    return updated;
  }

  async deleteProduct(id: string): Promise<void> {
    await db.delete(products).where(eq(products.id, id));
  }

  async getProductRateHistories(productId?: string): Promise<ProductRateHistory[]> {
    if (productId) {
      return db
        .select()
        .from(productRateHistories)
        .where(eq(productRateHistories.productId, productId))
        .orderBy(desc(productRateHistories.effectiveFrom), desc(productRateHistories.createdAt));
    }
    return db
      .select()
      .from(productRateHistories)
      .orderBy(desc(productRateHistories.effectiveFrom), desc(productRateHistories.createdAt));
  }

  async createProductRateHistory(history: InsertProductRateHistory): Promise<ProductRateHistory> {
    const [created] = await db.insert(productRateHistories).values(history).returning();
    return created;
  }

  async getContracts(): Promise<Contract[]> {
    const results = await db.select().from(contracts).orderBy(desc(contracts.contractDate));
    return results.map((row) => decryptPiiRow(row, CONTRACT_PII_FIELDS));
  }

  async getContractsPaged(params: ContractPagedQuery): Promise<ContractPagedResult> {
    const page = Math.max(1, Math.floor(Number(params.page) || 1));
    const pageSize = Math.min(200, Math.max(1, Math.floor(Number(params.pageSize) || 10)));
    const offset = (page - 1) * pageSize;
    const sort = params.sort || "contractDateDesc";

    const search = String(params.search || "").trim();
    const managerName = String(params.managerName || "").trim();
    const customerName = String(params.customerName || "").trim();
    const productCategory = String(params.productCategory || "").trim();
    const paymentMethod = String(params.paymentMethod || "").trim();

    const filters: any[] = [];

    if (managerName) {
      filters.push(eq(contracts.managerName, managerName));
    }

    if (customerName) {
      filters.push(eq(contracts.customerName, customerName));
    }

    if (paymentMethod) {
      const normalizedPayment = normalizeCompactText(paymentMethod);
      if (normalizedPayment === "입금전") {
        filters.push(or(eq(contracts.paymentMethod, "입금 전"), eq(contracts.paymentMethod, "입금전")));
      } else if (normalizedPayment === "입금확인") {
        filters.push(
          or(
            eq(contracts.paymentMethod, "입금확인"),
            eq(contracts.paymentMethod, "입금완료"),
            eq(contracts.paymentMethod, "하나"),
            eq(contracts.paymentMethod, "국민"),
            eq(contracts.paymentMethod, "농협"),
            eq(contracts.paymentMethod, "하나은행"),
            eq(contracts.paymentMethod, "국민은행"),
            eq(contracts.paymentMethod, "농협은행"),
          ),
        );
      } else if (normalizedPayment === "환불요청") {
        filters.push(
          or(
            eq(contracts.paymentMethod, "환불요청"),
            eq(contracts.paymentMethod, "환불처리"),
            eq(contracts.paymentMethod, "환불등록"),
          ),
        );
      } else if (normalizedPayment === "적립금사용") {
        filters.push(
          or(
            eq(contracts.paymentMethod, "적립금 등록"),
            eq(contracts.paymentMethod, "적립금등록"),
            eq(contracts.paymentMethod, "적립"),
            eq(contracts.paymentMethod, "적립금"),
            eq(contracts.paymentMethod, "적립금사용"),
          ),
        );
      } else if (normalizedPayment === "기타") {
        filters.push(or(eq(contracts.paymentMethod, "기타"), eq(contracts.paymentMethod, "체크")));
      } else {
        filters.push(eq(contracts.paymentMethod, paymentMethod));
      }
    }

    if (params.startDate) {
      filters.push(gte(contracts.contractDate, params.startDate));
    }

    if (params.endDate) {
      filters.push(lte(contracts.contractDate, params.endDate));
    }

    if (productCategory) {
      const productRows = await db
        .select({ name: products.name })
        .from(products)
        .where(eq(products.category, productCategory));

      const productNames = productRows
        .map((row) => String(row.name || "").trim())
        .filter(Boolean);

      if (productNames.length === 0) {
        return { items: [], total: 0, page, pageSize };
      }

      const categoryFilters = productNames.map((name) =>
        ilike(contracts.products, `%${name.replace(/[%_]/g, "\\$&")}%`),
      );
      filters.push(categoryFilters.length === 1 ? categoryFilters[0] : or(...categoryFilters));
    }

    const whereClause = filters.length > 0 ? and(...filters) : undefined;
    const orderByClause =
      sort === "contractDateAsc"
        ? [asc(contracts.contractDate), desc(contracts.createdAt)]
        : sort === "customerNameAsc"
          ? [asc(contracts.customerName), desc(contracts.contractDate), desc(contracts.createdAt)]
          : [desc(contracts.contractDate), desc(contracts.createdAt)];

    if (search) {
      const rows = whereClause
        ? await db.select().from(contracts).where(whereClause).orderBy(...orderByClause)
        : await db.select().from(contracts).orderBy(...orderByClause);

      const decryptedRows = rows.map((row) => decryptPiiRow(row, CONTRACT_PII_FIELDS));
      const filteredRows = decryptedRows.filter((row) =>
        matchesKoreanSearch(
          [row.contractNumber, row.customerName, row.userIdentifier, row.managerName, row.products],
          search,
        ),
      );

      return {
        items: filteredRows.slice(offset, offset + pageSize),
        total: filteredRows.length,
        page,
        pageSize,
      };
    }

    const totalRows = whereClause
      ? await db.select({ total: count() }).from(contracts).where(whereClause)
      : await db.select({ total: count() }).from(contracts);

    const items = whereClause
      ? await db
          .select()
          .from(contracts)
          .where(whereClause)
          .orderBy(...orderByClause)
          .limit(pageSize)
          .offset(offset)
      : await db
          .select()
          .from(contracts)
          .orderBy(...orderByClause)
          .limit(pageSize)
          .offset(offset);

    return {
      items: items.map((row) => decryptPiiRow(row, CONTRACT_PII_FIELDS)),
      total: Number(totalRows[0]?.total || 0),
      page,
      pageSize,
    };
  }

  async getContract(id: string): Promise<Contract | undefined> {
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id));
    return contract ? decryptPiiRow(contract, CONTRACT_PII_FIELDS) : undefined;
  }

  async createContract(contract: InsertContract): Promise<Contract> {
    const [created] = await db.insert(contracts).values(encryptPiiRow(contract, CONTRACT_PII_FIELDS)).returning();
    return decryptPiiRow(created, CONTRACT_PII_FIELDS);
  }

  async updateContract(id: string, contract: Partial<InsertContract>): Promise<Contract | undefined> {
    const [updated] = await db
      .update(contracts)
      .set(encryptPiiRow(contract, CONTRACT_PII_FIELDS))
      .where(eq(contracts.id, id))
      .returning();
    return updated ? decryptPiiRow(updated, CONTRACT_PII_FIELDS) : undefined;
  }

  async deleteContract(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(payments).where(eq(payments.contractId, id));
      await tx.delete(deposits).where(eq(deposits.contractId, id));
      await tx.delete(refunds).where(eq(refunds.contractId, id));
      await tx.delete(keeps).where(eq(keeps.contractId, id));
      await tx.delete(contracts).where(eq(contracts.id, id));
    });
  }

  async getContractsWithFinancials(): Promise<ContractWithFinancials[]> {
    const allContracts = (await db.select().from(contracts).orderBy(desc(contracts.contractDate))).map((row) =>
      decryptPiiRow(row, CONTRACT_PII_FIELDS),
    );
    const allRefunds = (await db.select().from(refunds)).map((row) => decryptPiiRow(row, REFUND_PII_FIELDS));
    const allKeeps = (await db.select().from(keeps)).map((row) => decryptPiiRow(row, KEEP_PII_FIELDS));
    const allProducts = await db.select().from(products);
    const allProductRateHistories = await db.select().from(productRateHistories);

    const productMap = new Map<string, typeof allProducts[0]>();
    for (const p of allProducts) {
      productMap.set(p.name, p);
    }

    const productHistoryMap = new Map<string, ProductRateHistory[]>();
    for (const history of allProductRateHistories) {
      const key = (history.productName || "").trim();
      if (!key) continue;
      if (!productHistoryMap.has(key)) {
        productHistoryMap.set(key, []);
      }
      productHistoryMap.get(key)!.push(history);
    }
    Array.from(productHistoryMap.values()).forEach((historyList) => {
      historyList.sort((a: ProductRateHistory, b: ProductRateHistory) => {
        const effectiveDiff = new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime();
        if (effectiveDiff !== 0) return effectiveDiff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    });

    const resolveProductSnapshot = (productName: string, contractDate: Date | string | null | undefined) => {
      const normalizedName = (productName || "").trim();
      if (!normalizedName) return undefined;
      const historyList = productHistoryMap.get(normalizedName) ?? [];
      if (historyList.length > 0) {
        const contractTime = contractDate ? new Date(contractDate).getTime() : Number.NaN;
        if (!Number.isNaN(contractTime)) {
          const matched = historyList.find((history) => new Date(history.effectiveFrom).getTime() <= contractTime);
          if (matched) return matched;
          return historyList[historyList.length - 1];
        }
        return historyList[0];
      }
      return productMap.get(normalizedName);
    };

    const refundMap = new Map<string, { total: number; lastDate: string | null; count: number }>();
    for (const r of allRefunds) {
      const existing = refundMap.get(r.contractId) || { total: 0, lastDate: null as string | null, count: 0 };
      existing.total += r.amount;
      existing.count += 1;
      const rDate = new Date(r.refundDate).toISOString();
      if (!existing.lastDate || rDate > existing.lastDate) {
        existing.lastDate = rDate;
      }
      refundMap.set(r.contractId, existing);
    }

    const keepMap = new Map<string, { total: number; lastDate: string | null; count: number }>();
    for (const k of allKeeps) {
      const existing = keepMap.get(k.contractId) || { total: 0, lastDate: null as string | null, count: 0 };
      existing.total += k.amount;
      existing.count += 1;
      const kDate = new Date(k.keepDate).toISOString();
      if (!existing.lastDate || kDate > existing.lastDate) {
        existing.lastDate = kDate;
      }
      keepMap.set(k.contractId, existing);
    }

    return allContracts.map(c => {
      let workerValue = c.worker ?? "";
      let workCostValue = c.workCost ?? 0;
      if (!workerValue && c.products) {
        const productNames = c.products.split(",").map(n => n.trim());
        const workers = productNames
          .map(name => resolveProductSnapshot(name, c.contractDate)?.worker)
          .filter((w): w is string => !!w);
        workerValue = Array.from(new Set(workers)).join(", ");
      }
      return {
        ...c,
        worker: workerValue,
        workCost: workCostValue,
        totalRefund: refundMap.get(c.id)?.total ?? 0,
        lastRefundDate: refundMap.get(c.id)?.lastDate ?? null,
        refundCount: refundMap.get(c.id)?.count ?? 0,
        totalKeep: keepMap.get(c.id)?.total ?? 0,
        lastKeepDate: keepMap.get(c.id)?.lastDate ?? null,
        keepCount: keepMap.get(c.id)?.count ?? 0,
      };
    });
  }

  async getAllRefunds(): Promise<RefundWithContract[]> {
    const result = await db
      .select({
        id: refunds.id,
        contractId: refunds.contractId,
        itemId: refunds.itemId,
        amount: refunds.amount,
        quantity: refunds.quantity,
        refundDays: refunds.refundDays,
        account: refunds.account,
        slot: refunds.slot,
        reason: refunds.reason,
        worker: refunds.worker,
        previousPaymentMethod: refunds.previousPaymentMethod,
        refundStatus: refunds.refundStatus,
        refundDate: refunds.refundDate,
        createdBy: refunds.createdBy,
        createdAt: refunds.createdAt,
        contractNumber: contracts.contractNumber,
        customerName: contracts.customerName,
        contractDate: contracts.contractDate,
        userIdentifier: sql<string | null>`coalesce(${refunds.userIdentifier}, ${contracts.userIdentifier})`,
        productName: sql<string | null>`coalesce(${refunds.productName}, ${contracts.products})`,
        products: sql<string | null>`coalesce(${refunds.productName}, ${contracts.products})`,
        days: sql<number | null>`case when ${refunds.itemId} is not null then ${refunds.days} else ${contracts.days} end`,
        addQuantity: sql<number | null>`case when ${refunds.itemId} is not null then ${refunds.addQuantity} else ${contracts.addQuantity} end`,
        extendQuantity: sql<number | null>`case when ${refunds.itemId} is not null then ${refunds.extendQuantity} else ${contracts.extendQuantity} end`,
        managerName: contracts.managerName,
        contractCost: sql<number | null>`case when ${refunds.targetAmount} > 0 then ${refunds.targetAmount} else ${contracts.cost} end`,
        targetAmount: refunds.targetAmount,
      })
      .from(refunds)
      .leftJoin(contracts, eq(refunds.contractId, contracts.id))
      .orderBy(desc(refunds.refundDate));
    return result.map(r => {
      const decrypted = decryptPiiRow(r, REFUND_PII_FIELDS);
      return {
        ...decrypted,
        contractNumber: decrypted.contractNumber ?? "",
        customerName: decrypted.customerName ?? "",
        userIdentifier: decrypted.userIdentifier ?? null,
        products: decrypted.products ?? null,
        days: decrypted.days ?? null,
        addQuantity: decrypted.addQuantity ?? null,
        extendQuantity: decrypted.extendQuantity ?? null,
        managerName: decrypted.managerName ?? null,
        contractCost: decrypted.contractCost ?? null,
        itemId: decrypted.itemId ?? null,
        targetAmount: decrypted.targetAmount ?? null,
        previousPaymentMethod: decrypted.previousPaymentMethod ?? null,
        refundStatus: decrypted.refundStatus ?? null,
        contractDate: decrypted.contractDate ?? null,
      };
    });
  }

  async getRefundsByContract(contractId: string, itemId?: string): Promise<Refund[]> {
    const whereClause = itemId
      ? and(eq(refunds.contractId, contractId), eq(refunds.itemId, itemId))
      : eq(refunds.contractId, contractId);
    const results = await db.select().from(refunds).where(whereClause).orderBy(desc(refunds.refundDate));
    return results.map((row) => decryptPiiRow(row, REFUND_PII_FIELDS));
  }

  async getRefund(id: string): Promise<Refund | undefined> {
    const [refund] = await db.select().from(refunds).where(eq(refunds.id, id));
    return refund ? decryptPiiRow(refund, REFUND_PII_FIELDS) : undefined;
  }

  async createRefund(refund: InsertRefund): Promise<Refund> {
    const [created] = await db.insert(refunds).values(encryptPiiRow(refund, REFUND_PII_FIELDS)).returning();
    return decryptPiiRow(created, REFUND_PII_FIELDS);
  }

  async updateRefundStatuses(ids: string[], refundStatus: string): Promise<number> {
    const normalizedIds = Array.from(new Set(ids.map((id) => String(id || "").trim()).filter(Boolean)));
    if (normalizedIds.length === 0) {
      return 0;
    }

    const updatedRows = await db
      .update(refunds)
      .set({ refundStatus })
      .where(inArray(refunds.id, normalizedIds))
      .returning({ id: refunds.id });

    return updatedRows.length;
  }

  async deleteRefund(id: string): Promise<void> {
    await db.delete(refunds).where(eq(refunds.id, id));
  }

  async getAllKeeps(): Promise<KeepWithContract[]> {
    const result = await db
      .select({
        id: keeps.id,
        contractId: keeps.contractId,
        itemId: keeps.itemId,
        amount: keeps.amount,
        keepDate: keeps.keepDate,
        reason: keeps.reason,
        worker: keeps.worker,
        previousPaymentMethod: keeps.previousPaymentMethod,
        keepStatus: keeps.keepStatus,
        decisionBy: keeps.decisionBy,
        decisionAt: keeps.decisionAt,
        createdBy: keeps.createdBy,
        createdAt: keeps.createdAt,
        contractNumber: contracts.contractNumber,
        customerName: contracts.customerName,
        userIdentifier: sql<string | null>`coalesce(${keeps.userIdentifier}, ${contracts.userIdentifier})`,
        productName: sql<string | null>`coalesce(${keeps.productName}, ${contracts.products})`,
        products: sql<string | null>`coalesce(${keeps.productName}, ${contracts.products})`,
        days: sql<number | null>`case when ${keeps.itemId} is not null then ${keeps.days} else ${contracts.days} end`,
        addQuantity: sql<number | null>`case when ${keeps.itemId} is not null then ${keeps.addQuantity} else ${contracts.addQuantity} end`,
        extendQuantity: sql<number | null>`case when ${keeps.itemId} is not null then ${keeps.extendQuantity} else ${contracts.extendQuantity} end`,
        managerName: contracts.managerName,
        contractCost: sql<number | null>`case when ${keeps.targetAmount} > 0 then ${keeps.targetAmount} else ${contracts.cost} end`,
        targetAmount: keeps.targetAmount,
      })
      .from(keeps)
      .leftJoin(contracts, eq(keeps.contractId, contracts.id))
      .orderBy(desc(keeps.keepDate));
    return result.map(r => {
      const decrypted = decryptPiiRow(r, KEEP_PII_FIELDS);
      return {
        ...decrypted,
        contractNumber: decrypted.contractNumber ?? "",
        customerName: decrypted.customerName ?? "",
        userIdentifier: decrypted.userIdentifier ?? null,
        products: decrypted.products ?? null,
        days: decrypted.days ?? null,
        addQuantity: decrypted.addQuantity ?? null,
        extendQuantity: decrypted.extendQuantity ?? null,
        managerName: decrypted.managerName ?? null,
        contractCost: decrypted.contractCost ?? null,
        itemId: decrypted.itemId ?? null,
        targetAmount: decrypted.targetAmount ?? null,
        previousPaymentMethod: decrypted.previousPaymentMethod ?? null,
        keepStatus: decrypted.keepStatus ?? null,
        decisionBy: decrypted.decisionBy ?? null,
        decisionAt: decrypted.decisionAt ?? null,
      };
    });
  }

  async getKeepsByContract(contractId: string, itemId?: string): Promise<Keep[]> {
    const whereClause = itemId
      ? and(eq(keeps.contractId, contractId), eq(keeps.itemId, itemId))
      : eq(keeps.contractId, contractId);
    const results = await db.select().from(keeps).where(whereClause).orderBy(desc(keeps.keepDate));
    return results.map((row) => decryptPiiRow(row, KEEP_PII_FIELDS));
  }

  async getKeep(id: string): Promise<Keep | undefined> {
    const [keep] = await db.select().from(keeps).where(eq(keeps.id, id));
    return keep ? decryptPiiRow(keep, KEEP_PII_FIELDS) : undefined;
  }

  async createKeep(keep: InsertKeep): Promise<Keep> {
    const [created] = await db.insert(keeps).values(encryptPiiRow(keep, KEEP_PII_FIELDS)).returning();
    return decryptPiiRow(created, KEEP_PII_FIELDS);
  }

  async updateKeep(id: string, keep: Partial<InsertKeep>): Promise<Keep | undefined> {
    const [updated] = await db
      .update(keeps)
      .set(encryptPiiRow(keep, KEEP_PII_FIELDS))
      .where(eq(keeps.id, id))
      .returning();
    return updated ? decryptPiiRow(updated, KEEP_PII_FIELDS) : undefined;
  }

  async deleteKeep(id: string): Promise<void> {
    await db.delete(keeps).where(eq(keeps.id, id));
  }

  async getRegionalManagementFees(): Promise<RegionalManagementFee[]> {
    return db
      .select()
      .from(regionalManagementFees)
      .orderBy(desc(regionalManagementFees.feeDate), desc(regionalManagementFees.createdAt));
  }

  async getRegionalManagementFee(id: string): Promise<RegionalManagementFee | undefined> {
    const [fee] = await db.select().from(regionalManagementFees).where(eq(regionalManagementFees.id, id));
    return fee;
  }

  async createRegionalManagementFee(fee: InsertRegionalManagementFee): Promise<RegionalManagementFee> {
    const [created] = await db.insert(regionalManagementFees).values(fee).returning();
    return created;
  }

  async updateRegionalManagementFee(
    id: string,
    fee: Partial<InsertRegionalManagementFee>,
  ): Promise<RegionalManagementFee | undefined> {
    const [updated] = await db
      .update(regionalManagementFees)
      .set({ ...fee, updatedAt: new Date() })
      .where(eq(regionalManagementFees.id, id))
      .returning();
    return updated;
  }

  async deleteRegionalManagementFee(id: string): Promise<void> {
    await db.delete(regionalManagementFees).where(eq(regionalManagementFees.id, id));
  }

  async getRegionalCustomerLists(): Promise<RegionalCustomerList[]> {
    return db
      .select()
      .from(regionalCustomerLists)
      .orderBy(
        sql`CASE ${regionalCustomerLists.tier}
          WHEN '1000' THEN 1
          WHEN '500' THEN 2
          WHEN '300' THEN 3
          WHEN '100' THEN 4
          ELSE 99
        END`,
        asc(regionalCustomerLists.sortOrder),
        asc(regionalCustomerLists.customerName),
      );
  }

  async getRegionalCustomerList(id: string): Promise<RegionalCustomerList | undefined> {
    const [item] = await db.select().from(regionalCustomerLists).where(eq(regionalCustomerLists.id, id));
    return item;
  }

  async createRegionalCustomerList(item: InsertRegionalCustomerList): Promise<RegionalCustomerList> {
    const [created] = await db.insert(regionalCustomerLists).values(item).returning();
    return created;
  }

  async updateRegionalCustomerList(
    id: string,
    item: Partial<InsertRegionalCustomerList>,
  ): Promise<RegionalCustomerList | undefined> {
    const [updated] = await db
      .update(regionalCustomerLists)
      .set({ ...item, updatedAt: new Date() })
      .where(eq(regionalCustomerLists.id, id))
      .returning();
    return updated;
  }

  async deleteRegionalCustomerList(id: string): Promise<void> {
    await db.delete(regionalCustomerLists).where(eq(regionalCustomerLists.id, id));
  }

  async getDeposits(): Promise<Deposit[]> {
    const results = await db
      .select()
      .from(deposits)
      .orderBy(desc(deposits.depositDate), desc(deposits.createdAt));
    return results.map((row) => decryptPiiRow(row, DEPOSIT_PII_FIELDS));
  }

  async getDeposit(id: string): Promise<Deposit | undefined> {
    const [deposit] = await db.select().from(deposits).where(eq(deposits.id, id));
    return deposit ? decryptPiiRow(deposit, DEPOSIT_PII_FIELDS) : undefined;
  }

  async createDeposit(deposit: InsertDeposit): Promise<Deposit> {
    const [created] = await db.insert(deposits).values(encryptPiiRow(deposit, DEPOSIT_PII_FIELDS)).returning();
    return decryptPiiRow(created, DEPOSIT_PII_FIELDS);
  }

  async createDeposits(depositList: InsertDeposit[]): Promise<Deposit[]> {
    if (depositList.length === 0) return [];
    const created = await db.insert(deposits).values(depositList.map((row) => encryptPiiRow(row, DEPOSIT_PII_FIELDS))).returning();
    return created.map((row) => decryptPiiRow(row, DEPOSIT_PII_FIELDS));
  }

  async updateDeposit(id: string, deposit: Partial<InsertDeposit>): Promise<Deposit | undefined> {
    const [updated] = await db
      .update(deposits)
      .set(encryptPiiRow(deposit, DEPOSIT_PII_FIELDS))
      .where(eq(deposits.id, id))
      .returning();
    return updated ? decryptPiiRow(updated, DEPOSIT_PII_FIELDS) : undefined;
  }

  async deleteDeposit(id: string): Promise<void> {
    await db.delete(deposits).where(eq(deposits.id, id));
  }

  async getPagePermissions(): Promise<PagePermission[]> {
    return db.select().from(pagePermissions);
  }

  async getPagePermissionsByUser(userId: string): Promise<PagePermission[]> {
    return db.select().from(pagePermissions).where(eq(pagePermissions.userId, userId));
  }

  async setPagePermissions(userId: string, pageKeys: string[]): Promise<void> {
    await db.delete(pagePermissions).where(eq(pagePermissions.userId, userId));
    if (pageKeys.length > 0) {
      await db.insert(pagePermissions).values(
        pageKeys.map((pageKey) => ({ userId, pageKey }))
      );
    }
  }

  async getSystemSettings(): Promise<SystemSetting[]> {
    return db.select().from(systemSettings);
  }

  async getSystemSetting(key: string): Promise<SystemSetting | undefined> {
    const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.settingKey, key));
    return setting;
  }

  async setSystemSetting(key: string, value: string): Promise<SystemSetting> {
    const existing = await this.getSystemSetting(key);
    if (existing) {
      const [updated] = await db.update(systemSettings).set({ settingValue: value }).where(eq(systemSettings.settingKey, key)).returning();
      return updated;
    }
    const [created] = await db.insert(systemSettings).values({ settingKey: key, settingValue: value }).returning();
    return created;
  }

  async setSystemSettingsBulk(settings: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
      await this.setSystemSetting(key, value);
    }
  }
  async getDealTimelines(dealId: string): Promise<DealTimeline[]> {
    return db.select().from(dealTimelines).where(eq(dealTimelines.dealId, dealId)).orderBy(desc(dealTimelines.createdAt));
  }

  async createDealTimeline(timeline: InsertDealTimeline): Promise<DealTimeline> {
    const [created] = await db.insert(dealTimelines).values(timeline).returning();
    return created;
  }

  async deleteDealTimeline(id: string): Promise<void> {
    await db.delete(dealTimelines).where(eq(dealTimelines.id, id));
  }

  async getNotices(): Promise<Notice[]> {
    return db.select().from(notices).orderBy(desc(notices.isPinned), desc(notices.createdAt));
  }

  async getNotice(id: string): Promise<Notice | undefined> {
    const [notice] = await db.select().from(notices).where(eq(notices.id, id));
    return notice;
  }

  async createNotice(notice: InsertNotice): Promise<Notice> {
    const [created] = await db.insert(notices).values(notice).returning();
    return created;
  }

  async updateNotice(id: string, notice: Partial<InsertNotice>): Promise<Notice | undefined> {
    const [updated] = await db.update(notices).set({ ...notice, updatedAt: new Date() }).where(eq(notices.id, id)).returning();
    return updated;
  }

  async deleteNotice(id: string): Promise<void> {
    await db.delete(notices).where(eq(notices.id, id));
  }

  async incrementNoticeViewCount(id: string): Promise<void> {
    await db.update(notices).set({ viewCount: sql`${notices.viewCount} + 1` }).where(eq(notices.id, id));
  }

  async getBackups(): Promise<Omit<DatabaseBackup, 'data'>[]> {
    const results = await db.select({
      id: databaseBackups.id,
      label: databaseBackups.label,
      createdByName: databaseBackups.createdByName,
      createdByUserId: databaseBackups.createdByUserId,
      tableCounts: databaseBackups.tableCounts,
      sizeBytes: databaseBackups.sizeBytes,
      createdAt: databaseBackups.createdAt,
    }).from(databaseBackups).orderBy(desc(databaseBackups.createdAt));
    return results;
  }

  async getBackup(id: string): Promise<DatabaseBackup | undefined> {
    const [backup] = await db.select().from(databaseBackups).where(eq(databaseBackups.id, id));
    return backup;
  }

  async createBackup(backup: InsertDatabaseBackup): Promise<DatabaseBackup> {
    const [created] = await db.insert(databaseBackups).values(backup).returning();
    return created;
  }

  async deleteBackup(id: string): Promise<void> {
    await db.delete(databaseBackups).where(eq(databaseBackups.id, id));
  }

  async getQuotations(): Promise<Quotation[]> {
    const results = await db.select().from(quotations).orderBy(desc(quotations.createdAt));
    return results.map((row) => decryptPiiRow(row, QUOTATION_PII_FIELDS));
  }

  async getQuotation(id: string): Promise<Quotation | undefined> {
    const [quotation] = await db.select().from(quotations).where(eq(quotations.id, id));
    return quotation ? decryptPiiRow(quotation, QUOTATION_PII_FIELDS) : undefined;
  }

  async createQuotation(quotation: InsertQuotation): Promise<Quotation> {
    const [created] = await db.insert(quotations).values(encryptPiiRow(quotation, QUOTATION_PII_FIELDS)).returning();
    return decryptPiiRow(created, QUOTATION_PII_FIELDS);
  }

  async updateQuotation(id: string, quotation: Partial<InsertQuotation>): Promise<Quotation | undefined> {
    const [updated] = await db
      .update(quotations)
      .set(encryptPiiRow(quotation, QUOTATION_PII_FIELDS))
      .where(eq(quotations.id, id))
      .returning();
    return updated ? decryptPiiRow(updated, QUOTATION_PII_FIELDS) : undefined;
  }

  async deleteQuotation(id: string): Promise<void> {
    await db.delete(quotations).where(eq(quotations.id, id));
  }

  async getNextQuotationNumber(): Promise<string> {
    const now = new Date();
    const prefix = `Q${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const result = await db.select({ quotationNumber: quotations.quotationNumber })
      .from(quotations)
      .where(sql`${quotations.quotationNumber} LIKE ${prefix + '%'}`)
      .orderBy(desc(quotations.quotationNumber))
      .limit(1);
    if (result.length === 0) return `${prefix}-001`;
    const lastNum = parseInt(result[0].quotationNumber.split("-").pop() || "0");
    return `${prefix}-${String(lastNum + 1).padStart(3, "0")}`;
  }
  async getImportBatches(): Promise<ImportBatch[]> {
    return db.select().from(importBatches).orderBy(desc(importBatches.createdAt));
  }

  async getImportBatch(id: string): Promise<ImportBatch | undefined> {
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, id));
    return batch;
  }

  async createImportBatch(batch: InsertImportBatch): Promise<ImportBatch> {
    const [created] = await db.insert(importBatches).values(batch).returning();
    return created;
  }

  async updateImportBatch(id: string, batch: Partial<InsertImportBatch>): Promise<ImportBatch | undefined> {
    const [updated] = await db.update(importBatches).set(batch).where(eq(importBatches.id, id)).returning();
    return updated;
  }

  async deleteImportBatch(id: string): Promise<void> {
    await db.delete(importStagingRows).where(eq(importStagingRows.batchId, id));
    await db.delete(importBatches).where(eq(importBatches.id, id));
  }

  async getImportStagingRows(batchId: string): Promise<ImportStagingRow[]> {
    return db.select().from(importStagingRows).where(eq(importStagingRows.batchId, batchId)).orderBy(importStagingRows.rowIndex);
  }

  async createImportStagingRows(rows: InsertImportStagingRow[]): Promise<ImportStagingRow[]> {
    if (rows.length === 0) return [];
    const created = await db.insert(importStagingRows).values(rows).returning();
    return created;
  }

  async deleteImportStagingRows(batchId: string): Promise<void> {
    await db.delete(importStagingRows).where(eq(importStagingRows.batchId, batchId));
  }

  async getImportMappings(userId?: string): Promise<ImportMapping[]> {
    if (userId) {
      return db.select().from(importMappings).where(eq(importMappings.userId, userId)).orderBy(desc(importMappings.createdAt));
    }
    return db.select().from(importMappings).orderBy(desc(importMappings.createdAt));
  }

  async createImportMapping(mapping: InsertImportMapping): Promise<ImportMapping> {
    const [created] = await db.insert(importMappings).values(mapping).returning();
    return created;
  }

  async deleteImportMapping(id: string): Promise<void> {
    await db.delete(importMappings).where(eq(importMappings.id, id));
  }
}

export const storage = new DatabaseStorage();
