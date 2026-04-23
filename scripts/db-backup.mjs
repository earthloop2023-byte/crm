import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tightenPermissions } from "./backup-security.mjs";

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

function sanitizeFileLabel(value) {
  return String(value || "")
    .normalize("NFC")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
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
  const dumps = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".dump")) continue;
    const fullPath = path.join(directoryPath, entry.name);
    const stat = await fs.stat(fullPath);
    dumps.push({
      fullPath,
      baseName: entry.name.slice(0, -".dump".length),
      mtimeMs: stat.mtimeMs,
    });
  }

  dumps.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const removeTargets = dumps.slice(keepCount);
  let removed = 0;

  for (const target of removeTargets) {
    const relatedFiles = [
      target.fullPath,
      path.join(directoryPath, `${target.baseName}.json`),
      path.join(directoryPath, `${target.baseName}.sha256`),
    ];
    for (const file of relatedFiles) {
      try {
        await fs.unlink(file);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    removed += 1;
  }

  return removed;
}

const databaseUrl = process.env.DATABASE_URL || "";
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pgDumpBin = process.env.PG_DUMP_BIN || "pg_dump";
const backupDirectory = path.resolve(process.cwd(), process.env.DB_BACKUP_DIR || "backups/db");
const retentionCount = parsePositiveInt(process.env.DB_BACKUP_RETENTION, 30);
const stamp = nowStamp();
const backupLabel = sanitizeFileLabel(
  process.env.DB_BACKUP_FILE_LABEL || process.env.DB_BACKUP_LABEL || ""
);
const baseFileName = backupLabel ? `crmdb-${backupLabel}-${stamp}` : `crmdb-${stamp}`;
const dumpPath = path.join(backupDirectory, `${baseFileName}.dump`);
const metaPath = path.join(backupDirectory, `${baseFileName}.json`);
const hashPath = path.join(backupDirectory, `${baseFileName}.sha256`);

await fs.mkdir(backupDirectory, { recursive: true });
await tightenPermissions(backupDirectory, 0o700);

const dumpArgs = [
  "--format=custom",
  "--no-owner",
  "--no-privileges",
  "--file",
  dumpPath,
  databaseUrl,
];

const dumpResult = spawnSync(pgDumpBin, dumpArgs, {
  stdio: "inherit",
  env: process.env,
});

if (dumpResult.error) {
  console.error(`Failed to execute ${pgDumpBin}: ${dumpResult.error.message}`);
  console.error("Set PG_DUMP_BIN to the full pg_dump executable path if needed.");
  process.exit(1);
}

if (dumpResult.status !== 0) {
  console.error(`pg_dump failed with exit code ${dumpResult.status ?? "unknown"}.`);
  process.exit(dumpResult.status ?? 1);
}

const stat = await fs.stat(dumpPath);
const sha256 = await sha256File(dumpPath);
await tightenPermissions(dumpPath, 0o600);

const metadata = {
  createdAt: new Date().toISOString(),
  file: path.basename(dumpPath),
  sizeBytes: stat.size,
  sha256,
  retentionCount,
};

await fs.writeFile(metaPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
await fs.writeFile(hashPath, `${sha256}  ${path.basename(dumpPath)}\n`, "utf8");
await tightenPermissions(metaPath, 0o600);
await tightenPermissions(hashPath, 0o600);

const removedCount = await pruneOldBackups(backupDirectory, retentionCount);

console.log(`Backup created: ${dumpPath}`);
console.log(`Metadata: ${metaPath}`);
console.log(`SHA256: ${hashPath}`);
console.log(`Pruned backups: ${removedCount}`);
