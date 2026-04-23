import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.CRM_BASE_URL || "http://127.0.0.1:5000";

const SLOT_CATEGORIES = new Set([
  "쿠팡슬롯",
  "스마트스토어 슬롯",
  "플레이스 슬롯",
  "웹사이트 슬롯",
  "유입플 슬롯",
]);

const RAW_ROWS = [
  ["네티모", "네티모", "바이럴m", "네이버", "30", "천근우", "010-5163-9986", "40,000", ""],
  ["네티모", "네티모", "바이럴m쿠팡골드", "쿠팡", "30", "천근우", "010-5163-9986", "24,000", ""],
  ["네티모", "네티모", "바이럴m웹사이트", "웹사이트", "30", "천근우", "010-5163-9986", "20,000", ""],
  ["엘에스", "", "포유", "네이버", "10", "박철", "010-9239-4687", "13,000", ""],
  ["엘에스", "", "BBS쿠팡", "쿠팡", "30", "박철", "010-9239-4687", "15,000", "18,000 11/7까지"],
  ["엘에스", "", "포유플레이스", "플레이스", "10", "박철", "010-9239-4687", "10,000", ""],
  ["슈퍼컨트롤", "슈퍼컨트롤", "DEEP", "네이버", "10", "여민수", "010-3304-6719", "23,000", ""],
  ["슈퍼컨트롤", "슈퍼컨트롤", "고고", "쿠팡", "30", "여민수", "010-3304-6719", "18,000", ""],
  ["리빙웰애드", "제이원인터", "모수플러스", "네이버", "10", "이성만", "010-8602-9416", "25,000", ""],
  ["재흥광고기획", "재흥광고기획", "앤드류", "네이버", "10", "김민수", "010-2730-2592", "25,000", ""],
  ["재흥광고기획", "재흥광고기획", "앤드류트래픽", "플레이스", "10", "김민수", "010-2730-2592", "25,000", ""],
  ["루폰스", "루폰스", "업다운", "쿠팡", "30", "유재덕", "010-2998-2852", "16,000", ""],
  ["디테일애드컴퍼니", "디테일애드컴퍼니", "CPC", "쿠팡", "30", "오성준", "010-5477-6553", "12,000", ""],
  ["정주호", "", "랭크", "쿠팡", "30", "정주호", "010-4010-1104", "15,000", "12/9일 변동"],
  ["정주호", "", "매직", "네이버", "10", "정주호", "010-4010-1104", "25,000", ""],
  ["티에스애드", "티에스애드", "TOP", "쿠팡", "30", "김택수", "010-5831-1070", "20,000", ""],
  ["티에스애드", "티에스애드", "엘리트", "네이버", "10", "김택수", "010-5831-1070", "12,000", "12월1일부터 2천원 인상"],
  ["티에스애드", "티에스애드", "보스", "쿠팡", "30", "김택수", "010-5831-1070", "15,000", ""],
  ["티에스애드", "티에스애드", "카지노", "네이버", "10", "김택수", "010-5831-1070", "26,000", ""],
  ["티에스애드", "티에스애드", "유토피아", "네이버", "10", "김택수", "010-5831-1070", "32,000", ""],
  ["티에스애드", "티에스애드", "땡초", "네이버", "10", "김택수", "010-5831-1070", "30,000", ""],
  ["티에스애드", "티에스애드", "갤럭시", "네이버", "10", "김택수", "010-5831-1070", "30,000", ""],
  ["티에스애드", "티에스애드", "랭크업", "쿠팡", "30", "김택수", "010-5831-1070", "16,000", ""],
  ["코이랩스", "코이랩스", "가드", "네이버", "10", "임다운", "010-5615-9534", "18,000", ""],
  ["코이랩스", "코이랩스", "블렌딩", "네이버", "10", "임다운", "010-5615-9534", "25,000", ""],
  ["코이랩스", "코이랩스", "스캔들", "네이버", "10", "임다운", "010-5615-9534", "25,000", ""],
  ["코이랩스", "코이랩스", "MIX", "네이버", "10", "임다운", "010-5615-9534", "15,000", ""],
  ["코이랩스", "코이랩스", "1219", "네이버", "10", "임다운", "010-5615-9534", "15,000", ""],
  ["코이랩스", "코이랩스", "오스틴", "네이버", "10", "임다운", "010-5615-9534", "14,000", ""],
  ["코이랩스", "코이랩스", "자몽", "네이버", "10", "임다운", "010-5615-9534", "25,000", ""],
  ["코이랩스", "코이랩스", "프로브", "플레이스", "10", "임다운", "010-5615-9534", "25,000", ""],
  ["코이랩스", "코이랩스", "피에스타", "쿠팡", "30", "임다운", "010-5615-9534", "20,000", ""],
  ["코이랩스", "코이랩스", "시그니처", "쿠팡", "30", "임다운", "010-5615-9534", "25,000", ""],
  ["코이랩스", "코이랩스", "헤르메스", "쿠팡", "30", "임다운", "010-5615-9534", "25,000", ""],
  ["코이랩스", "코이랩스", "프라다", "쿠팡", "30", "임다운", "010-5615-9534", "18,000", ""],
  ["프라이트", "프라이트", "큐랭크", "쿠팡", "30", "김선엽", "010-3095-3132", "20,000", ""],
  ["프라이트", "프라이트", "시드", "네이버", "10", "김선엽", "010-3095-3132", "25,000", ""],
  ["프라이트", "프라이트", "데코", "웹사이트", "10", "김선엽", "010-3095-3132", "25,000", ""],
  ["프라이트", "프라이트", "탑인", "네이버", "10", "김선엽", "010-3095-3132", "17,000", ""],
  ["단비에이전시", "단비에이전시", "루나", "네이버", "10", "김승환,김도현", "010-9953-5360", "27,000", ""],
  ["단비에이전시", "단비에이전시", "그램", "네이버", "10", "김승환,김도현", "010-9953-5360", "22,000", ""],
  ["단비에이전시", "단비에이전시", "베라", "네이버", "10", "김승환,김도현", "010-9953-5360", "18,000", ""],
  ["어퍼모스트", "어퍼모스트", "네오", "네이버", "10", "이충각", "010-3909-6754", "25,000", ""],
  ["어퍼모스트", "어퍼모스트", "네오트래픽", "플레이스", "10", "이충각", "010-3909-6754", "30,000", ""],
  ["제로커뮤니케이션", "제로커뮤니케이션", "엘릭서", "네이버", "10", "", "", "25,000", ""],
  ["제로커뮤니케이션", "제로커뮤니케이션", "일루마", "네이버", "7", "", "", "28,000", ""],
  ["애드브로", "애드브로", "자동완성슬롯", "", "10", "", "", "10,000", ""],
  ["제이솔컴퍼니", "제이솔컴퍼니", "일트트래픽", "플레이스", "10", "김무경", "", "35,000", "별로여서 안쓸예정"],
  ["제이솔컴퍼니", "제이솔컴퍼니", "블루", "네이버", "10", "김무경", "", "14,000", ""],
  ["퍼플페퍼", "퍼플페퍼", "말차트래픽", "플레이스", "10", "김동엽", "010-8484-5495", "40,000", ""],
  ["퍼플페퍼", "퍼플페퍼", "언더더딜트래픽", "플레이스", "10", "김동엽", "010-8484-5495", "50,000", ""],
  ["PH파트너스", "에이치솔루션", "컴백", "네이버", "10", "하종석", "", "25,000", ""],
  ["셀러버스", "셀러버스", "네이버자동완성", "", "25", "김태린", "", "견적마다 금액다름", ""],
  ["셀러버스", "셀러버스", "자동완성슬롯", "", "10", "김태린", "", "10,500", ""],
  ["셀러버스", "셀러버스", "피코", "네이버", "10", "김태린", "", "17,000", ""],
  ["굿투그레이트", "굿투그레이트", "웹사이트슬롯", "웹사이트", "30", "", "", "43,000", ""],
  ["다인기획", "다인기획", "플레이스트래픽", "플레이스", "10", "신현수", "", "38,000", ""],
  ["스마트윈솔루션", "스마트윈솔루션", "스마트", "네이버", "10", "상우", "", "25,000", ""],
  ["비상한마케팅", "비상한마케팅", "병학2", "네이버", "10", "이병학", "", "25,000", ""],
  ["광고잘아는사람들", "광고잘아는사람들", "원도트", "플레이스", "10", "송승빈", "", "40,000", ""],
  ["광고잘아는사람들", "광고잘아는사람들", "라칸트래픽", "플레이스", "10", "송승빈", "", "40,000", ""],
  ["아우어", "아우어마케팅", "소보루플러스", "네이버", "10", "김성운", "", "25,000", ""],
  ["나인기획", "나인기획", "플레이스월보장", "", "25", "", "", "견적마다 금액다름", ""],
  ["원픽어카운트", "원픽어카운트", "원픽플러스", "네이버", "10", "김두남", "", "16,000", ""],
  ["업투유", "업투유", "스티젠", "네이버", "10", "", "", "21,000", "2/23 변경"],
  ["어스컴퍼니", "어스컴퍼니", "삿포로", "플레이스", "10", "", "", "35,000", ""],
  ["인포플래닛", "인포플래닛", "아담", "네이버", "10", "석승훈", "", "25,000", ""],
  ["글로시엘", "글로시엘", "토마토", "네이버", "10", "이수국", "", "25,000", ""],
  ["정성브랜딩", "정성브랜딩", "스카이블루", "네이버", "10", "박찬호", "", "28,000", ""],
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
  const numeric = toTrimmed(text).replace(/[^\d]/g, "");
  if (!numeric) return 0;
  return Number(numeric) || 0;
}

function parseDays(text) {
  const numeric = Number(toTrimmed(text).replace(/[^\d]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return 10;
  return Math.round(numeric);
}

function mapCategory(kindText, productName) {
  const kind = toTrimmed(kindText);
  const product = toTrimmed(productName);

  if (kind === "쿠팡") return "쿠팡슬롯";
  if (kind === "네이버") return "스마트스토어 슬롯";
  if (kind === "플레이스") return "플레이스 슬롯";
  if (kind === "웹사이트") return "웹사이트 슬롯";

  if (product.includes("쿠팡")) return "쿠팡슬롯";
  if (product.includes("플레이스")) return "플레이스 슬롯";
  if (product.includes("웹사이트")) return "웹사이트 슬롯";
  if (product.includes("네이버")) return "스마트스토어 슬롯";
  return "유입플 슬롯";
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
      console.log(`[SYNC] 429 ${method} ${endpoint} wait=${waitMs}ms`);
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

function parseRows(rows) {
  return rows
    .map((columns, index) => {
      const [
        executor = "",
        businessName = "",
        product = "",
        kind = "",
        days = "",
        manager = "",
        phone = "",
        price = "",
        note = "",
      ] = columns;

      const productName = toTrimmed(product);
      if (!productName) {
        throw new Error(`[SYNC] rows[${index}] has empty product name`);
      }

      return {
        executor: toTrimmed(executor),
        businessName: toTrimmed(businessName),
        product: productName,
        kind: toTrimmed(kind),
        days: parseDays(days),
        manager: toTrimmed(manager),
        phone: toTrimmed(phone),
        unitPrice: parsePrice(price),
        note: toTrimmed(note),
      };
    })
    .filter((row) => row.product);
}

function addExecutorNameForDuplicates(rows) {
  const countMap = new Map();
  rows.forEach((row) => {
    countMap.set(row.product, (countMap.get(row.product) || 0) + 1);
  });

  return rows.map((row) => {
    const owner = row.executor || row.businessName || "미지정";
    const isDuplicate = (countMap.get(row.product) || 0) > 1;
    const name = isDuplicate ? `${row.product}(${owner})` : row.product;
    return {
      ...row,
      name,
      category: mapCategory(row.kind, row.product),
    };
  });
}

async function main() {
  console.log(`[SYNC] base=${BASE_URL}`);

  const me = await apiRequest("GET", "/api/auth/me");
  console.log(`[SYNC] auth=${me?.name || "-"} role=${me?.role || "-"}`);

  const parsedRows = addExecutorNameForDuplicates(parseRows(RAW_ROWS));
  const targetNames = new Set(parsedRows.map((row) => row.name));
  const duplicateMap = new Map();
  parsedRows.forEach((row) => {
    duplicateMap.set(row.product, (duplicateMap.get(row.product) || 0) + 1);
  });
  const duplicateBaseNames = [...duplicateMap.entries()]
    .filter(([, count]) => count > 1)
    .map(([name]) => name);

  const products = await apiRequest("GET", "/api/products");
  if (!Array.isArray(products)) {
    throw new Error("[SYNC] /api/products response is not an array");
  }

  const productsByName = new Map(
    products
      .map((product) => [toTrimmed(product?.name), product])
      .filter(([name]) => name.length > 0),
  );
  const slotProducts = products.filter((product) => SLOT_CATEGORIES.has(toTrimmed(product.category)));

  const backupPath = path.join(
    process.cwd(),
    "server",
    "scripts",
    `products-backup-before-slot-sync-${Date.now()}.json`,
  );
  fs.writeFileSync(backupPath, JSON.stringify(products, null, 2), "utf8");
  console.log(`[SYNC] backup=${backupPath}`);

  let deleted = 0;
  for (const product of slotProducts) {
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
    const existingUnitPrice = Number(existing?.unitPrice) || 0;
    const existingWorkCost = Number(existing?.workCost) || 0;
    const nextUnitPrice = row.unitPrice > 0 ? row.unitPrice : existingUnitPrice;
    const nextWorkCost =
      row.unitPrice > 0
        ? row.unitPrice
        : existingWorkCost > 0
          ? existingWorkCost
          : existingUnitPrice;

    const payload = {
      name: row.name,
      category: row.category,
      unitPrice: nextUnitPrice,
      unit: toTrimmed(existing?.unit),
      baseDays: row.days,
      workCost: nextWorkCost,
      purchasePrice: Number(existing?.purchasePrice) || 0,
      vatType: toTrimmed(existing?.vatType) || "부가세별도",
      worker: row.executor || row.businessName || null,
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

  let cleanedLegacyDuplicates = 0;
  for (const baseName of duplicateBaseNames) {
    const legacy = productsByName.get(baseName);
    if (!legacy) continue;
    const hasRenamedVariant = parsedRows.some((row) => row.product === baseName && row.name !== baseName);
    if (!hasRenamedVariant) continue;
    await apiRequest("DELETE", `/api/products/${legacy.id}`);
    productsByName.delete(baseName);
    cleanedLegacyDuplicates += 1;
  }

  console.log(`[SYNC] parsed=${parsedRows.length}`);
  console.log(`[SYNC] deleted=${deleted}`);
  console.log(`[SYNC] created=${created}`);
  console.log(`[SYNC] updated=${updated}`);
  console.log(`[SYNC] cleaned-legacy-duplicates=${cleanedLegacyDuplicates}`);
  if (duplicateBaseNames.length > 0) {
    console.log(`[SYNC] duplicate-base-names=${duplicateBaseNames.join(", ")}`);
  }

  const sampleRows = parsedRows.filter((row) => row.product === "자몽" || row.product === "자동완성슬롯");
  for (const row of sampleRows) {
    console.log(`[SYNC] sample ${row.product} => ${row.name} / ${row.category}`);
  }
}

main().catch((error) => {
  console.error("[SYNC] failed:", error);
  process.exitCode = 1;
});
