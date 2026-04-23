import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.CRM_BASE_URL || "http://127.0.0.1:5000";

let sessionCookie = "";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toTrimmed(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toNonNegativeInt(value) {
  const numeric = Math.round(Number(value) || 0);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return numeric;
}

function getContractQuantity(contract) {
  const addQuantity = toNonNegativeInt(contract.addQuantity);
  const extendQuantity = toNonNegativeInt(contract.extendQuantity);
  const fromSplit = addQuantity + extendQuantity;
  if (fromSplit > 0) return Math.max(1, fromSplit);
  return Math.max(1, toNonNegativeInt(contract.quantity) || 1);
}

function getContractDays(contract) {
  return Math.max(1, toNonNegativeInt(contract.days) || 1);
}

function normalizeWorker(workerText) {
  return toTrimmed(workerText)
    .split(",")
    .map((name) => toTrimmed(name))
    .filter(Boolean)
    .join(", ");
}

function normalizeProductName(name) {
  return toTrimmed(name).replace(/\s+/g, "");
}

function getBaseProductName(name) {
  const trimmed = toTrimmed(name);
  const match = trimmed.match(/^(.*)\([^)]*\)$/);
  if (!match) return trimmed;
  return toTrimmed(match[1]);
}

function buildWorkerText(workers) {
  const unique = [];
  const seen = new Set();
  for (const worker of workers) {
    const normalized = toTrimmed(worker);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
  }
  return unique.join(", ");
}

async function apiRequest(method, endpoint, body) {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const headers = {};
    if (sessionCookie) headers.Cookie = sessionCookie;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const setCookie = response.headers.get("set-cookie");
    if (setCookie) sessionCookie = setCookie.split(";")[0];

    const text = await response.text();
    if (response.status === 429) {
      const waitMs = Math.min(60000, attempt * 1500);
      console.log(`[REMATCH] 429 ${method} ${endpoint} wait=${waitMs}ms`);
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

  throw new Error(`${method} ${endpoint} failed: retry exceeded`);
}

async function main() {
  console.log(`[REMATCH] base=${BASE_URL}`);

  const me = await apiRequest("GET", "/api/auth/me");
  console.log(`[REMATCH] auth=${me?.name || "-"} role=${me?.role || "-"}`);

  const [products, contracts] = await Promise.all([
    apiRequest("GET", "/api/products"),
    apiRequest("GET", "/api/contracts"),
  ]);

  if (!Array.isArray(products) || !Array.isArray(contracts)) {
    throw new Error("[REMATCH] invalid response: products/contracts should be arrays");
  }

  const backupPath = path.join(
    process.cwd(),
    "server",
    "scripts",
    `contracts-backup-before-workcost-rematch-${Date.now()}.json`,
  );
  fs.writeFileSync(backupPath, JSON.stringify(contracts, null, 2), "utf8");
  console.log(`[REMATCH] backup=${backupPath}`);

  const productMap = new Map(
    products
      .map((product) => [toTrimmed(product?.name), product])
      .filter(([name]) => name.length > 0),
  );
  const normalizedProductMap = new Map();
  const baseNameMap = new Map();
  for (const product of products) {
    const name = toTrimmed(product.name);
    const normalized = normalizeProductName(name);
    const baseName = normalizeProductName(getBaseProductName(name));
    if (!normalizedProductMap.has(normalized)) normalizedProductMap.set(normalized, []);
    if (!baseNameMap.has(baseName)) baseNameMap.set(baseName, []);
    normalizedProductMap.get(normalized).push(product);
    baseNameMap.get(baseName).push(product);
  }

  const resolveProduct = (rawName, contractWorkerText) => {
    const exact = productMap.get(toTrimmed(rawName));
    if (exact) return exact;

    const normalized = normalizeProductName(rawName);
    const normalizedCandidates = normalizedProductMap.get(normalized) || [];
    if (normalizedCandidates.length === 1) return normalizedCandidates[0];

    const baseCandidates = baseNameMap.get(normalized) || [];
    if (baseCandidates.length === 1) return baseCandidates[0];
    if (baseCandidates.length > 1) {
      const workerCandidates = baseCandidates.filter(
        (candidate) => toTrimmed(candidate.worker) === toTrimmed(contractWorkerText),
      );
      if (workerCandidates.length === 1) return workerCandidates[0];
    }

    return null;
  };

  let updated = 0;
  let unchanged = 0;
  let noProductsOnContract = 0;
  let noMatchedProducts = 0;
  const missingProductNames = new Set();

  for (const contract of contracts) {
    const productNames = toTrimmed(contract.products)
      .split(",")
      .map((name) => toTrimmed(name))
      .filter(Boolean);

    if (productNames.length === 0) {
      noProductsOnContract += 1;
      continue;
    }

    const quantity = getContractQuantity(contract);
    const days = getContractDays(contract);
    let computedWorkCost = 0;
    const computedWorkers = [];
    let matchedProductCount = 0;

    const resolvedProductNames = [];
    for (const productName of productNames) {
      const product = resolveProduct(productName, contract.worker);
      if (!product) {
        missingProductNames.add(productName);
        continue;
      }

      resolvedProductNames.push(product.name);
      matchedProductCount += 1;
      if (product.worker) computedWorkers.push(product.worker);

      const workerUnitCost = toNonNegativeInt(product.workCost);
      const workerBaseDays = Math.max(1, toNonNegativeInt(product.baseDays) || 1);
      const effectiveDays = product.category === "바이럴 상품" ? 1 : days;
      const lineCost =
        workerUnitCost > 0
          ? Math.round((workerUnitCost / workerBaseDays) * effectiveDays * quantity)
          : 0;
      computedWorkCost += lineCost;
    }

    if (matchedProductCount === 0) {
      noMatchedProducts += 1;
      continue;
    }

    const nextWorker = buildWorkerText(computedWorkers);
    const nextWorkCost = computedWorkCost;
    const nextProducts =
      matchedProductCount === productNames.length
        ? resolvedProductNames.join(", ")
        : toTrimmed(contract.products);
    const currentWorker = normalizeWorker(contract.worker);
    const currentWorkCost = toNonNegativeInt(contract.workCost);
    const currentProducts = toTrimmed(contract.products);

    const workerChanged = currentWorker !== nextWorker;
    const workCostChanged = currentWorkCost !== nextWorkCost;
    const productsChanged = currentProducts !== nextProducts;

    if (!workerChanged && !workCostChanged && !productsChanged) {
      unchanged += 1;
      continue;
    }

    await apiRequest("PUT", `/api/contracts/${contract.id}`, {
      products: nextProducts,
      worker: nextWorker || null,
      workCost: nextWorkCost,
    });
    updated += 1;

    if (updated % 200 === 0) {
      console.log(`[REMATCH] progress updated=${updated}`);
    }
  }

  console.log(`[REMATCH] products=${products.length}`);
  console.log(`[REMATCH] contracts=${contracts.length}`);
  console.log(`[REMATCH] updated=${updated}`);
  console.log(`[REMATCH] unchanged=${unchanged}`);
  console.log(`[REMATCH] no-products-on-contract=${noProductsOnContract}`);
  console.log(`[REMATCH] no-matched-products=${noMatchedProducts}`);
  if (missingProductNames.size > 0) {
    console.log(`[REMATCH] missing-product-names=${[...missingProductNames].slice(0, 50).join(", ")}`);
  }
}

main().catch((error) => {
  console.error("[REMATCH] failed:", error);
  process.exitCode = 1;
});
