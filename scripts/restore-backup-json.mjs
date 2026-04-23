import fs from "node:fs/promises";
import process from "node:process";
import { Client } from "pg";
import { deserializeBackupContent } from "./backup-security.mjs";

const TABLE_ALIASES = {
  users: "users",
  customers: "customers",
  contacts: "contacts",
  deals: "deals",
  dealTimelines: "deal_timelines",
  activities: "activities",
  payments: "payments",
  products: "products",
  productRateHistories: "product_rate_histories",
  contracts: "contracts",
  refunds: "refunds",
  keeps: "keeps",
  deposits: "deposits",
  notices: "notices",
  pagePermissions: "page_permissions",
  systemSettings: "system_settings",
  systemLogs: "system_logs",
  quotations: "quotations",
  importBatches: "import_batches",
  importStagingRows: "import_staging_rows",
  importMappings: "import_mappings",
  databaseBackups: "database_backups",
};

const PREFERRED_INSERT_ORDER = [
  "users",
  "customers",
  "contacts",
  "products",
  "product_rate_histories",
  "deals",
  "deal_timelines",
  "activities",
  "contracts",
  "payments",
  "deposits",
  "refunds",
  "keeps",
  "notices",
  "page_permissions",
  "system_settings",
  "system_logs",
  "quotations",
  "import_batches",
  "import_staging_rows",
  "import_mappings",
  "database_backups",
];

function toSnakeCase(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[ -]+/g, "_")
    .toLowerCase();
}

function normalizeTablePayload(payload) {
  const rawTables =
    payload && typeof payload === "object" && payload.tables && typeof payload.tables === "object"
      ? payload.tables
      : payload && typeof payload === "object"
        ? payload
        : null;

  if (!rawTables || typeof rawTables !== "object") return null;

  const normalized = {};
  for (const [rawKey, rawRows] of Object.entries(rawTables)) {
    if (!Array.isArray(rawRows)) continue;
    const mappedTableName = TABLE_ALIASES[rawKey] || toSnakeCase(rawKey);
    normalized[mappedTableName] = rawRows;
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

async function getPublicTableNames(client) {
  const result = await client.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `,
  );

  return result.rows.map((row) => String(row.table_name));
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

  const columns = result.rows.map((row) => String(row.column_name));
  const typeByColumn = Object.fromEntries(
    result.rows.map((row) => [String(row.column_name), String(row.udt_name)]),
  );

  return { columns, typeByColumn };
}

function convertValueForColumn(value, udtName) {
  if (value === undefined) return null;
  if (value === null) return null;
  if ((udtName === "json" || udtName === "jsonb") && typeof value === "object") {
    return JSON.stringify(value);
  }
  return value;
}

function mapRowToColumns(row, knownColumns) {
  const mapped = {};
  const columnSet = new Set(knownColumns);
  for (const [rawKey, rawValue] of Object.entries(row ?? {})) {
    if (rawKey === "__meta") continue;
    let targetColumn = null;
    if (columnSet.has(rawKey)) {
      targetColumn = rawKey;
    } else {
      const snake = toSnakeCase(rawKey);
      if (columnSet.has(snake)) {
        targetColumn = snake;
      }
    }
    if (targetColumn) {
      mapped[targetColumn] = rawValue;
    }
  }
  return mapped;
}

function quoteIdentifier(name) {
  return `"${String(name).replace(/"/g, "\"\"")}"`;
}

async function insertRows(client, tableName, rawRows) {
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return 0;
  }

  const { columns, typeByColumn } = await getTableMetadata(client, tableName);
  if (columns.length === 0) {
    throw new Error(`Table not found or has no columns: ${tableName}`);
  }

  const normalizedRows = rawRows.map((row) => mapRowToColumns(row, columns));
  const activeColumns = columns.filter((column) => normalizedRows.some((row) => Object.hasOwn(row, column)));

  if (activeColumns.length === 0) {
    return 0;
  }

  const maxRowsByParamLimit = Math.max(1, Math.floor(60000 / activeColumns.length));
  const batchSize = Math.min(1000, maxRowsByParamLimit);
  let inserted = 0;

  for (let offset = 0; offset < normalizedRows.length; offset += batchSize) {
    const batch = normalizedRows.slice(offset, offset + batchSize);
    const values = [];
    const placeholders = [];
    let paramIndex = 1;

    for (const row of batch) {
      const slot = [];
      for (const column of activeColumns) {
        const converted = convertValueForColumn(row[column], typeByColumn[column]);
        values.push(converted);
        slot.push(`$${paramIndex}`);
        paramIndex += 1;
      }
      placeholders.push(`(${slot.join(",")})`);
    }

    const sql = `
      INSERT INTO ${quoteIdentifier(tableName)} (${activeColumns.map(quoteIdentifier).join(",")})
      VALUES ${placeholders.join(",")}
    `;
    await client.query(sql, values);
    inserted += batch.length;
  }

  return inserted;
}

async function main() {
  const backupPath = process.argv[2];
  if (!backupPath) {
    console.error("Usage: node scripts/restore-backup-json.mjs <backup-json-file>");
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required (export from .env.production first).");
    process.exit(1);
  }

  const raw = await fs.readFile(backupPath, "utf8");
  const parsed = JSON.parse(deserializeBackupContent(raw).plaintext);
  const tables = normalizeTablePayload(parsed);
  if (!tables) {
    throw new Error("Invalid backup payload: tables not found");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const publicTables = await getPublicTableNames(client);
    const tableNames = Object.keys(tables);

    if (tableNames.length === 0) {
      throw new Error("Invalid backup payload: no table rows found");
    }

    const missingTables = tableNames.filter((tableName) => !publicTables.includes(tableName));
    if (missingTables.length > 0) {
      throw new Error(`Restore target is missing tables: ${missingTables.join(", ")}`);
    }

    const insertOrder = [
      ...PREFERRED_INSERT_ORDER.filter((tableName) => tableNames.includes(tableName)),
      ...tableNames.filter((tableName) => !PREFERRED_INSERT_ORDER.includes(tableName)).sort((a, b) => a.localeCompare(b)),
    ];

    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '15s'");
    await client.query("SET LOCAL statement_timeout = '0'");

    await client.query(`TRUNCATE TABLE ${tableNames.map(quoteIdentifier).join(", ")} RESTART IDENTITY CASCADE`);

    const summary = {};
    for (const tableName of insertOrder) {
      const inserted = await insertRows(client, tableName, tables[tableName]);
      summary[tableName] = inserted;
    }

    await client.query("COMMIT");

    console.log("Restore completed.");
    for (const [tableName, count] of Object.entries(summary)) {
      console.log(`${tableName}: ${count}`);
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Restore failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
