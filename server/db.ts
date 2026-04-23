import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

export async function ensureDatabasePerformanceObjects() {
  const statements = [
    `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
    `CREATE INDEX IF NOT EXISTS idx_contracts_contract_date ON contracts (contract_date DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_contracts_manager_name ON contracts (manager_name)`,
    `CREATE INDEX IF NOT EXISTS idx_contracts_customer_name ON contracts (customer_name)`,
    `CREATE INDEX IF NOT EXISTS idx_contracts_payment_method ON contracts (payment_method)`,
    `CREATE INDEX IF NOT EXISTS idx_contracts_created_at ON contracts (created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_contracts_contract_number_trgm ON contracts USING gin (contract_number gin_trgm_ops)`,
    `CREATE INDEX IF NOT EXISTS idx_contracts_customer_name_trgm ON contracts USING gin (customer_name gin_trgm_ops)`,
    `CREATE INDEX IF NOT EXISTS idx_contracts_manager_name_trgm ON contracts USING gin (manager_name gin_trgm_ops)`,
    `CREATE INDEX IF NOT EXISTS idx_contracts_products_trgm ON contracts USING gin (products gin_trgm_ops)`,
    `CREATE INDEX IF NOT EXISTS idx_products_category ON products (category)`,
  ];

  for (const statement of statements) {
    try {
      await pool.query(statement);
    } catch (error) {
      console.warn("[db] performance object setup skipped for statement:", statement);
      console.warn(error);
    }
  }
}
