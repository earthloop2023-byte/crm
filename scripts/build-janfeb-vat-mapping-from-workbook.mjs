import fs from "node:fs/promises";
import path from "node:path";
import XLSX from "xlsx";

function parseArgs(argv) {
  const args = {
    file: "",
    contracts: "",
    outputDir: path.resolve("deliverables", "vat_janfeb_mapping"),
  };

  for (const arg of argv) {
    if (arg.startsWith("--file=")) args.file = path.resolve(arg.slice("--file=".length));
    else if (arg.startsWith("--contracts=")) args.contracts = path.resolve(arg.slice("--contracts=".length));
    else if (arg.startsWith("--output-dir=")) args.outputDir = path.resolve(arg.slice("--output-dir=".length));
  }

  if (!args.file) throw new Error("--file is required");
  if (!args.contracts) throw new Error("--contracts is required");
  return args;
}

function normalizeText(value) {
  return String(value ?? "").normalize("NFC").trim();
}

function normalizeCompact(value) {
  return normalizeText(value).replace(/\s+/g, "").toLowerCase();
}

function normalizeUserIdentifier(value) {
  return normalizeCompact(value);
}

function normalizeProductBase(value) {
  return normalizeCompact(String(value ?? "").replace(/\([^)]*\)/g, ""));
}

function toNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const cleaned = String(value ?? "")
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "");
  if (!cleaned) return 0;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toInt(value) {
  return Math.round(toNumber(value));
}

function normalizeVatType(value) {
  const compact = normalizeCompact(value);
  if (!compact) return null;
  if (compact.includes("미포함") || compact.includes("별도") || compact.includes("면세")) return "미포함";
  if (compact.includes("포함")) return "포함";
  return null;
}

function parseSheetMonth(sheetName) {
  const match = /^(\d{2})\.(\d{1,2})/.exec(normalizeText(sheetName));
  if (!match) return null;
  const year = 2000 + Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
  return { year, month };
}

function formatDateParts(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseWorkbookDate(value, sheetYear, sheetMonth) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === "number" && Number.isFinite(value) && value > 1000) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) {
      return formatDateParts(parsed.y, parsed.m, parsed.d);
    }
  }

  const text = normalizeText(value);
  const tokens = text.match(/\d+/g) ?? [];
  if (tokens.length >= 2) {
    const maybeMonth = Number(tokens[0]);
    const maybeDay = Number(tokens[1]);
    if (maybeMonth >= 1 && maybeMonth <= 12 && maybeDay >= 1 && maybeDay <= 31) {
      return formatDateParts(sheetYear, maybeMonth, maybeDay);
    }
  }

  if (tokens.length >= 1) {
    const maybeDay = Number(tokens[tokens.length - 1]);
    if (maybeDay >= 1 && maybeDay <= 31) {
      return formatDateParts(sheetYear, sheetMonth, maybeDay);
    }
  }

  return null;
}

function buildWorkbookRows(workbook) {
  const rows = [];

  for (const sheetName of workbook.SheetNames) {
    const monthInfo = parseSheetMonth(sheetName);
    if (!monthInfo) continue;
    if (!(monthInfo.year === 2026 && (monthInfo.month === 1 || monthInfo.month === 2))) continue;

    const values = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      raw: true,
      defval: "",
    });

    for (let index = 3; index < values.length; index += 1) {
      const row = values[index];
      if (!Array.isArray(row)) continue;

      const vatType = normalizeVatType(row[15]);
      const contractDate = parseWorkbookDate(row[0], monthInfo.year, monthInfo.month);
      const customerName = normalizeText(row[1]);
      const userIdentifier = normalizeText(row[2]);
      const productName = normalizeText(row[3]);
      const managerName = normalizeText(row[14]);
      const worker = normalizeText(row[10]);
      const days = toInt(row[4]);
      const addQuantity = toInt(row[5]);
      const extendQuantity = toInt(row[6]);
      const unitPrice = toInt(row[7]);
      const totalSupplyAmount = toNumber(row[8]);
      const refundAmount = toNumber(row[9]);
      const netSupplyAmount = Math.round(totalSupplyAmount - refundAmount);
      const workerUnitCost = Math.round(toNumber(row[11]));

      if (!vatType || !contractDate || !customerName || !productName) continue;
      if (netSupplyAmount <= 0) continue;

      rows.push({
        sourceSheet: sheetName,
        sourceRowNumber: index + 1,
        contractDate,
        customerName,
        managerName,
        userIdentifier,
        productName,
        productBaseKey: normalizeProductBase(productName),
        worker,
        workerKey: normalizeCompact(worker),
        days,
        addQuantity,
        extendQuantity,
        unitPrice,
        netSupplyAmount,
        workerUnitCost,
        vatType,
      });
    }
  }

  return rows;
}

function parseStoredItems(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeContractDate(value) {
  const text = normalizeText(value);
  return text.slice(0, 10);
}

function buildLiveItems(contracts) {
  const items = [];

  for (const contract of contracts) {
    const contractDate = normalizeContractDate(contract.contractDate);
    if (!(contractDate.startsWith("2026-01-") || contractDate.startsWith("2026-02-"))) continue;

    const parsedItems = parseStoredItems(contract.productDetailsJson);
    parsedItems.forEach((item, index) => {
      items.push({
        contractId: contract.id,
        contractNumber: normalizeText(contract.contractNumber),
        contractDate,
        customerName: normalizeText(contract.customerName),
        managerName: normalizeText(contract.managerName),
        userIdentifier: normalizeText(item?.userIdentifier ?? contract.userIdentifier),
        productName: normalizeText(item?.productName),
        productBaseKey: normalizeProductBase(item?.productName),
        worker: normalizeText(item?.worker),
        workerKey: normalizeCompact(item?.worker),
        days: toInt(item?.days ?? item?.baseDays),
        addQuantity: toInt(item?.addQuantity),
        extendQuantity: toInt(item?.extendQuantity),
        unitPrice: toInt(item?.unitPrice),
        netSupplyAmount: toInt(item?.supplyAmount),
        workerUnitCost: Math.round(toNumber(item?.workCost)),
        currentVatType: normalizeVatType(item?.vatType) ?? "",
        itemId: normalizeText(item?.id || String(index + 1)),
        itemIndex: index,
      });
    });
  }

  return items;
}

function buildKey(row) {
  return [
    row.contractDate,
    normalizeCompact(row.customerName),
    normalizeCompact(row.managerName),
    normalizeUserIdentifier(row.userIdentifier),
    row.productBaseKey,
    row.workerKey,
    String(row.days),
    String(row.addQuantity),
    String(row.extendQuantity),
    String(row.unitPrice),
    String(row.netSupplyAmount),
    String(row.workerUnitCost),
  ].join("||");
}

function buildRelaxedKey(row) {
  return [
    row.contractDate,
    normalizeCompact(row.customerName),
    normalizeCompact(row.managerName),
    normalizeUserIdentifier(row.userIdentifier),
    row.productBaseKey,
    row.workerKey,
    String(row.days),
    String(row.addQuantity),
    String(row.extendQuantity),
    String(row.unitPrice),
    String(row.netSupplyAmount),
  ].join("||");
}

function bucketByKey(rows, keyBuilder) {
  const map = new Map();
  for (const row of rows) {
    const key = keyBuilder(row);
    const bucket = map.get(key) ?? [];
    bucket.push(row);
    map.set(key, bucket);
  }
  return map;
}

function uniqueValues(values) {
  return [...new Set(values)];
}

function hasConsistentVat(rows) {
  const vatTypes = uniqueValues(rows.map((row) => row.vatType));
  return vatTypes.length === 1 ? vatTypes[0] : null;
}

function parseContractSequence(contractNumber) {
  const match = /(\d+)$/.exec(normalizeText(contractNumber));
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function assignOrderedBucket(assignmentsByItemKey, workbookRows, liveRows, matchType) {
  if (workbookRows.length !== liveRows.length) {
    return { applied: 0, reason: "count-mismatch" };
  }

  const sortedWorkbookRows = [...workbookRows].sort((a, b) => {
    if (a.sourceSheet !== b.sourceSheet) return a.sourceSheet.localeCompare(b.sourceSheet, "ko");
    return a.sourceRowNumber - b.sourceRowNumber;
  });
  const sortedLiveRows = [...liveRows].sort((a, b) => {
    const seqDiff = parseContractSequence(a.contractNumber) - parseContractSequence(b.contractNumber);
    if (seqDiff !== 0) return seqDiff;
    return a.contractId.localeCompare(b.contractId);
  });

  for (let index = 0; index < sortedLiveRows.length; index += 1) {
    const liveRow = sortedLiveRows[index];
    const workbookRow = sortedWorkbookRows[index];
    assignmentsByItemKey.set(`${liveRow.contractId}::${liveRow.itemIndex}`, {
      vatType: workbookRow.vatType,
      matchType,
      liveRow,
      workbookRow,
    });
  }

  return { applied: sortedLiveRows.length, reason: null };
}

function assignBucket(assignmentsByItemKey, workbookRows, liveRows, matchType) {
  const vatType = hasConsistentVat(workbookRows);
  if (!vatType) {
    return { applied: 0, reason: "mixed-vat" };
  }
  if (workbookRows.length !== liveRows.length) {
    return { applied: 0, reason: "count-mismatch" };
  }

  for (const liveRow of liveRows) {
    assignmentsByItemKey.set(`${liveRow.contractId}::${liveRow.itemIndex}`, {
      vatType,
      matchType,
      liveRow,
    });
  }

  return { applied: liveRows.length, reason: null };
}

function escapeSqlString(value) {
  return String(value ?? "").replace(/'/g, "''");
}

function buildSql(updates) {
  const lines = ["begin;"];

  for (const update of updates) {
    const json = escapeSqlString(JSON.stringify(update.productDetails));
    const invoiceIssued =
      update.invoiceIssued === null
        ? "null"
        : `'${escapeSqlString(update.invoiceIssued)}'`;

    lines.push(
      `update contracts set invoice_issued = ${invoiceIssued}, product_details_json = '${json}' where id = '${escapeSqlString(update.contractId)}';`,
    );
  }

  lines.push("commit;");
  return `${lines.join("\n")}\n`;
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
  const workbook = XLSX.readFile(args.file, { cellDates: true });
  const workbookRows = buildWorkbookRows(workbook);
  const contracts = JSON.parse(await fs.readFile(args.contracts, "utf8"));
  const liveItems = buildLiveItems(contracts);

  const workbookExact = bucketByKey(workbookRows, buildKey);
  const liveExact = bucketByKey(liveItems, buildKey);
  const workbookRelaxed = bucketByKey(workbookRows, buildRelaxedKey);
  const liveRelaxed = bucketByKey(liveItems, buildRelaxedKey);
  const assignmentsByItemKey = new Map();
  const unresolvedWorkbookKeys = new Set();
  const unresolvedLiveKeys = new Set();
  const exactIssues = [];

  let exactMatchedGroups = 0;
  let exactMatchedRows = 0;
  let orderedMatchedGroups = 0;
  let orderedMatchedRows = 0;

  for (const [key, workbookBucket] of workbookExact.entries()) {
    const liveBucket = liveExact.get(key) ?? [];
    const result = assignBucket(assignmentsByItemKey, workbookBucket, liveBucket, "exact");
    if (result.reason) {
      if (result.reason === "mixed-vat" && workbookBucket.length === liveBucket.length && liveBucket.length > 0) {
        const orderedResult = assignOrderedBucket(
          assignmentsByItemKey,
          workbookBucket,
          liveBucket,
          "exact-ordered-duplicate",
        );
        if (!orderedResult.reason) {
          exactMatchedGroups += 1;
          exactMatchedRows += orderedResult.applied;
          orderedMatchedGroups += 1;
          orderedMatchedRows += orderedResult.applied;
          continue;
        }
      }

      unresolvedWorkbookKeys.add(key);
      exactIssues.push({
        key,
        reason: result.reason,
        workbookCount: workbookBucket.length,
        liveCount: liveBucket.length,
        workbookVatTypes: uniqueValues(workbookBucket.map((row) => row.vatType)),
        sampleWorkbook: workbookBucket[0],
        sampleLive: liveBucket[0] ?? null,
      });
      if (liveBucket.length > 0) unresolvedLiveKeys.add(key);
      continue;
    }
    exactMatchedGroups += 1;
    exactMatchedRows += result.applied;
  }

  for (const key of liveExact.keys()) {
    if (!workbookExact.has(key)) {
      unresolvedLiveKeys.add(key);
    }
  }

  let relaxedMatchedGroups = 0;
  let relaxedMatchedRows = 0;
  const relaxedIssues = [];
  const consumedRelaxedKeys = new Set();

  for (const exactKey of unresolvedWorkbookKeys) {
    const workbookBucket = workbookExact.get(exactKey) ?? [];
    const relaxedKey = buildRelaxedKey(workbookBucket[0]);
    if (consumedRelaxedKeys.has(relaxedKey)) continue;

    const workbookBucketRelaxed = workbookRelaxed.get(relaxedKey) ?? [];
    const liveBucketRelaxed = (liveRelaxed.get(relaxedKey) ?? []).filter(
      (row) => !assignmentsByItemKey.has(`${row.contractId}::${row.itemIndex}`),
    );

    const vatType = hasConsistentVat(workbookBucketRelaxed);
    const distinctLiveExactKeys = uniqueValues(liveBucketRelaxed.map((row) => buildKey(row)));

    if (!vatType || workbookBucketRelaxed.length !== liveBucketRelaxed.length || distinctLiveExactKeys.length !== 1) {
      relaxedIssues.push({
        relaxedKey,
        workbookCount: workbookBucketRelaxed.length,
        liveCount: liveBucketRelaxed.length,
        workbookVatTypes: uniqueValues(workbookBucketRelaxed.map((row) => row.vatType)),
        distinctLiveExactKeys,
        sampleWorkbook: workbookBucketRelaxed[0] ?? null,
        sampleLive: liveBucketRelaxed[0] ?? null,
      });
      consumedRelaxedKeys.add(relaxedKey);
      continue;
    }

    const result = assignBucket(assignmentsByItemKey, workbookBucketRelaxed, liveBucketRelaxed, "relaxed-worker-cost");
    if (!result.reason) {
      relaxedMatchedGroups += 1;
      relaxedMatchedRows += result.applied;
      consumedRelaxedKeys.add(relaxedKey);
    }
  }

  const contractMap = new Map(
    contracts.map((contract) => [contract.id, contract]),
  );

  const updates = [];
  const mixedContracts = [];
  const parseFailures = [];
  let updatedItemCount = 0;
  let updatedContractCount = 0;

  for (const contract of contracts) {
    const contractDate = normalizeContractDate(contract.contractDate);
    if (!(contractDate.startsWith("2026-01-") || contractDate.startsWith("2026-02-"))) continue;

    const parsedItems = parseStoredItems(contract.productDetailsJson);
    if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
      parseFailures.push({
        contractId: contract.id,
        contractNumber: contract.contractNumber,
        reason: "no-product-details",
      });
      continue;
    }

    let changed = false;
    let matchedItemsForContract = 0;
    const nextItems = parsedItems.map((item, index) => {
      const assignment = assignmentsByItemKey.get(`${contract.id}::${index}`);
      if (!assignment) return item;

      matchedItemsForContract += 1;
      const nextVatType = assignment.vatType;
      const currentVatType = normalizeVatType(item?.vatType) ?? "";
      if (currentVatType !== nextVatType) {
        changed = true;
        updatedItemCount += 1;
      }
      return {
        ...item,
        vatType: nextVatType,
      };
    });

    if (matchedItemsForContract === 0) continue;

    const finalVatTypes = nextItems
      .map((item) => normalizeVatType(item?.vatType))
      .filter(Boolean);
    const uniqueVatTypes = uniqueValues(finalVatTypes);

    let nextInvoiceIssued = contract.invoiceIssued ?? null;
    if (uniqueVatTypes.length === 1 && finalVatTypes.length === nextItems.length) {
      if (normalizeVatType(contract.invoiceIssued) !== uniqueVatTypes[0]) {
        changed = true;
      }
      nextInvoiceIssued = uniqueVatTypes[0];
    } else if (uniqueVatTypes.length > 1) {
      mixedContracts.push({
        contractId: contract.id,
        contractNumber: contract.contractNumber,
        vatTypes: uniqueVatTypes,
      });
    }

    if (!changed) continue;

    updatedContractCount += 1;
    updates.push({
      contractId: contract.id,
      contractNumber: contract.contractNumber,
      contractDate,
      customerName: contract.customerName,
      managerName: contract.managerName,
      invoiceIssued: nextInvoiceIssued,
      matchedItemsForContract,
      totalItems: nextItems.length,
      productDetails: nextItems,
    });
  }

  const unmatchedWorkbookRows = workbookRows.filter((row) => {
    const relaxedKey = buildRelaxedKey(row);
    return ![...assignmentsByItemKey.values()].some((assignment) => buildRelaxedKey(assignment.liveRow) === relaxedKey);
  });

  const matchedContractIds = new Set(updates.map((update) => update.contractId));
  const unmatchedLiveItems = liveItems.filter(
    (row) => !assignmentsByItemKey.has(`${row.contractId}::${row.itemIndex}`),
  );

  const stamp = nowStamp();
  const outputDir = path.resolve(args.outputDir, stamp);
  await fs.mkdir(outputDir, { recursive: true });

  const report = {
    workbookFile: args.file,
    contractsFile: args.contracts,
    workbookRows: workbookRows.length,
    liveItems: liveItems.length,
    exactMatchedGroups,
    exactMatchedRows,
    orderedMatchedGroups,
    orderedMatchedRows,
    relaxedMatchedGroups,
    relaxedMatchedRows,
    totalAssignedItems: assignmentsByItemKey.size,
    updatedItemCount,
    updatedContractCount,
    matchedContractCount: matchedContractIds.size,
    unmatchedWorkbookRows: unmatchedWorkbookRows.length,
    unmatchedLiveItems: unmatchedLiveItems.length,
    mixedContracts: mixedContracts.length,
    parseFailures: parseFailures.length,
    exactIssues: exactIssues.length,
    relaxedIssues: relaxedIssues.length,
  };

  const reportPath = path.join(outputDir, "vat_mapping_report.json");
  const updatesPath = path.join(outputDir, "vat_contract_updates.json");
  const sqlPath = path.join(outputDir, "vat_contract_updates.sql");
  const unmatchedWorkbookPath = path.join(outputDir, "unmatched_workbook_rows.json");
  const unmatchedLivePath = path.join(outputDir, "unmatched_live_items.json");
  const exactIssuesPath = path.join(outputDir, "exact_issues.json");
  const relaxedIssuesPath = path.join(outputDir, "relaxed_issues.json");
  const mixedContractsPath = path.join(outputDir, "mixed_contracts.json");

  await Promise.all([
    fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    fs.writeFile(updatesPath, `${JSON.stringify(updates, null, 2)}\n`, "utf8"),
    fs.writeFile(sqlPath, buildSql(updates), "utf8"),
    fs.writeFile(unmatchedWorkbookPath, `${JSON.stringify(unmatchedWorkbookRows, null, 2)}\n`, "utf8"),
    fs.writeFile(unmatchedLivePath, `${JSON.stringify(unmatchedLiveItems, null, 2)}\n`, "utf8"),
    fs.writeFile(exactIssuesPath, `${JSON.stringify(exactIssues, null, 2)}\n`, "utf8"),
    fs.writeFile(relaxedIssuesPath, `${JSON.stringify(relaxedIssues, null, 2)}\n`, "utf8"),
    fs.writeFile(mixedContractsPath, `${JSON.stringify(mixedContracts, null, 2)}\n`, "utf8"),
  ]);

  console.log(
    JSON.stringify(
      {
        ...report,
        outputDir,
        reportPath,
        updatesPath,
        sqlPath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
