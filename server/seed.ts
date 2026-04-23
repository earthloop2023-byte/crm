import { db } from "./db";
import { users, systemLogs, customers, deals, activities, contracts, products, productRateHistories } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

const BOOTSTRAP_ADMIN_ACCOUNTS_ENV = "SEED_ADMIN_ACCOUNTS_JSON";

interface BootstrapAdminAccount {
  loginId: string;
  password: string;
  name: string;
  role: string;
  department: string;
}

function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

function parseBootstrapAdminAccounts(): BootstrapAdminAccount[] {
  const raw = String(process.env[BOOTSTRAP_ADMIN_ACCOUNTS_ENV] || "").trim();
  if (!raw) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${BOOTSTRAP_ADMIN_ACCOUNTS_ENV} must be valid JSON.`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`${BOOTSTRAP_ADMIN_ACCOUNTS_ENV} must be a JSON array.`);
  }

  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`${BOOTSTRAP_ADMIN_ACCOUNTS_ENV}[${index}] must be an object.`);
    }

    const account = entry as Record<string, unknown>;
    const loginId = String(account.loginId || "").trim();
    const password = String(account.password || "").trim();
    const name = String(account.name || "").trim();
    const role = String(account.role || "").trim();
    const department = String(account.department || "").trim();

    if (!loginId || !password || !name || !role || !department) {
      throw new Error(
        `${BOOTSTRAP_ADMIN_ACCOUNTS_ENV}[${index}] must include loginId, password, name, role, department.`,
      );
    }

    return {
      loginId,
      password,
      name,
      role,
      department,
    };
  });
}

async function seedAdminAccounts() {
  const adminAccounts = parseBootstrapAdminAccounts();
  if (adminAccounts.length === 0) {
    const existingUsers = await db.select({ id: users.id }).from(users).limit(1);
    if (existingUsers.length === 0) {
      console.warn(
        `[seed] no bootstrap admin accounts configured. Set ${BOOTSTRAP_ADMIN_ACCOUNTS_ENV} when initializing a blank database.`,
      );
    }
    return;
  }

  for (const account of adminAccounts) {
    const existing = await db.select().from(users).where(eq(users.loginId, account.loginId)).limit(1);

    if (existing.length > 0) {
      continue;
    }

    await db.insert(users).values({
      loginId: account.loginId,
      password: hashPassword(account.password),
      name: account.name,
      role: account.role,
      department: account.department,
      isActive: true,
      workStatus: "재직중",
    });
    console.log(`[seed] admin account created: ${account.loginId}`);
  }
}

async function cleanupDummyData() {
  const dummyLoginIds = ["kim.chulsoo", "lee.younghee", "park.minsoo", "choi.donghyun"];
  for (const loginId of dummyLoginIds) {
    await db.delete(systemLogs).where(eq(systemLogs.loginId, loginId));
  }

  const dummyNames = ["김철수", "이영희", "박민수", "정수진", "최동현"];
  for (const name of dummyNames) {
    const custs = await db.select({ id: customers.id }).from(customers).where(eq(customers.name, name));
    for (const c of custs) {
      await db.delete(activities).where(eq(activities.customerId, c.id));
      await db.delete(deals).where(eq(deals.customerId, c.id));
      await db.delete(customers).where(eq(customers.id, c.id));
    }
  }
  console.log("Dummy data cleanup completed.");
}

async function fixUnhashedPasswords() {
  const allUsers = await db.select().from(users);
  for (const user of allUsers) {
    if (user.password && !user.password.startsWith("$2b$") && !user.password.startsWith("$2a$")) {
      const hashed = hashPassword(user.password);
      await db.update(users).set({ password: hashed }).where(eq(users.id, user.id));
      console.log(`Fixed unhashed password for user: ${user.loginId}`);
    }
  }
}

async function fixContractWorkCosts() {
  const zeroContracts = await db
    .select({ id: contracts.id, productName: contracts.products })
    .from(contracts)
    .where(and(eq(contracts.days, 0), eq(contracts.quantity, 0)));

  if (zeroContracts.length === 0) return;

  const allProducts = await db.select().from(products);
  const productMap = new Map(allProducts.map((p) => [p.name, p]));

  let updated = 0;
  const skipped: string[] = [];
  for (const contract of zeroContracts) {
    const product = productMap.get(contract.productName || "");
    if (!product || !product.baseDays || product.baseDays <= 0) {
      skipped.push(`${contract.id} (${contract.productName || "unknown"})`);
      continue;
    }

    const workerUnitCost = Number(product.workCost || 0);
    const computedWorkCost = Math.round((workerUnitCost / product.baseDays) * product.baseDays);

    await db
      .update(contracts)
      .set({ days: product.baseDays, quantity: 1, workCost: computedWorkCost })
      .where(eq(contracts.id, contract.id));
    updated++;
  }

  if (updated > 0) {
    console.log(`Fixed work costs for ${updated} contracts.`);
  }
  if (skipped.length > 0) {
    console.warn(
      `Skipped ${skipped.length} contracts (no matching product): ${skipped.slice(0, 5).join(", ")}${skipped.length > 5 ? "..." : ""}`,
    );
  }
}

async function ensureProductRateHistoryTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS product_rate_histories (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id varchar NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      product_name text NOT NULL,
      effective_from timestamp NOT NULL,
      unit_price integer NOT NULL DEFAULT 0,
      work_cost integer DEFAULT 0,
      base_days integer DEFAULT 0,
      vat_type text DEFAULT '부가세별도',
      worker text,
      changed_by text,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_product_rate_histories_product_name_effective_from
    ON product_rate_histories(product_name, effective_from DESC)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_product_rate_histories_product_id_effective_from
    ON product_rate_histories(product_id, effective_from DESC)
  `);
}

async function bootstrapProductRateHistories() {
  const [allProducts, existingHistories] = await Promise.all([
    db.select().from(products),
    db.select({ productId: productRateHistories.productId }).from(productRateHistories),
  ]);

  const existingProductIds = new Set(existingHistories.map((history) => history.productId));
  const now = new Date();
  const missingHistories = allProducts
    .filter((product) => !existingProductIds.has(product.id))
    .map((product) => ({
      productId: product.id,
      productName: product.name,
      effectiveFrom: now,
      unitPrice: Number(product.unitPrice) || 0,
      workCost: Number(product.workCost) || 0,
      baseDays: Number(product.baseDays) || 0,
      vatType: product.vatType || "부가세별도",
      worker: product.worker || null,
      changedBy: "system-bootstrap",
    }));

  if (missingHistories.length > 0) {
    await db.insert(productRateHistories).values(missingHistories);
    console.log(`Bootstrapped ${missingHistories.length} product rate history rows.`);
  }
}

export async function seedDatabase() {
  await ensureProductRateHistoryTable();
  await bootstrapProductRateHistories();
  await seedAdminAccounts();
  await cleanupDummyData();
  await fixUnhashedPasswords();
  await fixContractWorkCosts();
  console.log("Database seed completed.");
}
