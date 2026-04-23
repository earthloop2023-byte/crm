import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const BASE_URL = process.env.CRM_BASE_URL || "http://127.0.0.1:5000";
const EXCEL_PATH = process.argv[2] || detectExcelPath();

let sessionCookie = "";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function detectExcelPath() {
  const downloadsDir = "C:/Users/ksm39/Downloads";
  const fileName = fs
    .readdirSync(downloadsDir)
    .find((name) => /^26.*0225.*\.xlsx$/u.test(name));
  if (!fileName) {
    throw new Error("?ㅼ슫濡쒕뱶 ?대뜑?먯꽌 26?щ’ 0225 ?묒? ?뚯씪??李얠쓣 ???놁뒿?덈떎.");
  }
  return path.join(downloadsDir, fileName);
}

function toTrimmed(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toNullableTrimmed(value) {
  const text = toTrimmed(value);
  return text ? text : null;
}

function normalizeNonNegativeInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.round(n));
}

function normalizePositiveInt(value, fallback = 1) {
  const normalized = normalizeNonNegativeInt(value, fallback);
  return normalized > 0 ? normalized : fallback;
}

function toLocalDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function parseContractDate(rawValue, fallback) {
  if (rawValue instanceof Date && !Number.isNaN(rawValue.getTime())) {
    return new Date(rawValue.getFullYear(), rawValue.getMonth(), rawValue.getDate());
  }
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    const parsed = XLSX.SSF.parse_date_code(rawValue);
    if (parsed) {
      const d = toLocalDate(parsed.y, parsed.m, parsed.d);
      if (d) return d;
    }
  }
  const text = toTrimmed(rawValue);
  if (!text) return fallback;

  const normalized = text
    .replace(/[./]/g, "-")
    .replace(/??g, "-")
    .replace(/??g, "-")
    .replace(/??g, "")
    .trim();

  const ymdMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s.*)?$/);
  if (ymdMatch) {
    const parsed = toLocalDate(Number(ymdMatch[1]), Number(ymdMatch[2]), Number(ymdMatch[3]));
    if (parsed) return parsed;
  }

  const mdyMatch = normalized.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s.*)?$/);
  if (mdyMatch) {
    const parsed = toLocalDate(Number(mdyMatch[3]), Number(mdyMatch[1]), Number(mdyMatch[2]));
    if (parsed) return parsed;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }
  return fallback;
}

function hasExplicitDateValue(rawValue) {
  if (rawValue === null || rawValue === undefined) return false;
  if (rawValue instanceof Date) return !Number.isNaN(rawValue.getTime());
  if (typeof rawValue === "number") return Number.isFinite(rawValue);
  return toTrimmed(rawValue).length > 0;
}

function parseInvoiceIssued(rawValue) {
  if (typeof rawValue === "boolean") return rawValue ? "발행" : "미발행";
  const value = toTrimmed(rawValue).toLowerCase();
  if (!value) return null;
  if (["true", "1", "y", "yes", "o", "발행"].includes(value)) return "발행";
  if (["false", "0", "n", "no", "x", "미발행", "미발급"].includes(value)) return "미발행";
  return null;
}

function parseInvoiceFlag(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === "") return null;
  if (typeof rawValue === "boolean") return rawValue;
  const value = toTrimmed(rawValue).toLowerCase();
  if (!value) return null;
  if (["true", "1", "y", "yes", "o", "발행"].includes(value)) return true;
  if (["false", "0", "n", "no", "x", "미발행", "미발급"].includes(value)) return false;
  return null;
}

function vatTypeFromInvoiceFlag(flag) {
  if (flag === null) return null;
  return flag ? "부가세포함" : "부가세별도";
}

function parsePayment(rawValue) {
  const paymentMethod = toNullableTrimmed(rawValue);
  if (!paymentMethod) return { paymentMethod: null, paymentConfirmed: false };

  const normalized = paymentMethod.replace(/\s+/g, "").toLowerCase();
  const unconfirmedKeywords = ["誘명솗??, "?湲?, "誘몄엯湲?, "痍⑥냼", "false", "0", "n", "no", "x"];
  const paymentConfirmed = !unconfirmedKeywords.some((keyword) => normalized.includes(keyword));
  return { paymentMethod, paymentConfirmed };
}

async function apiRequest(method, endpoint, body) {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const headers = {};
    if (sessionCookie) {
      headers.Cookie = sessionCookie;
    }
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      sessionCookie = setCookie.split(";")[0];
    }

    const text = await response.text();
    if (response.status === 429) {
      const waitMs = Math.min(60000, 1500 * attempt);
      console.log(`[SYNC] 429 ${method} ${endpoint} attempt=${attempt} wait=${waitMs}ms`);
      await sleep(waitMs);
      continue;
    }

    if (!response.ok) {
      throw new Error(`${method} ${endpoint} failed (${response.status}): ${text}`);
    }

    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  throw new Error(`${method} ${endpoint} failed: too many retries`);
}

async function main() {
  console.log(`[SYNC] base=${BASE_URL}`);
  console.log(`[SYNC] excel=${EXCEL_PATH}`);

  const me = await apiRequest("GET", "/api/auth/me");
  console.log(`[SYNC] auth=${me?.name || "unknown"} (${me?.role || "-"})`);

  const existingContracts = await apiRequest("GET", "/api/contracts");
  const backupPath = path.join(
    process.cwd(),
    "server",
    "scripts",
    `contracts-backup-before-26slot-${Date.now()}.json`,
  );
  fs.writeFileSync(backupPath, JSON.stringify(existingContracts, null, 2), "utf8");
  console.log(`[SYNC] backup=${backupPath}`);

  for (let i = 0; i < existingContracts.length; i++) {
    const contract = existingContracts[i];
    await apiRequest("DELETE", `/api/contracts/${contract.id}`);
    if ((i + 1) % 200 === 0 || i === existingContracts.length - 1) {
      console.log(`[SYNC] deleted ${i + 1}/${existingContracts.length}`);
    }
  }

  const users = await apiRequest("GET", "/api/users");
  const customers = await apiRequest("GET", "/api/customers");
  const products = await apiRequest("GET", "/api/products");

  const managerMap = new Map(users.map((user) => [user.name, user]));
  const customerMap = new Map(customers.map((customer) => [customer.name, customer]));
  const productMap = new Map(products.map((product) => [product.name, product]));

  const workbook = XLSX.readFile(EXCEL_PATH, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null, raw: true });
  console.log(`[SYNC] sheet=${sheetName} rows=${rows.length}`);
  const dateKey = Object.keys(rows[0] || {}).find((key) => key.includes("날짜")) || "날짜";

  let currentDate = new Date();
  const now = new Date();
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastRowIndexWithDate = (() => {
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (hasExplicitDateValue(rows[i]?.[dateKey])) return i;
    }
    return -1;
  })();
  let inserted = 0;
  let skipped = 0;
  let createdCustomers = 0;
  let createdProducts = 0;
  let updatedProducts = 0;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const customerName = toTrimmed(row["?붿껌"] ?? row["?좎껌"]);
    const productName = toTrimmed(row["?덈챸"] ?? row["?щ’"] ?? row["?곹뭹"]);
    if (!customerName || !productName) {
      skipped += 1;
      continue;
    }

    const rawDate = row[dateKey] ?? row["?좎쭨"];
    if (hasExplicitDateValue(rawDate)) {
      currentDate = parseContractDate(rawDate, currentDate);
    } else if (rowIndex > lastRowIndexWithDate) {
      currentDate = todayDate;
    }

    const addQuantity = normalizeNonNegativeInt(row["異붽?"], 0);
    const extendQuantity = normalizeNonNegativeInt(row["?곗옣"], 0);
    const quantityFromSplit = addQuantity + extendQuantity;
    const quantity = Math.max(1, quantityFromSplit || normalizePositiveInt(row["?섎웾"], 1));
    const days = normalizePositiveInt(row["?쇱닔"], 1);
    const unitPrice = normalizeNonNegativeInt(row["?④?"], 0);
    const excelCost = normalizeNonNegativeInt(row["寃곗젣湲덉븸"] ?? row["珥앷툑??], 0);
    const formulaCost = quantityFromSplit > 0 ? quantityFromSplit * unitPrice : excelCost;
    const cost = formulaCost > 0 ? formulaCost : excelCost;
    const managerName = toTrimmed(row["?대떦??]);
    const workerFromSheet = toNullableTrimmed(row["?묒뾽??]);
    const userIdentifier = toNullableTrimmed(row["?ъ슜??]);
    const invoiceRaw = row["怨꾩궛?쒕컻??];
    const invoiceIssued = parseInvoiceIssued(invoiceRaw);
    const vatType = vatTypeFromInvoiceFlag(parseInvoiceFlag(invoiceRaw));
    const payment = parsePayment(row["寃곗젣?뺤씤"]);
    const paymentStatusText = payment.paymentMethod;
    const refundAmount = normalizeNonNegativeInt(row["?섎텋湲덉븸"], 0);
    const noteFromSheet = toNullableTrimmed(row["鍮꾧퀬"]);
    const notes = [noteFromSheet, refundAmount > 0 ? `?섎텋湲덉븸: ${refundAmount}` : null]
      .filter(Boolean)
      .join(" | ") || null;

    let customer = customerMap.get(customerName);
    if (!customer) {
      customer = await apiRequest("POST", "/api/customers", {
        name: customerName,
        status: "active",
      });
      customerMap.set(customerName, customer);
      createdCustomers += 1;
    }

    let product = productMap.get(productName);
    if (!product) {
      product = await apiRequest("POST", "/api/products", {
        name: productName,
        category: "湲고?",
        unitPrice,
        baseDays: days,
        worker: workerFromSheet,
        vatType: vatType || "遺媛?몃퀎??,
        isActive: true,
      });
      productMap.set(productName, product);
      createdProducts += 1;
    } else {
      const patch = {};
      if (vatType && product.vatType !== vatType) patch.vatType = vatType;
      if ((!product.unitPrice || product.unitPrice === 0) && unitPrice > 0) patch.unitPrice = unitPrice;
      if ((!product.baseDays || product.baseDays === 0) && days > 0) patch.baseDays = days;
      if ((!product.worker || !String(product.worker).trim()) && workerFromSheet) patch.worker = workerFromSheet;
      if (Object.keys(patch).length > 0) {
        product = await apiRequest("PUT", `/api/products/${product.id}`, patch);
        productMap.set(productName, product);
        updatedProducts += 1;
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

    const contractNumber = `IMP0225-${String(inserted + 1).padStart(5, "0")}`;
    await apiRequest("POST", "/api/contracts", {
      contractNumber,
      contractDate: currentDate.toISOString(),
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
      paymentMethod: paymentStatusText,
      invoiceIssued,
      worker,
      workCost,
      notes,
      disbursementStatus: paymentStatusText,
      userIdentifier,
    });

    inserted += 1;
    if (inserted % 200 === 0) {
      console.log(`[SYNC] inserted ${inserted}`);
    }
  }

  console.log(`[SYNC] done inserted=${inserted} skipped=${skipped}`);
  console.log(`[SYNC] createdCustomers=${createdCustomers} createdProducts=${createdProducts} updatedProducts=${updatedProducts}`);
}

main().catch((error) => {
  console.error("[SYNC] failed:", error);
  process.exitCode = 1;
});

