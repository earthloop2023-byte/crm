import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import XLSX from "xlsx";
import { Client } from "pg";

function parseArgs(argv) {
  const args = {
    file: "",
    apply: false,
    reportPrefix: "deposit-bank-update-report",
  };

  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
    else if (arg.startsWith("--file=")) args.file = arg.slice("--file=".length);
    else if (arg.startsWith("--report-prefix=")) args.reportPrefix = arg.slice("--report-prefix=".length);
  }

  if (!args.file) {
    throw new Error("--file is required");
  }

  return args;
}

function nowStamp() {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}-${mi}-${ss}`;
}

function normalizeName(value) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function parseWorkbookDateKey(sheetName, rawValue) {
  const yearMatch = String(sheetName).match(/(\d{2})\./);
  const monthDayMatch = String(rawValue ?? "").match(/(\d{2})\s*\uc6d4\s*(\d{2})\s*\uc77c/);
  if (!yearMatch || !monthDayMatch) return "";
  return `20${yearMatch[1]}-${monthDayMatch[1]}-${monthDayMatch[2]}`;
}

function shiftDateKey(dateKey, deltaDays) {
  const date = new Date(`${dateKey}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatDbDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function readWorkbookRows(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const rows = [];

  for (const sheetName of workbook.SheetNames) {
    const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: null,
      raw: false,
    });

    for (const row of sheetRows.slice(4)) {
      const [rawDate, rawAmount, rawName] = row;
      if (rawDate == null || rawAmount == null || rawName == null) continue;

      const workbookDateKey = parseWorkbookDateKey(sheetName, rawDate);
      const amount = Number(String(rawAmount).replace(/[^0-9.-]/g, ""));
      const depositorName = normalizeName(rawName);

      if (!workbookDateKey || !Number.isFinite(amount) || !depositorName) continue;

      // Existing deposit rows are stored one day behind the workbook date in this dataset.
      rows.push({
        sourceSheet: sheetName,
        workbookDateKey,
        matchedDateKey: shiftDateKey(workbookDateKey, -1),
        amount,
        depositorName,
      });
    }
  }

  return rows;
}

function buildWorkbookCountMap(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = `${row.matchedDateKey}|${row.amount}|${row.depositorName}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

async function fetchDeposits(client) {
  const result = await client.query(`
    SELECT id, deposit_date, depositor_name, deposit_amount, deposit_bank
    FROM deposits
    ORDER BY deposit_date ASC, id ASC
  `);
  return result.rows;
}

async function updateDepositBanks(client, updates) {
  for (const update of updates) {
    await client.query(
      `UPDATE deposits SET deposit_bank = $2 WHERE id = $1`,
      [update.id, update.depositBank],
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL || "postgres://crm:crm@127.0.0.1:5432/crmdb";
  const workbookPath = path.resolve(args.file);

  const workbookRows = readWorkbookRows(workbookPath);
  const workbookCounts = buildWorkbookCountMap(workbookRows);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const deposits = await fetchDeposits(client);
    const updates = [];
    const matched = [];
    const unmatched = [];
    let matchedCount = 0;

    for (const deposit of deposits) {
      const key = `${formatDbDateKey(deposit.deposit_date)}|${Number(deposit.deposit_amount || 0)}|${normalizeName(deposit.depositor_name)}`;
      const remaining = workbookCounts.get(key) || 0;
      const nextBank = remaining > 0 ? "\uad6d\ubbfc" : "\ud558\ub098";
      if (remaining > 0) {
        workbookCounts.set(key, remaining - 1);
        matchedCount += 1;
      }

      if (deposit.deposit_bank !== nextBank) {
        updates.push({ id: deposit.id, depositBank: nextBank });
      }

      const sampleRow = {
        id: deposit.id,
        key,
        depositDate: deposit.deposit_date,
        depositAmount: Number(deposit.deposit_amount || 0),
        depositorName: deposit.depositor_name,
        depositBank: nextBank,
      };

      if (remaining > 0) {
        if (matched.length < 20) matched.push(sampleRow);
      } else if (unmatched.length < 20) {
        unmatched.push(sampleRow);
      }
    }

    if (args.apply && updates.length > 0) {
      await client.query("BEGIN");
      await updateDepositBanks(client, updates);
      await client.query("COMMIT");
    }

    const leftoverWorkbookMatches = [...workbookCounts.values()].reduce((sum, value) => sum + Number(value || 0), 0);
    const summary = {
      generatedAt: new Date().toISOString(),
      workbookPath,
      apply: args.apply,
      workbookRows: workbookRows.length,
      deposits: deposits.length,
      matchedToKookmin: matchedCount,
      updatedRows: updates.length,
      targetKookminRows: updates.filter((row) => row.depositBank === "\uad6d\ubbfc").length,
      targetHanaRows: updates.filter((row) => row.depositBank === "\ud558\ub098").length,
      leftoverWorkbookRows: leftoverWorkbookMatches,
      matchedSample: matched,
      unmatchedSample: unmatched,
    };

    const reportDir = path.resolve(process.cwd(), "backups");
    await fs.mkdir(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `${args.reportPrefix}-${nowStamp()}.json`);
    await fs.writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

    console.log(`REPORT ${reportPath}`);
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
