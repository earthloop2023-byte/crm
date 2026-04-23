import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.CRM_BASE_URL || "http://127.0.0.1:5000";
const SOURCE_PATH =
  process.env.REGIONAL_SOURCE_JSON ||
  "d:/CodexProjects/crm-taesoo/customers_tajiyeok.json";

let sessionCookie = "";

function toTrimmed(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toNumber(value) {
  const normalized = toTrimmed(value).replace(/[^\d.-]/g, "");
  if (!normalized) return 0;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric);
}

function parseDate(value) {
  const text = toTrimmed(value);
  if (!text) return null;
  const dt = new Date(text);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function toStage(value) {
  const normalized = toTrimmed(value).toLowerCase();
  if (normalized === "new" || normalized === "active" || normalized === "churned") {
    return normalized;
  }
  return "new";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      console.log(`[REGIONAL-RESTORE] 429 ${method} ${endpoint} wait=${waitMs}ms`);
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

function loadRows() {
  const absPath = path.resolve(SOURCE_PATH);
  const text = fs.readFileSync(absPath, "utf8");
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error(`Source JSON is not an array: ${absPath}`);
  }
  return { absPath, rows: parsed };
}

function mapRowToDeal(row, customersByName, productsByName) {
  const title = toTrimmed(row["고객명"]);
  const phone = toTrimmed(row["전화번호"]);
  const companyName = toTrimmed(row["상호명"]);
  const industry = toTrimmed(row["업종"]);
  const expectedCloseDate = parseDate(row["인입일"]);
  const lineCount = Math.max(0, toNumber(row["회선수"]));
  const stage = toStage(row["진행상황"]);
  const productName = toTrimmed(row["상품"]);
  const notes = toTrimmed(row["메모"]);
  const cancelledLineCount = Math.max(0, toNumber(row["해지회선수"]));
  const value = Math.max(0, toNumber(row["금액"]));
  const probability = Math.max(0, Math.min(100, toNumber(row["확률"])));

  if (!title) return null;

  const matchedCustomer = customersByName.get(title);
  const matchedProduct = productName ? productsByName.get(productName) : undefined;

  return {
    title,
    customerId: matchedCustomer?.id || null,
    value,
    stage,
    probability,
    expectedCloseDate,
    notes,
    phone,
    companyName,
    industry,
    lineCount,
    cancelledLineCount,
    productId: matchedProduct?.id || "",
  };
}

async function main() {
  console.log(`[REGIONAL-RESTORE] base=${BASE_URL}`);
  const { absPath, rows } = loadRows();
  console.log(`[REGIONAL-RESTORE] source=${absPath}`);
  console.log(`[REGIONAL-RESTORE] sourceRows=${rows.length}`);

  const me = await apiRequest("GET", "/api/auth/me");
  console.log(`[REGIONAL-RESTORE] auth=${me?.name || "-"} role=${me?.role || "-"}`);

  const [currentDeals, customers, products] = await Promise.all([
    apiRequest("GET", "/api/deals"),
    apiRequest("GET", "/api/customers"),
    apiRequest("GET", "/api/products"),
  ]);

  if (!Array.isArray(currentDeals) || !Array.isArray(customers) || !Array.isArray(products)) {
    throw new Error("Invalid API response. Expected arrays for deals/customers/products.");
  }

  const customersByName = new Map(
    customers.map((customer) => [toTrimmed(customer.name), customer]).filter(([name]) => name.length > 0),
  );
  const productsByName = new Map(
    products.map((product) => [toTrimmed(product.name), product]).filter(([name]) => name.length > 0),
  );

  let deleted = 0;
  for (const deal of currentDeals) {
    await apiRequest("DELETE", `/api/deals/${deal.id}`);
    deleted += 1;
  }

  let created = 0;
  let skipped = 0;
  for (const row of rows) {
    const payload = mapRowToDeal(row, customersByName, productsByName);
    if (!payload) {
      skipped += 1;
      continue;
    }
    await apiRequest("POST", "/api/deals", payload);
    created += 1;
    if (created % 50 === 0) {
      console.log(`[REGIONAL-RESTORE] progress created=${created}`);
    }
  }

  const restoredDeals = await apiRequest("GET", "/api/deals");
  console.log(`[REGIONAL-RESTORE] deleted=${deleted}`);
  console.log(`[REGIONAL-RESTORE] created=${created}`);
  console.log(`[REGIONAL-RESTORE] skipped=${skipped}`);
  console.log(`[REGIONAL-RESTORE] finalDeals=${Array.isArray(restoredDeals) ? restoredDeals.length : 0}`);
}

main().catch((error) => {
  console.error("[REGIONAL-RESTORE] failed:", error);
  process.exitCode = 1;
});

