import crypto, { randomUUID } from "crypto";
import pg from "pg";

const { Client } = pg;

const DEAL_NOTE_PREFIX = "[CS메모]";
const DEAL_CANCELLATION_REASON_PREFIX = "[해지사유]";
const PII_ENVELOPE_KIND = "crm.pii.envelope";
const PII_ENVELOPE_ALGORITHM = "aes-256-gcm";

function getStaticEncryptionKey(secret) {
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

function isPiiEnvelope(value) {
  if (!value || typeof value !== "object") return false;
  return (
    value.kind === PII_ENVELOPE_KIND &&
    value.algorithm === PII_ENVELOPE_ALGORITHM &&
    typeof value.iv === "string" &&
    typeof value.tag === "string" &&
    typeof value.ciphertext === "string"
  );
}

function deserializePiiValue(stored) {
  if (!stored) return "";

  let parsed;
  try {
    parsed = JSON.parse(String(stored));
  } catch {
    return String(stored);
  }

  if (!isPiiEnvelope(parsed)) {
    return String(stored);
  }

  const secret = String(process.env.PII_ENCRYPTION_KEY || "").trim();
  if (!secret) {
    throw new Error("PII_ENCRYPTION_KEY is required to backfill encrypted deal notes.");
  }

  const key = getStaticEncryptionKey(secret);
  const decipher = crypto.createDecipheriv(
    PII_ENVELOPE_ALGORITHM,
    key,
    Buffer.from(parsed.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(parsed.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function extractDealNoteFromTimelineContent(content) {
  const normalized = normalizeText(content);
  if (!normalized) return null;

  if (normalized.startsWith(DEAL_NOTE_PREFIX)) {
    const stripped = normalized.slice(DEAL_NOTE_PREFIX.length).trim();
    return stripped || null;
  }

  if (
    normalized.startsWith("[인입]") ||
    normalized.startsWith("[개통]") ||
    normalized.startsWith("[해지]") ||
    normalized.startsWith("[부분해지]") ||
    normalized.startsWith(DEAL_CANCELLATION_REASON_PREFIX) ||
    /^\[\?+\]/.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

function extractDealCancellationReasonFromTimelineContent(content) {
  const normalized = normalizeText(content);
  if (!normalized) return null;
  const match = normalized.match(/^\[(?:해지사유|\?+)\]\s*(?:(?:\d{4}\.\d{2}\.\d{2})\s+)?([\s\S]+)$/);
  return match?.[1]?.trim() || null;
}

function formatTimelineDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return "1970.01.01";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

function resolveAnchorDate(row, type) {
  if (type === "reason") {
    return row.churn_date || row.contract_end_date || row.contract_start_date || row.inbound_date || row.created_at || new Date();
  }
  return row.created_at || row.inbound_date || row.contract_start_date || row.contract_end_date || new Date();
}

async function main() {
  const apply = process.argv.includes("--apply");
  const client = new Client({
    connectionString: process.env.DATABASE_URL || "postgres://crm:crm@127.0.0.1:5432/crmdb",
  });

  await client.connect();

  try {
    const [dealsResult, timelinesResult] = await Promise.all([
      client.query(`
        select
          id,
          notes,
          cancellation_reason,
          inbound_date,
          contract_start_date,
          contract_end_date,
          churn_date,
          created_at
        from deals
      `),
      client.query(`
        select deal_id, content
        from deal_timelines
      `),
    ]);

    const timelinesByDealId = new Map();
    for (const row of timelinesResult.rows) {
      const list = timelinesByDealId.get(row.deal_id) || [];
      list.push(String(row.content || ""));
      timelinesByDealId.set(row.deal_id, list);
    }

    const inserts = [];
    for (const row of dealsResult.rows) {
      const timelines = timelinesByDealId.get(row.id) || [];
      const note = normalizeText(deserializePiiValue(row.notes));
      const reason = normalizeText(row.cancellation_reason);

      if (
        note &&
        !timelines.some((content) => extractDealNoteFromTimelineContent(content) === note)
      ) {
        inserts.push({
          id: randomUUID(),
          dealId: row.id,
          content: `${DEAL_NOTE_PREFIX} ${note}`,
          createdAt: resolveAnchorDate(row, "note"),
        });
      }

      if (
        reason &&
        !timelines.some((content) => extractDealCancellationReasonFromTimelineContent(content) === reason)
      ) {
        inserts.push({
          id: randomUUID(),
          dealId: row.id,
          content: `${DEAL_CANCELLATION_REASON_PREFIX} ${formatTimelineDate(resolveAnchorDate(row, "reason"))} ${reason}`,
          createdAt: resolveAnchorDate(row, "reason"),
        });
      }
    }

    const summary = {
      apply,
      candidateCount: inserts.length,
      noteCount: inserts.filter((row) => row.content.startsWith(DEAL_NOTE_PREFIX)).length,
      reasonCount: inserts.filter((row) => row.content.startsWith(DEAL_CANCELLATION_REASON_PREFIX)).length,
      sample: inserts.slice(0, 10),
    };
    console.log(JSON.stringify(summary, null, 2));

    if (!apply || inserts.length === 0) {
      return;
    }

    await client.query("begin");
    for (const row of inserts) {
      await client.query(
        `
          insert into deal_timelines (
            id,
            deal_id,
            content,
            author_id,
            author_name,
            created_at
          ) values ($1, $2, $3, $4, $5, $6)
        `,
        [row.id, row.dealId, row.content, null, "시스템", row.createdAt],
      );
    }
    await client.query("commit");
    console.log(`inserted ${inserts.length} timeline rows`);
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
