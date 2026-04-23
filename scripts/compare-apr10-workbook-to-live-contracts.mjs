import fs from "node:fs/promises";
import path from "node:path";
import XLSX from "xlsx";

function parseArgs(argv) {
  const args = {
    workbook: "",
    liveContracts: "",
    from: "2026-04-10",
    outputDir: path.resolve("deliverables", "apr10_contract_compare"),
  };

  for (const arg of argv) {
    if (arg.startsWith("--workbook=")) args.workbook = path.resolve(arg.slice("--workbook=".length));
    else if (arg.startsWith("--live-contracts=")) args.liveContracts = path.resolve(arg.slice("--live-contracts=".length));
    else if (arg.startsWith("--from=")) args.from = arg.slice("--from=".length);
    else if (arg.startsWith("--output-dir=")) args.outputDir = path.resolve(arg.slice("--output-dir=".length));
  }

  if (!args.workbook) throw new Error("--workbook is required");
  if (!args.liveContracts) throw new Error("--live-contracts is required");
  return args;
}

function normalizeText(value) {
  return String(value ?? "").normalize("NFC").trim();
}

function normalizeCompact(value) {
  return normalizeText(value).replace(/\s+/g, "").toLowerCase();
}

function normalizeVatType(value) {
  const compact = normalizeCompact(value);
  if (!compact) return "";
  if (compact.includes("미포함") || compact.includes("별도") || compact.includes("면세")) return "미포함";
  if (compact.includes("포함")) return "포함";
  return normalizeText(value);
}

function normalizePaymentMethod(value) {
  const compact = normalizeCompact(value);
  if (!compact) return "";
  if (compact === "입금완료") return "입금확인";
  return normalizeText(value);
}

function toInt(value) {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : 0;
  const cleaned = String(value ?? "")
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "")
    .trim();
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function parseWorkbookDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const text = normalizeText(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);

  const match = text.match(/(\d+)\s*\.\s*(\d+)/);
  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return null;
}

function stripTrailingWorker(productName, worker) {
  const normalizedProduct = normalizeText(productName);
  const normalizedWorker = normalizeText(worker);
  if (!normalizedProduct || !normalizedWorker) return normalizedProduct;
  const suffix = `(${normalizedWorker})`;
  return normalizedProduct.endsWith(suffix)
    ? normalizedProduct.slice(0, -suffix.length)
    : normalizedProduct;
}

function findSheetName(sheetNames, keyword) {
  return sheetNames.find((name) => normalizeText(name).includes(keyword));
}

function readWorkbookRows(workbook, fromDate) {
  const slotSheetName = findSheetName(workbook.SheetNames, "슬롯");
  const viralSheetName = findSheetName(workbook.SheetNames, "바이럴");
  if (!slotSheetName || !viralSheetName) {
    throw new Error(`Required sheets not found: ${workbook.SheetNames.join(", ")}`);
  }

  const rows = [];

  const slotRows = XLSX.utils.sheet_to_json(workbook.Sheets[slotSheetName], {
    header: 1,
    defval: "",
    raw: true,
  }).slice(2);

  for (const row of slotRows) {
    const date = parseWorkbookDate(row[0]);
    if (!date || date < fromDate) continue;

    rows.push({
      sheetType: "slot",
      date,
      customerName: normalizeText(row[1]),
      userIdentifier: normalizeText(row[2]),
      productName: normalizeText(row[3]),
      baseProductName: normalizeText(row[3]),
      days: toInt(row[4]),
      addQuantity: toInt(row[5]),
      extendQuantity: toInt(row[6]),
      unitPrice: toInt(row[7]),
      supplyAmount: toInt(row[8]) - toInt(row[12]),
      managerName: normalizeText(row[9]),
      vatType: normalizeVatType(row[10]),
      paymentMethod: normalizePaymentMethod(row[11]),
      refundAmount: toInt(row[12]),
      notes: normalizeText(row[13]),
      worker: normalizeText(row[14]),
    });
  }

  const viralRows = XLSX.utils.sheet_to_json(workbook.Sheets[viralSheetName], {
    header: 1,
    defval: "",
    raw: true,
  }).slice(1);

  for (const row of viralRows) {
    const date = parseWorkbookDate(row[0]);
    if (!date || date < fromDate) continue;

    rows.push({
      sheetType: "viral",
      date,
      customerName: normalizeText(row[1]),
      managerName: normalizeText(row[2]),
      productName: normalizeText(row[3]),
      baseProductName: normalizeText(row[3]),
      addQuantity: toInt(row[4]),
      unitPrice: toInt(row[5]),
      supplyAmount: toInt(row[6]),
      vatType: normalizeVatType(row[7]),
      paymentMethod: normalizePaymentMethod(row[8]),
      notes: normalizeText(row[9]),
      worker: normalizeText(row[10]),
      disbursementStatus: normalizeText(row[11]),
      days: 0,
      extendQuantity: 0,
      refundAmount: 0,
      userIdentifier: "",
    });
  }

  return rows;
}

function parseLiveContractItems(contracts, fromDate) {
  const rows = [];

  for (const contract of contracts) {
    const date = normalizeText(contract.contractDate).slice(0, 10);
    if (!date || date < fromDate) continue;

    let items = [];
    try {
      items = typeof contract.productDetailsJson === "string"
        ? JSON.parse(contract.productDetailsJson || "[]")
        : Array.isArray(contract.productDetailsJson)
          ? contract.productDetailsJson
          : [];
    } catch {
      items = [];
    }

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const userIdentifier = normalizeText(item?.userIdentifier ?? contract.userIdentifier);
      const worker = normalizeText(item?.worker ?? contract.worker);
      const baseProductName = stripTrailingWorker(item?.productName ?? contract.products, worker);
      const days = toInt(item?.days ?? item?.baseDays);
      const addQuantity = toInt(item?.addQuantity);
      const extendQuantity = toInt(item?.extendQuantity);
      const itemType = userIdentifier ? "slot" : "viral";

      rows.push({
        sheetType: itemType,
        contractId: contract.id,
        contractNumber: normalizeText(contract.contractNumber),
        itemIndex: index,
        date,
        customerName: normalizeText(contract.customerName),
        managerName: normalizeText(contract.managerName),
        userIdentifier,
        productName: normalizeText(item?.productName ?? contract.products),
        baseProductName,
        worker,
        days,
        addQuantity,
        extendQuantity,
        unitPrice: toInt(item?.unitPrice),
        supplyAmount: toInt(item?.supplyAmount ?? contract.cost),
        vatType: normalizeVatType(item?.vatType ?? contract.invoiceIssued),
        paymentMethod: normalizePaymentMethod(contract.paymentMethod),
        notes: normalizeText(contract.notes),
      });
    }
  }

  return rows;
}

function buildKey(row) {
  return [
    row.sheetType,
    row.date,
    normalizeCompact(row.customerName),
    normalizeCompact(row.managerName),
    normalizeCompact(row.userIdentifier),
    normalizeCompact(row.baseProductName),
    normalizeCompact(row.worker),
    String(row.days),
    String(row.addQuantity),
    String(row.extendQuantity),
    String(row.unitPrice),
    String(row.supplyAmount),
    normalizeCompact(row.paymentMethod),
    normalizeCompact(row.vatType),
  ].join("||");
}

function bucketRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = buildKey(row);
    const bucket = map.get(key) ?? [];
    bucket.push(row);
    map.set(key, bucket);
  }
  return map;
}

function nowStamp() {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workbook = XLSX.readFile(args.workbook, { cellDates: true });
  const workbookRows = readWorkbookRows(workbook, args.from);
  const liveContracts = JSON.parse(await fs.readFile(args.liveContracts, "utf8"));
  const liveRows = parseLiveContractItems(liveContracts, args.from).filter((row) =>
    row.sheetType === "slot" || row.sheetType === "viral",
  );

  const workbookBuckets = bucketRows(workbookRows);
  const liveBuckets = bucketRows(liveRows);
  const missingRows = [];
  const extraRows = [];
  let matchedRows = 0;

  for (const [key, workbookBucket] of workbookBuckets.entries()) {
    const liveBucket = liveBuckets.get(key) ?? [];
    matchedRows += Math.min(workbookBucket.length, liveBucket.length);
    if (workbookBucket.length > liveBucket.length) {
      missingRows.push(...workbookBucket.slice(liveBucket.length));
    }
  }

  for (const [key, liveBucket] of liveBuckets.entries()) {
    const workbookBucket = workbookBuckets.get(key) ?? [];
    if (liveBucket.length > workbookBucket.length) {
      extraRows.push(...liveBucket.slice(workbookBucket.length));
    }
  }

  const summary = {
    workbookRows: workbookRows.length,
    liveRows: liveRows.length,
    matchedRows,
    missingRows: missingRows.length,
    extraRows: extraRows.length,
    workbookByType: workbookRows.reduce((acc, row) => {
      acc[row.sheetType] = (acc[row.sheetType] || 0) + 1;
      return acc;
    }, {}),
    liveByType: liveRows.reduce((acc, row) => {
      acc[row.sheetType] = (acc[row.sheetType] || 0) + 1;
      return acc;
    }, {}),
    missingByType: missingRows.reduce((acc, row) => {
      acc[row.sheetType] = (acc[row.sheetType] || 0) + 1;
      return acc;
    }, {}),
    extraByType: extraRows.reduce((acc, row) => {
      acc[row.sheetType] = (acc[row.sheetType] || 0) + 1;
      return acc;
    }, {}),
  };

  const outputDir = path.join(args.outputDir, nowStamp());
  await fs.mkdir(outputDir, { recursive: true });

  await Promise.all([
    fs.writeFile(path.join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8"),
    fs.writeFile(path.join(outputDir, "missing_rows.json"), `${JSON.stringify(missingRows, null, 2)}\n`, "utf8"),
    fs.writeFile(path.join(outputDir, "extra_rows.json"), `${JSON.stringify(extraRows, null, 2)}\n`, "utf8"),
    fs.writeFile(path.join(outputDir, "workbook_rows.json"), `${JSON.stringify(workbookRows, null, 2)}\n`, "utf8"),
    fs.writeFile(path.join(outputDir, "live_rows.json"), `${JSON.stringify(liveRows, null, 2)}\n`, "utf8"),
  ]);

  console.log(JSON.stringify({ ...summary, outputDir }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
