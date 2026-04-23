import fs from "node:fs/promises";
import path from "node:path";
import XLSX from "xlsx";

function parseArgs(argv) {
  const args = {
    workbook: "",
    liveContracts: "",
    liveProducts: "",
    liveProductHistories: "",
    liveUsers: "",
    liveCustomers: "",
    viralComboMap: path.resolve("deliverables", "audit_20260413_april_only", "viral_remapped_combos.json"),
    from: "2026-04-10",
    outputDir: path.resolve("deliverables", "apr10_contract_reconcile"),
  };

  for (const arg of argv) {
    if (arg.startsWith("--workbook=")) args.workbook = path.resolve(arg.slice("--workbook=".length));
    else if (arg.startsWith("--live-contracts=")) args.liveContracts = path.resolve(arg.slice("--live-contracts=".length));
    else if (arg.startsWith("--live-products=")) args.liveProducts = path.resolve(arg.slice("--live-products=".length));
    else if (arg.startsWith("--live-product-histories=")) args.liveProductHistories = path.resolve(arg.slice("--live-product-histories=".length));
    else if (arg.startsWith("--live-users=")) args.liveUsers = path.resolve(arg.slice("--live-users=".length));
    else if (arg.startsWith("--live-customers=")) args.liveCustomers = path.resolve(arg.slice("--live-customers=".length));
    else if (arg.startsWith("--viral-combo-map=")) args.viralComboMap = path.resolve(arg.slice("--viral-combo-map=".length));
    else if (arg.startsWith("--from=")) args.from = arg.slice("--from=".length);
    else if (arg.startsWith("--output-dir=")) args.outputDir = path.resolve(arg.slice("--output-dir=".length));
  }

  for (const [key, value] of Object.entries(args)) {
    if (["from", "outputDir", "viralComboMap"].includes(key)) continue;
    if (!value) throw new Error(`--${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)} is required`);
  }

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
  if (compact === "적립금사용" || compact === "적립금사용하기") return "적립금사용";
  if (compact === "적립금사용") return "적립금사용";
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
  let sourceIndex = 1;

  const slotRows = XLSX.utils.sheet_to_json(workbook.Sheets[slotSheetName], {
    header: 1,
    defval: "",
    raw: true,
  }).slice(2);

  for (const row of slotRows) {
    const date = parseWorkbookDate(row[0]);
    if (!date || date < fromDate) continue;
    rows.push({
      sourceIndex: sourceIndex++,
      sourceSheet: slotSheetName,
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
      disbursementStatus: "",
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
      sourceIndex: sourceIndex++,
      sourceSheet: viralSheetName,
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
    if (fromDate && (!date || date < fromDate)) continue;

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
      rows.push({
        liveIndex: rows.length + 1,
        sheetType: userIdentifier ? "slot" : "viral",
        contractId: contract.id,
        contractNumber: normalizeText(contract.contractNumber),
        itemIndex: index,
        date,
        customerName: normalizeText(contract.customerName),
        managerName: normalizeText(contract.managerName),
        userIdentifier,
        productName: normalizeText(item?.productName ?? contract.products),
        baseProductName: stripTrailingWorker(item?.productName ?? contract.products, worker),
        worker,
        days: toInt(item?.days ?? item?.baseDays),
        addQuantity: toInt(item?.addQuantity),
        extendQuantity: toInt(item?.extendQuantity),
        unitPrice: toInt(item?.unitPrice),
        supplyAmount: toInt(item?.supplyAmount ?? contract.cost),
        vatType: normalizeVatType(item?.vatType ?? contract.invoiceIssued),
        paymentMethod: normalizePaymentMethod(contract.paymentMethod),
        notes: normalizeText(contract.notes),
        disbursementStatus: normalizeText(contract.disbursementStatus),
        quantity: toInt(item?.quantity),
        baseDays: toInt(item?.baseDays),
        workCost: toInt(item?.workCost),
      });
    }
  }

  return rows;
}

function buildLiveProductExampleMaps(liveRows) {
  const exactMap = new Map();
  const wildcardWorkerMap = new Map();
  const exactProductNameMap = new Map();

  for (const row of liveRows) {
    const exactKey = [
      row.sheetType,
      normalizeCompact(row.baseProductName),
      normalizeCompact(row.worker),
    ].join("||");
    if (!exactMap.has(exactKey)) {
      exactMap.set(exactKey, row);
    }

    const wildcardKey = [
      row.sheetType,
      normalizeCompact(row.baseProductName),
    ].join("||");
    if (!wildcardWorkerMap.has(wildcardKey)) {
      wildcardWorkerMap.set(wildcardKey, row);
    }

    const productNameKey = normalizeCompact(row.productName);
    if (productNameKey && !exactProductNameMap.has(productNameKey)) {
      exactProductNameMap.set(productNameKey, row);
    }
  }

  return { exactMap, wildcardWorkerMap, exactProductNameMap, allRows: liveRows };
}

function buildViralComboLookup(rows) {
  const map = new Map();
  for (const row of rows ?? []) {
    const rawProductName = normalizeText(row?.product_name_raw ?? row?.productNameRaw);
    if (!rawProductName) continue;
    const worker = normalizeText(row?.worker);
    const key = [normalizeCompact(rawProductName), normalizeCompact(worker)].join("||");
    map.set(key, {
      mappedProductName: normalizeText(row?.mapped_server_product_name ?? row?.mappedServerProductName),
      mappedWorker: normalizeText(row?.mapped_server_worker ?? row?.mappedServerWorker),
      mappedProductId: normalizeText(row?.mapped_server_product_id ?? row?.mappedServerProductId),
    });
  }
  return map;
}

function exactKey(row) {
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

function fuzzyKey(row) {
  if (row.sheetType === "slot") {
    return [
      row.sheetType,
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

  return [
    row.sheetType,
    normalizeCompact(row.customerName),
    normalizeCompact(row.managerName),
    normalizeCompact(row.baseProductName),
    normalizeCompact(row.worker || "*"),
    String(row.addQuantity),
    String(row.unitPrice),
    String(row.supplyAmount),
    normalizeCompact(row.paymentMethod),
    normalizeCompact(row.vatType),
  ].join("||");
}

function fuzzyCandidateKeyForLive(row, allowWorkerWildcard = false) {
  if (row.sheetType === "slot") return fuzzyKey(row);
  return [
    row.sheetType,
    normalizeCompact(row.customerName),
    normalizeCompact(row.managerName),
    normalizeCompact(row.baseProductName),
    normalizeCompact(allowWorkerWildcard ? "*" : row.worker),
    String(row.addQuantity),
    String(row.unitPrice),
    String(row.supplyAmount),
    normalizeCompact(row.paymentMethod),
    normalizeCompact(row.vatType),
  ].join("||");
}

function bucketRows(rows, keyBuilder) {
  const map = new Map();
  for (const row of rows) {
    const key = keyBuilder(row);
    const bucket = map.get(key) ?? [];
    bucket.push(row);
    map.set(key, bucket);
  }
  return map;
}

function pickMatchingProduct(row, products) {
  const base = normalizeCompact(row.baseProductName);
  const worker = normalizeCompact(row.worker);
  const readProductBase = (product) => normalizeCompact(stripTrailingWorker(product.name, product.worker));
  const exactCandidates = products.filter((product) => {
    const productWorker = normalizeCompact(product.worker);
    const productBase = readProductBase(product);
    return productBase === base && (worker ? productWorker === worker : true);
  });

  if (worker && exactCandidates.length === 1) return exactCandidates[0];
  if (!worker && exactCandidates.length === 1) return exactCandidates[0];

  const baseOnly = products.filter((product) =>
    readProductBase(product) === base,
  );

  if (baseOnly.length === 1) return baseOnly[0];

  const fuzzyCandidates = products.filter((product) => {
    const productWorker = normalizeCompact(product.worker);
    const productBase = readProductBase(product);
    if (worker && productWorker !== worker) return false;
    return productBase.includes(base) || base.includes(productBase);
  });

  if (fuzzyCandidates.length === 1) return fuzzyCandidates[0];
  return exactCandidates[0] ?? baseOnly[0] ?? null;
}

function buildProductHistoryLookup(histories) {
  const map = new Map();
  for (const history of histories) {
    const key = normalizeText(history.productName);
    if (!key) continue;
    const bucket = map.get(key) ?? [];
    bucket.push(history);
    map.set(key, bucket);
  }

  for (const bucket of map.values()) {
    bucket.sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());
  }

  return map;
}

function pickRateSnapshot(product, historyLookup, contractDate) {
  const historyList = historyLookup.get(normalizeText(product.name)) ?? [];
  const contractTime = new Date(`${contractDate}T23:59:59.999+09:00`).getTime();
  const matchedHistory = historyList.find((history) => new Date(history.effectiveFrom).getTime() <= contractTime);
  return matchedHistory ?? product;
}

function buildQuantity(row) {
  return Math.max(1, row.addQuantity, row.extendQuantity);
}

function buildTopLevelDays(row, snapshot) {
  if (row.sheetType === "viral") return 1;
  return row.days || toInt(snapshot.baseDays) || 1;
}

function buildItemDays(row, snapshot) {
  if (row.sheetType === "viral") return 1;
  return row.days || toInt(snapshot.baseDays) || 1;
}

function buildGrossSupplyAmount(row) {
  return row.vatType === "포함"
    ? Math.round(row.supplyAmount * 1.1)
    : row.supplyAmount;
}

function buildContractSignature(row) {
  return [
    row.date,
    normalizeCompact(row.customerName),
    normalizeCompact(row.managerName),
    normalizeCompact(row.baseProductName),
    normalizeCompact(row.worker),
    normalizeCompact(row.paymentMethod),
    normalizeCompact(row.vatType),
  ].join("||");
}

function buildProductNameFromRow(row, worker) {
  const normalizedWorker = normalizeText(worker);
  if (!normalizedWorker) return normalizeText(row.baseProductName);
  const suffix = `(${normalizedWorker})`;
  return normalizeText(row.baseProductName).endsWith(suffix)
    ? normalizeText(row.baseProductName)
    : `${normalizeText(row.baseProductName)}${suffix}`;
}

function resolveRowItem(row, context, itemId = "1") {
  const {
    products,
    productHistoryLookup,
    liveMatchedRow,
    liveProductExamples,
    viralComboLookup,
  } = context;
  const comboKey = [
    normalizeCompact(row.baseProductName),
    normalizeCompact(row.worker),
  ].join("||");
  const comboMatch = row.sheetType === "viral"
    ? (viralComboLookup?.get(comboKey) ?? null)
    : null;
  const preferredWorker = normalizeText(
    row.worker ||
    comboMatch?.mappedWorker ||
    (!row.worker ? liveMatchedRow?.worker : ""),
  );
  const preferredProductName = normalizeText(
    comboMatch?.mappedProductName ||
    (!row.worker ? liveMatchedRow?.productName : "") ||
    buildProductNameFromRow(row, preferredWorker)
  );
  const exactProductMatch = preferredProductName
    ? products.find((product) => normalizeCompact(product.name) === normalizeCompact(preferredProductName))
    : null;
  const matchedProduct = exactProductMatch ?? pickMatchingProduct(
    {
      ...row,
      worker: preferredWorker,
      baseProductName: stripTrailingWorker(preferredProductName, preferredWorker) || row.baseProductName,
    },
    products,
  );
  const exactExampleKey = [
    row.sheetType,
    normalizeCompact(row.baseProductName),
    normalizeCompact(preferredWorker),
  ].join("||");
  const wildcardExampleKey = [
    row.sheetType,
    normalizeCompact(row.baseProductName),
  ].join("||");
  const exactProductExample =
    liveProductExamples.exactProductNameMap.get(normalizeCompact(preferredProductName)) ??
    null;
  const fallbackExample =
    liveMatchedRow ??
    exactProductExample ??
    liveProductExamples.exactMap.get(exactExampleKey) ??
    liveProductExamples.wildcardWorkerMap.get(wildcardExampleKey) ??
    liveProductExamples.allRows.find((candidate) => {
      if (candidate.sheetType !== row.sheetType) return false;
      if (preferredWorker && normalizeCompact(candidate.worker) !== normalizeCompact(preferredWorker)) return false;
      const candidateBase = normalizeCompact(candidate.baseProductName);
      const targetBase = normalizeCompact(row.baseProductName);
      return candidateBase.includes(targetBase) || targetBase.includes(candidateBase);
    }) ??
    null;

  if (!matchedProduct && !fallbackExample) {
    throw new Error(`Product mapping not found for ${row.sheetType} ${row.customerName} ${row.baseProductName} ${row.worker}`);
  }

  const snapshot = matchedProduct
    ? pickRateSnapshot(matchedProduct, productHistoryLookup, row.date)
    : {
        name: preferredProductName || fallbackExample?.productName || "",
        worker: preferredWorker || fallbackExample?.worker || row.worker,
        workCost: fallbackExample?.workCost ?? 0,
        baseDays: fallbackExample?.baseDays ?? (row.sheetType === "viral" ? 1 : Math.max(row.days, 1)),
      };
  const productName = normalizeText(
    preferredProductName ??
      matchedProduct?.name ??
      fallbackExample?.productName ??
      buildProductNameFromRow(row, preferredWorker),
  );
  const worker = normalizeText(preferredWorker || matchedProduct?.worker || fallbackExample?.worker || liveMatchedRow?.worker);
  const quantity = buildQuantity(row);
  const itemDays = buildItemDays(row, snapshot);
  const workCost = toInt(fallbackExample?.workCost ?? snapshot.workCost);
  const baseDays = toInt(fallbackExample?.baseDays ?? snapshot.baseDays) || itemDays;
  const disbursementStatus = normalizeText(row.disbursementStatus);
  const paymentMethod = normalizePaymentMethod(row.paymentMethod);
  const vatType = normalizeVatType(row.vatType);

  return {
    id: itemId,
    productName,
    userIdentifier: row.userIdentifier,
    vatType,
    unitPrice: row.unitPrice,
    days: itemDays,
    addQuantity: row.addQuantity,
    extendQuantity: row.extendQuantity,
    quantity,
    baseDays,
    worker,
    workCost,
    fixedWorkCostAmount: null,
    disbursementStatus,
    supplyAmount: row.supplyAmount,
    grossSupplyAmount: buildGrossSupplyAmount(row),
    refundAmount: row.refundAmount,
    negativeAdjustmentAmount: 0,
    meta: {
      row,
      paymentMethod,
      vatType,
      disbursementStatus,
    },
  };
}

function buildPayloadFromRows(rows, context, contractNumber) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("rows are required");
  }

  const { usersByName, customersByName } = context;
  const sortedRows = [...rows].sort((a, b) => a.sourceIndex - b.sourceIndex);
  const firstRow = sortedRows[0];
  const customer = customersByName.get(normalizeCompact(firstRow.customerName)) ?? null;
  const manager = usersByName.get(normalizeCompact(firstRow.managerName)) ?? null;
  const items = sortedRows.map((row, index) => resolveRowItem(row, context, String(index + 1)));
  const storedItems = items.map(({ meta: _meta, ...item }) => item);
  const firstItem = storedItems[0];
  const notes = Array.from(new Set(sortedRows.map((row) => normalizeText(row.notes)).filter(Boolean))).join(" | ");
  const disbursementStatuses = Array.from(new Set(storedItems.map((item) => normalizeText(item.disbursementStatus)).filter(Boolean)));
  const paymentMethods = Array.from(new Set(sortedRows.map((row) => normalizePaymentMethod(row.paymentMethod)).filter(Boolean)));
  const invoiceTypes = Array.from(new Set(storedItems.map((item) => normalizeVatType(item.vatType)).filter(Boolean)));

  return {
    contractNumber,
    contractDate: firstRow.date,
    contractName: null,
    managerId: manager?.id ?? null,
    managerName: firstRow.managerName,
    customerId: customer?.id ?? null,
    customerName: firstRow.customerName,
    products: storedItems.map((item) => item.productName).join(", "),
    cost: sortedRows.reduce((sum, row) => sum + row.supplyAmount, 0),
    days: firstItem?.days ?? 0,
    quantity: firstItem?.quantity ?? 0,
    addQuantity: firstItem?.addQuantity ?? 0,
    extendQuantity: firstItem?.extendQuantity ?? 0,
    paymentConfirmed: false,
    paymentMethod: paymentMethods[0] ?? "",
    invoiceIssued: invoiceTypes[0] ?? "",
    worker: storedItems.map((item) => item.worker).filter(Boolean).join(", "),
    notes,
    disbursementStatus: disbursementStatuses[0] ?? "",
    executionPaymentStatus: "입금전",
    userIdentifier: storedItems.map((item) => item.userIdentifier).filter(Boolean).join(", "),
    productDetailsJson: JSON.stringify(storedItems),
  };
}

function buildPayload(row, context, contractNumber) {
  return buildPayloadFromRows([row], context, contractNumber);
}

function buildInsertContractNumber(index) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `CT-${stamp}${String(index + 1).padStart(3, "0")}`;
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
  const liveRows = parseLiveContractItems(liveContracts, args.from);
  const allLiveRows = parseLiveContractItems(liveContracts, "");
  const products = JSON.parse(await fs.readFile(args.liveProducts, "utf8"));
  const productHistories = JSON.parse(await fs.readFile(args.liveProductHistories, "utf8"));
  const users = JSON.parse(await fs.readFile(args.liveUsers, "utf8"));
  const customers = JSON.parse(await fs.readFile(args.liveCustomers, "utf8"));
  const viralComboRows = await fs.readFile(args.viralComboMap, "utf8")
    .then((raw) => JSON.parse(raw))
    .catch(() => []);

  const usersByName = new Map(users.map((user) => [normalizeCompact(user.name), user]));
  const customersByName = new Map(customers.map((customer) => [normalizeCompact(customer.name), customer]));
  const productHistoryLookup = buildProductHistoryLookup(productHistories);
  const liveProductExamples = buildLiveProductExampleMaps(allLiveRows);
  const viralComboLookup = buildViralComboLookup(viralComboRows);

  const exactWorkbookBuckets = bucketRows(workbookRows, exactKey);
  const exactLiveBuckets = bucketRows(liveRows, exactKey);
  const matchedWorkbookIndexes = new Set();
  const matchedLiveIndexes = new Set();
  const exactMatches = [];

  for (const [key, workbookBucket] of exactWorkbookBuckets.entries()) {
    const liveBucket = exactLiveBuckets.get(key) ?? [];
    const count = Math.min(workbookBucket.length, liveBucket.length);
    for (let index = 0; index < count; index += 1) {
      matchedWorkbookIndexes.add(workbookBucket[index].sourceIndex);
      matchedLiveIndexes.add(liveBucket[index].liveIndex);
      exactMatches.push({
        workbook: workbookBucket[index],
        live: liveBucket[index],
      });
    }
  }

  const unmatchedWorkbookRows = workbookRows.filter((row) => !matchedWorkbookIndexes.has(row.sourceIndex));
  const unmatchedLiveRows = liveRows.filter((row) => !matchedLiveIndexes.has(row.liveIndex));
  const unmatchedLiveByFuzzyKey = bucketRows(unmatchedLiveRows, (row) => fuzzyCandidateKeyForLive(row, false));
  const unmatchedLiveByFuzzyWildcardKey = bucketRows(unmatchedLiveRows, (row) => fuzzyCandidateKeyForLive(row, true));

  const fuzzyMatches = [];
  const fuzzyMatchedLiveIndexes = new Set();
  const fuzzyMatchedWorkbookIndexes = new Set();

  for (const workbookRow of unmatchedWorkbookRows) {
    const key = fuzzyKey(workbookRow);
    const candidateBuckets = workbookRow.sheetType === "viral" && !workbookRow.worker
      ? unmatchedLiveByFuzzyWildcardKey.get(key)
      : unmatchedLiveByFuzzyKey.get(key);
    const candidates = (candidateBuckets ?? []).filter((row) => !fuzzyMatchedLiveIndexes.has(row.liveIndex));
    if (candidates.length !== 1) continue;

    const candidate = candidates[0];
    fuzzyMatchedWorkbookIndexes.add(workbookRow.sourceIndex);
    fuzzyMatchedLiveIndexes.add(candidate.liveIndex);
    fuzzyMatches.push({
      workbook: workbookRow,
      live: candidate,
    });
  }

  const unmatchedWorkbookAfterFuzzy = unmatchedWorkbookRows.filter((row) => !fuzzyMatchedWorkbookIndexes.has(row.sourceIndex));
  const unmatchedLiveAfterFuzzy = unmatchedLiveRows.filter((row) => !fuzzyMatchedLiveIndexes.has(row.liveIndex));

  const liveRowsByContractId = new Map();
  for (const row of liveRows) {
    const bucket = liveRowsByContractId.get(row.contractId) ?? [];
    bucket.push(row);
    liveRowsByContractId.set(row.contractId, bucket);
  }

  const matchedWorkbookRowsByContractId = new Map();
  for (const match of [...exactMatches, ...fuzzyMatches]) {
    const bucket = matchedWorkbookRowsByContractId.get(match.live.contractId) ?? [];
    bucket.push(match.workbook);
    matchedWorkbookRowsByContractId.set(match.live.contractId, bucket);
  }

  const unmatchedLiveByContractId = new Map();
  for (const row of unmatchedLiveAfterFuzzy) {
    const bucket = unmatchedLiveByContractId.get(row.contractId) ?? [];
    bucket.push(row);
    unmatchedLiveByContractId.set(row.contractId, bucket);
  }

  const partialContractUpdatePlans = [];
  const workbookIndexesClaimedByPartialUpdates = new Set();
  const contractIdsHandledByPartialUpdates = new Set();

  for (const [contractId, deleteRows] of unmatchedLiveByContractId.entries()) {
    const matchedWorkbookRows = matchedWorkbookRowsByContractId.get(contractId) ?? [];
    if (matchedWorkbookRows.length === 0) continue;

    const contractRows = liveRowsByContractId.get(contractId) ?? [];
    const signatureSet = new Set(contractRows.map((row) => buildContractSignature(row)));
    const supplementalWorkbookRows = unmatchedWorkbookAfterFuzzy.filter((row) =>
      signatureSet.has(buildContractSignature(row)),
    );
    const replacementWorkbookRows = [...matchedWorkbookRows, ...supplementalWorkbookRows]
      .sort((a, b) => a.sourceIndex - b.sourceIndex);
    if (replacementWorkbookRows.length === 0) continue;

    for (const row of supplementalWorkbookRows) {
      workbookIndexesClaimedByPartialUpdates.add(row.sourceIndex);
    }
    contractIdsHandledByPartialUpdates.add(contractId);
    partialContractUpdatePlans.push({
      type: "update",
      contractId,
      contractNumber: contractRows[0]?.contractNumber ?? deleteRows[0]?.contractNumber ?? "",
      workbookRows: replacementWorkbookRows,
      liveRows: contractRows,
      liveRow: deleteRows[0],
      workbookRow: replacementWorkbookRows[0],
      changeMode: "replace-contract-items",
    });
  }

  const finalInserts = unmatchedWorkbookAfterFuzzy.filter((row) => !workbookIndexesClaimedByPartialUpdates.has(row.sourceIndex));
  const finalDeletes = unmatchedLiveAfterFuzzy.filter((row) => !contractIdsHandledByPartialUpdates.has(row.contractId));

  const updatePlans = [
    ...fuzzyMatches.map((match) => ({
    type: "update",
    contractId: match.live.contractId,
    contractNumber: match.live.contractNumber,
    workbookRow: match.workbook,
    liveRow: match.live,
    })),
    ...partialContractUpdatePlans,
  ];

  const insertPlans = finalInserts.map((row, index) => ({
    type: "insert",
    contractNumber: buildInsertContractNumber(index),
    workbookRow: row,
  }));

  const deletePlans = Array.from(
    finalDeletes.reduce((map, row) => {
      if (!map.has(row.contractId)) {
        map.set(row.contractId, {
          type: "delete",
          contractId: row.contractId,
          contractNumber: row.contractNumber,
          liveRow: row,
          liveRows: liveRowsByContractId.get(row.contractId) ?? [row],
        });
      }
      return map;
    }, new Map()).values(),
  );

  const payloadContext = {
    products,
    productHistoryLookup,
    usersByName,
    customersByName,
    liveProductExamples,
    viralComboLookup,
  };

  const preparedUpdates = updatePlans.map((plan) => ({
    ...plan,
    payload: Array.isArray(plan.workbookRows)
      ? buildPayloadFromRows(plan.workbookRows, payloadContext, plan.contractNumber)
      : buildPayload(plan.workbookRow, { ...payloadContext, liveMatchedRow: plan.liveRow }, plan.contractNumber),
  }));

  const preparedInserts = insertPlans.map((plan) => ({
    ...plan,
    payload: buildPayload(plan.workbookRow, payloadContext, plan.contractNumber),
  }));

  const summary = {
    workbookRows: workbookRows.length,
    liveRows: liveRows.length,
    exactMatches: exactMatches.length,
    fuzzyMatches: fuzzyMatches.length,
    updates: preparedUpdates.length,
    inserts: preparedInserts.length,
    deletes: deletePlans.length,
    unmatchedWorkbookAfterPlan: finalInserts.length,
    unmatchedLiveAfterPlan: finalDeletes.length,
    updatesByType: preparedUpdates.reduce((acc, row) => {
      const type = row.workbookRow?.sheetType ?? row.workbookRows?.[0]?.sheetType ?? "unknown";
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {}),
    insertsByType: preparedInserts.reduce((acc, row) => {
      acc[row.workbookRow.sheetType] = (acc[row.workbookRow.sheetType] || 0) + 1;
      return acc;
    }, {}),
    deletesByType: deletePlans.reduce((acc, row) => {
      acc[row.liveRow.sheetType] = (acc[row.liveRow.sheetType] || 0) + 1;
      return acc;
    }, {}),
  };

  const outputDir = path.join(args.outputDir, nowStamp());
  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8"),
    fs.writeFile(path.join(outputDir, "updates.json"), `${JSON.stringify(preparedUpdates, null, 2)}\n`, "utf8"),
    fs.writeFile(path.join(outputDir, "inserts.json"), `${JSON.stringify(preparedInserts, null, 2)}\n`, "utf8"),
    fs.writeFile(path.join(outputDir, "deletes.json"), `${JSON.stringify(deletePlans, null, 2)}\n`, "utf8"),
    fs.writeFile(path.join(outputDir, "exact_matches.json"), `${JSON.stringify(exactMatches, null, 2)}\n`, "utf8"),
    fs.writeFile(path.join(outputDir, "fuzzy_matches.json"), `${JSON.stringify(fuzzyMatches, null, 2)}\n`, "utf8"),
    fs.writeFile(path.join(outputDir, "workbook_rows.json"), `${JSON.stringify(workbookRows, null, 2)}\n`, "utf8"),
    fs.writeFile(path.join(outputDir, "live_rows.json"), `${JSON.stringify(liveRows, null, 2)}\n`, "utf8"),
  ]);

  console.log(JSON.stringify({ ...summary, outputDir }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
