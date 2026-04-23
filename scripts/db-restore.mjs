import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const dumpFileArg = args[0];
const hasConfirm = args.includes("--yes");

if (!dumpFileArg) {
  console.error("Usage: node scripts/db-restore.mjs <dump-file> --yes");
  process.exit(1);
}

if (!hasConfirm) {
  console.error("Restore is destructive. Re-run with --yes to continue.");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL || "";
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pgRestoreBin = process.env.PG_RESTORE_BIN || "pg_restore";
const dumpPath = path.resolve(process.cwd(), dumpFileArg);

try {
  const stat = await fs.stat(dumpPath);
  if (!stat.isFile()) {
    console.error(`Dump file is not a file: ${dumpPath}`);
    process.exit(1);
  }
} catch {
  console.error(`Dump file not found: ${dumpPath}`);
  process.exit(1);
}

const restoreArgs = [
  "--clean",
  "--if-exists",
  "--no-owner",
  "--no-privileges",
  "--dbname",
  databaseUrl,
  dumpPath,
];

const restoreResult = spawnSync(pgRestoreBin, restoreArgs, {
  stdio: "inherit",
  env: process.env,
});

if (restoreResult.error) {
  console.error(`Failed to execute ${pgRestoreBin}: ${restoreResult.error.message}`);
  console.error("Set PG_RESTORE_BIN to the full pg_restore executable path if needed.");
  process.exit(1);
}

if (restoreResult.status !== 0) {
  console.error(`pg_restore failed with exit code ${restoreResult.status ?? "unknown"}.`);
  process.exit(restoreResult.status ?? 1);
}

console.log(`Restore completed from: ${dumpPath}`);
