import fs from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

function parseArgs(argv) {
  const args = {
    updates: "",
    backupDir: "",
    apply: false,
  };

  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
    else if (arg.startsWith("--updates=")) args.updates = path.resolve(arg.slice("--updates=".length));
    else if (arg.startsWith("--backup-dir=")) args.backupDir = path.resolve(arg.slice("--backup-dir=".length));
  }

  if (!args.updates) throw new Error("--updates is required");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  return args;
}

function normalizeText(value) {
  return String(value ?? "").normalize("NFC").trim();
}

function normalizeVatType(value) {
  const compact = normalizeText(value).replace(/\s+/g, "");
  if (!compact) return "";
  if (compact.includes("미포함") || compact.includes("별도") || compact.includes("면세")) return "미포함";
  if (compact.includes("포함")) return "포함";
  return compact;
}

function parseStoredItems(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  }
  return [];
}

function normalizeComparableItem(item) {
  return {
    id: normalizeText(item?.id),
    productName: normalizeText(item?.productName),
    userIdentifier: normalizeText(item?.userIdentifier),
    unitPrice: Number(item?.unitPrice ?? 0),
    days: Number(item?.days ?? 0),
    addQuantity: Number(item?.addQuantity ?? 0),
    extendQuantity: Number(item?.extendQuantity ?? 0),
    quantity: Number(item?.quantity ?? 0),
    baseDays: Number(item?.baseDays ?? 0),
    worker: normalizeText(item?.worker),
    workCost: Number(item?.workCost ?? 0),
    supplyAmount: Number(item?.supplyAmount ?? 0),
  };
}

function normalizeFinalItem(item) {
  return {
    ...item,
    vatType: normalizeVatType(item?.vatType),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const updates = JSON.parse(await fs.readFile(args.updates, "utf8"));
  const updatesById = new Map(updates.map((row) => [row.contractId, row]));
  const ids = updates.map((row) => row.contractId);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows } = await client.query(
    `
      select
        id,
        contract_number,
        to_char(contract_date + interval '9 hours', 'YYYY-MM-DD') as contract_date,
        customer_name,
        manager_name,
        invoice_issued,
        product_details_json
      from contracts
      where id = any($1::text[])
      order by contract_date asc, contract_number asc
    `,
    [ids],
  );

  if (rows.length !== updates.length) {
    throw new Error(`target count mismatch: expected ${updates.length}, got ${rows.length}`);
  }

  const mismatches = [];
  for (const row of rows) {
    const update = updatesById.get(row.id);
    if (!update) {
      mismatches.push({ contractId: row.id, reason: "missing-update-row" });
      continue;
    }

    if (normalizeText(row.contract_number) !== normalizeText(update.contractNumber)) {
      mismatches.push({
        contractId: row.id,
        contractNumber: row.contract_number,
        expectedContractNumber: update.contractNumber,
        reason: "contract-number-mismatch",
      });
      continue;
    }

    const currentItems = parseStoredItems(row.product_details_json).map(normalizeComparableItem);
    const updateItems = update.productDetails.map(normalizeComparableItem);
    if (JSON.stringify(currentItems) !== JSON.stringify(updateItems)) {
      mismatches.push({
        contractId: row.id,
        contractNumber: row.contract_number,
        reason: "product-details-base-mismatch",
        currentItems,
        updateItems,
      });
    }
  }

  if (mismatches.length > 0) {
    throw new Error(
      `preflight mismatch: ${mismatches.length} contract(s) differ from update source\n${JSON.stringify(mismatches.slice(0, 20), null, 2)}`,
    );
  }

  let backupPath = null;
  if (args.backupDir) {
    await fs.mkdir(args.backupDir, { recursive: true });
    backupPath = path.join(args.backupDir, "contracts-before.json");
    await fs.writeFile(backupPath, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  }

  if (args.apply) {
    await client.query("begin");
    try {
      for (const update of updates) {
        await client.query(
          `
            update contracts
            set invoice_issued = $2,
                product_details_json = $3
            where id = $1
          `,
          [
            update.contractId,
            update.invoiceIssued ?? null,
            JSON.stringify(update.productDetails.map(normalizeFinalItem)),
          ],
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }

  const summary = {
    updates: updates.length,
    apply: args.apply,
    backupPath,
    byInvoiceIssued: updates.reduce((acc, row) => {
      const key = normalizeVatType(row.invoiceIssued) || "";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
  };

  if (args.backupDir) {
    const summaryPath = path.join(args.backupDir, "apply-summary.json");
    await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    summary.summaryPath = summaryPath;
  }

  await client.end();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
