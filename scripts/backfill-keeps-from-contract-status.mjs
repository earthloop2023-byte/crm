import process from "node:process";
import { Client } from "pg";

const KEEP_PAYMENT_METHODS = new Set([
  "적립",
  "적립금",
  "적립금등록",
  "적립금사용",
]);

function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
  };
}

function normalizePaymentMethod(value) {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

async function fetchKeepCandidates(client) {
  const result = await client.query(`
    SELECT
      id,
      contract_number,
      contract_date,
      customer_name,
      products,
      cost,
      days,
      add_quantity,
      extend_quantity,
      worker,
      user_identifier,
      notes,
      payment_method
    FROM contracts
    ORDER BY contract_date ASC NULLS LAST, contract_number ASC
  `);

  return result.rows.filter((row) => KEEP_PAYMENT_METHODS.has(normalizePaymentMethod(row.payment_method)));
}

async function fetchExistingKeepContractIds(client) {
  const result = await client.query(`SELECT DISTINCT contract_id FROM keeps WHERE contract_id IS NOT NULL`);
  return new Set(result.rows.map((row) => String(row.contract_id)));
}

function buildMissingKeepRows(candidates, existingKeepContractIds) {
  return candidates
    .filter((row) => !existingKeepContractIds.has(String(row.id)))
    .map((row) => ({
      contractId: String(row.id),
      contractNumber: row.contract_number,
      customerName: row.customer_name,
      amount: Number(row.cost ?? 0),
      keepDate: row.contract_date ?? new Date().toISOString(),
      reason: row.notes ?? null,
      worker: row.worker ?? null,
      userIdentifier: row.user_identifier ?? null,
      productName: row.products ?? null,
      days: Number(row.days ?? 0),
      addQuantity: Number(row.add_quantity ?? 0),
      extendQuantity: Number(row.extend_quantity ?? 0),
    }));
}

async function insertKeepRows(client, rows) {
  if (rows.length === 0) return 0;

  const values = [];
  const placeholders = rows.map((row, index) => {
    const base = index * 12;
    values.push(
      row.contractId,
      null,
      row.userIdentifier,
      row.productName,
      row.days,
      row.addQuantity,
      row.extendQuantity,
      row.amount,
      row.keepDate,
      row.reason,
      row.worker,
      "system-import",
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12})`;
  });

  await client.query(
    `
      INSERT INTO keeps (
        contract_id,
        item_id,
        user_identifier,
        product_name,
        days,
        add_quantity,
        extend_quantity,
        amount,
        keep_date,
        reason,
        worker,
        created_by
      )
      VALUES ${placeholders.join(", ")}
    `,
    values,
  );

  return rows.length;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL || "postgres://crm:crm@127.0.0.1:5432/crmdb";
  const client = new Client({ connectionString: databaseUrl });

  await client.connect();

  try {
    const candidates = await fetchKeepCandidates(client);
    const existingKeepContractIds = await fetchExistingKeepContractIds(client);
    const missingRows = buildMissingKeepRows(candidates, existingKeepContractIds);

    const summary = {
      apply: args.apply,
      candidateContracts: candidates.length,
      existingKeepContracts: existingKeepContractIds.size,
      missingKeepContracts: missingRows.length,
      zeroAmountCandidates: missingRows.filter((row) => row.amount === 0).length,
      sample: missingRows.slice(0, 10).map((row) => ({
        contractNumber: row.contractNumber,
        customerName: row.customerName,
        amount: row.amount,
      })),
    };

    if (args.apply && missingRows.length > 0) {
      await client.query("BEGIN");
      await insertKeepRows(client, missingRows);
      await client.query("COMMIT");
    }

    const finalCountResult = await client.query(`SELECT COUNT(*)::int AS count FROM keeps`);
    summary.finalKeepCount = Number(finalCountResult.rows[0]?.count ?? 0);

    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors
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
