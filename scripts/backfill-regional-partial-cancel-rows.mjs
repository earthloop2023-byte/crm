import { randomUUID } from "crypto";
import { Client } from "pg";

function formatDateLabel(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10).replace(/-/g, ".");
  }
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
    await client.query(`alter table deals add column if not exists parent_deal_id varchar`);

    const { rows } = await client.query(`
      select
        d.id,
        d.title,
        d.customer_id,
        d.value,
        d.stage,
        d.probability,
        d.expected_close_date,
        d.inbound_date,
        d.contract_start_date,
        d.contract_end_date,
        d.churn_date,
        d.renewal_due_date,
        d.contract_status,
        d.notes,
        d.phone,
        d.email,
        d.billing_account_number,
        d.company_name,
        d.industry,
        d.telecom_provider,
        d.customer_disposition,
        d.customer_type_detail,
        d.first_progress_status,
        d.second_progress_status,
        d.additional_progress_status,
        d.acquisition_channel,
        d.cancellation_reason,
        d.salesperson,
        d.pre_churn_stage,
        coalesce(d.line_count, 0) as line_count,
        coalesce(d.cancelled_line_count, 0) as cancelled_line_count,
        d.product_id,
        coalesce(d.churn_date, d.contract_end_date, d.contract_start_date, d.inbound_date, d.created_at) as split_anchor_date
      from deals d
      where coalesce(d.cancelled_line_count, 0) > 0
        and coalesce(d.parent_deal_id, '') = ''
        and coalesce(d.stage, '') <> 'churned'
        and not exists (
          select 1
          from deals child
          where child.parent_deal_id = d.id
        )
      order by d.created_at asc
    `);

    console.log(
      JSON.stringify(
        {
          apply,
          candidateCount: rows.length,
          sample: rows.slice(0, 10).map((row) => ({
            id: row.id,
            billingAccountNumber: row.billing_account_number,
            companyName: row.company_name,
            stage: row.stage,
            contractStatus: row.contract_status,
            lineCount: row.line_count,
            cancelledLineCount: row.cancelled_line_count,
          })),
        },
        null,
        2,
      ),
    );

    if (!apply || rows.length === 0) {
      return;
    }

    await client.query("begin");

    for (const row of rows) {
      const splitDealId = randomUUID();
      const reasonText = String(row.cancellation_reason || "").trim();
      const splitAnchorDate = row.split_anchor_date || new Date();
      const splitDateLabel = formatDateLabel(splitAnchorDate);

      await client.query(
        `
          insert into deals (
            id,
            parent_deal_id,
            title,
            customer_id,
            value,
            stage,
            probability,
            expected_close_date,
            inbound_date,
            contract_start_date,
            contract_end_date,
            churn_date,
            renewal_due_date,
            contract_status,
            notes,
            phone,
            email,
            billing_account_number,
            company_name,
            industry,
            telecom_provider,
            customer_disposition,
            customer_type_detail,
            first_progress_status,
            second_progress_status,
            additional_progress_status,
            acquisition_channel,
            cancellation_reason,
            salesperson,
            pre_churn_stage,
            line_count,
            cancelled_line_count,
            product_id
          ) values (
            $1, $2, $3, $4, $5, 'churned', $6, $7, $8, $9, $10, $11, $12, '해지', '',
            $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25,
            $26, $27, 0, $28, $29
          )
        `,
        [
          splitDealId,
          row.id,
          row.title,
          row.customer_id,
          row.value,
          row.probability,
          row.expected_close_date,
          row.inbound_date,
          row.contract_start_date,
          row.contract_end_date,
          row.churn_date,
          row.renewal_due_date,
          row.phone,
          row.email,
          row.billing_account_number,
          row.company_name,
          row.industry,
          row.telecom_provider,
          row.customer_disposition,
          row.customer_type_detail,
          row.first_progress_status,
          row.second_progress_status,
          row.additional_progress_status,
          row.acquisition_channel,
          reasonText || null,
          row.salesperson,
          row.pre_churn_stage || row.contract_status || row.stage || "개통",
          row.cancelled_line_count,
          row.product_id,
        ],
      );

      await client.query(
        `
          update deals
          set cancelled_line_count = 0,
              cancellation_reason = null,
              churn_date = null
          where id = $1
        `,
        [row.id],
      );

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
          splitDealId,
          `[부분해지] ${splitDateLabel} ${row.cancelled_line_count}회선 해지`,
          null,
          "시스템",
        ],
      );

      if (reasonText) {
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
            splitDealId,
            `[해지사유] ${reasonText}`,
            null,
            "시스템",
          ],
        );
      }
    }

    await client.query("commit");
    console.log(`split ${rows.length} legacy partial-cancel rows`);
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
