import fs from "fs";
import path from "path";
import XLSX from "xlsx";
import { db, pool } from "../db";
import { storage } from "../storage";
import { contracts, keeps, payments, refunds } from "@shared/schema";

type RawRow = Record<string, unknown>;

function toTrimmed(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toNullableTrimmed(value: unknown): string | null {
  const trimmed = toTrimmed(value);
  return trimmed.length > 0 ? trimmed : null;
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

function resolveExcelPath(cliPath?: string): string {
  if (cliPath) return cliPath;

  const downloadsDir = path.join(process.env.USERPROFILE || "C:\\Users\\ksm39", "Downloads");
  const files = fs
    .readdirSync(downloadsDir)
    .filter((file) => file.includes("0225") && file.endsWith(".xlsx") && !file.startsWith("~$"))
    .sort();

  if (files.length === 0) {
    throw new Error(`No matching xlsx file found in ${downloadsDir}`);
  }

  return path.join(downloadsDir, files[0]);
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

  const ymdMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s.*)?$/);
  if (ymdMatch) {
    const parsed = toLocalDate(
      Number(ymdMatch[1]),
      Number(ymdMatch[2]),
      Number(ymdMatch[3]),
    );
    if (parsed) return parsed;
  }

  const mdyMatch = normalized.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s.*)?$/);
  if (mdyMatch) {
    const parsed = toLocalDate(
      Number(mdyMatch[3]),
      Number(mdyMatch[1]),
      Number(mdyMatch[2]),
    );
    if (parsed) return parsed;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  return fallback;
}

function hasExplicitDateValue(rawDate: unknown): boolean {
  if (rawDate === null || rawDate === undefined) return false;
  if (rawDate instanceof Date) return !Number.isNaN(rawDate.getTime());
  if (typeof rawDate === "number") return Number.isFinite(rawDate);
  return toTrimmed(rawDate).length > 0;
}

function parseInvoiceIssued(rawValue: unknown): string | null {
  if (typeof rawValue === "boolean") return rawValue ? "\uBC1C\uD589" : "\uBBF8\uBC1C\uD589";

  const value = toTrimmed(rawValue).toLowerCase();
  if (!value) return null;
  if (["true", "1", "y", "yes", "o", "\uBC1C\uD589"].includes(value)) return "\uBC1C\uD589";
  if (["false", "0", "n", "no", "x", "\uBBF8\uBC1C\uD589", "\uBBF8\uBC1C\uAE09"].includes(value)) return "\uBBF8\uBC1C\uD589";
  return null;
}

function parseInvoiceFlag(rawValue: unknown): boolean | null {
  if (rawValue === null || rawValue === undefined || rawValue === "") return null;
  if (typeof rawValue === "boolean") return rawValue;

  const value = toTrimmed(rawValue).toLowerCase();
  if (!value) return null;

  if (["true", "1", "y", "yes", "o", "\uBC1C\uD589"].includes(value)) return true;
  if (["false", "0", "n", "no", "x", "\uBBF8\uBC1C\uD589", "\uBBF8\uBC1C\uAE09"].includes(value)) return false;
  return null;
}

function vatTypeFromInvoiceFlag(flag: boolean | null): string | null {
  if (flag === null) return null;
  return flag ? "\uBD80\uAC00\uC138 \uD3EC\uD568" : "\uBD80\uAC00\uC138 \uBCC4\uB3C4";
}

function parsePayment(rawValue: unknown): { paymentMethod: string | null; paymentConfirmed: boolean } {
  const paymentMethod = toNullableTrimmed(rawValue);
  if (!paymentMethod) return { paymentMethod: null, paymentConfirmed: false };

  const normalized = paymentMethod.replace(/\s+/g, "");
  const unconfirmedKeywords = [
    "\uBBF8\uD655\uC815",
    "\uB300\uAE30",
    "\uBBF8\uC785\uAE08",
    "\uCDE8\uC18C",
  ];
  const paymentConfirmed = !unconfirmedKeywords.some((keyword) => normalized.includes(keyword));

  return { paymentMethod, paymentConfirmed };
}

async function main() {
  const sourcePath = resolveExcelPath(process.argv[2]);
  const workbook = XLSX.readFile(sourcePath, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<RawRow>(worksheet, { defval: null, raw: true });

  if (!rows.length) {
    throw new Error(`No rows found in sheet ${sheetName}`);
  }

  const allUsers = await storage.getUsers();
  const managerMap = new Map(allUsers.map((user) => [toTrimmed(user.name), user]));

  const allCustomers = await storage.getCustomers();
  const customerMap = new Map(allCustomers.map((customer) => [toTrimmed(customer.name), customer]));

  const allProducts = await storage.getProducts();
  const productMap = new Map(allProducts.map((product) => [toTrimmed(product.name), product]));

  let inserted = 0;
  let skipped = 0;
  let createdCustomers = 0;
  let createdProducts = 0;
  let currentDate = new Date();
  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const lastRowIndexWithDate = (() => {
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (hasExplicitDateValue(rows[i]?.["\uB0A0\uC9DC"])) return i;
    }
    return -1;
  })();
  const preparedRows: Array<{
    contractDate: Date;
    managerId: string | null;
    managerName: string;
    customerId: string;
    customerName: string;
    productName: string;
    cost: number;
    days: number;
    quantity: number;
    addQuantity: number;
    extendQuantity: number;
    paymentConfirmed: boolean;
    paymentMethod: string | null;
    disbursementStatus: string | null;
    invoiceIssued: string | null;
    worker: string | null;
    workCost: number;
    notes: string | null;
    userIdentifier: string | null;
  }> = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const customerName = toTrimmed(
      row["\uC2E0\uCCAD"] ?? row["\uC694\uCCAD"] ?? row["\uACE0\uAC1D\uBA85"],
    );
    const productName = toTrimmed(
      row["\uC2AC\uB86F"] ?? row["\uD488\uBA85"] ?? row["\uC0C1\uD488"],
    );
    if (!customerName || !productName) {
      skipped += 1;
      continue;
    }

    if (hasExplicitDateValue(row["\uB0A0\uC9DC"])) {
      currentDate = parseContractDate(row["\uB0A0\uC9DC"], currentDate);
    } else if (rowIndex > lastRowIndexWithDate) {
      currentDate = todayDate;
    }

    const addQuantity = normalizeNonNegativeInt(row["\uCD94\uAC00"], 0);
    const extendQuantity = normalizeNonNegativeInt(row["\uC5F0\uC7A5"], 0);
    const quantityFromSplit = addQuantity + extendQuantity;
    const quantity = Math.max(1, quantityFromSplit);
    const days = normalizePositiveInt(row["\uC77C\uC218"], 1);
    const unitPrice = normalizeNonNegativeInt(row["\uB2E8\uAC00"], 0);
    const excelCost = normalizeNonNegativeInt(row["\uACB0\uC81C\uAE08\uC561"], 0);
    const formulaCost = quantityFromSplit > 0 ? quantityFromSplit * unitPrice : excelCost;
    const cost = formulaCost > 0 ? formulaCost : excelCost;
    const managerName = toTrimmed(row["\uB2F4\uB2F9\uC790"]);
    const workerFromSheet = toNullableTrimmed(row["\uC791\uC5C5\uC790"]);
    const userIdentifier = toNullableTrimmed(row["\uC0AC\uC6A9\uC790"]);
    const invoiceRaw = row["\uACC4\uC0B0\uC11C\uBC1C\uD589"];
    const invoiceIssued = parseInvoiceIssued(invoiceRaw);
    const invoiceFlag = parseInvoiceFlag(invoiceRaw);
    const vatType = vatTypeFromInvoiceFlag(invoiceFlag);
    const payment = parsePayment(row["\uACB0\uC81C\uD655\uC778"]);
    const paymentStatusFromSheet = toNullableTrimmed(row["\uACB0\uC81C\uD655\uC778"]);
    const refundAmount = normalizeNonNegativeInt(row["\uD658\uBD88\uAE08\uC561"], 0);
    const noteFromSheet = toNullableTrimmed(row["\uBE44\uACE0"]);
    const notes = [noteFromSheet, refundAmount > 0 ? `\uD658\uBD88\uAE08\uC561: ${refundAmount}` : null]
      .filter(Boolean)
      .join(" | ") || null;

    let customer = customerMap.get(customerName);
    if (!customer) {
      customer = await storage.createCustomer({
        name: customerName,
        status: "active",
      });
      customerMap.set(customerName, customer);
      createdCustomers += 1;
    }

    let product = productMap.get(productName);
    if (!product) {
      product = await storage.createProduct({
        name: productName,
        category: "\uAE30\uD0C0",
        unitPrice,
        baseDays: days,
        worker: workerFromSheet,
        vatType: vatType || "\uBD80\uAC00\uC138 \uBCC4\uB3C4",
        isActive: true,
      });
      productMap.set(productName, product);
      createdProducts += 1;
    } else if (vatType && product.vatType !== vatType) {
      const updatedProduct = await storage.updateProduct(product.id, { vatType });
      if (updatedProduct) {
        product = updatedProduct;
        productMap.set(productName, updatedProduct);
      }
    }

    const manager = managerMap.get(managerName);
    const worker = workerFromSheet || product.worker || null;
    const workerUnitCost = normalizeNonNegativeInt(product.workCost, 0);
    const workerBaseDays = normalizePositiveInt(product.baseDays, 1);
    const workCost =
      workerUnitCost > 0
        ? Math.round((workerUnitCost / workerBaseDays) * days * quantity)
        : 0;

    preparedRows.push({
      contractDate: currentDate,
      managerId: manager?.id || null,
      managerName,
      customerId: customer.id,
      customerName,
      productName,
      cost,
      days,
      quantity,
      addQuantity,
      extendQuantity,
      paymentConfirmed: payment.paymentConfirmed,
      paymentMethod: paymentStatusFromSheet,
      disbursementStatus: paymentStatusFromSheet,
      invoiceIssued,
      worker,
      workCost,
      notes,
      userIdentifier,
    });
  }

  await db.transaction(async (tx) => {
    await tx.delete(refunds);
    await tx.delete(keeps);
    await tx.delete(payments);
    await tx.delete(contracts);

    for (const row of preparedRows) {
      const [contract] = await tx
        .insert(contracts)
        .values({
          contractNumber: `IMP0225-${String(inserted + 1).padStart(5, "0")}`,
          contractDate: row.contractDate,
          contractName: null,
          managerId: row.managerId,
          managerName: row.managerName,
          customerId: row.customerId,
          customerName: row.customerName,
          products: row.productName,
          cost: row.cost,
          days: row.days,
          quantity: row.quantity,
          addQuantity: row.addQuantity,
          extendQuantity: row.extendQuantity,
          paymentConfirmed: row.paymentConfirmed,
          paymentMethod: row.paymentMethod,
          invoiceIssued: row.invoiceIssued,
          worker: row.worker,
          workCost: row.workCost,
          notes: row.notes,
          disbursementStatus: row.disbursementStatus,
          userIdentifier: row.userIdentifier,
        })
        .returning({ id: contracts.id });

      await tx.insert(payments).values({
        contractId: contract.id,
        depositDate: row.contractDate,
        customerName: row.customerName,
        manager: row.managerName,
        amount: row.cost,
        depositConfirmed: row.paymentConfirmed,
        paymentMethod: row.paymentMethod,
        invoiceIssued: row.invoiceIssued === "\uBC1C\uD589",
        notes: row.notes,
      });

      inserted += 1;
    }

    await tx.update(contracts).set({ contractName: null });
  });

  console.log(`[IMPORT] source=${sourcePath}`);
  console.log(`[IMPORT] sheet=${sheetName}`);
  console.log(`[IMPORT] inserted=${inserted}`);
  console.log(`[IMPORT] skipped=${skipped}`);
  console.log(`[IMPORT] createdCustomers=${createdCustomers}`);
  console.log(`[IMPORT] createdProducts=${createdProducts}`);
}

main()
  .catch((error) => {
    console.error("[IMPORT] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });


