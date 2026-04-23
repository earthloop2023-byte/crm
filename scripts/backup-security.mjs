import crypto from "node:crypto";
import { promises as fs } from "node:fs";

const BACKUP_ENVELOPE_KIND = "crm.backup.envelope";
const BACKUP_ENVELOPE_VERSION = 1;
const BACKUP_ENVELOPE_ALGORITHM = "aes-256-gcm";

function getBackupEncryptionSecret() {
  const value = String(process.env.BACKUP_ENCRYPTION_KEY || "").trim();
  return value || null;
}

function isEncryptedBackupEnvelope(value) {
  if (!value || typeof value !== "object") return false;
  return (
    value.kind === BACKUP_ENVELOPE_KIND &&
    value.version === BACKUP_ENVELOPE_VERSION &&
    value.algorithm === BACKUP_ENVELOPE_ALGORITHM &&
    typeof value.salt === "string" &&
    typeof value.iv === "string" &&
    typeof value.tag === "string" &&
    typeof value.ciphertext === "string"
  );
}

function deriveEncryptionKey(secret, salt) {
  return crypto.scryptSync(secret, salt, 32);
}

function maybeRequireProductionBackupKey() {
  if (String(process.env.NODE_ENV || "").toLowerCase() === "production" && !getBackupEncryptionSecret()) {
    throw new Error("BACKUP_ENCRYPTION_KEY is required in production for JSON backup operations.");
  }
}

function serializeBackupContent(plaintext) {
  const secret = getBackupEncryptionSecret();
  if (!secret) {
    return { stored: plaintext, encrypted: false };
  }

  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveEncryptionKey(secret, salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    stored: JSON.stringify({
      kind: BACKUP_ENVELOPE_KIND,
      version: BACKUP_ENVELOPE_VERSION,
      algorithm: BACKUP_ENVELOPE_ALGORITHM,
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    }),
    encrypted: true,
  };
}

function deserializeBackupContent(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { plaintext: raw, encrypted: false };
  }

  if (!isEncryptedBackupEnvelope(parsed)) {
    return { plaintext: raw, encrypted: false };
  }

  const secret = getBackupEncryptionSecret();
  if (!secret) {
    throw new Error("BACKUP_ENCRYPTION_KEY is required to decrypt this backup file.");
  }

  const salt = Buffer.from(parsed.salt, "base64");
  const iv = Buffer.from(parsed.iv, "base64");
  const tag = Buffer.from(parsed.tag, "base64");
  const ciphertext = Buffer.from(parsed.ciphertext, "base64");
  const key = deriveEncryptionKey(secret, salt);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");

  return { plaintext, encrypted: true };
}

async function tightenPermissions(targetPath, mode) {
  try {
    await fs.chmod(targetPath, mode);
  } catch (error) {
    if (["EPERM", "EINVAL", "ENOSYS", "UNKNOWN"].includes(error?.code || "")) {
      return;
    }
    throw error;
  }
}

export {
  deserializeBackupContent,
  maybeRequireProductionBackupKey,
  serializeBackupContent,
  tightenPermissions,
};
