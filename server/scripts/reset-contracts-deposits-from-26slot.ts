import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../db";
import {
  users,
  customers,
  products,
  contracts,
  payments,
  refunds,
  keeps,
  deposits,
} from "@shared/schema";

type SheetRow = Array<unknown>;

function toTrimmed(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toNullableTrimmed(value: unknown): string | null {
  const text = toTrimmed(value);
  return text.length > 0 ? text : null;
}

function normalizeNonNegativeInt(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

function normalizePositiveInt(value: unknown, fallback = 1): number {
  return Math.max(1, normalizeNonNegativeInt(value, fallback));
}

function hasExplicitDateValue(rawDate: unknown): boolean {
  if (rawDate === null || rawDate === undefined) return false;
  if (rawDate instanceof Date) return !Number.isNaN(rawDate.getTime());
  if (typeof rawDate === "number") return Number.isFinite(rawDate);
  return toTrimmed(rawDate).length > 0;
}

function toLocalDate(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function parseContractDate(rawDate: unknown, fallback: Date): Date {
  if (rawDate instanceof Date && !Number.isNaN(rawDate.getTime())) {
    return new Date(rawDate.getFullYear(), rawDate.getMonth(), rawDate.getDate());
  }

  if (typeof rawDate === "number" && Number.isFinite(rawDate)) {
    const dateCode = XLSX.SSF.parse_date_code(rawDate);
    if (dateCode?.y && dateCode?.m && dateCode?.d) {
      const parsed = toLocalDate(dateCode.y, dateCode.m, dateCode.d);
      if (parsed) return parsed;
    }
  }

  const text = toTrimmed(rawDate);
  if (text.length === 0) return fallback;

  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (Number.isFinite(serial)) {
      const dateCode = XLSX.SSF.parse_date_code(serial);
      if (dateCode?.y && dateCode?.m && dateCode?.d) {
        const parsed = toLocalDate(dateCode.y, dateCode.m, dateCode.d);
        if (parsed) return parsed;
      }
    }
  }

  const normalized = text
    .replace(/[./]/g, "-")
    .replace(/\uB144/g, "-")
    .replace(/\uC6D4/g, "-")
    .replace(/\uC77C/g, "")
    .trim();

  const ymd = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s.*)?$/);
  if (ymd) {
    const parsed = toLocalDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
    if (parsed) return parsed;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  return fallback;
}

function parseVatFlag(rawValue: unknown): boolean | null {
  if (rawValue === null || rawValue === undefined || rawValue === "") return null;
  if (typeof rawValue === "boolean") return rawValue;

  const value = toTrimmed(rawValue).toLowerCase();
  if (!value) return null;
  if (["true", "1", "y", "yes", "o", "\uD3EC\uD568"].includes(value)) return true;
  if (["false", "0", "n", "no", "x", "\uBBF8\uD3EC\uD568"].includes(value)) return false;
  return null;
}

function vatTypeFromFlag(flag: boolean | null): string | null {
  if (flag === null) return null;
  return flag ? "\uBD80\uAC00\uC138 \uD3EC\uD568" : "\uBD80\uAC00\uC138 \uBCC4\uB3C4";
}

function contractVatLabelFromFlag(flag: boolean | null): string | null {
  if (flag === null) return null;
  return flag ? "\uD3EC\uD568" : "\uBBF8\uD3EC\uD568";
}

function parsePayment(rawValue: unknown): { paymentMethod: string | null; paymentConfirmed: boolean } {
  const paymentMethod = toNullableTrimmed(rawValue);
  if (!paymentMethod) return { paymentMethod: null, paymentConfirmed: false };

  const normalized = paymentMethod.replace(/\s+/g, "");
  const unconfirmedKeywords = [
    "\uCCB4\uD06C",
    "\uBBF8\uD655\uC815",
    "\uBBF8\uC785\uAE08",
    "\uB300\uAE30",
    "\uCDE8\uC18C",
    "false",
    "0",
    "n",
    "no",
    "x",
  ];

  const paymentConfirmed = !unconfirmedKeywords.some((keyword) => normalized.toLowerCase().includes(keyword.toLowerCase()));
  return { paymentMethod, paymentConfirmed };
}

function resolveDepositBank(paymentMethod: string | null): string {
  if (!paymentMethod) return "-";
  const normalized = paymentMethod.replace(/\s+/g, "");
  if (normalized === "\uD558\uB098" || normalized === "\uAD6D\uBBFC") return paymentMethod;
  return "-";
}

function resolveExcelPath(cliPath?: string): string {
  if (cliPath) return cliPath;
  const downloadsDir = path.join(process.env.USERPROFILE || "C:\\Users\\ksm39", "Downloads");
  const candidate = path.join(downloadsDir, "26\uC2AC\uB86F.xlsx");
  if (!fs.existsSync(candidate)) {
    throw new Error(`Excel file not found: ${candidate}`);
  }
  return candidate;
}

function makeTimestampLabel(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}${m}${d}_${hh}${mm}${ss}`;
}

function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

async function main() {
  const excelPath = resolveExcelPath(process.argv[2]);
  const now = new Date();
  const backupTag = makeTimestampLabel(now);
  const backupRoot = path.join(process.cwd(), "backups", `contract_deposit_pre_reset_26slot_${backupTag}`);
  fs.mkdirSync(backupRoot, { recursive: true });

  const [beforeContracts, beforeDeposits] = await Promise.all([
    db.select().from(contracts),
    db.select().from(deposits),
  ]);

  writeJson(path.join(backupRoot, "contracts.json"), beforeContracts);
  writeJson(path.join(backupRoot, "deposits.json"), beforeDeposits);

  const workbook = XLSX.readFile(excelPath, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<SheetRow>(worksheet, { header: 1, defval: null, raw: true });

  if (rows.length < 2) {
    throw new Error(`No data rows in sheet: ${sheetName}`);
  }

  const IDX = {
    date: 1,
    customerName: 2,
    userIdentifier: 3,
    productName: 4,
    days: 5,
    addQuantity: 6,
    extendQuantity: 7,
    unitPrice: 8,
    supplyAmount: 9,
    managerName: 10,
    vatFlag: 11,
    paymentStatus: 12,
    refundAmount: 13,
    note: 14,
  } as const;

  const lastRowIndexWithDate = (() => {
    for (let i = rows.length - 1; i >= 1; i -= 1) {
      if (hasExplicitDateValue(rows[i]?.[IDX.date])) return i;
    }
    return -1;
  })();

  let currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [allUsers, allCustomers, allProducts] = await Promise.all([
    db.select().from(users),
    db.select().from(customers),
    db.select().from(products),
  ]);

  const managerMap = new Map(allUsers.map((user) => [toTrimmed(user.name), user]));
  const customerMap = new Map(allCustomers.map((customer) => [toTrimmed(customer.name), customer]));
  const productMap = new Map(allProducts.map((product) => [toTrimmed(product.name), product]));

  let insertedContracts = 0;
  let insertedDeposits = 0;
  let insertedPayments = 0;
  let createdCustomers = 0;
  let createdProducts = 0;
  let skippedRows = 0;

  await db.transaction(async (tx) => {
    await tx.delete(deposits);
    await tx.delete(payments);
    await tx.delete(refunds);
    await tx.delete(keeps);
    await tx.delete(contracts);

    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] || [];

      const customerName = toTrimmed(row[IDX.customerName]);
      const productName = toTrimmed(row[IDX.productName]);
      if (!customerName || !productName) {
        skippedRows += 1;
        continue;
      }

      if (hasExplicitDateValue(row[IDX.date])) {
        currentDate = parseContractDate(row[IDX.date], currentDate);
      } else if (rowIndex > lastRowIndexWithDate) {
        currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      }

      const addQuantity = normalizeNonNegativeInt(row[IDX.addQuantity], 0);
      const extendQuantity = normalizeNonNegativeInt(row[IDX.extendQuantity], 0);
      const quantity = Math.max(1, addQuantity + extendQuantity);
      const days = normalizePositiveInt(row[IDX.days], 1);
      const unitPrice = normalizeNonNegativeInt(row[IDX.unitPrice], 0);
      const supplyAmount = normalizeNonNegativeInt(row[IDX.supplyAmount], 0);
      const computedByUnit = quantity * unitPrice;
      const supplyBaseAmount = supplyAmount > 0 ? supplyAmount : computedByUnit;
      const vatFlag = parseVatFlag(row[IDX.vatFlag]);
      const vatAmount = vatFlag === true ? Math.round(supplyBaseAmount * 0.1) : 0;
      const cost = supplyBaseAmount + vatAmount;

      const managerName = toTrimmed(row[IDX.managerName]) || "\uBBF8\uC9C0\uC815";
      const manager = managerMap.get(managerName);
      const vatType = vatTypeFromFlag(vatFlag);
      const contractVatLabel = contractVatLabelFromFlag(vatFlag);
      const payment = parsePayment(row[IDX.paymentStatus]);
      const refundAmount = normalizeNonNegativeInt(row[IDX.refundAmount], 0);
      const note = toNullableTrimmed(row[IDX.note]);
      const notes = [note, refundAmount > 0 ? `\uD658\uBD88\uAE08\uC561: ${refundAmount}` : null]
        .filter(Boolean)
        .join(" | ") || null;
      const userIdentifier = toNullableTrimmed(row[IDX.userIdentifier]);

      let customer = customerMap.get(customerName);
      if (!customer) {
        const [createdCustomer] = await tx.insert(customers).values({
          name: customerName,
          status: "active",
        }).returning();
        customer = createdCustomer;
        customerMap.set(customerName, createdCustomer);
        createdCustomers += 1;
      }

      let product = productMap.get(productName);
      if (!product) {
        const [createdProduct] = await tx.insert(products).values({
          name: productName,
          category: "\uAE30\uD0C0",
          unitPrice,
          baseDays: days,
          workCost: 0,
          worker: null,
          vatType: vatType || "\uBD80\uAC00\uC138 \uBCC4\uB3C4",
          isActive: true,
        }).returning();
        product = createdProduct;
        productMap.set(productName, createdProduct);
        createdProducts += 1;
      } else if (vatType && product.vatType !== vatType) {
        const [updatedProduct] = await tx
          .update(products)
          .set({ vatType })
          .where(eq(products.id, product.id))
          .returning();
        if (updatedProduct) {
          product = updatedProduct;
          productMap.set(productName, updatedProduct);
        }
      }

      const worker = toNullableTrimmed(product.worker);
      const workerBaseDays = Math.max(normalizePositiveInt(product.baseDays, 1), 1);
      const workerUnitCost = normalizeNonNegativeInt(product.workCost, 0);
      const workCost = workerUnitCost > 0
        ? Math.round((workerUnitCost / workerBaseDays) * days * quantity)
        : 0;

      const contractNumber = `IMP26SLT-${String(insertedContracts + 1).padStart(5, "0")}`;
      const executionPaymentStatus = payment.paymentConfirmed ? "\uC785\uAE08\uC644\uB8CC" : "\uC785\uAE08\uC804";

      const [contract] = await tx.insert(contracts).values({
        contractNumber,
        contractDate: currentDate,
        contractName: null,
        managerId: manager?.id || null,
        managerName,
        customerId: customer.id,
        customerName,
        products: productName,
        cost,
        days,
        quantity,
        addQuantity,
        extendQuantity,
        paymentConfirmed: payment.paymentConfirmed,
        paymentMethod: payment.paymentMethod,
        invoiceIssued: contractVatLabel,
        worker,
        workCost,
        notes,
        disbursementStatus: payment.paymentMethod,
        executionPaymentStatus,
        userIdentifier,
      }).returning({ id: contracts.id });
      insertedContracts += 1;

      await tx.insert(deposits).values({
        depositDate: currentDate,
        depositorName: customerName,
        depositAmount: cost,
        depositBank: resolveDepositBank(payment.paymentMethod),
        notes,
        confirmedAmount: payment.paymentConfirmed ? cost : 0,
        totalContractAmount: cost,
        contractId: contract.id,
        confirmedBy: payment.paymentConfirmed ? "system-import-26slot" : null,
        confirmedAt: payment.paymentConfirmed ? now : null,
      });
      insertedDeposits += 1;

      await tx.insert(payments).values({
        contractId: contract.id,
        depositDate: currentDate,
        customerName,
        manager: managerName,
        amount: cost,
        depositConfirmed: payment.paymentConfirmed,
        paymentMethod: payment.paymentMethod,
        invoiceIssued: vatFlag === true,
        notes,
      });
      insertedPayments += 1;
    }
  });

  const [afterContractsCountRow, afterDepositsCountRow] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(contracts),
    db.select({ count: sql<number>`count(*)` }).from(deposits),
  ]);

  const summary = {
    backupRoot,
    excelPath,
    sheetName,
    totalRows: rows.length - 1,
    insertedContracts,
    insertedDeposits,
    insertedPayments,
    createdCustomers,
    createdProducts,
    skippedRows,
    beforeCounts: {
      contracts: beforeContracts.length,
      deposits: beforeDeposits.length,
    },
    afterCounts: {
      contracts: Number(afterContractsCountRow[0]?.count || 0),
      deposits: Number(afterDepositsCountRow[0]?.count || 0),
    },
    generatedAt: new Date().toISOString(),
  };

  writeJson(path.join(backupRoot, "IMPORT_SUMMARY.json"), summary);

  console.log(`[RESET] excel=${excelPath}`);
  console.log(`[RESET] sheet=${sheetName}`);
  console.log(`[RESET] backup=${backupRoot}`);
  console.log(`[RESET] before contracts=${beforeContracts.length}, deposits=${beforeDeposits.length}`);
  console.log(`[RESET] inserted contracts=${insertedContracts}, deposits=${insertedDeposits}, payments=${insertedPayments}`);
  console.log(`[RESET] created customers=${createdCustomers}, products=${createdProducts}, skipped=${skippedRows}`);
  console.log(`[RESET] after contracts=${summary.afterCounts.contracts}, deposits=${summary.afterCounts.deposits}`);
}

main()
  .catch((error) => {
    console.error("[RESET] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
