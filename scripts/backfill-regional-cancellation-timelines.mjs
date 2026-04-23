import { randomUUID } from "crypto";
import { Client } from "pg";

function formatTimelineDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10).replace(/-/g, ".");
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const client = new Client({
    connectionString: process.env.DATABASE_URL || "postgres://crm:crm@127.0.0.1:5432/crmdb",
  });

  await client.connect();

  try {
    const { rows } = await client.query(`
      select
        d.id,
        d.company_name,
        d.title,
        d.cancellation_reason,
        coalesce(d.churn_date, d.contract_end_date, d.contract_start_date, d.inbound_date, d.created_at) as anchor_date
      from deals d
      where coalesce(trim(d.cancellation_reason), '') <> ''
        and not exists (
          select 1
          from deal_timelines dt
          where dt.deal_id = d.id
            and dt.content like '[해지사유]%'
        )
      order by d.created_at asc
    `);

    console.log(JSON.stringify({
      apply,
      candidateCount: rows.length,
      sample: rows.slice(0, 5).map((row) => ({
        id: row.id,
        title: row.title,
        companyName: row.company_name,
        cancellationReason: row.cancellation_reason,
      })),
    }, null, 2));

    if (!apply || rows.length === 0) {
      return;
    }

    await client.query("begin");

    for (const row of rows) {
      await client.query(
        `
          insert into deal_timelines (
            id,
            deal_id,
            content,
            author_id,
            author_name
          ) values ($1, $2, $3, $4, $5)
        `,
        [
          randomUUID(),
          row.id,
          `[해지사유] ${formatTimelineDate(row.anchor_date)} ${String(row.cancellation_reason).trim()}`,
          null,
          "시스템",
        ],
      );
    }

    await client.query("commit");
    console.log(`inserted ${rows.length} timeline rows`);
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
