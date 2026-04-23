import pg from "pg";
import {
  PII_TABLE_COLUMN_MAP,
  assertPiiEncryptionKey,
  deserializePiiContent,
  serializePiiContent,
} from "./pii-security.mjs";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

assertPiiEncryptionKey();

const shouldApply = process.argv.includes("--apply");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrateTable(client, tableName, columns) {
  const selectColumns = ["id", ...columns].map((column) => `"${column}"`).join(", ");
  const result = await client.query(`SELECT ${selectColumns} FROM "${tableName}"`);

  let updatedRows = 0;
  let updatedCells = 0;

  for (const row of result.rows) {
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const column of columns) {
      const rawValue = row[column];
      if (typeof rawValue !== "string" || rawValue.length === 0) continue;
      const decoded = deserializePiiContent(rawValue);
      if (decoded.latest) continue;
      const encrypted = serializePiiContent(decoded.plaintext).stored;
      if (encrypted === rawValue) continue;

      setClauses.push(`"${column}" = $${paramIndex}`);
      values.push(encrypted);
      paramIndex += 1;
      updatedCells += 1;
    }

    if (setClauses.length === 0) continue;

    updatedRows += 1;
    if (shouldApply) {
      values.push(row.id);
      await client.query(`UPDATE "${tableName}" SET ${setClauses.join(", ")} WHERE id = $${paramIndex}`, values);
    }
  }

  return {
    tableName,
    updatedRows,
    updatedCells,
  };
}

async function main() {
  const client = await pool.connect();
  try {
    const summaries = [];
    for (const [tableName, columns] of Object.entries(PII_TABLE_COLUMN_MAP)) {
      summaries.push(await migrateTable(client, tableName, columns));
    }

    const totalRows = summaries.reduce((sum, item) => sum + item.updatedRows, 0);
    const totalCells = summaries.reduce((sum, item) => sum + item.updatedCells, 0);

    console.log(`[pii-migration] mode=${shouldApply ? "apply" : "dry-run"} tables=${summaries.length} rows=${totalRows} cells=${totalCells}`);
    for (const summary of summaries) {
      console.log(`[pii-migration] ${summary.tableName}: rows=${summary.updatedRows}, cells=${summary.updatedCells}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[pii-migration] failed:", error);
  process.exitCode = 1;
});
