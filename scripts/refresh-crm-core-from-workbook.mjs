import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import XLSX from "xlsx";
import { Client } from "pg";

const SHEET_INDEX = {
  users: 0,
  customers: 1,
  products: 2,
  productRateHistories: 3,
  contracts: 4,
};

const PROTECTED_PRODUCTS = [
  {
    id: "7038076b-3ae1-4e85-9aee-07175773a170",
    name: "KCT",
    category: "타지역서비스",
    unit_price: 0,
    unit: "0",
    base_days: 0,
    work_cost: 0,
    purchase_price: 0,
    vat_type: "부가별도",
    worker: "KCT상품",
    notes: null,
    is_active: true,
    created_at: "2026-03-04T16:15:57.640Z",
  },
  {
    id: "35fdad00-8f6a-4517-bd7b-a7a4960ad2ae",
    name: "드림라인",
    category: "타지역서비스",
    unit_price: 0,
    unit: "0",
    base_days: 0,
    work_cost: 0,
    purchase_price: 0,
    vat_type: "부가별도",
    worker: "드림라인상품",
    notes: null,
    is_active: true,
    created_at: "2026-03-16T00:00:00.000Z",
  },
];

const PRESERVED_CONTRACT_REFERENCE_TABLES = [
  "payments",
  "deposits",
  "keeps",
  "refunds",
];

function parseArgs(argv) {
  const args = {
    file: "",
    apply: false,
    reportPrefix: "crm-core-refresh-report",
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

function normalizeSheetRows(workbook, index) {
  const sheetName = workbook.SheetNames[index];
  if (!sheetName) {
    throw new Error(`Sheet index ${index} is missing.`);
  }
  return XLSX.utils
    .sheet_to_json(workbook.Sheets[sheetName], { defval: null, raw: true })
    .map((row) => {
      const normalized = {};
      for (const [key, value] of Object.entries(row)) {
        normalized[toSnakeCase(key)] = normalizeCellValue(value);
      }
      return normalized;
    });
}

function ensureProtectedProducts(productRows) {
  const names = new Set(productRows.map((row) => String(row.name || "").trim()));
  const result = [...productRows];
  for (const product of PROTECTED_PRODUCTS) {
    if (!names.has(product.name)) {
      result.push({ ...product });
      names.add(product.name);
    }
  }
  return result;
}

function ensureProtectedProductRateHistories(rateRows, productRows) {
  const byProductId = new Set(rateRows.map((row) => String(row.product_id || "").trim()).filter(Boolean));
  const byProductName = new Set(rateRows.map((row) => String(row.product_name || "").trim()).filter(Boolean));
  const result = [...rateRows];

  for (const product of productRows) {
    const productId = String(product.id || "").trim();
    const productName = String(product.name || "").trim();
    const isProtected = PROTECTED_PRODUCTS.some((entry) => entry.id === productId || entry.name === productName);
    if (!isProtected) continue;
    if (byProductId.has(productId) || byProductName.has(productName)) continue;

    result.push({
      id: `${productId}-rate`,
      product_id: productId,
      product_name: productName,
      effective_from: product.created_at || new Date().toISOString(),
      unit_price: product.unit_price ?? 0,
      work_cost: product.work_cost ?? 0,
      base_days: product.base_days ?? 0,
      vat_type: product.vat_type ?? "부가별도",
      worker: product.worker ?? null,
      changed_by: "system",
      created_at: product.created_at || new Date().toISOString(),
    });
  }

  return result;
}

function remapContractManagerIds(contractRows, workbookUsers, currentUsers) {
  const workbookUserById = new Map(
    workbookUsers
      .filter((row) => row.id && row.login_id)
      .map((row) => [String(row.id), row]),
  );
  const currentUserIdByLoginId = new Map(
    currentUsers
      .filter((row) => row.id && row.login_id)
      .map((row) => [String(row.login_id), String(row.id)]),
  );

  return contractRows.map((row) => {
    if (!row.manager_id) return row;
    const workbookUser = workbookUserById.get(String(row.manager_id));
    if (!workbookUser?.login_id) {
      return { ...row, manager_id: null };
    }
    const nextManagerId = currentUserIdByLoginId.get(String(workbookUser.login_id));
    return { ...row, manager_id: nextManagerId ?? null };
  });
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
    if (known.has(rawKey)) mapped[rawKey] = rawValue;
    else if (known.has(snake)) mapped[snake] = rawValue;
  }
  return mapped;
}

async function insertRows(client, tableName, rawRows) {
  if (!Array.isArray(rawRows) || rawRows.length === 0) return 0;

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

async function upsertRowsById(client, tableName, rawRows) {
  if (!Array.isArray(rawRows) || rawRows.length === 0) return 0;

  const { columns, typeByColumn } = await getTableMetadata(client, tableName);
  const normalizedRows = rawRows.map((row) => mapRowToColumns(row, columns));
  const activeColumns = columns.filter((column) => normalizedRows.some((row) => Object.hasOwn(row, column)));
  if (!activeColumns.includes("id")) {
    throw new Error(`${tableName} does not have an id column for upsert.`);
  }

  const updateColumns = activeColumns.filter((column) => column !== "id");
  const maxRowsByParamLimit = Math.max(1, Math.floor(60000 / activeColumns.length));
  const batchSize = Math.min(1000, maxRowsByParamLimit);
  let affected = 0;

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
        ON CONFLICT (id) DO UPDATE SET
          ${updateColumns.map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`).join(", ")}
      `,
      values,
    );

    affected += batch.length;
  }

  return affected;
}

async function fetchTableRows(client, tableName) {
  const result = await client.query(`SELECT * FROM ${quoteIdentifier(tableName)}`);
  return result.rows;
}

async function fetchCount(client, tableName) {
  const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(tableName)}`);
  return Number(result.rows[0]?.count || 0);
}

function runBackup(databaseUrl) {
  const result = spawnSync(process.execPath, ["scripts/db-backup-json.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || "Backup failed");
  }

  const stdout = String(result.stdout || "");
  const match = stdout.match(/JSON backup created:\s*(.+)/);
  return match?.[1]?.trim() || null;
}

function mapRowsById(rows) {
  return new Map(
    rows
      .filter((row) => row.id)
      .map((row) => [String(row.id), row]),
  );
}

function buildContractNumberMap(rows) {
  return new Map(
    rows
      .filter((row) => row.contract_number)
      .map((row) => [String(row.contract_number), String(row.id)]),
  );
}

function remapContractReferenceRows(rows, oldContractById, newContractIdByNumber) {
  return rows.map((row) => {
    const contractId = row.contract_id ? String(row.contract_id) : "";
    if (!contractId) return row;
    const contract = oldContractById.get(contractId);
    const contractNumber = contract?.contract_number ? String(contract.contract_number) : "";
    const nextContractId = contractNumber ? newContractIdByNumber.get(contractNumber) : null;
    if (!nextContractId) {
      throw new Error(`Missing remap target for contract_id=${contractId} contract_number=${contractNumber}`);
    }
    return { ...row, contract_id: nextContractId };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL || "postgres://crm:crm@127.0.0.1:5432/crmdb";
  const workbookPath = path.resolve(args.file);
  const workbook = XLSX.readFile(workbookPath, { cellDates: true });

  const workbookUsers = normalizeSheetRows(workbook, SHEET_INDEX.users);
  const customers = normalizeSheetRows(workbook, SHEET_INDEX.customers);
  const products = ensureProtectedProducts(normalizeSheetRows(workbook, SHEET_INDEX.products));
  const productRateHistories = ensureProtectedProductRateHistories(
    normalizeSheetRows(workbook, SHEET_INDEX.productRateHistories),
    products,
  );
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const currentUsers = await fetchTableRows(client, "users");
    const contracts = remapContractManagerIds(
      normalizeSheetRows(workbook, SHEET_INDEX.contracts).map((row) => ({
        ...row,
        product_details_json: row.product_details_json ?? null,
      })),
      workbookUsers,
      currentUsers,
    );

    const oldContracts = await fetchTableRows(client, "contracts");
    const preservedByTable = Object.fromEntries(
      await Promise.all(
        PRESERVED_CONTRACT_REFERENCE_TABLES.map(async (tableName) => [tableName, await fetchTableRows(client, tableName)]),
      ),
    );
    const oldContractById = mapRowsById(oldContracts);
    const newContractIdByNumber = buildContractNumberMap(contracts);

    for (const tableName of PRESERVED_CONTRACT_REFERENCE_TABLES) {
      remapContractReferenceRows(preservedByTable[tableName], oldContractById, newContractIdByNumber);
    }

    const report = {
      generatedAt: new Date().toISOString(),
      workbookPath,
      apply: args.apply,
      backupPath: null,
      workbookCounts: {
        customers: customers.length,
        products: products.length,
        productRateHistories: productRateHistories.length,
        contracts: contracts.length,
      },
      preservedCounts: Object.fromEntries(
        PRESERVED_CONTRACT_REFERENCE_TABLES.map((tableName) => [tableName, preservedByTable[tableName].length]),
      ),
      afterCounts: {},
    };

    if (args.apply) {
      report.backupPath = runBackup(databaseUrl);

      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '15s'");
      await client.query("SET LOCAL statement_timeout = '0'");

      await upsertRowsById(client, "customers", customers);
      await upsertRowsById(client, "products", products);

      await client.query("DELETE FROM product_rate_histories");
      await insertRows(client, "product_rate_histories", productRateHistories);

      for (const tableName of PRESERVED_CONTRACT_REFERENCE_TABLES) {
        await client.query(`DELETE FROM ${quoteIdentifier(tableName)}`);
      }
      await client.query("DELETE FROM contracts");
      await insertRows(client, "contracts", contracts);

      for (const tableName of PRESERVED_CONTRACT_REFERENCE_TABLES) {
        const remapped = remapContractReferenceRows(preservedByTable[tableName], oldContractById, newContractIdByNumber);
        await insertRows(client, tableName, remapped);
      }

      await client.query("COMMIT");
    }

    for (const tableName of [
      "customers",
      "products",
      "product_rate_histories",
      "contracts",
      ...PRESERVED_CONTRACT_REFERENCE_TABLES,
    ]) {
      report.afterCounts[tableName] = await fetchCount(client, tableName);
    }

    const reportDir = path.resolve(process.cwd(), "backups");
    await fs.mkdir(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `${args.reportPrefix}-${nowStamp()}.json`);
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    console.log(`REPORT ${reportPath}`);
    if (report.backupPath) console.log(`BACKUP ${report.backupPath}`);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
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
