import { Client } from "pg";

const MANUAL_VAT_ALIASES = new Map([
  ["가구매리뷰", "포함"],
  ["가구매리뷰(실배송)", "포함"],
  ["가구매리뷰(자사몰)", "포함"],
  ["가구매리뷰(옥션)", "포함"],
  ["가구매리뷰(카카오)", "포함"],
  ["가구매리뷰(g마켓)", "포함"],
  ["웹사이트상위노출", "포함"],
  ["페이백대헹", "포함"],
]);

function normalizeProductKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]/gi, "");
}

function normalizeProductBaseKey(value) {
  return normalizeProductKey(String(value || "").replace(/\([^)]*\)/g, ""));
}

function mapVatTypeToInvoiceIssued(value) {
  const normalized = String(value || "").replace(/\s+/g, "");
  if (!normalized) return null;
  if (normalized.includes("미포함") || normalized.includes("별도") || normalized.includes("면세")) {
    return "미포함";
  }
  if (normalized.includes("포함")) {
    return "포함";
  }
  return null;
}

function splitProductNames(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildVatLookup(products) {
  const exactMap = new Map();
  const normalizedMap = new Map();
  const baseCandidates = new Map();

  for (const product of products) {
    const invoiceIssued = mapVatTypeToInvoiceIssued(product.vat_type);
    if (!invoiceIssued) continue;

    const exactName = String(product.name || "").trim();
    const normalizedName = normalizeProductKey(product.name);
    const baseName = normalizeProductBaseKey(product.name);

    if (exactName && !exactMap.has(exactName)) {
      exactMap.set(exactName, invoiceIssued);
    }

    if (normalizedName && !normalizedMap.has(normalizedName)) {
      normalizedMap.set(normalizedName, invoiceIssued);
    }

    if (baseName) {
      if (!baseCandidates.has(baseName)) {
        baseCandidates.set(baseName, new Set());
      }
      baseCandidates.get(baseName).add(invoiceIssued);
    }
  }

  const baseMap = new Map();
  for (const [key, values] of baseCandidates.entries()) {
    if (values.size === 1) {
      baseMap.set(key, [...values][0]);
    }
  }

  return { exactMap, normalizedMap, baseMap };
}

function resolveInvoiceIssued(productName, vatLookup) {
  const exactName = String(productName || "").trim();
  if (exactName && MANUAL_VAT_ALIASES.has(exactName)) {
    return MANUAL_VAT_ALIASES.get(exactName);
  }
  if (exactName && vatLookup.exactMap.has(exactName)) {
    return vatLookup.exactMap.get(exactName);
  }

  const normalizedName = normalizeProductKey(productName);
  if (normalizedName && vatLookup.normalizedMap.has(normalizedName)) {
    return vatLookup.normalizedMap.get(normalizedName);
  }

  const baseName = normalizeProductBaseKey(productName);
  if (baseName && vatLookup.baseMap.has(baseName)) {
    return vatLookup.baseMap.get(baseName);
  }

  return null;
}

function parseStoredItems(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const apply = process.argv.includes("--apply");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const productResult = await client.query(`
    select name, vat_type
    from products
  `);

  const vatLookup = buildVatLookup(productResult.rows);

  const contractResult = await client.query(`
    select id, contract_number, products, invoice_issued, product_details_json
    from contracts
    where to_char(contract_date + interval '9 hours', 'YYYY-MM') in ('2025-12', '2026-01', '2026-02')
      and coalesce(trim(invoice_issued), '') = ''
    order by contract_date asc, id asc
  `);

  const report = {
    totalContracts: contractResult.rows.length,
    updatedContracts: 0,
    unmatchedContracts: 0,
    unmatchedProducts: {},
    sampleUpdated: [],
  };

  if (apply) {
    await client.query("begin");
  }

  try {
    for (const row of contractResult.rows) {
      const productNames = splitProductNames(row.products);
      const productMatches = productNames
        .map((name) => ({ name, invoiceIssued: resolveInvoiceIssued(name, vatLookup) }))
        .filter((item) => item.invoiceIssued);

      if (productMatches.length === 0) {
        report.unmatchedContracts += 1;
        for (const name of productNames) {
          report.unmatchedProducts[name] = (report.unmatchedProducts[name] || 0) + 1;
        }
        continue;
      }

      const uniqueInvoices = [...new Set(productMatches.map((item) => item.invoiceIssued))];
      const invoiceIssued = uniqueInvoices.length === 1 ? uniqueInvoices[0] : productMatches[0].invoiceIssued;

      const storedItems = parseStoredItems(row.product_details_json);
      let nextItems = storedItems;

      if (Array.isArray(storedItems) && storedItems.length > 0) {
        nextItems = storedItems.map((item) => {
          const productName = String(item?.productName || "").trim();
          const matchedInvoiceIssued = resolveInvoiceIssued(productName, vatLookup) || invoiceIssued;
          return {
            ...item,
            vatType: matchedInvoiceIssued,
          };
        });
      }

      report.updatedContracts += 1;
      if (report.sampleUpdated.length < 20) {
        report.sampleUpdated.push({
          contractNumber: row.contract_number,
          products: row.products,
          invoiceIssued,
        });
      }

      if (apply) {
        await client.query(
          `
            update contracts
            set invoice_issued = $2,
                product_details_json = coalesce($3, product_details_json)
            where id = $1
          `,
          [row.id, invoiceIssued, nextItems ? JSON.stringify(nextItems) : null],
        );
      }
    }

    if (apply) {
      await client.query("commit");
    }
  } catch (error) {
    if (apply) {
      await client.query("rollback");
    }
    throw error;
  } finally {
    await client.end();
  }

  const sortedUnmatched = Object.entries(report.unmatchedProducts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([name, count]) => ({ name, count }));

  console.log(
    JSON.stringify(
      {
        ...report,
        unmatchedProducts: sortedUnmatched,
        apply,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
