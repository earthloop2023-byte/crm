import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import pg from "pg";
import XLSX from "xlsx";

const { Client } = pg;

const DEFAULT_SHEET_NAME = "고객DB";
const DEFAULT_BACKUP_DIR = "backups/regional-deals-import";
const IMPORT_AUTHOR_NAME = "시스템";
const PROVIDER_PRODUCT_NAME_MAP = {
  "드림라인": "드림라인",
  KCT: "KCT",
};

const COLUMN_ALIASES = {
  billingAccountNumber: ["청구계정번호"],
  companyName: ["상호", "업체명(상호)"],
  industry: ["업종/카테고리", "업종"],
  lineCount: ["누적회선수", "총회선수"],
  contractStatus: ["계약상태"],
  inboundDate: ["인입일", "신청일"],
  contractStartDate: ["계약 시작일", "가입일", "신규가입일"],
  contractEndDate: ["계약 종료일", "해지일"],
  renewalDueDate: ["갱신 예정일"],
  cancelledLineCount: ["해지회선수", "해지회선"],
  telecomProvider: ["통신사"],
  customerName: ["고객명", "성함", "이름"],
  phone: ["연락처", "착신번호", "전화번호"],
  email: ["이메일"],
  customerDisposition: ["고객 성향"],
  notes: ["특이사항 /CS메모", "비고", "메모", "통화메모"],
  firstProgressStatus: ["1차 진행상황"],
  secondProgressStatus: ["2차 진행상황"],
  additionalProgressStatus: ["추가 진행상황"],
  acquisitionChannel: ["유입경로"],
  cancellationReason: ["해지 사유"],
  salesperson: ["영업자"],
};

function parseArgs(argv) {
  const options = {
    apply: false,
    file: process.env.REGIONAL_IMPORT_XLSX || "",
    sheet: process.env.REGIONAL_IMPORT_SHEET || DEFAULT_SHEET_NAME,
    backupDir: process.env.REGIONAL_IMPORT_BACKUP_DIR || DEFAULT_BACKUP_DIR,
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
    if (arg.startsWith("--sheet=")) {
      options.sheet = arg.slice("--sheet=".length);
      continue;
    }
    if (arg.startsWith("--backup-dir=")) {
      options.backupDir = arg.slice("--backup-dir=".length);
    }
  }

  return options;
}

function asText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseInteger(value) {
  const text = asText(value).replace(/,/g, "");
  if (!text) return 0;
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value) {
  return asText(value).replace(/\s+/g, " ");
}

function normalizeStatus(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  if (normalized === "신규") return "신규상담";
  if (normalized === "유지") return "등록";
  return normalized;
}

function normalizeProvider(value) {
  const normalized = normalizeText(value).toUpperCase();
  if (!normalized) return "";
  if (normalized === "KCT") return "KCT";
  if (normalized.includes("드림")) return "드림라인";
  return normalizeText(value);
}

function getKoreanDateKey(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

function normalizeToKoreanContractDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const koreanDateKey = getKoreanDateKey(value);
  if (!koreanDateKey) return null;
  const normalized = new Date(`${koreanDateKey}T12:00:00+09:00`);
  return Number.isNaN(normalized.getTime()) ? null : normalized;
}

function addMonthsToKoreanContractDate(value, monthDelta) {
  const baseDate = normalizeToKoreanContractDate(value);
  if (!baseDate) return null;
  const nextDate = new Date(baseDate);
  nextDate.setMonth(nextDate.getMonth() + monthDelta);
  return normalizeToKoreanContractDate(nextDate) || nextDate;
}

function getKoreanYearMonthKey(value) {
  const dateKey = getKoreanDateKey(value);
  if (!dateKey) return null;
  return dateKey.slice(0, 7);
}

function shiftKoreanYearMonthKey(yearMonth, monthDelta) {
  const baseDate = new Date(`${yearMonth}-01T12:00:00+09:00`);
  if (Number.isNaN(baseDate.getTime())) return yearMonth;
  baseDate.setMonth(baseDate.getMonth() + monthDelta);
  return getKoreanYearMonthKey(baseDate) || yearMonth;
}

function parseSpreadsheetDate(value) {
  const text = asText(value);
  if (!text) return null;
  const matches = text.match(/\d+/g);
  if (!matches || matches.length < 3) return null;
  const year = Number.parseInt(matches[0], 10);
  const month = Number.parseInt(matches[1], 10);
  const day = Number.parseInt(matches[2], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return normalizeToKoreanContractDate(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00+09:00`);
}

function getRegionalDealLifecycleSnapshot(input, existingDeal, referenceDate = new Date()) {
  const hasOwn = (key) => !!input && Object.prototype.hasOwnProperty.call(input, key);
  const today = normalizeToKoreanContractDate(referenceDate) || new Date(referenceDate);
  const todayKey = getKoreanDateKey(today);
  const todayMonthKey = getKoreanYearMonthKey(today);
  const existingStatus = normalizeText(existingDeal?.contractStatus);
  const existingStage = normalizeText(existingDeal?.stage) || "new";
  const contractStartDate = hasOwn("contractStartDate")
    ? normalizeToKoreanContractDate(input.contractStartDate)
    : normalizeToKoreanContractDate(existingDeal?.contractStartDate);
  let contractEndDate = hasOwn("contractEndDate")
    ? normalizeToKoreanContractDate(input.contractEndDate)
    : normalizeToKoreanContractDate(existingDeal?.contractEndDate);
  let renewalDueDate = hasOwn("renewalDueDate")
    ? normalizeToKoreanContractDate(input.renewalDueDate)
    : normalizeToKoreanContractDate(existingDeal?.renewalDueDate);
  let stage = normalizeText(hasOwn("stage") ? input.stage : existingDeal?.stage) || existingStage;
  let contractStatus = normalizeText(hasOwn("contractStatus") ? input.contractStatus : existingDeal?.contractStatus);

  if (!contractStatus) {
    if (stage === "churned") {
      contractStatus = "해지";
    } else if (stage === "active") {
      contractStatus = "등록";
    } else {
      contractStatus = contractStartDate ? "등록/갱신예정" : "신규상담";
    }
  }

  const wasChurned = existingStage === "churned" || existingStatus === "해지";
  const willBeChurned = stage === "churned" || contractStatus === "해지";
  if (willBeChurned) {
    stage = "churned";
    contractStatus = "해지";
    if (!wasChurned) {
      contractEndDate = today;
    } else if (!contractEndDate) {
      contractEndDate = normalizeToKoreanContractDate(existingDeal?.contractEndDate) || today;
    }
    renewalDueDate = null;
    return {
      stage,
      contractStatus,
      contractStartDate,
      contractEndDate,
      renewalDueDate,
    };
  }

  if (contractStartDate && (contractStatus === "" || contractStatus === "신규" || contractStatus === "신규상담")) {
    contractStatus = "등록/갱신예정";
    stage = "new";
  } else if (contractStatus === "등록/갱신예정") {
    stage = "new";
  } else if (contractStatus === "유지" || contractStatus === "등록") {
    contractStatus = "등록";
    stage = "active";
  } else if (contractStatus === "신규" || contractStatus === "신규상담") {
    contractStatus = "신규상담";
    stage = "new";
  }

  if (!contractEndDate && contractStartDate) {
    contractEndDate = addMonthsToKoreanContractDate(contractStartDate, 3);
  }

  if (!renewalDueDate && contractEndDate) {
    renewalDueDate = contractEndDate;
  }

  if (contractStartDate && contractStatus === "등록/갱신예정") {
    const contractStartMonthKey = getKoreanYearMonthKey(contractStartDate);
    const promoteMonthKey = contractStartMonthKey ? shiftKoreanYearMonthKey(contractStartMonthKey, 3) : null;
    if (todayMonthKey && promoteMonthKey && todayMonthKey >= promoteMonthKey) {
      contractStatus = "등록";
      stage = "active";
    }
  }

  const previousEndDateKey = getKoreanDateKey(contractEndDate);
  const currentRenewalKey = getKoreanDateKey(renewalDueDate);
  let nextContractEndDate = contractEndDate ? new Date(contractEndDate) : null;
  let nextEndDateKey = previousEndDateKey;
  let extended = false;

  while (nextContractEndDate && nextEndDateKey && todayKey && nextEndDateKey <= todayKey) {
    nextContractEndDate.setMonth(nextContractEndDate.getMonth() + 3);
    nextContractEndDate = normalizeToKoreanContractDate(nextContractEndDate) || nextContractEndDate;
    nextEndDateKey = getKoreanDateKey(nextContractEndDate);
    extended = true;
  }

  if (extended && nextContractEndDate && nextEndDateKey && previousEndDateKey !== nextEndDateKey) {
    contractEndDate = nextContractEndDate;
    if (!currentRenewalKey || currentRenewalKey === previousEndDateKey) {
      renewalDueDate = nextContractEndDate;
    }
  }

  if (!renewalDueDate && contractEndDate) {
    renewalDueDate = contractEndDate;
  }

  return {
    stage,
    contractStatus,
    contractStartDate,
    contractEndDate,
    renewalDueDate,
  };
}

function formatDisplayDate(value) {
  const dateKey = getKoreanDateKey(value);
  if (!dateKey) return "";
  const [year, month, day] = dateKey.split("-");
  return `${year}. ${Number(month)}. ${Number(day)}.`;
}

function buildHeaderLookup(headers) {
  return new Map(
    headers
      .map((header, index) => [normalizeText(header), index])
      .filter(([header]) => header)
  );
}

function getRowValueByAliases(row, headerLookup, aliases) {
  for (const alias of aliases) {
    const headerIndex = headerLookup.get(normalizeText(alias));
    if (headerIndex === undefined) continue;
    return row[headerIndex];
  }
  return "";
}

function findWorkbookPath(explicitPath) {
  if (explicitPath) return path.resolve(explicitPath);
  const desktop = path.join(os.homedir(), "Desktop");
  const workbookName = fs
    .readdirSync(desktop)
    .find((name) => name.endsWith(".xlsx") && name.includes("타지역"));
  if (!workbookName) {
    throw new Error("타지역 엑셀 파일을 찾지 못했습니다. --file=경로 로 지정하세요.");
  }
  return path.join(desktop, workbookName);
}

function resolveSheet(workbook, requestedName) {
  if (workbook.Sheets[requestedName]) return requestedName;
  const fallback = workbook.SheetNames.find((name) => name.includes(requestedName));
  if (!fallback) {
    throw new Error(`시트 '${requestedName}' 를 찾지 못했습니다.`);
  }
  return fallback;
}

function buildDealFromRow(row, headerLookup, productIdsByProvider) {
  const companyName = asText(getRowValueByAliases(row, headerLookup, COLUMN_ALIASES.companyName));
  const customerName = asText(getRowValueByAliases(row, headerLookup, COLUMN_ALIASES.customerName));
  const telecomProvider = normalizeProvider(getRowValueByAliases(row, headerLookup, COLUMN_ALIASES.telecomProvider));
  const contractStatus = normalizeStatus(getRowValueByAliases(row, headerLookup, COLUMN_ALIASES.contractStatus));
  const inboundDate = parseSpreadsheetDate(getRowValueByAliases(row, headerLookup, COLUMN_ALIASES.inboundDate));
  const contractStartDate = parseSpreadsheetDate(getRowValueByAliases(row, headerLookup, COLUMN_ALIASES.contractStartDate));
  const sourceContractEndDate = parseSpreadsheetDate(getRowValueByAliases(row, headerLookup, COLUMN_ALIASES.contractEndDate));
  const sourceRenewalDueDate = parseSpreadsheetDate(getRowValueByAliases(row, headerLookup, COLUMN_ALIASES.renewalDueDate));
  const lineCount = parseInteger(getRowValueByAliases(row, headerLookup, COLUMN_ALIASES.lineCount));
  const cancelledLineCount = parseInteger(getRowValueByAliases(row, headerLookup, COLUMN_ALIASES.cancelledLineCount));
  const billingAccountNumber = asText(getRowValueByAliases(row, headerLookup, COLUMN_ALIASES.billingAccountNumber));
  const email = asText(getRowValueByAliases(row, headerLookup, COLUMN_ALIASES.email));
  const notes = asText(getRowValueByAliases(row, headerLookup, COLUMN_ALIASES.notes));

  let deal = {
    id: randomUUID(),
    title: customerName || companyName || billingAccountNumber || "이관데이터",
    customerId: null,
    value: 0,
    stage: contractStatus === "해지" ? "churned" : contractStatus === "등록" ? "active" : "new",
    probability: 0,
    expectedCloseDate: inboundDate || contractStartDate,
    inboundDate,
    contractStartDate,
    contractEndDate: sourceContractEndDate,
    renewalDueDate: sourceRenewalDueDate,
    contractStatus,
    notes,
    phone: asText(getRowValueByAliases(row, headerLookup, COLUMN_ALIASES.phone)),
    email,
    billingAccountNumber,
    companyName,
    industry: asText(getRowValueByAliases(row, headerLookup, COLUMN_ALIASES.industry)),
    telecomProvider,
    customerDisposition: asText(getRowValueByAliases(row, headerLookup, COLUMN_ALIASES.customerDisposition)),
    customerTypeDetail: "",
    firstProgressStatus: asText(getRowValueByAliases(row, headerLookup, COLUMN_ALIASES.firstProgressStatus)),
    secondProgressStatus: asText(getRowValueByAliases(row, headerLookup, COLUMN_ALIASES.secondProgressStatus)),
    additionalProgressStatus: asText(getRowValueByAliases(row, headerLookup, COLUMN_ALIASES.additionalProgressStatus)),
    acquisitionChannel: asText(getRowValueByAliases(row, headerLookup, COLUMN_ALIASES.acquisitionChannel)),
    cancellationReason: asText(getRowValueByAliases(row, headerLookup, COLUMN_ALIASES.cancellationReason)),
    salesperson: asText(getRowValueByAliases(row, headerLookup, COLUMN_ALIASES.salesperson)),
    preChurnStage: null,
    lineCount: Math.max(lineCount, 0),
    cancelledLineCount: Math.max(cancelledLineCount, 0),
    productId: productIdsByProvider.get(telecomProvider) || null,
  };

  deal = {
    ...deal,
    ...getRegionalDealLifecycleSnapshot(deal, null),
  };

  if (deal.contractStatus === "해지") {
    if (sourceContractEndDate) {
      deal.contractEndDate = sourceContractEndDate;
    }
    deal.cancelledLineCount = Math.max(deal.cancelledLineCount, deal.lineCount);
    deal.lineCount = 0;
    deal.renewalDueDate = null;
  }

  if (!deal.expectedCloseDate) {
    deal.expectedCloseDate = deal.inboundDate || deal.contractStartDate || null;
  }

  return deal;
}

function buildTimelines(deal) {
  const anchorDate = deal.inboundDate || deal.contractStartDate || new Date();
  const items = [
    {
      id: randomUUID(),
      dealId: deal.id,
      content: `[${deal.contractStatus || "신규상담"}] ${formatDisplayDate(anchorDate)} 엑셀 일괄이관`,
      authorId: null,
      authorName: IMPORT_AUTHOR_NAME,
    },
  ];

  if (deal.cancellationReason) {
    items.push({
      id: randomUUID(),
      dealId: deal.id,
      content: `[해지사유] ${formatDisplayDate(deal.churnDate || deal.contractEndDate || anchorDate)} ${deal.cancellationReason}`,
      authorId: null,
      authorName: IMPORT_AUTHOR_NAME,
    });
  }

  if (deal.notes) {
    items.push({
      id: randomUUID(),
      dealId: deal.id,
      content: deal.notes,
      authorId: null,
      authorName: IMPORT_AUTHOR_NAME,
    });
  }

  return items;
}

function summarizeDeals(deals) {
  const statusCounts = {};
  const providerCounts = {};
  for (const deal of deals) {
    const status = deal.contractStatus || "(blank)";
    const provider = deal.telecomProvider || "(blank)";
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    providerCounts[provider] = (providerCounts[provider] || 0) + 1;
  }
  return { statusCounts, providerCounts };
}

function getTimestampLabel(date = new Date()) {
  const key = getKoreanDateKey(date)?.replace(/-/g, "") || "00000000";
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(/:/g, "");
  return `${key}-${time}`;
}

async function loadWorkbookRows(workbookPath, requestedSheetName) {
  const workbook = XLSX.readFile(workbookPath, { raw: false, defval: "" });
  const sheetName = resolveSheet(workbook, requestedSheetName);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: "",
  });

  if (!rows.length) {
    throw new Error(`시트 '${sheetName}' 에 데이터가 없습니다.`);
  }

  const [headers, ...dataRows] = rows;
  const headerLookup = buildHeaderLookup(headers);
  const filteredRows = dataRows.filter((row) =>
    row.some((cell) => asText(cell))
  );

  return { sheetName, headers, headerLookup, rows: filteredRows };
}

async function loadRegionalProductMap(client) {
  const result = await client.query(
    `
      select id, name
      from products
      where category = '타지역서비스'
    `
  );

  const productIdsByProvider = new Map();
  for (const row of result.rows) {
    const normalizedName = normalizeProvider(row.name);
    if (normalizedName) {
      productIdsByProvider.set(normalizedName, row.id);
    }
  }

  for (const [provider, productName] of Object.entries(PROVIDER_PRODUCT_NAME_MAP)) {
    if (!productIdsByProvider.has(provider)) {
      const fallback = result.rows.find((row) => normalizeText(row.name) === productName);
      if (fallback) {
        productIdsByProvider.set(provider, fallback.id);
      }
    }
  }

  return productIdsByProvider;
}

async function backupCurrentDeals(client, backupDir, workbookPath, sheetName) {
  await mkdir(backupDir, { recursive: true });
  const [dealsResult, timelinesResult] = await Promise.all([
    client.query("select * from deals order by created_at desc"),
    client.query("select * from deal_timelines order by created_at desc"),
  ]);

  const backupPayload = {
    generatedAt: new Date().toISOString(),
    workbookPath,
    sheetName,
    dealsCount: dealsResult.rowCount,
    timelinesCount: timelinesResult.rowCount,
    deals: dealsResult.rows,
    dealTimelines: timelinesResult.rows,
  };

  const backupPath = path.join(
    backupDir,
    `regional-deals-before-replace-${getTimestampLabel()}.json`
  );
  await writeFile(backupPath, JSON.stringify(backupPayload, null, 2), "utf8");
  return backupPath;
}

async function insertDeals(client, deals, timelines) {
  const dealSql = `
    insert into deals (
      id, title, customer_id, value, stage, probability, expected_close_date,
      inbound_date, contract_start_date, contract_end_date, renewal_due_date,
      contract_status, notes, phone, email, billing_account_number, company_name,
      industry, telecom_provider, customer_disposition, customer_type_detail,
      first_progress_status, second_progress_status, additional_progress_status,
      acquisition_channel, cancellation_reason, salesperson, pre_churn_stage,
      line_count, cancelled_line_count, product_id
    ) values (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11,
      $12, $13, $14, $15, $16, $17,
      $18, $19, $20, $21,
      $22, $23, $24,
      $25, $26, $27, $28,
      $29, $30, $31
    )
  `;

  const timelineSql = `
    insert into deal_timelines (
      id, deal_id, content, author_id, author_name
    ) values ($1, $2, $3, $4, $5)
  `;

  for (const deal of deals) {
    await client.query(dealSql, [
      deal.id,
      deal.title,
      deal.customerId,
      deal.value,
      deal.stage,
      deal.probability,
      deal.expectedCloseDate,
      deal.inboundDate,
      deal.contractStartDate,
      deal.contractEndDate,
      deal.renewalDueDate,
      deal.contractStatus,
      deal.notes,
      deal.phone,
      deal.email,
      deal.billingAccountNumber,
      deal.companyName,
      deal.industry,
      deal.telecomProvider,
      deal.customerDisposition,
      deal.customerTypeDetail,
      deal.firstProgressStatus,
      deal.secondProgressStatus,
      deal.additionalProgressStatus,
      deal.acquisitionChannel,
      deal.cancellationReason,
      deal.salesperson,
      deal.preChurnStage,
      deal.lineCount,
      deal.cancelledLineCount,
      deal.productId,
    ]);
  }

  for (const timeline of timelines) {
    await client.query(timelineSql, [
      timeline.id,
      timeline.dealId,
      timeline.content,
      timeline.authorId,
      timeline.authorName,
    ]);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const workbookPath = findWorkbookPath(options.file);
  const { sheetName, headers, headerLookup, rows } = await loadWorkbookRows(workbookPath, options.sheet);
  const client = new Client({
    connectionString: process.env.DATABASE_URL || "postgres://crm:crm@127.0.0.1:5432/crmdb",
  });

  await client.connect();

  try {
    const productIdsByProvider = await loadRegionalProductMap(client);
    const deals = rows
      .map((row) => buildDealFromRow(row, headerLookup, productIdsByProvider))
      .filter((deal) => deal.title || deal.companyName || deal.billingAccountNumber);
    const timelines = deals.flatMap((deal) => buildTimelines(deal));
    const sourceSummary = summarizeDeals(deals);

    const preview = {
      workbookPath,
      sheetName,
      headers,
      apply: options.apply,
      sourceRowCount: rows.length,
      importedDealCount: deals.length,
      importedTimelineCount: timelines.length,
      ...sourceSummary,
      sample: deals.slice(0, 5).map((deal) => ({
        title: deal.title,
        companyName: deal.companyName,
        contractStatus: deal.contractStatus,
        stage: deal.stage,
        telecomProvider: deal.telecomProvider,
        lineCount: deal.lineCount,
        cancelledLineCount: deal.cancelledLineCount,
        inboundDate: getKoreanDateKey(deal.inboundDate),
        contractStartDate: getKoreanDateKey(deal.contractStartDate),
        contractEndDate: getKoreanDateKey(deal.contractEndDate),
        renewalDueDate: getKoreanDateKey(deal.renewalDueDate),
      })),
    };

    if (!options.apply) {
      console.log(JSON.stringify(preview, null, 2));
      return;
    }

    const backupPath = await backupCurrentDeals(client, path.resolve(options.backupDir), workbookPath, sheetName);
    await client.query("begin");
    await client.query("delete from deals");
    await insertDeals(client, deals, timelines);
    await client.query("commit");

    const finalCounts = await client.query(`
      select
        count(*)::int as deals_count,
        count(*) filter (where contract_status = '신규상담')::int as new_count,
        count(*) filter (where contract_status = '등록/갱신예정')::int as pending_count,
        count(*) filter (where contract_status = '등록')::int as active_count,
        count(*) filter (where contract_status = '해지')::int as churned_count
      from deals
    `);
    const timelineCounts = await client.query("select count(*)::int as count from deal_timelines");

    console.log(
      JSON.stringify(
        {
          ...preview,
          backupPath,
          finalCounts: finalCounts.rows[0],
          finalTimelineCount: timelineCounts.rows[0]?.count ?? 0,
        },
        null,
        2
      )
    );
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // ignore rollback failures when no transaction exists
    }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
