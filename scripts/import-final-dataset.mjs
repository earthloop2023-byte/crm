import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import XLSX from "xlsx";
import { Client } from "pg";

const SHEET_TABLE_SPECS = [
  { sheetName: "고객", tableName: "customers" },
  { sheetName: "상품", tableName: "products" },
  { sheetName: "상품단가이력", tableName: "product_rate_histories" },
  { sheetName: "계약", tableName: "contracts" },
  { sheetName: "결제", tableName: "payments" },
  { sheetName: "입금", tableName: "deposits" },
];

const CLEAR_ONLY_TABLES = [
  "contacts",
  "customer_counselings",
  "customer_change_histories",
  "customer_files",
  "activities",
  "refunds",
  "keeps",
  "import_batches",
  "import_staging_rows",
  "import_mappings",
];

const PRESERVED_TABLES = [
  "deals",
  "deal_timelines",
  "regional_unpaid_uploads",
];

const INSERT_ORDER = [
  "customers",
  "products",
  "product_rate_histories",
  "contracts",
  "payments",
  "deposits",
];

function parseArgs(argv) {
  const args = {
    file: "",
    apply: false,
    reportPrefix: "final-dataset-import-report",
  };

  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
    else if (arg.startsWith("--file=")) args.file = arg.slice("--file=".length);
    else if (arg.startsWith("--report-prefix=")) args.reportPrefix = arg.slice("--report-prefix=".length);
  }

  if (!args.file) {
    throw new Error("--file=엑셀경로가 필요합니다.");
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

function quoteIdentifier(name) {
  return `"${String(name).replace(/"/g, "\"\"")}"`;
}

function toSnakeCase(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[ -]+/g, "_")
    .toLowerCase();
}

function normalizeCellValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

function normalizeRowKeys(row) {
  const normalized = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[toSnakeCase(key)] = normalizeCellValue(value);
  }
  return normalized;
}

function readSheetRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`시트를 찾을 수 없습니다: ${sheetName}`);
  }

  return XLSX.utils
    .sheet_to_json(sheet, {
      defval: null,
      raw: true,
    })
    .map((row) => normalizeRowKeys(row));
}

function remapContractManagerIds(contractRows, workbookUserRows, currentUserRows) {
  const workbookUserById = new Map(
    workbookUserRows
      .filter((row) => row.id && row.login_id)
      .map((row) => [String(row.id), row]),
  );
  const currentUserIdByLoginId = new Map(
    currentUserRows
      .filter((row) => row.login_id && row.id)
      .map((row) => [String(row.login_id), String(row.id)]),
  );

  return contractRows.map((row) => {
    if (!row.manager_id) return row;
    const workbookUser = workbookUserById.get(String(row.manager_id));
    if (!workbookUser?.login_id) return row;
    const remappedManagerId = currentUserIdByLoginId.get(String(workbookUser.login_id));
    return remappedManagerId ? { ...row, manager_id: remappedManagerId } : row;
  });
}

async function getPublicTableNames(client) {
  const result = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  return result.rows.map((row) => String(row.table_name));
}

async function fetchTableRows(client, tableName) {
  const result = await client.query(`SELECT * FROM ${quoteIdentifier(tableName)}`);
  return result.rows;
}

async function getTableMetadata(client, tableName) {
  const result = await client.query(
    `
      SELECT column_name, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `,
    [tableName],
  );

  return {
    columns: result.rows.map((row) => String(row.column_name)),
    typeByColumn: Object.fromEntries(result.rows.map((row) => [String(row.column_name), String(row.udt_name)])),
  };
}

function convertBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value ?? "").trim().toLowerCase();
  if (["true", "t", "1", "y", "yes"].includes(text)) return true;
  if (["false", "f", "0", "n", "no"].includes(text)) return false;
  return null;
}

function convertNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/,/g, "").trim();
  if (!cleaned) return null;
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
}

function convertTimestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function convertValueForColumn(value, udtName) {
  if (value === undefined || value === null || value === "") return null;

  if (udtName === "bool") return convertBoolean(value);
  if (["int2", "int4", "int8", "float4", "float8", "numeric"].includes(udtName)) return convertNumber(value);
  if (["timestamp", "timestamptz", "date"].includes(udtName)) return convertTimestamp(value);
  if ((udtName === "json" || udtName === "jsonb") && typeof value === "object") return JSON.stringify(value);

  return value;
}

function mapRowToColumns(row, knownColumns) {
  const mapped = {};
  const known = new Set(knownColumns);
  for (const [rawKey, rawValue] of Object.entries(row ?? {})) {
    const snake = toSnakeCase(rawKey);
    if (known.has(rawKey)) {
      mapped[rawKey] = rawValue;
    } else if (known.has(snake)) {
      mapped[snake] = rawValue;
    }
  }
  return mapped;
}

async function insertRows(client, tableName, rawRows) {
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return 0;
  }

  const { columns, typeByColumn } = await getTableMetadata(client, tableName);
  const normalizedRows = rawRows.map((row) => mapRowToColumns(row, columns));
  const activeColumns = columns.filter((column) => normalizedRows.some((row) => Object.hasOwn(row, column)));

  if (activeColumns.length === 0) return 0;

  const maxRowsByParamLimit = Math.max(1, Math.floor(60000 / activeColumns.length));
  const batchSize = Math.min(1000, maxRowsByParamLimit);
  let inserted = 0;

  for (let offset = 0; offset < normalizedRows.length; offset += batchSize) {
    const batch = normalizedRows.slice(offset, offset + batchSize);
    const values = [];
    const placeholders = [];
    let paramIndex = 1;

    for (const row of batch) {
      const rowPlaceholders = [];
      for (const column of activeColumns) {
        values.push(convertValueForColumn(row[column], typeByColumn[column]));
        rowPlaceholders.push(`$${paramIndex++}`);
      }
      placeholders.push(`(${rowPlaceholders.join(",")})`);
    }

    await client.query(
      `
        INSERT INTO ${quoteIdentifier(tableName)} (${activeColumns.map(quoteIdentifier).join(",")})
        VALUES ${placeholders.join(",")}
      `,
      values,
    );

    inserted += batch.length;
  }

  return inserted;
}

function collectNonNullValues(rows, key) {
  return new Set(
    rows
      .map((row) => row[key])
      .filter((value) => value !== null && value !== undefined && value !== ""),
  );
}

function validateReferenceSet(label, sourceSet, targetSet) {
  const missing = [...sourceSet].filter((value) => !targetSet.has(value));
  if (missing.length > 0) {
    throw new Error(`${label} 참조 누락: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? " ..." : ""}`);
  }
}

function runBackup(databaseUrl) {
  const result = spawnSync(process.execPath, ["scripts/db-backup-json.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || "백업 실패");
  }

  const stdout = String(result.stdout || "");
  const match = stdout.match(/JSON backup created:\s*(.+)/);
  return match?.[1]?.trim() || null;
}

async function fetchCount(client, tableName) {
  const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(tableName)}`);
  return Number(result.rows[0]?.count || 0);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL || "";
  if (!databaseUrl) {
    throw new Error("DATABASE_URL이 필요합니다.");
  }

  const workbookPath = path.resolve(args.file);
  const workbook = XLSX.readFile(workbookPath, { cellDates: true });
  const workbookUsers = readSheetRows(workbook, "사용자");
  const importedTables = Object.fromEntries(
    SHEET_TABLE_SPECS.map(({ sheetName, tableName }) => [tableName, readSheetRows(workbook, sheetName)]),
  );

  importedTables.refunds = [];
  importedTables.keeps = [];
  importedTables.contacts = [];
  importedTables.customer_counselings = [];
  importedTables.customer_change_histories = [];
  importedTables.customer_files = [];
  importedTables.activities = [];
  importedTables.import_batches = [];
  importedTables.import_staging_rows = [];
  importedTables.import_mappings = [];

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const publicTables = await getPublicTableNames(client);
    const targetTables = [...INSERT_ORDER, ...CLEAR_ONLY_TABLES];

    const requiredTables = [...targetTables, ...PRESERVED_TABLES];
    const missingTables = requiredTables.filter((tableName) => !publicTables.includes(tableName));
    if (missingTables.length > 0) {
      throw new Error(`대상 DB에 없는 테이블: ${missingTables.join(", ")}`);
    }

    const existingUsers = await client.query(`SELECT id, login_id FROM users`);
    importedTables.contracts = remapContractManagerIds(importedTables.contracts, workbookUsers, existingUsers.rows);
    const userIds = new Set(existingUsers.rows.map((row) => row.id));
    validateReferenceSet("계약.manager_id", collectNonNullValues(importedTables.contracts, "manager_id"), userIds);

    const customerIds = collectNonNullValues(importedTables.customers, "id");
    const productIds = collectNonNullValues(importedTables.products, "id");
    const contractIds = collectNonNullValues(importedTables.contracts, "id");

    validateReferenceSet("계약.customer_id", collectNonNullValues(importedTables.contracts, "customer_id"), customerIds);
    validateReferenceSet("상품단가이력.product_id", collectNonNullValues(importedTables.product_rate_histories, "product_id"), productIds);
    validateReferenceSet("결제.contract_id", collectNonNullValues(importedTables.payments, "contract_id"), contractIds);
    validateReferenceSet("입금.contract_id", collectNonNullValues(importedTables.deposits, "contract_id"), contractIds);

    const report = {
      generatedAt: new Date().toISOString(),
      workbookPath,
      apply: args.apply,
      backupPath: null,
      preservedTables: {},
      importedSheetCounts: Object.fromEntries(SHEET_TABLE_SPECS.map(({ sheetName, tableName }) => [tableName, importedTables[tableName].length])),
      clearedOnlyTables: CLEAR_ONLY_TABLES,
      finalTableTargets: Object.fromEntries(targetTables.map((tableName) => [tableName, importedTables[tableName]?.length ?? 0])),
      insertedCounts: {},
      afterCounts: {},
    };

    const preservedRows = {};
    for (const tableName of PRESERVED_TABLES) {
      preservedRows[tableName] = await fetchTableRows(client, tableName);
      report.preservedTables[tableName] = preservedRows[tableName].length;
    }

    if (args.apply) {
      report.backupPath = runBackup(databaseUrl);

      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '15s'");
      await client.query("SET LOCAL statement_timeout = '0'");
      await client.query(`TRUNCATE TABLE ${targetTables.map(quoteIdentifier).join(", ")} RESTART IDENTITY CASCADE`);

      for (const tableName of INSERT_ORDER) {
        report.insertedCounts[tableName] = await insertRows(client, tableName, importedTables[tableName]);
      }

      for (const tableName of CLEAR_ONLY_TABLES) {
        report.insertedCounts[tableName] = 0;
      }

      report.insertedCounts.deals = await insertRows(client, "deals", preservedRows.deals);
      report.insertedCounts.deal_timelines = await insertRows(client, "deal_timelines", preservedRows.deal_timelines);
      report.insertedCounts.regional_unpaid_uploads = await insertRows(client, "regional_unpaid_uploads", preservedRows.regional_unpaid_uploads);

      await client.query("COMMIT");
    }

    for (const tableName of [...targetTables, ...PRESERVED_TABLES]) {
      report.afterCounts[tableName] = await fetchCount(client, tableName);
    }

    const reportDir = path.resolve(process.cwd(), "backups");
    await fs.mkdir(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `${args.reportPrefix}-${nowStamp()}.json`);
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    console.log(`REPORT ${reportPath}`);
    if (report.backupPath) console.log(`BACKUP ${report.backupPath}`);
    for (const tableName of targetTables) {
      console.log(`${tableName}: ${report.afterCounts[tableName]}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
