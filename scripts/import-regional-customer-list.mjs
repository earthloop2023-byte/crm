import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { mkdir, writeFile } from "node:fs/promises";
import pg from "pg";
import XLSX from "xlsx";

const { Client } = pg;

const DEFAULT_BACKUP_DIR = "backups/regional-customer-list-import";
const TARGET_SHEETS = ["1000", "500", "300", "100"];

function parseArgs(argv) {
  const options = {
    apply: false,
    file: process.env.REGIONAL_CUSTOMER_LIST_XLSX || "",
    backupDir: process.env.REGIONAL_CUSTOMER_LIST_BACKUP_DIR || DEFAULT_BACKUP_DIR,
  };

  for (const arg of argv) {
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg.startsWith("--file=")) {
      options.file = arg.slice("--file=".length);
      continue;
    }
    if (arg.startsWith("--backup-dir=")) {
      options.backupDir = arg.slice("--backup-dir=".length);
    }
  }

  return options;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeNullableText(value) {
  const text = normalizeText(value);
  return text ? text : null;
}

function parseCount(value) {
  const text = normalizeText(value).replace(/,/g, "");
  return Math.max(Number.parseInt(text, 10) || 0, 0);
}

function hasContent(value) {
  return normalizeText(value) !== "";
}

function findWorkbookPath(explicitPath) {
  if (explicitPath) return path.resolve(explicitPath);
  const desktop = path.join(os.homedir(), "Desktop");
  const workbookName = fs
    .readdirSync(desktop)
    .find((name) => name.endsWith(".xlsx") && name.includes("타지역 고객리스트"));

  if (!workbookName) {
    throw new Error("타지역 고객리스트 엑셀 파일을 찾지 못했습니다. --file=경로로 지정해주세요.");
  }

  return path.join(desktop, workbookName);
}

function getHeaderIndex(headers, candidates) {
  for (let index = 0; index < headers.length; index += 1) {
    const header = normalizeText(headers[index]);
    if (!header) continue;
    if (candidates.some((candidate) => header === candidate || header.includes(candidate))) {
      return index;
    }
  }
  return -1;
}

function parseSheetRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`시트 '${sheetName}'를 찾지 못했습니다.`);
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  if (!rows.length) {
    return { sourceRows: 0, items: [] };
  }

  const headers = rows[0].map((value) => normalizeText(value));
  const customerNameIndex = getHeaderIndex(headers, ["고객명"]);
  const registrationCountIndex = getHeaderIndex(headers, ["등록건수"]);
  const sameCustomerIndex = getHeaderIndex(headers, ["동일고객"]);
  const csTimelineIndex = getHeaderIndex(headers, ["CS/타임라인"]);
  const exposureIndices = headers.reduce((acc, header, index) => {
    if (header.includes("노출 안내")) acc.push(index);
    return acc;
  }, []);
  const blogIndices = headers.reduce((acc, header, index) => {
    if (header.includes("블로그 리뷰")) acc.push(index);
    return acc;
  }, []);

  if (customerNameIndex < 0 || registrationCountIndex < 0) {
    throw new Error(`시트 '${sheetName}'의 필수 컬럼(고객명/등록건수)을 찾지 못했습니다.`);
  }

  const items = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const customerName = normalizeText(row[customerNameIndex]);
    if (!customerName) continue;

    items.push({
      tier: sheetName,
      customerName,
      registrationCount: parseCount(row[registrationCountIndex]),
      sameCustomer: sameCustomerIndex >= 0 ? normalizeNullableText(row[sameCustomerIndex]) : null,
      exposureNotice: exposureIndices.some((index) => hasContent(row[index])),
      blogReview: blogIndices.some((index) => hasContent(row[index])),
      csTimeline: csTimelineIndex >= 0 ? normalizeNullableText(row[csTimelineIndex]) : null,
      sortOrder: items.length + 1,
      createdBy: "system-import",
      updatedBy: "system-import",
    });
  }

  return {
    sourceRows: items.length,
    items,
  };
}

async function ensureTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS regional_customer_lists (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      tier text NOT NULL,
      customer_name text NOT NULL,
      registration_count integer NOT NULL DEFAULT 0,
      same_customer text,
      exposure_notice boolean NOT NULL DEFAULT false,
      blog_review boolean NOT NULL DEFAULT false,
      cs_timeline text,
      sort_order integer NOT NULL DEFAULT 0,
      created_by text,
      updated_by text,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const workbookPath = findWorkbookPath(options.file);
  const workbook = XLSX.readFile(workbookPath);

  const sheetReports = {};
  const items = [];

  for (const sheetName of TARGET_SHEETS) {
    const parsed = parseSheetRows(workbook, sheetName);
    sheetReports[sheetName] = { sourceRows: parsed.sourceRows };
    items.push(...parsed.items);
  }

  const backupRoot = path.resolve(options.backupDir);
  await mkdir(backupRoot, { recursive: true });

  const report = {
    workbookPath,
    apply: options.apply,
    sourceCounts: sheetReports,
    totalSourceRows: items.length,
    insertedCounts: {},
    totalInsertedRows: 0,
    beforeCount: 0,
    afterCount: 0,
    timestamp: new Date().toISOString(),
  };

  if (!options.apply) {
    const reportPath = path.join(backupRoot, `regional-customer-list-import-report-${Date.now()}.json`);
    await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
    console.log(JSON.stringify({ ...report, reportPath }, null, 2));
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await ensureTable(client);
    const beforeRows = await client.query(`SELECT * FROM regional_customer_lists ORDER BY tier, sort_order, customer_name`);
    report.beforeCount = beforeRows.rowCount || 0;

    const backupPath = path.join(backupRoot, `regional-customer-list-before-import-${Date.now()}.json`);
    await writeFile(backupPath, JSON.stringify(beforeRows.rows, null, 2), "utf8");

    await client.query("BEGIN");
    await client.query("DELETE FROM regional_customer_lists");

    for (const item of items) {
      await client.query(
        `
          INSERT INTO regional_customer_lists (
            tier,
            customer_name,
            registration_count,
            same_customer,
            exposure_notice,
            blog_review,
            cs_timeline,
            sort_order,
            created_by,
            updated_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `,
        [
          item.tier,
          item.customerName,
          item.registrationCount,
          item.sameCustomer,
          item.exposureNotice,
          item.blogReview,
          item.csTimeline,
          item.sortOrder,
          item.createdBy,
          item.updatedBy,
        ],
      );
    }

    const afterRows = await client.query(`
      SELECT tier, count(*)::int AS count
      FROM regional_customer_lists
      GROUP BY tier
      ORDER BY CASE tier WHEN '1000' THEN 1 WHEN '500' THEN 2 WHEN '300' THEN 3 WHEN '100' THEN 4 ELSE 99 END
    `);

    const totalAfter = await client.query(`SELECT count(*)::int AS count FROM regional_customer_lists`);
    await client.query("COMMIT");

    report.insertedCounts = Object.fromEntries(afterRows.rows.map((row) => [row.tier, row.count]));
    report.totalInsertedRows = totalAfter.rows[0]?.count || 0;
    report.afterCount = report.totalInsertedRows;

    const reportPath = path.join(backupRoot, `regional-customer-list-import-report-${Date.now()}.json`);
    await writeFile(reportPath, JSON.stringify({ ...report, backupPath }, null, 2), "utf8");
    console.log(JSON.stringify({ ...report, backupPath, reportPath }, null, 2));
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
