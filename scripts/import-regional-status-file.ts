import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import XLSX from "xlsx";

import { addKoreanBusinessDays } from "../shared/korean-business-days";
import { storage } from "../server/storage";

type DealPayload = {
  title: string;
  value: number;
  stage: string;
  probability: number;
  expectedCloseDate: Date | null;
  inboundDate: Date | null;
  contractStartDate: Date | null;
  contractEndDate: Date | null;
  churnDate: Date | null;
  renewalDueDate: null;
  contractStatus: string;
  notes: string | null;
  phone: string | null;
  email: string | null;
  billingAccountNumber: string | null;
  companyName: string | null;
  industry: string | null;
  telecomProvider: string | null;
  customerDisposition: string | null;
  customerTypeDetail: null;
  firstProgressStatus: string | null;
  secondProgressStatus: string | null;
  additionalProgressStatus: string | null;
  acquisitionChannel: string | null;
  cancellationReason: string | null;
  salesperson: string | null;
  preChurnStage: null;
  lineCount: number;
  cancelledLineCount: number;
  productId: null;
  customerId: null;
};

type CanonicalCounts = Map<string, number>;

function parseArgs(argv: string[]) {
  const args = {
    file: "",
    reportPrefix: "regional-import-report",
    defaultStatus: "",
  };

  for (const arg of argv) {
    if (arg.startsWith("--file=")) args.file = arg.slice("--file=".length);
    else if (arg.startsWith("--report-prefix=")) args.reportPrefix = arg.slice("--report-prefix=".length);
    else if (arg.startsWith("--default-status=")) args.defaultStatus = arg.slice("--default-status=".length);
  }

  if (!args.file) {
    throw new Error("--file=엑셀경로가 필요합니다.");
  }

  return args;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeNumber(value: unknown): number {
  const text = normalizeText(value).replace(/,/g, "");
  if (!text) return 0;
  const numberValue = Number(text);
  return Number.isFinite(numberValue) ? Math.round(numberValue) : 0;
}

function stageFromStatus(status: string): "new" | "active" | "churned" {
  if (status === "개통") return "active";
  if (status === "해지") return "churned";
  return "new";
}

function toDateOnlyString(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) return null;

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    return `${year.toString().padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const dash = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dash) {
    return `${dash[1]}-${String(Number(dash[2])).padStart(2, "0")}-${String(Number(dash[3])).padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear().toString().padStart(4, "0")}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function toDate(value: unknown): Date | null {
  const dateOnly = toDateOnlyString(value);
  return dateOnly ? new Date(`${dateOnly}T12:00:00+09:00`) : null;
}

function addOneDay(date: Date | null): Date | null {
  return addKoreanBusinessDays(date, 1);
}

function formatTimelineDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}.${String(parsed.getMonth() + 1).padStart(2, "0")}.${String(parsed.getDate()).padStart(2, "0")}`;
}

function canonicalFromPayload(payload: DealPayload): string {
  const dateValue = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : "");
  return JSON.stringify({
    title: normalizeText(payload.title),
    billingAccountNumber: normalizeText(payload.billingAccountNumber),
    companyName: normalizeText(payload.companyName),
    industry: normalizeText(payload.industry),
    lineCount: normalizeNumber(payload.lineCount),
    contractStatus: normalizeText(payload.contractStatus),
    inboundDate: dateValue(payload.inboundDate),
    contractStartDate: dateValue(payload.contractStartDate),
    contractEndDate: dateValue(payload.contractEndDate),
    churnDate: dateValue(payload.churnDate),
    cancelledLineCount: normalizeNumber(payload.cancelledLineCount),
    telecomProvider: normalizeText(payload.telecomProvider),
    phone: normalizeText(payload.phone),
    email: normalizeText(payload.email),
    customerDisposition: normalizeText(payload.customerDisposition),
    notes: normalizeText(payload.notes),
    firstProgressStatus: normalizeText(payload.firstProgressStatus),
    secondProgressStatus: normalizeText(payload.secondProgressStatus),
    additionalProgressStatus: normalizeText(payload.additionalProgressStatus),
    acquisitionChannel: normalizeText(payload.acquisitionChannel),
    cancellationReason: normalizeText(payload.cancellationReason),
    salesperson: normalizeText(payload.salesperson),
    stage: normalizeText(payload.stage),
  });
}

function canonicalFromDeal(deal: Record<string, unknown>): string {
  const dateValue = (value: unknown) => {
    if (!value) return "";
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
  };

  return JSON.stringify({
    title: normalizeText(deal.title),
    billingAccountNumber: normalizeText(deal.billingAccountNumber),
    companyName: normalizeText(deal.companyName),
    industry: normalizeText(deal.industry),
    lineCount: normalizeNumber(deal.lineCount),
    contractStatus: normalizeText(deal.contractStatus),
    inboundDate: dateValue(deal.inboundDate ?? deal.expectedCloseDate),
    contractStartDate: dateValue(deal.contractStartDate),
    contractEndDate: dateValue(deal.contractEndDate),
    churnDate: dateValue(deal.churnDate),
    cancelledLineCount: normalizeNumber(deal.cancelledLineCount),
    telecomProvider: normalizeText(deal.telecomProvider),
    phone: normalizeText(deal.phone),
    email: normalizeText(deal.email),
    customerDisposition: normalizeText(deal.customerDisposition),
    notes: normalizeText(deal.notes),
    firstProgressStatus: normalizeText(deal.firstProgressStatus),
    secondProgressStatus: normalizeText(deal.secondProgressStatus),
    additionalProgressStatus: normalizeText((deal as any).additionalProgressStatus),
    acquisitionChannel: normalizeText(deal.acquisitionChannel),
    cancellationReason: normalizeText(deal.cancellationReason),
    salesperson: normalizeText(deal.salesperson),
    stage: normalizeText(deal.stage),
  });
}

function incrementCount(map: CanonicalCounts, key: string, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function buildPayloadsFromRows(rows: Record<string, unknown>[], defaultStatus: string): DealPayload[] {
  return rows.map((row, index) => {
    const customerName = normalizeText(row["고객명"]);
    const companyName = normalizeText(row["상호"]);
    const billingAccountNumber = normalizeText(row["청구계정번호"]);
    const contractStatus = normalizeText(row["상태"]) || defaultStatus;
    const inboundDate = toDate(row["인입일"]);
    const contractStartDate = toDate(row["등록일"]);
    const contractEndDate = toDate(row["개통일"]) ?? addOneDay(contractStartDate);
    const churnDate = toDate(row["해지일"]);

    return {
      title: customerName || companyName || billingAccountNumber || `${defaultStatus || "타지역"}-${index + 1}`,
      value: 0,
      stage: stageFromStatus(contractStatus),
      probability: 0,
      expectedCloseDate: inboundDate,
      inboundDate,
      contractStartDate,
      contractEndDate,
      churnDate,
      renewalDueDate: null,
      contractStatus,
      notes: normalizeText(row["특이사항 /CS메모"]) || null,
      phone: normalizeText(row["연락처"]) || null,
      email: normalizeText(row["이메일"]) || null,
      billingAccountNumber: billingAccountNumber || null,
      companyName: companyName || null,
      industry: normalizeText(row["업종/카테고리"]) || null,
      telecomProvider: normalizeText(row["통신사"]) || null,
      customerDisposition: normalizeText(row["고객 성향"]) || null,
      customerTypeDetail: null,
      firstProgressStatus: normalizeText(row["1차 진행상황"]) || null,
      secondProgressStatus: normalizeText(row["2차 진행상황"]) || null,
      additionalProgressStatus: normalizeText(row["추가 진행상황"]) || null,
      acquisitionChannel: normalizeText(row["유입경로"]) || null,
      cancellationReason: normalizeText(row["해지 사유"]) || null,
      salesperson: normalizeText(row["영업자"]) || null,
      preChurnStage: null,
      lineCount: normalizeNumber(row["총회선수"]),
      cancelledLineCount: normalizeNumber(row["해지회선수"]),
      productId: null,
      customerId: null,
    };
  });
}

function saveReport(reportPrefix: string, report: unknown): string {
  const backupDir = path.resolve(process.cwd(), "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(backupDir, `${reportPrefix}-${timestamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  return reportPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workbook = XLSX.readFile(path.resolve(args.file));
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "", raw: false });
  const payloads = buildPayloadsFromRows(rows, args.defaultStatus);

  const sourceCounts = new Map<string, number>();
  payloads.forEach((payload) => incrementCount(sourceCounts, canonicalFromPayload(payload)));

  const beforeDeals = await storage.getDeals();
  const beforeCounts = new Map<string, number>();
  beforeDeals.forEach((deal) => incrementCount(beforeCounts, canonicalFromDeal(deal as unknown as Record<string, unknown>)));

  const duplicateOverSource: Array<{ key: Record<string, unknown>; existingCount: number; sourceCount: number }> = [];
  for (const [key, sourceCount] of sourceCounts.entries()) {
    const existingCount = beforeCounts.get(key) || 0;
    if (existingCount > sourceCount) {
      duplicateOverSource.push({
        key: JSON.parse(key) as Record<string, unknown>,
        existingCount,
        sourceCount,
      });
    }
  }

  if (duplicateOverSource.length > 0) {
    const reportPath = saveReport(args.reportPrefix, {
      file: path.resolve(args.file),
      sheetName,
      sourceRows: payloads.length,
      beforeRows: beforeDeals.length,
      duplicateOverSource,
      createdAt: new Date().toISOString(),
    });
    throw new Error(`기존 데이터가 원본보다 많은 중복 상태입니다. 보고서: ${reportPath}`);
  }

  const existingConsumed = new Map<string, number>();
  const rowsToCreate: DealPayload[] = [];
  for (const payload of payloads) {
    const key = canonicalFromPayload(payload);
    const alreadyExisting = beforeCounts.get(key) || 0;
    const consumed = existingConsumed.get(key) || 0;
    if (consumed < alreadyExisting) {
      existingConsumed.set(key, consumed + 1);
      continue;
    }
    rowsToCreate.push(payload);
  }

  const createdIds: string[] = [];
  try {
    for (const payload of rowsToCreate) {
      const created = await storage.createDeal(payload as any);
      createdIds.push(created.id);

      const timelineDate =
        created.inboundDate ||
        created.contractStartDate ||
        created.contractEndDate ||
        created.churnDate ||
        new Date();

      await storage.createDealTimeline({
        dealId: created.id,
        content: `[${created.contractStatus || payload.contractStatus}] ${formatTimelineDate(timelineDate)} 등록`,
        authorId: null,
        authorName: "시스템",
      });

      if (created.cancellationReason && String(created.cancellationReason).trim()) {
        const reasonDate = created.churnDate || timelineDate;
        await storage.createDealTimeline({
          dealId: created.id,
          content: `[해지사유] ${formatTimelineDate(reasonDate)} ${String(created.cancellationReason).trim()}`,
          authorId: null,
          authorName: "시스템",
        });
      }
    }
  } catch (error) {
    for (const id of createdIds.reverse()) {
      try {
        await storage.deleteDeal(id);
      } catch {
        // ignore rollback cleanup failures
      }
    }
    throw error;
  }

  const afterDeals = await storage.getDeals();
  const afterCounts = new Map<string, number>();
  afterDeals.forEach((deal) => incrementCount(afterCounts, canonicalFromDeal(deal as unknown as Record<string, unknown>)));

  const expectedCounts = new Map<string, number>(beforeCounts);
  for (const [key, sourceCount] of sourceCounts.entries()) {
    expectedCounts.set(key, sourceCount);
  }

  const mismatches: Array<{ key: Record<string, unknown>; expectedCount: number; actualCount: number }> = [];
  const allKeys = new Set([...expectedCounts.keys(), ...afterCounts.keys()]);
  for (const key of allKeys) {
    const expectedCount = expectedCounts.get(key) || 0;
    const actualCount = afterCounts.get(key) || 0;
    if (expectedCount !== actualCount) {
      mismatches.push({
        key: JSON.parse(key) as Record<string, unknown>,
        expectedCount,
        actualCount,
      });
    }
  }

  const report = {
    file: path.resolve(args.file),
    sheetName,
    sourceRows: payloads.length,
    beforeRows: beforeDeals.length,
    createdRows: createdIds.length,
    skippedAsExistingRows: payloads.length - rowsToCreate.length,
    afterRows: afterDeals.length,
    verified:
      createdIds.length === rowsToCreate.length &&
      mismatches.length === 0,
    mismatches,
    createdAt: new Date().toISOString(),
  };
  const reportPath = saveReport(args.reportPrefix, report);
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));

  if (mismatches.length > 0) {
    throw new Error(`검증 실패: ${reportPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
