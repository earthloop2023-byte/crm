import crypto from "crypto";

const BACKUP_ENVELOPE_KIND = "crm.backup.envelope";
const BACKUP_ENVELOPE_VERSION = 1;
const BACKUP_ENVELOPE_ALGORITHM = "aes-256-gcm";

interface BackupEnvelopeV1 {
  kind: typeof BACKUP_ENVELOPE_KIND;
  version: typeof BACKUP_ENVELOPE_VERSION;
  algorithm: typeof BACKUP_ENVELOPE_ALGORITHM;
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

function getBackupEncryptionSecret(): string | null {
  const value = String(process.env.BACKUP_ENCRYPTION_KEY || "").trim();
  return value || null;
}

function isEncryptedBackupEnvelope(value: unknown): value is BackupEnvelopeV1 {
  if (!value || typeof value !== "object") return false;
  const envelope = value as Record<string, unknown>;
  return (
    envelope.kind === BACKUP_ENVELOPE_KIND &&
    envelope.version === BACKUP_ENVELOPE_VERSION &&
    envelope.algorithm === BACKUP_ENVELOPE_ALGORITHM &&
    typeof envelope.salt === "string" &&
    typeof envelope.iv === "string" &&
    typeof envelope.tag === "string" &&
    typeof envelope.ciphertext === "string"
  );
}

function requireBufferFromBase64(value: string, label: string): Buffer {
  try {
    return Buffer.from(value, "base64");
  } catch {
    throw new Error(`Invalid encrypted backup ${label}.`);
  }
}

function deriveEncryptionKey(secret: string, salt: Buffer) {
  return crypto.scryptSync(secret, salt, 32);
}

export function isBackupEncryptionConfigured() {
  return Boolean(getBackupEncryptionSecret());
}

export function assertBackupEncryptionReadyForProduction() {
  if (process.env.NODE_ENV === "production" && !isBackupEncryptionConfigured()) {
    throw new Error("BACKUP_ENCRYPTION_KEY must be set in production for backup operations.");
  }
}

export function serializeBackupData(plaintext: string): { stored: string; encrypted: boolean } {
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

  const envelope: BackupEnvelopeV1 = {
    kind: BACKUP_ENVELOPE_KIND,
    version: BACKUP_ENVELOPE_VERSION,
    algorithm: BACKUP_ENVELOPE_ALGORITHM,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };

  return {
    stored: JSON.stringify(envelope),
    encrypted: true,
  };
}

export function deserializeBackupData(stored: string): { plaintext: string; encrypted: boolean } {
  const raw = String(stored || "");
  if (!raw) {
    return { plaintext: raw, encrypted: false };
  }

  let parsed: unknown;
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
    throw new Error("BACKUP_ENCRYPTION_KEY is required to decrypt this backup.");
  }

  const salt = requireBufferFromBase64(parsed.salt, "salt");
  const iv = requireBufferFromBase64(parsed.iv, "iv");
  const tag = requireBufferFromBase64(parsed.tag, "tag");
  const ciphertext = requireBufferFromBase64(parsed.ciphertext, "ciphertext");
  const key = deriveEncryptionKey(secret, salt);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");

  return {
    plaintext,
    encrypted: true,
  };
}
