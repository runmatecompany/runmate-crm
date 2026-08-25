import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

const execFileAsync = promisify(execFile);

// A gépen telepített PostgreSQL pg_dump.exe elérési útja — nincs a PATH-ban,
// ezért a teljes útvonalat kell megadni (felülírható PG_DUMP_PATH env
// változóval, ha valaha máshova települ/más verzióra frissül).
const PG_DUMP_PATH = process.env.PG_DUMP_PATH || "C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe";
const BACKUP_DIR = "D:\\RUNMATE_CRM\\0\\backups";
const RETENTION_DAYS = 30;

function todayFilename(): string {
  const dateStr = new Date().toISOString().slice(0, 10);
  return `runmate_crm_backup_${dateStr}.sql`;
}

async function pruneOldBackups(): Promise<void> {
  const files = await fs.readdir(BACKUP_DIR).catch(() => [] as string[]);
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const file of files) {
    if (!file.startsWith("runmate_crm_backup_")) continue;
    const filePath = path.join(BACKUP_DIR, file);
    const stat = await fs.stat(filePath).catch(() => null);
    if (stat && stat.mtimeMs < cutoff) {
      await fs.unlink(filePath).catch(() => {});
    }
  }
}

// Napi, sima SQL-dump mentés — a felhasználó a Számlázás modult a valódi,
// egyetlen számlázó rendszereként használja, ezért a teljes adatbázist
// (nem csak a számlákat) érdemes megőrizni visszaállítható formában.
// Ugyanaz a fájlnév egy napon belül felülíródik (nem több mentés/nap), a
// RETENTION_DAYS-nél régebbi napi mentések törlődnek minden futáskor.
export async function runDatabaseBackup(): Promise<void> {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const outFile = path.join(BACKUP_DIR, todayFilename());
  await execFileAsync(PG_DUMP_PATH, [config.databaseUrl, "--format=plain", "-f", outFile]);
  await pruneOldBackups();
}
