import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL || "";
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const backupDir = path.resolve(process.cwd(), process.env.REBRAND_BACKUP_DIR || "backups/rebrand-earthloop");

const oldKoreanCompany = "\uC778\uB355";
const oldKoreanBrand = "\uBC14\uC774\uB7F4\uB9E4\uC9C1";
const oldKoreanBrandSpaced = "\uBC14\uC774\uB7F4 \uB9E4\uC9C1";
const oldKoreanCorp = `\uC8FC\uC2DD\uD68C\uC0AC ${oldKoreanCompany}`;
const oldEnglishCompanyLower = "in" + "duk";
const oldEnglishCompanyUpper = "IN" + "DUK";
const oldEnglishCompanyTitle = "In" + "duk";
const oldEnglishBrandCompact = "Viral" + "M";
const oldEnglishBrandSpaced = "Viral" + " Magic";
const oldEnglishBrandLower = "viral" + "m";

const replacements = [
  [`${oldEnglishCompanyLower}-crm`, "earthloopcrm"],
  [oldKoreanBrand, "어스루프"],
  [oldKoreanBrandSpaced, "어스루프"],
  [oldKoreanCorp, "주식회사 어스루프"],
  [oldKoreanCompany, "어스루프"],
  [oldEnglishBrandSpaced, "Earthloop"],
  [oldEnglishBrandCompact, "Earthloop"],
  [oldEnglishBrandLower, "earthloop"],
  [oldEnglishCompanyUpper, "EARTHLOOP"],
  [oldEnglishCompanyTitle, "Earthloop"],
  [oldEnglishCompanyLower, "earthloop"],
];

const patterns = replacements.map(([from]) => `%${from}%`);

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function timestampLabel() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

function isEncryptedPiiEnvelope(value) {
  if (typeof value !== "string" || !value.trim().startsWith("{")) return false;
  try {
    const parsed = JSON.parse(value);
    return parsed?.kind === "crm.pii.envelope";
  } catch {
    return false;
  }
}

function replaceBrandTerms(value) {
  if (typeof value !== "string" || isEncryptedPiiEnvelope(value)) return value;
  return replacements.reduce((next, [from, to]) => next.split(from).join(to), value);
}

async function getPrimaryKeys(client) {
  const result = await client.query(`
    select
      tc.table_schema,
      tc.table_name,
      kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
     and tc.table_schema = kcu.table_schema
     and tc.table_name = kcu.table_name
    where tc.constraint_type = 'PRIMARY KEY'
      and tc.table_schema = 'public'
    order by tc.table_name, kcu.ordinal_position
  `);

  const keys = new Map();
  for (const row of result.rows) {
    const key = `${row.table_schema}.${row.table_name}`;
    if (!keys.has(key)) keys.set(key, []);
    keys.get(key).push(row.column_name);
  }
  return keys;
}

async function getTextColumns(client) {
  const result = await client.query(`
    select table_schema, table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and data_type in ('text', 'character varying')
      and column_name <> 'password'
    order by table_name, column_name
  `);
  return result.rows;
}

async function collectChanges(client) {
  const primaryKeys = await getPrimaryKeys(client);
  const columns = await getTextColumns(client);
  const changes = [];

  for (const column of columns) {
    const tableKey = `${column.table_schema}.${column.table_name}`;
    const pkColumns = primaryKeys.get(tableKey) || [];
    if (pkColumns.length !== 1) continue;

    const schemaName = quoteIdentifier(column.table_schema);
    const tableName = quoteIdentifier(column.table_name);
    const columnName = quoteIdentifier(column.column_name);
    const pkName = quoteIdentifier(pkColumns[0]);
    const rows = await client.query(
      `
        select ${pkName}::text as pk_value, ${columnName} as value
        from ${schemaName}.${tableName}
        where ${columnName} is not null
          and ${columnName} ilike any($1::text[])
      `,
      [patterns],
    );

    for (const row of rows.rows) {
      const nextValue = replaceBrandTerms(row.value);
      if (nextValue !== row.value) {
        changes.push({
          tableSchema: column.table_schema,
          tableName: column.table_name,
          columnName: column.column_name,
          pkColumn: pkColumns[0],
          pkValue: row.pk_value,
          before: row.value,
          after: nextValue,
        });
      }
    }
  }

  return changes;
}

async function writeBackup(changes) {
  await fs.promises.mkdir(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `before-rebrand-${timestampLabel()}.json`);
  await fs.promises.writeFile(
    backupPath,
    `${JSON.stringify({ createdAt: new Date().toISOString(), changes }, null, 2)}\n`,
    "utf8",
  );
  return backupPath;
}

async function applyChanges(client, changes) {
  await client.query("begin");
  try {
    for (const change of changes) {
      await client.query(
        `
          update ${quoteIdentifier(change.tableSchema)}.${quoteIdentifier(change.tableName)}
          set ${quoteIdentifier(change.columnName)} = $1
          where ${quoteIdentifier(change.pkColumn)}::text = $2
        `,
        [change.after, change.pkValue],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

const client = new Client({ connectionString: databaseUrl });
try {
  await client.connect();
  const changes = await collectChanges(client);
  const backupPath = await writeBackup(changes);
  if (apply && changes.length > 0) {
    await applyChanges(client, changes);
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: apply ? "apply" : "dry-run",
        changes: changes.length,
        backupPath,
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
