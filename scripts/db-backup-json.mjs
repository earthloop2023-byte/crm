import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";
import {
  maybeRequireProductionBackupKey,
  serializeBackupContent,
  tightenPermissions,
} from "./backup-security.mjs";

const TABLE_SPECS = [
  { key: "users", tableName: "users" },
  { key: "customers", tableName: "customers" },
  { key: "contacts", tableName: "contacts" },
  { key: "customerCounselings", tableName: "customer_counselings" },
  { key: "customerChangeHistories", tableName: "customer_change_histories" },
  { key: "customerFiles", tableName: "customer_files" },
  { key: "deals", tableName: "deals" },
  { key: "dealTimelines", tableName: "deal_timelines" },
  { key: "regionalUnpaidUploads", tableName: "regional_unpaid_uploads" },
  { key: "regionalManagementFees", tableName: "regional_management_fees" },
  { key: "regionalCustomerLists", tableName: "regional_customer_lists" },
  { key: "activities", tableName: "activities" },
  { key: "payments", tableName: "payments" },
  { key: "products", tableName: "products" },
  { key: "productRateHistories", tableName: "product_rate_histories" },
  { key: "contracts", tableName: "contracts" },
  { key: "refunds", tableName: "refunds" },
  { key: "keeps", tableName: "keeps" },
  { key: "deposits", tableName: "deposits" },
  { key: "notices", tableName: "notices" },
  { key: "pagePermissions", tableName: "page_permissions" },
  { key: "systemSettings", tableName: "system_settings" },
  { key: "systemLogs", tableName: "system_logs" },
  { key: "quotations", tableName: "quotations" },
  { key: "importBatches", tableName: "import_batches" },
  { key: "importStagingRows", tableName: "import_staging_rows" },
  { key: "importMappings", tableName: "import_mappings" },
];

const EXCLUDED_TABLES = ["database_backups"];

function nowStamp() {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function parsePositiveInt(rawValue, fallbackValue) {
  const parsed = Number.parseInt(String(rawValue || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackValue;
  return parsed;
}

function quoteIdentifier(name) {
  return `"${String(name).replace(/"/g, "\"\"")}"`;
}

function normalizeRemotePath(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function sanitizeFileLabel(value) {
  return String(value || "")
    .normalize("NFC")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getDatabaseName(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    const databaseName = parsed.pathname.replace(/^\//, "");
    return databaseName || "crmdb";
  } catch {
    return "crmdb";
  }
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function pruneOldBackups(directoryPath, keepCount) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const backupsBySeries = new Map();

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".backup.json")) continue;
    const fullPath = path.join(directoryPath, entry.name);
    const stat = await fs.stat(fullPath);
    const seriesKey = getBackupSeriesKey(entry.name);
    if (!seriesKey) continue;
    if (!backupsBySeries.has(seriesKey)) backupsBySeries.set(seriesKey, []);
    backupsBySeries.get(seriesKey).push({
      fullPath,
      baseName: entry.name.slice(0, -".backup.json".length),
      mtimeMs: stat.mtimeMs,
    });
  }

  let removedCount = 0;

  for (const backups of backupsBySeries.values()) {
    backups.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const removeTargets = backups.slice(keepCount);

    for (const target of removeTargets) {
      const relatedFiles = [
        target.fullPath,
        path.join(directoryPath, `${target.baseName}.meta.json`),
        path.join(directoryPath, `${target.baseName}.sha256`),
      ];

      for (const filePath of relatedFiles) {
        try {
          await fs.unlink(filePath);
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      }
      removedCount += 1;
    }
  }

  return removedCount;
}

async function fetchTableRows(client, tableName) {
  const result = await client.query(`SELECT * FROM ${quoteIdentifier(tableName)}`);
  return result.rows;
}

function runRclone(rcloneBin, args, options = {}) {
  const result = spawnSync(rcloneBin, args, {
    stdio: options.captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
    env: process.env,
    encoding: "utf8",
  });

  if (result.error) {
    throw new Error(`Failed to execute ${rcloneBin}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = options.captureOutput ? String(result.stderr || "").trim() : "";
    throw new Error(
      `${rcloneBin} ${args[0]} failed with exit code ${result.status ?? "unknown"}${stderr ? `: ${stderr}` : ""}`
    );
  }

  return options.captureOutput ? String(result.stdout || "") : "";
}

function uploadFileWithRclone(rcloneBin, localPath, remoteTarget) {
  runRclone(rcloneBin, ["copyto", localPath, remoteTarget]);
}

function deleteRemoteFileWithRclone(rcloneBin, remoteTarget) {
  runRclone(rcloneBin, ["deletefile", remoteTarget]);
}

function listRemoteFilesWithRclone(rcloneBin, remoteBase) {
  const stdout = runRclone(
    rcloneBin,
    ["lsf", "--files-only", remoteBase],
    { captureOutput: true }
  );
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getBackupSeriesKey(fileName) {
  const normalized = String(fileName || "").trim();
  const match = normalized.match(/^(.*)-\d{8}-\d{6}\.backup\.json$/);
  return match ? match[1] : null;
}

async function pruneOldRemoteBackups(rcloneBin, remoteBase, keepCount) {
  const files = listRemoteFilesWithRclone(rcloneBin, remoteBase);
  const backupsBySeries = new Map();

  for (const fileName of files) {
    if (!fileName.endsWith(".backup.json")) continue;
    const seriesKey = getBackupSeriesKey(fileName);
    if (!seriesKey) continue;
    if (!backupsBySeries.has(seriesKey)) backupsBySeries.set(seriesKey, []);
    backupsBySeries.get(seriesKey).push(fileName);
  }

  let removedCount = 0;

  for (const backupFiles of backupsBySeries.values()) {
    backupFiles.sort((a, b) => b.localeCompare(a, "en"));
    const removeTargets = backupFiles.slice(keepCount);

    for (const backupName of removeTargets) {
      const baseName = backupName.slice(0, -".backup.json".length);
      const relatedFiles = [
        backupName,
        `${baseName}.meta.json`,
        `${baseName}.sha256`,
      ];

      for (const fileName of relatedFiles) {
        if (!files.includes(fileName)) continue;
        deleteRemoteFileWithRclone(rcloneBin, `${remoteBase}/${fileName}`);
      }
      removedCount += 1;
    }
  }

  return removedCount;
}

function buildMenuPayload(basePayload, label, includedKeys) {
  const tables = {};
  const tableCounts = {};

  for (const key of includedKeys) {
    tables[key] = basePayload.tables[key] ?? [];
    tableCounts[key] = basePayload.tableCounts[key] ?? 0;
  }

  return {
    backupType: basePayload.backupType,
    backupVersion: basePayload.backupVersion,
    createdAt: basePayload.createdAt,
    databaseName: basePayload.databaseName,
    excludedTables: basePayload.excludedTables,
    scopeLabel: label,
    includedTables: includedKeys,
    tableCounts,
    tables,
  };
}

async function writeJsonBackupArtifact({
  backupDirectory,
  baseFileName,
  payload,
  retentionCount,
  databaseName,
  rcloneRemote,
  rcloneRemotePath,
  rcloneBin,
}) {
  const backupPath = path.join(backupDirectory, `${baseFileName}.backup.json`);
  const metaPath = path.join(backupDirectory, `${baseFileName}.meta.json`);
  const hashPath = path.join(backupDirectory, `${baseFileName}.sha256`);
  const serializedBackup = serializeBackupContent(`${JSON.stringify(payload, null, 2)}\n`);

  await fs.writeFile(backupPath, serializedBackup.stored, "utf8");
  await tightenPermissions(backupPath, 0o600);

  const stat = await fs.stat(backupPath);
  const sha256 = await sha256File(backupPath);
  const metadata = {
    createdAt: payload.createdAt,
    file: path.basename(backupPath),
    sizeBytes: stat.size,
    sha256,
    retentionCount,
    databaseName,
    scopeLabel: payload.scopeLabel || null,
    excludedTables: EXCLUDED_TABLES,
    includedTables: payload.includedTables || Object.keys(payload.tables || {}),
    tableCounts: payload.tableCounts,
    protection: {
      encrypted: serializedBackup.encrypted,
      scheme: serializedBackup.encrypted ? "aes-256-gcm" : "plaintext",
    },
    driveUpload: {
      enabled: Boolean(rcloneRemote),
      remote: rcloneRemote || null,
      remotePath: rcloneRemote ? rcloneRemotePath : null,
      uploadedAt: null,
      prunedRemoteBackups: 0,
    },
  };

  if (rcloneRemote) {
    const remoteBase = rcloneRemotePath ? `${rcloneRemote}:${rcloneRemotePath}` : `${rcloneRemote}:`;
    uploadFileWithRclone(rcloneBin, backupPath, `${remoteBase}/${path.basename(backupPath)}`);
    metadata.driveUpload.uploadedAt = new Date().toISOString();
  }

  await fs.writeFile(metaPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  await fs.writeFile(hashPath, `${sha256}  ${path.basename(backupPath)}\n`, "utf8");
  await tightenPermissions(metaPath, 0o600);
  await tightenPermissions(hashPath, 0o600);

  if (rcloneRemote) {
    const remoteBase = rcloneRemotePath ? `${rcloneRemote}:${rcloneRemotePath}` : `${rcloneRemote}:`;
    uploadFileWithRclone(rcloneBin, metaPath, `${remoteBase}/${path.basename(metaPath)}`);
    uploadFileWithRclone(rcloneBin, hashPath, `${remoteBase}/${path.basename(hashPath)}`);
  }

  return { backupPath, metaPath, hashPath };
}

const databaseUrl = process.env.DATABASE_URL || "";
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const backupDirectory = path.resolve(process.cwd(), process.env.DB_BACKUP_JSON_DIR || "backups/json");
const retentionCount = parsePositiveInt(process.env.DB_BACKUP_JSON_RETENTION || process.env.DB_BACKUP_RETENTION, 12);
const rcloneBin = process.env.RCLONE_BIN || "rclone";
const rcloneRemote = String(process.env.RCLONE_REMOTE || "").trim();
const rcloneRemotePath = normalizeRemotePath(process.env.RCLONE_REMOTE_PATH || "crm-backups/json-weekly");

const stamp = nowStamp();
const databaseName = getDatabaseName(databaseUrl);
await fs.mkdir(backupDirectory, { recursive: true });
await tightenPermissions(backupDirectory, 0o700);
maybeRequireProductionBackupKey();

const client = new Client({ connectionString: databaseUrl });
await client.connect();

let payload = null;

try {
  const tables = {};
  const tableCounts = {};

  for (const spec of TABLE_SPECS) {
    const rows = await fetchTableRows(client, spec.tableName);
    tables[spec.key] = rows;
    tableCounts[spec.key] = rows.length;
  }

  payload = {
    backupType: "json",
    backupVersion: 2,
    createdAt: new Date().toISOString(),
    databaseName,
    excludedTables: EXCLUDED_TABLES,
    tableCounts,
    tables,
  };
} finally {
  await client.end();
}

const backupJobs = MENU_BACKUP_DEFINITIONS.map((definition) => ({
    baseFileName: `${databaseName}-${sanitizeFileLabel(definition.label)}-json-${stamp}`,
    payload: buildMenuPayload(payload, definition.label, definition.keys),
  }));

const createdArtifacts = [];

for (const job of backupJobs) {
  const artifact = await writeJsonBackupArtifact({
    backupDirectory,
    baseFileName: job.baseFileName,
    payload: job.payload,
    retentionCount,
    databaseName,
    rcloneRemote,
    rcloneRemotePath,
    rcloneBin,
  });
  createdArtifacts.push({ ...artifact, label: job.payload.scopeLabel || "전체CRM" });
}

let prunedRemoteCount = 0;
if (rcloneRemote) {
  const remoteBase = rcloneRemotePath ? `${rcloneRemote}:${rcloneRemotePath}` : `${rcloneRemote}:`;
  prunedRemoteCount = await pruneOldRemoteBackups(rcloneBin, remoteBase, retentionCount);
}
const removedCount = await pruneOldBackups(backupDirectory, retentionCount);

for (const artifact of createdArtifacts) {
  console.log(`[${artifact.label}] JSON backup created: ${artifact.backupPath}`);
  console.log(`[${artifact.label}] Metadata: ${artifact.metaPath}`);
  console.log(`[${artifact.label}] SHA256: ${artifact.hashPath}`);
}
if (rcloneRemote) {
  console.log(`Uploaded to: ${rcloneRemote}${rcloneRemotePath ? `:${rcloneRemotePath}` : ":"}`);
  console.log(`Pruned remote backups: ${prunedRemoteCount}`);
}
console.log(`Pruned backups: ${removedCount}`);
