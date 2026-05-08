import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import pg from "pg";

const { Client } = pg;

const DEFAULT_DB_URL = "postgres://crm:crm@127.0.0.1:5432/crmdb";

function toTrimmed(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeText(value) {
  return toTrimmed(value).replace(/\s+/g, "").toLowerCase();
}

function normalizeDateOnly(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateForContractNumber(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function toNonNegativeInt(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value ? 1 : 0;
  const numeric = Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.round(numeric));
}

function parseOptionalBoolean(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;

  const normalized = toTrimmed(value).toLowerCase();
  if (!normalized) return null;
  if (["true", "1", "y", "yes", "o"].includes(normalized)) return true;
  if (["false", "0", "n", "no", "x"].includes(normalized)) return false;
  return null;
}

function parseDate(rawDate, fallbackDate) {
  if (rawDate instanceof Date && !Number.isNaN(rawDate.getTime())) {
    return normalizeDateOnly(rawDate);
  }

  if (typeof rawDate === "number" && Number.isFinite(rawDate)) {
    const dateCode = XLSX.SSF.parse_date_code(rawDate);
    if (dateCode?.y && dateCode?.m && dateCode?.d) {
      return new Date(dateCode.y, dateCode.m - 1, dateCode.d);
    }
  }

  const text = toTrimmed(rawDate);
  if (!text) return fallbackDate;

  const normalized = text
    .replace(/[./]/g, "-")
    .replace(/년/g, "-")
    .replace(/월/g, "-")
    .replace(/일/g, "")
    .trim();
  const ymd = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s.*)?$/);
  if (ymd) {
    const date = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    if (!Number.isNaN(date.getTime())) return normalizeDateOnly(date);
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return normalizeDateOnly(parsed);
  }

  return fallbackDate;
}

function hasExplicitDateValue(value) {
  if (value === null || value === undefined) return false;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value === "number") return Number.isFinite(value);
  return toTrimmed(value).length > 0;
}

function parseInvoiceIssued(value) {
  const boolValue = parseOptionalBoolean(value);
  if (boolValue === true) return "포함";
  if (boolValue === false) return "미포함";

  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (["발행", "발급", "포함", "부가세포함"].includes(normalized)) return "포함";
  if (["미발행", "미발급", "미포함", "별도", "부가세별도", "면세"].includes(normalized)) return "미포함";
  return null;
}

function parsePaymentMethod(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (["false", "0", "x", "n", "no"].includes(normalized)) return null;
  if (normalized === "입금완료") return "입금확인";
  if (normalized === "적립금등록") return "적립금 등록";
  return toTrimmed(value);
}

function parsePaymentConfirmed(value) {
  const boolValue = parseOptionalBoolean(value);
  if (boolValue !== null) return boolValue;

  const normalized = normalizeText(value);
  if (!normalized) return false;

  const unconfirmedKeywords = ["미확인", "미입금", "대기", "취소", "cancel", "pending"];
  if (unconfirmedKeywords.some((keyword) => normalized.includes(keyword))) {
    return false;
  }
  return true;
}

function parseDisbursementStatus(value) {
  const boolValue = parseOptionalBoolean(value);
  if (boolValue === true) return "지급완료";
  if (boolValue === false) return "지급대기";

  const text = toTrimmed(value);
  if (!text) return null;
  return text;
}

function mergeNotes(baseNote, refundAmount, extraTexts) {
  const parts = [];

  const note = toTrimmed(baseNote);
  if (note) parts.push(note);

  for (const extra of extraTexts) {
    const normalized = toTrimmed(extra);
    if (!normalized) continue;
    parts.push(normalized);
  }

  if (refundAmount > 0) {
    parts.push(`환불금액: ${refundAmount.toLocaleString("ko-KR")}원`);
  }

  if (parts.length === 0) return null;

  const deduped = [];
  const seen = new Set();
  for (const item of parts) {
    if (seen.has(item)) continue;
    seen.add(item);
    deduped.push(item);
  }
  return deduped.join(" | ");
}

function buildContractKey({ dateKey, customerName, productName, quantity, cost, managerName, worker }) {
  return [
    dateKey,
    normalizeText(customerName),
    normalizeText(productName),
    String(quantity),
    String(cost),
    normalizeText(managerName),
    normalizeText(worker),
  ].join("|");
}

function resolveExcelPath(cliPath) {
  if (cliPath && fs.existsSync(cliPath)) return cliPath;

  const downloadsDir = path.join(process.env.USERPROFILE || "C:\\Users\\earthloop", "Downloads");
  const allFiles = fs
    .readdirSync(downloadsDir)
    .filter((name) => name.toLowerCase().endsWith(".xlsx") && !name.startsWith("~$"))
    .sort((a, b) => {
      const aStat = fs.statSync(path.join(downloadsDir, a));
      const bStat = fs.statSync(path.join(downloadsDir, b));
      return bStat.mtimeMs - aStat.mtimeMs;
    });

  const preferred = allFiles.find((name) => name.includes("월보장") && name.includes("어스루프"));
  if (preferred) return path.join(downloadsDir, preferred);

  const fallback = allFiles.find((name) => name.includes("월보장"));
  if (fallback) return path.join(downloadsDir, fallback);

  if (allFiles.length > 0) return path.join(downloadsDir, allFiles[0]);
  throw new Error(`No .xlsx file found in ${downloadsDir}`);
}

function resolveProduct(productsByNameKey, productName, workerName) {
  const nameKey = normalizeText(productName);
  if (!nameKey) return null;

  const candidates = productsByNameKey.get(nameKey) || [];
  if (candidates.length === 0) return null;
  if (!workerName) return candidates[0];

  const workerKey = normalizeText(workerName);
  const workerMatched = candidates.find((candidate) => normalizeText(candidate.worker) === workerKey);
  return workerMatched || candidates[0];
}

async function main() {
  const excelPath = resolveExcelPath(process.argv[2]);
  const databaseUrl = process.env.DATABASE_URL || DEFAULT_DB_URL;

  const workbook = XLSX.readFile(excelPath, { cellDates: true });
  const sheetName = workbook.SheetNames.find((name) => String(name).includes("바이럴")) || workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null, raw: true });

  if (rows.length === 0) {
    throw new Error(`No rows in sheet: ${sheetName}`);
  }

  const headerKeys = Object.keys(rows[0]);
  if (headerKeys.length < 14) {
    throw new Error(`Unexpected sheet layout: headers=${headerKeys.length}`);
  }

  const kDate = headerKeys[1];
  const kCustomer = headerKeys[2];
  const kProduct = headerKeys[3];
  const kQuantity = headerKeys[4];
  const kUnitPrice = headerKeys[5];
  const kSupply = headerKeys[6];
  const kManager = headerKeys[7];
  const kInvoice = headerKeys[8];
  const kPayment = headerKeys[9];
  const kRefund = headerKeys[10];
  const kNote = headerKeys[11];
  const kWorker = headerKeys[12];
  const kDisbursement = headerKeys[13];
  const extraNoteKeys = headerKeys.slice(14);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const [usersRes, customersRes, productsRes, contractsRes] = await Promise.all([
      client.query(`select id, name from users`),
      client.query(`select id, name from customers`),
      client.query(`select id, name, worker, category, unit_price, base_days, work_cost from products`),
      client.query(`
        select
          id,
          contract_date::date as contract_date,
          customer_name,
          products,
          quantity,
          add_quantity,
          extend_quantity,
          cost,
          manager_name,
          worker
        from contracts
      `),
    ]);

    const userMap = new Map();
    for (const row of usersRes.rows) {
      const key = normalizeText(row.name);
      if (!key || userMap.has(key)) continue;
      userMap.set(key, row.id);
    }

    const customerMap = new Map();
    for (const row of customersRes.rows) {
      const key = normalizeText(row.name);
      if (!key || customerMap.has(key)) continue;
      customerMap.set(key, { id: row.id, name: row.name });
    }

    const productsByNameKey = new Map();
    for (const row of productsRes.rows) {
      const key = normalizeText(row.name);
      if (!key) continue;
      if (!productsByNameKey.has(key)) productsByNameKey.set(key, []);
      productsByNameKey.get(key).push(row);
    }

    const existingContractCounts = new Map();
    const addExistingContractCount = (key) => {
      existingContractCounts.set(key, (existingContractCounts.get(key) || 0) + 1);
    };
    for (const row of contractsRes.rows) {
      const quantityFromSplit = (Number(row.add_quantity) || 0) + (Number(row.extend_quantity) || 0);
      const quantity = quantityFromSplit > 0 ? quantityFromSplit : Math.max(1, Number(row.quantity) || 1);
      const existingContractDate = row.contract_date instanceof Date
        ? row.contract_date
        : new Date(row.contract_date);
      const dateKey = formatDateKey(existingContractDate);
      const key = buildContractKey({
        dateKey,
        customerName: row.customer_name || "",
        productName: toTrimmed(row.products || ""),
        quantity,
        cost: Number(row.cost) || 0,
        managerName: row.manager_name || "",
        worker: row.worker || "",
      });
      addExistingContractCount(key);
    }
    const sheetSeenCounts = new Map();

    let currentDate = null;
    let insertedCustomers = 0;
    let insertedContracts = 0;
    let insertedPayments = 0;
    let skippedMissingRequired = 0;
    let skippedPayback = 0;
    let skippedDuplicates = 0;
    let rowsWithUnmappedProduct = 0;
    let rowsWithWorkCostFallbackZero = 0;
    const unmappedProducts = new Set();

    const now = new Date();
    const today = normalizeDateOnly(now);
    const contractNumberPrefix = `VIRAL-${formatDateForContractNumber(today)}`;

    await client.query("BEGIN");

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      const customerName = toTrimmed(row[kCustomer]);
      const productName = toTrimmed(row[kProduct]);
      if (!customerName || !productName) {
        skippedMissingRequired += 1;
        continue;
      }

      if (hasExplicitDateValue(row[kDate])) {
        currentDate = parseDate(row[kDate], currentDate || today);
      } else if (!currentDate) {
        currentDate = today;
      }

      const compactProductName = normalizeText(productName);
      if (compactProductName === "페이백대행") {
        skippedPayback += 1;
        continue;
      }

      const quantity = Math.max(1, toNonNegativeInt(row[kQuantity], 1));
      const unitPrice = toNonNegativeInt(row[kUnitPrice], 0);
      const supplyAmountFromSheet = toNonNegativeInt(row[kSupply], 0);
      const supplyAmount = supplyAmountFromSheet > 0 ? supplyAmountFromSheet : unitPrice * quantity;

      const invoiceIssued = parseInvoiceIssued(row[kInvoice]) || "미포함";
      const cost = invoiceIssued === "포함"
        ? supplyAmount + Math.round(supplyAmount * 0.1)
        : supplyAmount;

      const managerNameRaw = toTrimmed(row[kManager]);
      const managerName = managerNameRaw || "미지정";
      const worker = toTrimmed(row[kWorker]) || null;
      const paymentMethod = parsePaymentMethod(row[kPayment]);
      const paymentConfirmed = parsePaymentConfirmed(row[kPayment]);
      const disbursementStatus = parseDisbursementStatus(row[kDisbursement]);
      const executionPaymentStatus = disbursementStatus || "입금전";
      const refundAmount = toNonNegativeInt(row[kRefund], 0);
      const extraNoteTexts = extraNoteKeys.map((key) => row[key]);
      const notes = mergeNotes(row[kNote], refundAmount, extraNoteTexts);

      const dateKey = formatDateKey(currentDate);
      const contractKey = buildContractKey({
        dateKey,
        customerName,
        productName,
        quantity,
        cost,
        managerName,
        worker,
      });
      const seenCount = (sheetSeenCounts.get(contractKey) || 0) + 1;
      sheetSeenCounts.set(contractKey, seenCount);
      const existingCount = existingContractCounts.get(contractKey) || 0;
      if (seenCount <= existingCount) {
        skippedDuplicates += 1;
        continue;
      }

      let customer = customerMap.get(normalizeText(customerName));
      if (!customer) {
        const inserted = await client.query(
          `
            insert into customers (name, company, status, created_at)
            values ($1, $2, 'active', now())
            returning id, name
          `,
          [customerName, customerName],
        );
        customer = inserted.rows[0];
        customerMap.set(normalizeText(customerName), customer);
        insertedCustomers += 1;
      }

      const matchedProduct = resolveProduct(productsByNameKey, productName, worker);
      if (!matchedProduct) {
        rowsWithUnmappedProduct += 1;
        unmappedProducts.add(productName);
      }

      const baseDays = Math.max(1, toNonNegativeInt(matchedProduct?.base_days, 1));
      const productWorkCost = toNonNegativeInt(matchedProduct?.work_cost, 0);
      const days = 1;
      const workCost = productWorkCost > 0
        ? Math.round((productWorkCost / baseDays) * quantity * days)
        : 0;
      if (workCost === 0) {
        rowsWithWorkCostFallbackZero += 1;
      }

      const managerId = userMap.get(normalizeText(managerNameRaw)) || null;
      const contractNumber = `${contractNumberPrefix}-${String(rowIndex + 1).padStart(5, "0")}`;
      const addQuantity = quantity;
      const extendQuantity = 0;

      const insertedContract = await client.query(
        `
          insert into contracts (
            contract_number,
            contract_date,
            contract_name,
            manager_id,
            manager_name,
            customer_id,
            customer_name,
            products,
            cost,
            days,
            quantity,
            add_quantity,
            extend_quantity,
            payment_confirmed,
            payment_method,
            invoice_issued,
            worker,
            work_cost,
            notes,
            disbursement_status,
            execution_payment_status,
            user_identifier
          ) values (
            $1, $2, null, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
            $13, $14, $15, $16, $17, $18, $19, $20, null
          )
          returning id
        `,
        [
          contractNumber,
          currentDate,
          managerId,
          managerName,
          customer.id,
          customerName,
          productName,
          cost,
          days,
          quantity,
          addQuantity,
          extendQuantity,
          paymentConfirmed,
          paymentMethod,
          invoiceIssued,
          worker,
          workCost,
          notes,
          disbursementStatus,
          executionPaymentStatus,
        ],
      );

      const contractId = insertedContract.rows[0].id;
      await client.query(
        `
          insert into payments (
            contract_id,
            deposit_date,
            customer_name,
            manager,
            amount,
            deposit_confirmed,
            payment_method,
            invoice_issued,
            notes,
            created_at
          ) values (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, now()
          )
        `,
        [
          contractId,
          currentDate,
          customerName,
          managerName,
          cost,
          paymentConfirmed,
          paymentMethod,
          invoiceIssued === "포함",
          notes,
        ],
      );

      insertedContracts += 1;
      insertedPayments += 1;
    }

    await client.query("COMMIT");

    console.log(`[VIRAL-IMPORT] source=${excelPath}`);
    console.log(`[VIRAL-IMPORT] sheet=${sheetName}`);
    console.log(`[VIRAL-IMPORT] rows=${rows.length}`);
    console.log(`[VIRAL-IMPORT] insertedCustomers=${insertedCustomers}`);
    console.log(`[VIRAL-IMPORT] insertedContracts=${insertedContracts}`);
    console.log(`[VIRAL-IMPORT] insertedPayments=${insertedPayments}`);
    console.log(`[VIRAL-IMPORT] skippedMissingRequired=${skippedMissingRequired}`);
    console.log(`[VIRAL-IMPORT] skippedPayback=${skippedPayback}`);
    console.log(`[VIRAL-IMPORT] skippedDuplicates=${skippedDuplicates}`);
    console.log(`[VIRAL-IMPORT] rowsWithUnmappedProduct=${rowsWithUnmappedProduct}`);
    console.log(`[VIRAL-IMPORT] rowsWithWorkCostZero=${rowsWithWorkCostFallbackZero}`);
    if (unmappedProducts.size > 0) {
      console.log(
        `[VIRAL-IMPORT] unmappedProductSample=${Array.from(unmappedProducts).slice(0, 40).join(", ")}`,
      );
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[VIRAL-IMPORT] failed:", error);
  process.exitCode = 1;
});
