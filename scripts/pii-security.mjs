import crypto from "crypto";

const PII_ENVELOPE_KIND = "crm.pii.envelope";
const PII_ENVELOPE_VERSION_V1 = 1;
const PII_ENVELOPE_VERSION_V2 = 2;
const PII_ENVELOPE_ALGORITHM = "aes-256-gcm";

export const PII_TABLE_COLUMN_MAP = {
  users: ["email", "phone"],
  customers: ["email", "phone", "notes"],
  contacts: ["name", "email", "phone"],
  deals: ["phone", "email", "billing_account_number", "notes"],
  payments: ["notes"],
  system_logs: ["login_id", "user_name", "ip_address", "user_agent", "details"],
  contracts: ["user_identifier", "notes"],
  refunds: ["user_identifier", "account"],
  keeps: ["user_identifier"],
  deposits: ["depositor_name", "notes"],
  quotations: [
    "customer_phone",
    "customer_email",
    "customer_name",
    "customer_company",
    "project_name",
    "notes",
    "created_by_email",
    "created_by_phone",
  ],
  customer_counselings: ["content"],
  customer_change_histories: ["before_data", "after_data"],
  customer_files: ["file_name", "original_file_name", "file_data", "note"],
};

function getPiiEncryptionSecret() {
  const value = String(process.env.PII_ENCRYPTION_KEY || "").trim();
  return value || null;
}

function deriveEncryptionKey(secret, salt) {
  return crypto.scryptSync(secret, salt, 32);
}

let cachedSecretForStaticKey = null;
let cachedStaticKey = null;

function getStaticEncryptionKey(secret) {
  if (cachedStaticKey && cachedSecretForStaticKey === secret) {
    return cachedStaticKey;
  }
  cachedSecretForStaticKey = secret;
  cachedStaticKey = crypto.createHash("sha256").update(secret, "utf8").digest();
  return cachedStaticKey;
}

function isPiiEnvelopeV1(value) {
  if (!value || typeof value !== "object") return false;
  return (
    value.kind === PII_ENVELOPE_KIND &&
    value.version === PII_ENVELOPE_VERSION_V1 &&
    value.algorithm === PII_ENVELOPE_ALGORITHM &&
    typeof value.salt === "string" &&
    typeof value.iv === "string" &&
    typeof value.tag === "string" &&
    typeof value.ciphertext === "string"
  );
}

function isPiiEnvelopeV2(value) {
  if (!value || typeof value !== "object") return false;
  return (
    value.kind === PII_ENVELOPE_KIND &&
    value.version === PII_ENVELOPE_VERSION_V2 &&
    value.algorithm === PII_ENVELOPE_ALGORITHM &&
    typeof value.iv === "string" &&
    typeof value.tag === "string" &&
    typeof value.ciphertext === "string"
  );
}

function isPiiEnvelope(value) {
  return isPiiEnvelopeV1(value) || isPiiEnvelopeV2(value);
}

export function assertPiiEncryptionKey() {
  if (!getPiiEncryptionSecret()) {
    throw new Error("PII_ENCRYPTION_KEY is required for this operation.");
  }
}

export function isEncryptedPiiStoredValue(value) {
  if (typeof value !== "string" || !value) return false;
  try {
    return isPiiEnvelope(JSON.parse(value));
  } catch {
    return false;
  }
}

export function isLatestEncryptedPiiStoredValue(value) {
  if (typeof value !== "string" || !value) return false;
  try {
    return isPiiEnvelopeV2(JSON.parse(value));
  } catch {
    return false;
  }
}

export function serializePiiContent(plaintext) {
  if (plaintext === "") {
    return { stored: plaintext, encrypted: false };
  }

  const secret = getPiiEncryptionSecret();
  if (!secret) {
    return { stored: plaintext, encrypted: false };
  }

  const iv = crypto.randomBytes(12);
  const key = getStaticEncryptionKey(secret);
  const cipher = crypto.createCipheriv(PII_ENVELOPE_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    stored: JSON.stringify({
      kind: PII_ENVELOPE_KIND,
      version: PII_ENVELOPE_VERSION_V2,
      algorithm: PII_ENVELOPE_ALGORITHM,
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    }),
    encrypted: true,
  };
}

export function deserializePiiContent(stored) {
  if (!stored) {
    return { plaintext: stored, encrypted: false, latest: false };
  }

  let parsed;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return { plaintext: stored, encrypted: false, latest: false };
  }

  if (!isPiiEnvelope(parsed)) {
    return { plaintext: stored, encrypted: false, latest: false };
  }

  const secret = getPiiEncryptionSecret();
  if (!secret) {
    throw new Error("PII_ENCRYPTION_KEY is required to decrypt this value.");
  }

  const iv = Buffer.from(parsed.iv, "base64");
  const tag = Buffer.from(parsed.tag, "base64");
  const ciphertext = Buffer.from(parsed.ciphertext, "base64");
  const key = isPiiEnvelopeV1(parsed)
    ? deriveEncryptionKey(secret, Buffer.from(parsed.salt, "base64"))
    : getStaticEncryptionKey(secret);
  const decipher = crypto.createDecipheriv(PII_ENVELOPE_ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");

  return {
    plaintext,
    encrypted: true,
    latest: isPiiEnvelopeV2(parsed),
  };
}
