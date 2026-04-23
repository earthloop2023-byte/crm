import crypto, { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import XLSX from "xlsx";
import pg from "pg";

const { Client } = pg;

const STATUS_OPEN = "개통";
const TIMELINE_AUTHOR_NAME = "시스템";
const IMPORT_PREFIX = "[개통]";
const NOTE_PREFIX = "[CS메모]";
const CANCELLATION_PREFIX = "[해지사유]";

const PII_ENVELOPE_KIND = "crm.pii.envelope";
const PII_ENVELOPE_VERSION = 2;
const PII_ENVELOPE_ALGORITHM = "aes-256-gcm";

function loadEnvFiles() {
  const envCandidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), ".env.production"),
  ];

  for (const envPath of envCandidates) {
    if (!fs.existsSync(envPath)) continue;
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) continue;
      const key = trimmed.slice(0, separatorIndex).trim();
      if (!key || process.env[key]) continue;
      let value = trimmed.slice(separatorIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

function parseArgs(argv) {
  const options = {
    file: "",
    apply: false,
    backupDir: path.resolve(process.cwd(), "backups", "regional-open-sync"),
    reportPrefix: "regional-open-sync-report",
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
      options.backupDir = path.resolve(arg.slice("--backup-dir=".length));
      continue;
    }
    if (arg.startsWith("--report-prefix=")) {
      options.reportPrefix = arg.slice("--report-prefix=".length);
    }
  }

  if (!options.file) {
    throw new Error("--file=엑셀 경로가 필요합니다.");
  }

  return options;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeNumber(value) {
  const text = normalizeText(value).replace(/,/g, "");
  if (!text) return 0;
  const numberValue = Number(text);
  return Number.isFinite(numberValue) ? Math.round(numberValue) : 0;
}

function toDateOnlyString(value) {
  const text = normalizeText(value);
  if (!text) return null;

  const dot = text.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})$/);
  if (dot) {
    return `${dot[1]}-${String(Number(dot[2])).padStart(2, "0")}-${String(Number(dot[3])).padStart(2, "0")}`;
  }

  const dash = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dash) {
    return `${dash[1]}-${String(Number(dash[2])).padStart(2, "0")}-${String(Number(dash[3])).padStart(2, "0")}`;
  }

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    return `${String(year).padStart(4, "0")}-${String(Number(slash[1])).padStart(2, "0")}-${String(Number(slash[2])).padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDate(value) {
  const dateOnly = toDateOnlyString(value);
  return dateOnly ? new Date(`${dateOnly}T12:00:00+09:00`) : null;
}

function formatTimelineDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "1970.01.01";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

function createStoredPiiValue(plaintext) {
  const normalized = normalizeText(plaintext);
  if (!normalized) return "";
  const secret = normalizeText(process.env.PII_ENCRYPTION_KEY);
  if (!secret) return normalized;
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash("sha256").update(secret, "utf8").digest();
  const cipher = crypto.createCipheriv(PII_ENVELOPE_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    kind: PII_ENVELOPE_KIND,
    version: PII_ENVELOPE_VERSION,
    algorithm: PII_ENVELOPE_ALGORITHM,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  });
}

function decryptStoredPiiValue(stored) {
  const text = normalizeText(stored);
  if (!text) return "";
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }
  if (
    !parsed ||
    parsed.kind !== PII_ENVELOPE_KIND ||
    parsed.algorithm !== PII_ENVELOPE_ALGORITHM ||
    typeof parsed.iv !== "string" ||
    typeof parsed.tag !== "string" ||
    typeof parsed.ciphertext !== "string"
  ) {
    return text;
  }
  const secret = normalizeText(process.env.PII_ENCRYPTION_KEY);
  if (!secret) {
    throw new Error("PII_ENCRYPTION_KEY가 필요합니다.");
  }
  const key = crypto.createHash("sha256").update(secret, "utf8").digest();
  const decipher = crypto.createDecipheriv(
    PII_ENVELOPE_ALGORITHM,
    key,
    Buffer.from(parsed.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(parsed.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

function getTimestampLabel(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function saveJsonReport(targetPath, payload) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2), "utf8");
}

function isWorkbookDataRow(values) {
  return values.some((value) => normalizeText(value) !== "");
}

function buildSourceRows(workbookPath) {
  const workbook = XLSX.readFile(path.resolve(workbookPath));
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: false });

  if (!rows.length) {
    return { sheetName, headers: [], rows: [] };
  }

  const headers = Object.keys(rows[0]);
  const sourceRows = rows
    .slice(1)
    .map((row, index) => ({ row, values: Object.values(row).map((value) => normalizeText(value)), index: index + 2 }))
    .filter(({ values }) => isWorkbookDataRow(values))
    .map(({ values, index }) => ({
      sourceIndex: index,
      billingAccountNumber: values[0] || "",
      companyName: values[1] || "",
      industry: values[2] || "",
      lineCount: normalizeNumber(values[3]),
      contractStatus: values[4] || STATUS_OPEN,
      inboundDate: toDate(values[5]),
      contractStartDate: toDate(values[6]),
      contractEndDate: toDate(values[7]),
      churnDate: toDate(values[8]),
      cancelledLineCount: normalizeNumber(values[9]),
      telecomProvider: values[10] || "",
      customerName: values[11] || "",
      phone: values[12] || "",
      email: values[13] || "",
      customerDisposition: values[14] || "",
      notes: values[15] || "",
      firstProgressStatus: values[16] || "",
      secondProgressStatus: values[17] || "",
      additionalProgressStatus: values[18] || "",
      acquisitionChannel: values[19] || "",
      cancellationReason: values[20] || "",
      salesperson: values[21] || "",
    }));

  return { sheetName, headers, rows: sourceRows };
}

function businessGroupKey(row) {
  return [
    normalizeText(row.billingAccountNumber),
    normalizeText(row.companyName),
    normalizeText(row.telecomProvider),
    normalizeText(row.customerName),
  ].join("||");
}

function canonicalSortKey(row) {
  return [
    toDateOnlyString(row.inboundDate) || "",
    toDateOnlyString(row.contractStartDate) || "",
    toDateOnlyString(row.contractEndDate) || "",
    toDateOnlyString(row.churnDate) || "",
    String(normalizeNumber(row.lineCount)).padStart(10, "0"),
    String(normalizeNumber(row.cancelledLineCount)).padStart(10, "0"),
    normalizeText(row.industry),
    normalizeText(row.phone),
    normalizeText(row.email),
    normalizeText(row.customerDisposition),
    normalizeText(row.notes),
    normalizeText(row.firstProgressStatus),
    normalizeText(row.secondProgressStatus),
    normalizeText(row.additionalProgressStatus),
    normalizeText(row.acquisitionChannel),
    normalizeText(row.cancellationReason),
    normalizeText(row.salesperson),
  ].join("||");
}

function canonicalComparisonKey(row) {
  return JSON.stringify({
    billingAccountNumber: normalizeText(row.billingAccountNumber),
    companyName: normalizeText(row.companyName),
    industry: normalizeText(row.industry),
    lineCount: normalizeNumber(row.lineCount),
    contractStatus: STATUS_OPEN,
    inboundDate: toDateOnlyString(row.inboundDate),
    contractStartDate: toDateOnlyString(row.contractStartDate),
    contractEndDate: toDateOnlyString(row.contractEndDate),
    churnDate: toDateOnlyString(row.churnDate),
    cancelledLineCount: normalizeNumber(row.cancelledLineCount),
    telecomProvider: normalizeText(row.telecomProvider),
    customerName: normalizeText(row.customerName),
    phone: normalizeText(row.phone),
    email: normalizeText(row.email),
    customerDisposition: normalizeText(row.customerDisposition),
    notes: normalizeText(row.notes),
    firstProgressStatus: normalizeText(row.firstProgressStatus),
    secondProgressStatus: normalizeText(row.secondProgressStatus),
    additionalProgressStatus: normalizeText(row.additionalProgressStatus),
    acquisitionChannel: normalizeText(row.acquisitionChannel),
    cancellationReason: normalizeText(row.cancellationReason),
    salesperson: normalizeText(row.salesperson),
  });
}

function buildSourceMultiset(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = canonicalComparisonKey(row);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

async function loadCurrentOpenDeals(client) {
  const result = await client.query(`
    select
      id,
      title,
      stage,
      inbound_date,
      contract_start_date,
      contract_end_date,
      churn_date,
      contract_status,
      notes,
      phone,
      email,
      billing_account_number,
      company_name,
      industry,
      telecom_provider,
      customer_disposition,
      first_progress_status,
      second_progress_status,
      additional_progress_status,
      acquisition_channel,
      cancellation_reason,
      salesperson,
      line_count,
      cancelled_line_count
    from deals
    where contract_status = $1
    order by created_at desc nulls last, id
  `, [STATUS_OPEN]);

  return result.rows.map((row) => ({
    ...row,
    billingAccountNumber: decryptStoredPiiValue(row.billing_account_number),
    notesPlain: decryptStoredPiiValue(row.notes),
    phonePlain: decryptStoredPiiValue(row.phone),
    emailPlain: decryptStoredPiiValue(row.email),
    customerName: normalizeText(row.title),
    companyName: normalizeText(row.company_name),
    industry: normalizeText(row.industry),
    telecomProvider: normalizeText(row.telecom_provider),
    customerDisposition: normalizeText(row.customer_disposition),
    firstProgressStatus: normalizeText(row.first_progress_status),
    secondProgressStatus: normalizeText(row.second_progress_status),
    additionalProgressStatus: normalizeText(row.additional_progress_status),
    acquisitionChannel: normalizeText(row.acquisition_channel),
    cancellationReason: normalizeText(row.cancellation_reason),
    salesperson: normalizeText(row.salesperson),
    lineCount: normalizeNumber(row.line_count),
    cancelledLineCount: normalizeNumber(row.cancelled_line_count),
    inboundDate: row.inbound_date,
    contractStartDate: row.contract_start_date,
    contractEndDate: row.contract_end_date,
    churnDate: row.churn_date,
  }));
}

async function loadCurrentOpenTimelines(client) {
  const result = await client.query(`
    select
      dt.*
    from deal_timelines dt
    inner join deals d on d.id = dt.deal_id
    where d.contract_status = $1
  `, [STATUS_OPEN]);
  return result.rows;
}

async function loadRegionalProductMap(client) {
  const result = await client.query(`
    select id, name
    from products
    where name in ('드림라인', 'KCT')
  `);
  const map = new Map();
  for (const row of result.rows) {
    map.set(normalizeText(row.name), row.id);
  }
  return map;
}

function buildGroupMap(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = businessGroupKey(row);
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

function sortWithinGroup(rows, sortKeyGetter) {
  return [...rows].sort((left, right) => sortKeyGetter(left).localeCompare(sortKeyGetter(right), "ko"));
}

function buildNewDealRecord(source, productId) {
  return {
    id: randomUUID(),
    title: normalizeText(source.customerName) || normalizeText(source.companyName) || normalizeText(source.billingAccountNumber) || `개통-${source.sourceIndex}`,
    customer_id: null,
    value: 0,
    stage: "active",
    probability: 0,
    expected_close_date: source.inboundDate || source.contractStartDate || source.contractEndDate || null,
    inbound_date: source.inboundDate,
    contract_start_date: source.contractStartDate,
    contract_end_date: source.contractEndDate,
    renewal_due_date: null,
    contract_status: STATUS_OPEN,
    notes: createStoredPiiValue(source.notes),
    phone: createStoredPiiValue(source.phone),
    email: createStoredPiiValue(source.email),
    billing_account_number: createStoredPiiValue(source.billingAccountNumber),
    company_name: normalizeText(source.companyName) || null,
    industry: normalizeText(source.industry) || null,
    telecom_provider: normalizeText(source.telecomProvider) || null,
    customer_disposition: normalizeText(source.customerDisposition) || null,
    customer_type_detail: null,
    first_progress_status: normalizeText(source.firstProgressStatus) || null,
    second_progress_status: normalizeText(source.secondProgressStatus) || null,
    additional_progress_status: normalizeText(source.additionalProgressStatus) || null,
    acquisition_channel: normalizeText(source.acquisitionChannel) || null,
    cancellation_reason: normalizeText(source.cancellationReason) || null,
    salesperson: normalizeText(source.salesperson) || null,
    pre_churn_stage: null,
    line_count: normalizeNumber(source.lineCount),
    cancelled_line_count: normalizeNumber(source.cancelledLineCount),
    product_id: productId || null,
    churn_date: source.churnDate,
  };
}

function buildUpdateDealRecord(source, productId) {
  return {
    title: normalizeText(source.customerName) || normalizeText(source.companyName) || normalizeText(source.billingAccountNumber),
    stage: "active",
    probability: 0,
    expected_close_date: source.inboundDate || source.contractStartDate || source.contractEndDate || null,
    inbound_date: source.inboundDate,
    contract_start_date: source.contractStartDate,
    contract_end_date: source.contractEndDate,
    renewal_due_date: null,
    contract_status: STATUS_OPEN,
    notes: createStoredPiiValue(source.notes),
    phone: createStoredPiiValue(source.phone),
    email: createStoredPiiValue(source.email),
    billing_account_number: createStoredPiiValue(source.billingAccountNumber),
    company_name: normalizeText(source.companyName) || null,
    industry: normalizeText(source.industry) || null,
    telecom_provider: normalizeText(source.telecomProvider) || null,
    customer_disposition: normalizeText(source.customerDisposition) || null,
    first_progress_status: normalizeText(source.firstProgressStatus) || null,
    second_progress_status: normalizeText(source.secondProgressStatus) || null,
    additional_progress_status: normalizeText(source.additionalProgressStatus) || null,
    acquisition_channel: normalizeText(source.acquisitionChannel) || null,
    cancellation_reason: normalizeText(source.cancellationReason) || null,
    salesperson: normalizeText(source.salesperson) || null,
    line_count: normalizeNumber(source.lineCount),
    cancelled_line_count: normalizeNumber(source.cancelledLineCount),
    product_id: productId || null,
    churn_date: source.churnDate,
  };
}

async function run() {
  loadEnvFiles();
  const options = parseArgs(process.argv.slice(2));
  const workbookPath = path.resolve(options.file);
  const now = new Date();
  const reportPath = path.resolve(options.backupDir, `${options.reportPrefix}-${getTimestampLabel(now)}.json`);
  const backupPath = path.resolve(options.backupDir, `regional-open-before-sync-${getTimestampLabel(now)}.json`);

  const sourceWorkbook = buildSourceRows(workbookPath);
  const sourceRows = sourceWorkbook.rows;
  const sourceCounts = buildSourceMultiset(sourceRows);

  const client = new Client({
    connectionString: process.env.DATABASE_URL || "postgresql://postgres:1234@127.0.0.1:5432/crmdb",
  });
  await client.connect();

  try {
    const [currentDeals, currentTimelines, regionalProductMap] = await Promise.all([
      loadCurrentOpenDeals(client),
      loadCurrentOpenTimelines(client),
      loadRegionalProductMap(client),
    ]);

    const sourceGroups = buildGroupMap(sourceRows);
    const currentGroups = buildGroupMap(currentDeals);

    const duplicateSourceGroups = [...sourceGroups.entries()]
      .filter(([, rows]) => rows.length > 1)
      .map(([key, rows]) => ({ key, count: rows.length }))
      .slice(0, 20);

    const duplicateCurrentGroups = [...currentGroups.entries()]
      .filter(([, rows]) => rows.length > 1)
      .map(([key, rows]) => ({ key, count: rows.length }))
      .slice(0, 20);

    const allKeys = new Set([...sourceGroups.keys(), ...currentGroups.keys()]);
    const updates = [];
    const creates = [];
    const deletes = [];

    for (const key of allKeys) {
      const sourceGroup = sortWithinGroup(sourceGroups.get(key) || [], canonicalSortKey);
      const currentGroup = sortWithinGroup(currentGroups.get(key) || [], canonicalSortKey);
      const sharedCount = Math.min(sourceGroup.length, currentGroup.length);

      for (let index = 0; index < sharedCount; index += 1) {
        updates.push({
          dealId: currentGroup[index].id,
          source: sourceGroup[index],
        });
      }

      for (let index = sharedCount; index < sourceGroup.length; index += 1) {
        creates.push(sourceGroup[index]);
      }

      for (let index = sharedCount; index < currentGroup.length; index += 1) {
        deletes.push(currentGroup[index]);
      }
    }

    const preview = {
      workbookPath,
      sheetName: sourceWorkbook.sheetName,
      workbookHeaders: sourceWorkbook.headers,
      sourceRowCount: sourceRows.length,
      currentOpenCount: currentDeals.length,
      updateCount: updates.length,
      createCount: creates.length,
      deleteCount: deletes.length,
      duplicateSourceGroups,
      duplicateCurrentGroups,
      apply: options.apply,
    };

    if (!options.apply) {
      saveJsonReport(reportPath, preview);
      console.log(JSON.stringify({ ...preview, reportPath }, null, 2));
      return;
    }

    saveJsonReport(backupPath, {
      generatedAt: now.toISOString(),
      workbookPath,
      sheetName: sourceWorkbook.sheetName,
      currentDeals,
      currentTimelines,
    });

    await client.query("begin");

    for (const row of updates) {
      const productId = regionalProductMap.get(normalizeText(row.source.telecomProvider)) || null;
      const payload = buildUpdateDealRecord(row.source, productId);
      await client.query(
        `
          update deals
          set
            title = $2,
            stage = $3,
            probability = $4,
            expected_close_date = $5,
            inbound_date = $6,
            contract_start_date = $7,
            contract_end_date = $8,
            renewal_due_date = $9,
            contract_status = $10,
            notes = $11,
            phone = $12,
            email = $13,
            billing_account_number = $14,
            company_name = $15,
            industry = $16,
            telecom_provider = $17,
            customer_disposition = $18,
            first_progress_status = $19,
            second_progress_status = $20,
            additional_progress_status = $21,
            acquisition_channel = $22,
            cancellation_reason = $23,
            salesperson = $24,
            line_count = $25,
            cancelled_line_count = $26,
            product_id = $27,
            churn_date = $28
          where id = $1
        `,
        [
          row.dealId,
          payload.title,
          payload.stage,
          payload.probability,
          payload.expected_close_date,
          payload.inbound_date,
          payload.contract_start_date,
          payload.contract_end_date,
          payload.renewal_due_date,
          payload.contract_status,
          payload.notes,
          payload.phone,
          payload.email,
          payload.billing_account_number,
          payload.company_name,
          payload.industry,
          payload.telecom_provider,
          payload.customer_disposition,
          payload.first_progress_status,
          payload.second_progress_status,
          payload.additional_progress_status,
          payload.acquisition_channel,
          payload.cancellation_reason,
          payload.salesperson,
          payload.line_count,
          payload.cancelled_line_count,
          payload.product_id,
          payload.churn_date,
        ],
      );
    }

    for (const source of creates) {
      const productId = regionalProductMap.get(normalizeText(source.telecomProvider)) || null;
      const deal = buildNewDealRecord(source, productId);
      await client.query(
        `
          insert into deals (
            id, title, customer_id, value, stage, probability, expected_close_date,
            inbound_date, contract_start_date, contract_end_date, renewal_due_date,
            contract_status, notes, phone, email, billing_account_number, company_name,
            industry, telecom_provider, customer_disposition, customer_type_detail,
            first_progress_status, second_progress_status, additional_progress_status,
            acquisition_channel, cancellation_reason, salesperson, pre_churn_stage,
            line_count, cancelled_line_count, product_id, churn_date
          ) values (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11,
            $12, $13, $14, $15, $16, $17,
            $18, $19, $20, $21,
            $22, $23, $24,
            $25, $26, $27, $28,
            $29, $30, $31, $32
          )
        `,
        [
          deal.id,
          deal.title,
          deal.customer_id,
          deal.value,
          deal.stage,
          deal.probability,
          deal.expected_close_date,
          deal.inbound_date,
          deal.contract_start_date,
          deal.contract_end_date,
          deal.renewal_due_date,
          deal.contract_status,
          deal.notes,
          deal.phone,
          deal.email,
          deal.billing_account_number,
          deal.company_name,
          deal.industry,
          deal.telecom_provider,
          deal.customer_disposition,
          deal.customer_type_detail,
          deal.first_progress_status,
          deal.second_progress_status,
          deal.additional_progress_status,
          deal.acquisition_channel,
          deal.cancellation_reason,
          deal.salesperson,
          deal.pre_churn_stage,
          deal.line_count,
          deal.cancelled_line_count,
          deal.product_id,
          deal.churn_date,
        ],
      );

      const anchorDate = deal.contract_end_date || deal.contract_start_date || deal.inbound_date || now;
      await client.query(
        `
          insert into deal_timelines (
            id, deal_id, content, author_id, author_name
          ) values ($1, $2, $3, $4, $5)
        `,
        [randomUUID(), deal.id, `${IMPORT_PREFIX} ${formatTimelineDate(anchorDate)} 엑셀 재반영`, null, TIMELINE_AUTHOR_NAME],
      );

      if (normalizeText(source.notes)) {
        await client.query(
          `
            insert into deal_timelines (
              id, deal_id, content, author_id, author_name
            ) values ($1, $2, $3, $4, $5)
          `,
          [randomUUID(), deal.id, `${NOTE_PREFIX} ${normalizeText(source.notes)}`, null, TIMELINE_AUTHOR_NAME],
        );
      }

      if (normalizeText(source.cancellationReason)) {
        const reasonAnchorDate = deal.churn_date || anchorDate;
        await client.query(
          `
            insert into deal_timelines (
              id, deal_id, content, author_id, author_name
            ) values ($1, $2, $3, $4, $5)
          `,
          [
            randomUUID(),
            deal.id,
            `${CANCELLATION_PREFIX} ${formatTimelineDate(reasonAnchorDate)} ${normalizeText(source.cancellationReason)}`,
            null,
            TIMELINE_AUTHOR_NAME,
          ],
        );
      }
    }

    if (deletes.length > 0) {
      const deleteIds = deletes.map((row) => row.id);
      await client.query(`delete from deal_timelines where deal_id = any($1::text[])`, [deleteIds]);
      await client.query(`delete from activities where deal_id = any($1::text[])`, [deleteIds]);
      await client.query(`delete from deals where id = any($1::text[])`, [deleteIds]);
    }

    const finalDeals = await loadCurrentOpenDeals(client);
    const finalCounts = buildSourceMultiset(
      finalDeals.map((deal) => ({
        billingAccountNumber: deal.billingAccountNumber,
        companyName: deal.companyName,
        industry: deal.industry,
        lineCount: deal.lineCount,
        contractStatus: deal.contract_status,
        inboundDate: deal.inboundDate,
        contractStartDate: deal.contractStartDate,
        contractEndDate: deal.contractEndDate,
        churnDate: deal.churnDate,
        cancelledLineCount: deal.cancelledLineCount,
        telecomProvider: deal.telecomProvider,
        customerName: deal.customerName,
        phone: deal.phonePlain,
        email: deal.emailPlain,
        customerDisposition: deal.customerDisposition,
        notes: deal.notesPlain,
        firstProgressStatus: deal.firstProgressStatus,
        secondProgressStatus: deal.secondProgressStatus,
        additionalProgressStatus: deal.additionalProgressStatus,
        acquisitionChannel: deal.acquisitionChannel,
        cancellationReason: deal.cancellationReason,
        salesperson: deal.salesperson,
      })),
    );

    const mismatches = [];
    const allCanonicalKeys = new Set([...sourceCounts.keys(), ...finalCounts.keys()]);
    for (const key of allCanonicalKeys) {
      const sourceCount = sourceCounts.get(key) || 0;
      const finalCount = finalCounts.get(key) || 0;
      if (sourceCount !== finalCount) {
        mismatches.push({
          row: JSON.parse(key),
          sourceCount,
          finalCount,
        });
      }
    }

    if (mismatches.length > 0) {
      throw new Error(`검증 실패: ${mismatches.length}개 불일치가 있습니다.`);
    }

    await client.query("commit");

    const report = {
      ...preview,
      backupPath,
      finalOpenCount: finalDeals.length,
      verified: finalDeals.length === sourceRows.length && mismatches.length === 0,
      mismatches,
    };
    saveJsonReport(reportPath, report);
    console.log(JSON.stringify({ ...report, reportPath }, null, 2));
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
