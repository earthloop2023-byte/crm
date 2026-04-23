import fs from "node:fs/promises";
import path from "node:path";
import XLSX from "xlsx";
import { Client } from "pg";

function parseArgs(argv) {
  const args = {
    file: "",
    apply: false,
    from: "2025-12-01",
    to: "2026-03-01",
    reportPrefix: "contract-vat-from-profit-workbook",
  };

  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
    else if (arg.startsWith("--file=")) args.file = arg.slice("--file=".length);
    else if (arg.startsWith("--from=")) args.from = arg.slice("--from=".length);
    else if (arg.startsWith("--to=")) args.to = arg.slice("--to=".length);
    else if (arg.startsWith("--report-prefix=")) args.reportPrefix = arg.slice("--report-prefix=".length);
  }

  if (!args.file) {
    throw new Error("--file is required");
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  return args;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeWorkbookDate(rawValue, year, month) {
  const digits = String(rawValue ?? "").replace(/[^0-9]/g, "");
  const day = digits ? digits.slice(-2).padStart(2, "0") : "01";
  return `${year}-${month}-${day}`;
}

function buildWorkbookRows(workbook) {
  const rows = [];

  for (const sheetName of workbook.SheetNames) {
    const monthMatch = /^(\d{2})\.(\d{1,2})월$/.exec(sheetName);
    if (!monthMatch) continue;

    const year = `20${monthMatch[1]}`;
    const month = monthMatch[2].padStart(2, "0");
    const sheet = workbook.Sheets[sheetName];
    const values = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

    for (let index = 3; index < values.length; index += 1) {
      const row = values[index];
      if (!row) continue;

      const contractDate = normalizeWorkbookDate(row[0], year, month);
      const customerName = normalizeText(row[1]);
      const userIdentifier = normalizeText(row[2]);
      const productName = normalizeText(row[3]);
      const totalSupply = Number(row[8] ?? 0);

      if (!customerName || !productName || !Number.isFinite(totalSupply) || totalSupply <= 0) {
        continue;
      }

      rows.push({
        contractDate,
        customerName,
        userIdentifier,
        productName,
        supplyAmount: Math.round(totalSupply),
        supplyWithVatAmount: Math.round(totalSupply * 1.1),
      });
    }
  }

  return rows;
}

function buildWorkbookLookup(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = [row.contractDate, row.customerName, row.userIdentifier, row.productName].join("||");
    const bucket = map.get(key) ?? [];
    bucket.push(row);
    map.set(key, bucket);
  }
  return map;
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
  const workbook = XLSX.readFile(args.file, { cellDates: true });
  const workbookRows = buildWorkbookRows(workbook);
  const workbookLookup = buildWorkbookLookup(workbookRows);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows: contractRows } = await client.query(
    `
      select
        id,
        to_char(contract_date + interval '9 hours', 'YYYY-MM-DD') as contract_date,
        trim(customer_name) as customer_name,
        coalesce(trim(user_identifier), '') as user_identifier,
        trim(products) as products,
        coalesce(cost, 0)::bigint as cost,
        coalesce(invoice_issued, '') as invoice_issued
      from contracts
      where contract_date >= $1
        and contract_date < $2
      order by contract_date asc, id asc
    `,
    [args.from, args.to],
  );

  const report = {
    workbookRows: workbookRows.length,
    contractRows: contractRows.length,
    deterministicSupplyMatches: 0,
    deterministicVatMatches: 0,
    ambiguousMatches: 0,
    blanksFilledToExcluded: 0,
    blanksFilledToIncluded: 0,
    unchangedIncluded: 0,
    unchangedExcluded: 0,
    noWorkbookMatch: 0,
    sampleUpdated: [],
  };

  if (args.apply) {
    await client.query("begin");
  }

  try {
    for (const row of contractRows) {
      const key = [row.contract_date, row.customer_name, row.user_identifier, row.products].join("||");
      const workbookOptions = workbookLookup.get(key) ?? [];
      if (workbookOptions.length === 0) {
        report.noWorkbookMatch += 1;
        continue;
      }

      const supplyMatches = workbookOptions.filter((item) => item.supplyAmount === Number(row.cost));
      const supplyWithVatMatches = workbookOptions.filter((item) => item.supplyWithVatAmount === Number(row.cost));

      if (supplyMatches.length > 0 && supplyWithVatMatches.length === 0) {
        report.deterministicSupplyMatches += 1;
        if (!row.invoice_issued) {
          report.blanksFilledToExcluded += 1;
          if (report.sampleUpdated.length < 30) {
            report.sampleUpdated.push({
              id: row.id,
              contractDate: row.contract_date,
              customerName: row.customer_name,
              userIdentifier: row.user_identifier,
              product: row.products,
              cost: Number(row.cost),
              invoiceIssued: "미포함",
            });
          }
          if (args.apply) {
            await client.query(`update contracts set invoice_issued = '미포함' where id = $1`, [row.id]);
          }
        } else if (row.invoice_issued === "미포함") {
          report.unchangedExcluded += 1;
        }
        continue;
      }

      if (supplyWithVatMatches.length > 0 && supplyMatches.length === 0) {
        report.deterministicVatMatches += 1;
        if (!row.invoice_issued) {
          report.blanksFilledToIncluded += 1;
          if (report.sampleUpdated.length < 30) {
            report.sampleUpdated.push({
              id: row.id,
              contractDate: row.contract_date,
              customerName: row.customer_name,
              userIdentifier: row.user_identifier,
              product: row.products,
              cost: Number(row.cost),
              invoiceIssued: "포함",
            });
          }
          if (args.apply) {
            await client.query(`update contracts set invoice_issued = '포함' where id = $1`, [row.id]);
          }
        } else if (row.invoice_issued === "포함") {
          report.unchangedIncluded += 1;
        }
        continue;
      }

      if (supplyMatches.length > 0 && supplyWithVatMatches.length > 0) {
        report.ambiguousMatches += 1;
      }
    }

    if (args.apply) {
      await client.query("commit");
    }
  } catch (error) {
    if (args.apply) {
      await client.query("rollback");
    }
    throw error;
  } finally {
    await client.end();
  }

  const reportDir = path.resolve("backups", "vat-workbook");
  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `${args.reportPrefix}-${nowStamp()}.json`);
  await fs.writeFile(reportPath, JSON.stringify({ ...report, apply: args.apply, file: args.file }, null, 2), "utf8");

  console.log(JSON.stringify({ ...report, apply: args.apply, reportPath }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
