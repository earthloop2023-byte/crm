import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import bcrypt from "bcryptjs";

const databaseUrl = process.env.DATABASE_URL || "";
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const adminLoginId = process.env.RESET_ADMIN_LOGIN_ID || "admin";
const adminPassword = process.env.RESET_ADMIN_PASSWORD || "aa12345";
const adminName = process.env.RESET_ADMIN_NAME || "관리자";
const adminRole = process.env.RESET_ADMIN_ROLE || "개발자";
const adminDepartment = process.env.RESET_ADMIN_DEPARTMENT || "개발팀";
const backupDir = path.resolve(process.cwd(), process.env.ACCOUNT_RESET_BACKUP_DIR || "backups/account-reset");

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

async function tableExists(client, tableName) {
  const result = await client.query("select to_regclass($1) as name", [`public.${tableName}`]);
  return Boolean(result.rows[0]?.name);
}

async function readTable(client, tableName) {
  if (!(await tableExists(client, tableName))) return [];
  const result = await client.query(`select * from ${tableName}`);
  return result.rows;
}

async function writeBackup(client) {
  await fs.promises.mkdir(backupDir, { recursive: true });
  const backup = {
    createdAt: new Date().toISOString(),
    action: "reset-earthloop-admin",
    tables: {
      users: await readTable(client, "users"),
      page_permissions: await readTable(client, "page_permissions"),
      system_settings: await readTable(client, "system_settings"),
      session: await readTable(client, "session"),
    },
  };
  const backupPath = path.join(backupDir, `before-admin-reset-${timestampLabel()}.json`);
  await fs.promises.writeFile(backupPath, `${JSON.stringify(backup, null, 2)}\n`, "utf8");
  return backupPath;
}

async function nullUserReferences(client) {
  const refs = [
    ["contracts", "manager_id"],
    ["deal_timelines", "author_id"],
    ["import_batches", "user_id"],
    ["import_mappings", "user_id"],
    ["notices", "author_id"],
    ["quotations", "created_by_id"],
    ["system_logs", "user_id"],
  ];

  for (const [table, column] of refs) {
    if (await tableExists(client, table)) {
      await client.query(`update ${table} set ${column} = null where ${column} is not null`);
    }
  }
}

async function resetAdmin(client) {
  const hashedPassword = bcrypt.hashSync(adminPassword, 10);

  await client.query("begin");
  try {
    await nullUserReferences(client);

    if (await tableExists(client, "session")) {
      await client.query("delete from session");
    }

    if (await tableExists(client, "page_permissions")) {
      await client.query("delete from page_permissions");
    }

    await client.query("delete from users");
    const inserted = await client.query(
      `
        insert into users (
          login_id, password, name, email, phone, role, department,
          work_status, is_active, last_password_change_at
        )
        values ($1, $2, $3, null, null, $4, $5, '재직중', true, now())
        returning id, login_id, name, role, department, work_status, is_active
      `,
      [adminLoginId, hashedPassword, adminName, adminRole, adminDepartment],
    );

    if (await tableExists(client, "system_settings")) {
      await client.query(
        `
          insert into system_settings (setting_key, setting_value)
          values ('company_name', '어스루프')
          on conflict (setting_key) do update set setting_value = excluded.setting_value
        `,
      );
    }

    await client.query("commit");
    return inserted.rows[0];
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

const client = new Client({ connectionString: databaseUrl });
try {
  await client.connect();
  const backupPath = await writeBackup(client);
  const admin = await resetAdmin(client);
  const countResult = await client.query("select count(*)::int as count from users");
  console.log(
    JSON.stringify(
      {
        ok: true,
        backupPath,
        usersCount: countResult.rows[0]?.count ?? null,
        admin,
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
