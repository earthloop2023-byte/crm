import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.CRM_BASE_URL || "http://127.0.0.1:5000";
const TARGET_CATEGORY = "바이럴 상품";

const RAW_ROWS = [
  ["위드플랜", "제작영수증리뷰", "2,000", "사업자 러블리뷰 변경", "1/2일 단가변경"],
  ["유픽컴퍼니", "제작영수증리뷰", "2,000", "", ""],
  ["더비지파트너즈", "제작영수증리뷰", "2,000", "", ""],
  ["데이터봇", "제작영수증리뷰", "1,700", "", ""],
  ["비상한마케팅", "제작영수증리뷰", "1,200", "", "바이럴지급"],
  ["스마트윈솔루션", "제작영수증리뷰", "1,500", "", ""],
  ["리더블비", "제작영수증리뷰", "1,400", "", ""],
  ["개화", "제작영수증리뷰", "800", "", ""],
  ["신화캐슬", "일반블배포", "1,500", "헬로드림", ""],
  ["(주)동인선", "준최블배포", "13,000", "김미희", ""],
  ["윌메이드", "준최블배포", "10,000", "", "바이럴지급"],
  ["윌메이드", "최블배포", "25,000", "", "건 발행"],
  ["위애드", "최블배포", "20,000", "", ""],
  ["윌메이드", "원고대행", "5,000", "", ""],
  ["재흥광고기획", "ai블로그배포", "300", "", ""],
  ["시나브로", "가구매리뷰(실배송)", "2,700", "", ""],
  ["시나브로", "가구매리뷰(자사몰)", "3,300", "", ""],
  ["굿투그레이트", "구매확정", "1,800", "", "바이럴지급"],
  ["굿투그레이트", "가구매리뷰", "2,000", "", ""],
  ["굿투그레이트", "가구매리뷰(실배송)", "1,500", "", ""],
  ["굿투그레이트", "가구매리뷰(한달리뷰)", "3,000", "", ""],
  ["굿투그레이트", "가구매리뷰(g마켓,옥션,자사몰)", "2,300", "", ""],
  ["굿투그레이트", "가구매리뷰(카카오)", "2,000", "실배송", ""],
  ["비카인코스", "가구매리뷰(로켓)", "5,000", "창진", ""],
  ["비카인코스", "모두닥리뷰", "6,000", "창진", ""],
  ["비카인코스", "바비톡상담", "7,000", "창진", ""],
  ["루다웍스", "구글플레이스리뷰", "1,500", "", "매주 금요일 발행"],
  ["루다웍스", "카카오맵리뷰", "1,500", "", ""],
  ["루다웍스", "앱리뷰", "4,500", "", ""],
  ["강한사람들", "커뮤니티/핫딜침투", "https://docs.google.com/spreadsheets/d/1xXx0xDj4ri0iQXWkO5F6FxmNpOzcugdpw23aRFnbLpE/edit?gid=1326315769#gid=1326315769", "", ""],
  ["에이치컴퍼니", "당근침투(일반)", "15,000", "김영현", ""],
  ["에이치컴퍼니", "당근침투(프리미엄)", "20,000", "김영현", ""],
  ["베링컴퍼니", "뉴스원고대행", "10,000", "", "세금계산서 미발행 국민지급"],
  ["베링컴퍼니", "원고대행", "7,000", "1,500자", ""],
  ["베링컴퍼니", "원고대행", "8,000", "2,000자", ""],
  ["DY컴퍼니", "준최블ID", "40,000", "준최4", ""],
  ["민컴퍼니", "블로그상위노출", "키워드별상이", "문영완", ""],
  ["애드브로", "블로그상위노출", "키워드별상이", "", ""],
  ["어스컴퍼니", "예약자리뷰", "2,000", "유에스씨엠", ""],
  ["박병욱", "언론송출", "매체별상이", "코스인터네셔널", ""],
  ["레뷰", "체험단", "10,000(충전)", "", ""],
  ["에이치컴퍼니", "카페배포", "27,000(충전)", "", ""],
  ["에이컴퍼니", "카페배포", "15,000(충전)", "", ""],
  ["애드캐리", "ai블로그배포", "600(충전)", "장동훈", "말일합산발행"],
  ["리얼타임", "언론송출", "매체별상이(충전)", "", ""],
  ["스마일드래곤", "sns7979", "상품별상이(충전)", "", ""],
  ["지프라마케팅", "지식인추천(좋아요)", "400(충전)", "", ""],
  ["유재덕", "스토어알림받기", "30(충전)", "주식회사 루폰스", ""],
  ["JB컴퍼니", "스토어알림받기", "35", "", ""],
  ["엘와이컴퍼니", "지식인건바이", "키워드별상이", "이상석", ""],
];

let sessionCookie = "";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toTrimmed(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parsePrice(text) {
  const normalized = toTrimmed(text);
  if (!normalized) return 0;
  if (/https?:\/\//i.test(normalized)) return 0;
  const numeric = normalized.replace(/[^\d]/g, "");
  if (!numeric) return 0;
  const value = Number(numeric) || 0;
  if (!Number.isFinite(value) || value > 2147483647) return 0;
  return value;
}

function normalizeHint(text) {
  return toTrimmed(text).replace(/\s+/g, " ");
}

function mergeNotes(noteA, noteB) {
  const left = toTrimmed(noteA);
  const right = toTrimmed(noteB);
  if (!left && !right) return "";
  if (!left) return right;
  if (!right) return left;
  return `${left} / ${right}`;
}

function parseRows(rows) {
  return rows
    .map((columns, index) => {
      const [
        executor = "",
        product = "",
        priceText = "",
        noteA = "",
        noteB = "",
      ] = columns;

      const normalizedExecutor = toTrimmed(executor);
      const normalizedProduct = toTrimmed(product);
      if (!normalizedExecutor || !normalizedProduct) {
        throw new Error(`[SYNC-VIRAL] rows[${index}] has empty executor/product`);
      }

      return {
        executor: normalizedExecutor,
        product: normalizedProduct,
        rawPrice: toTrimmed(priceText),
        unitPrice: parsePrice(priceText),
        note: mergeNotes(noteA, noteB),
      };
    })
    .filter((row) => row.product.length > 0);
}

function applyDuplicateNaming(rows) {
  const productCountMap = new Map();
  rows.forEach((row) => {
    productCountMap.set(row.product, (productCountMap.get(row.product) || 0) + 1);
  });

  const baseNamed = rows.map((row) => {
    const duplicateProduct = (productCountMap.get(row.product) || 0) > 1;
    const baseName = duplicateProduct ? `${row.product}(${row.executor})` : row.product;
    return {
      ...row,
      baseName,
    };
  });

  const baseNameCountMap = new Map();
  baseNamed.forEach((row) => {
    baseNameCountMap.set(row.baseName, (baseNameCountMap.get(row.baseName) || 0) + 1);
  });

  const used = new Set();
  return baseNamed.map((row) => {
    let name = row.baseName;
    if ((baseNameCountMap.get(row.baseName) || 0) > 1) {
      const hint = normalizeHint(row.note) || normalizeHint(row.rawPrice);
      if (hint) {
        name = `${row.baseName}-${hint}`;
      }
    }

    if (used.has(name)) {
      let seq = 2;
      let candidate = `${name}#${seq}`;
      while (used.has(candidate)) {
        seq += 1;
        candidate = `${name}#${seq}`;
      }
      name = candidate;
    }
    used.add(name);

    return {
      ...row,
      name,
      category: TARGET_CATEGORY,
      baseDays: 1,
    };
  });
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
      console.log(`[SYNC-VIRAL] 429 ${method} ${endpoint} wait=${waitMs}ms`);
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
  console.log(`[SYNC-VIRAL] base=${BASE_URL}`);

  const me = await apiRequest("GET", "/api/auth/me");
  console.log(`[SYNC-VIRAL] auth=${me?.name || "-"} role=${me?.role || "-"}`);

  const parsedRows = applyDuplicateNaming(parseRows(RAW_ROWS));
  const targetNames = new Set(parsedRows.map((row) => row.name));

  const products = await apiRequest("GET", "/api/products");
  if (!Array.isArray(products)) {
    throw new Error("[SYNC-VIRAL] /api/products response is not an array");
  }

  const productsByName = new Map(
    products
      .map((product) => [toTrimmed(product?.name), product])
      .filter(([name]) => name.length > 0),
  );

  const viralProducts = products.filter((product) => toTrimmed(product.category) === TARGET_CATEGORY);

  const backupPath = path.join(
    process.cwd(),
    "server",
    "scripts",
    `products-backup-before-viral-sync-${Date.now()}.json`,
  );
  fs.writeFileSync(backupPath, JSON.stringify(products, null, 2), "utf8");
  console.log(`[SYNC-VIRAL] backup=${backupPath}`);

  let deleted = 0;
  for (const product of viralProducts) {
    const currentName = toTrimmed(product.name);
    if (!targetNames.has(currentName)) {
      await apiRequest("DELETE", `/api/products/${product.id}`);
      productsByName.delete(currentName);
      deleted += 1;
    }
  }

  let created = 0;
  let updated = 0;
  for (const row of parsedRows) {
    const existing = productsByName.get(row.name);
    const existingWorkCost = Number(existing?.workCost) || 0;

    const payload = {
      name: row.name,
      category: TARGET_CATEGORY,
      unitPrice: row.unitPrice,
      unit: toTrimmed(existing?.unit),
      baseDays: row.baseDays,
      workCost: existingWorkCost > 0 ? existingWorkCost : row.unitPrice,
      purchasePrice: Number(existing?.purchasePrice) || 0,
      vatType: toTrimmed(existing?.vatType) || "부가세별도",
      worker: row.executor || null,
      isActive: true,
    };

    if (existing) {
      const updatedProduct = await apiRequest("PUT", `/api/products/${existing.id}`, payload);
      productsByName.set(row.name, updatedProduct || { ...existing, ...payload });
      updated += 1;
    } else {
      const createdProduct = await apiRequest("POST", "/api/products", payload);
      productsByName.set(row.name, createdProduct || payload);
      created += 1;
    }
  }

  console.log(`[SYNC-VIRAL] parsed=${parsedRows.length}`);
  console.log(`[SYNC-VIRAL] deleted=${deleted}`);
  console.log(`[SYNC-VIRAL] created=${created}`);
  console.log(`[SYNC-VIRAL] updated=${updated}`);

  const duplicateProducts = new Map();
  parsedRows.forEach((row) => {
    duplicateProducts.set(row.product, (duplicateProducts.get(row.product) || 0) + 1);
  });
  const duplicateBaseNames = [...duplicateProducts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name]) => name);
  if (duplicateBaseNames.length > 0) {
    console.log(`[SYNC-VIRAL] duplicate-base-names=${duplicateBaseNames.join(", ")}`);
  }

  const samples = parsedRows.filter((row) => row.product === "제작영수증리뷰" || row.product === "원고대행" || row.product === "카페배포");
  samples.forEach((row) => {
    console.log(`[SYNC-VIRAL] sample ${row.product} => ${row.name} / ${row.unitPrice}`);
  });
}

main().catch((error) => {
  console.error("[SYNC-VIRAL] failed:", error);
  process.exitCode = 1;
});
