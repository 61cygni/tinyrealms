#!/usr/bin/env node
/**
 * Automated backup helper:
 * - Creates a new world dump in dumps/
 * - Prunes old dumps by retention days
 *
 * Usage:
 *   node scripts/backup-world.mjs
 *   node scripts/backup-world.mjs --retention-days 14
 *   node scripts/backup-world.mjs --full --retention-days 30
 */
import { execSync } from "child_process";
import { readdirSync, statSync, unlinkSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const DUMPS_DIR = resolve(ROOT, "dumps");

const args = process.argv.slice(2);
const full = args.includes("--full");
const idx = args.indexOf("--retention-days");
const retentionDays = idx >= 0 ? Number(args[idx + 1]) : 14;
if (!Number.isFinite(retentionDays) || retentionDays < 1) {
  console.error("Invalid --retention-days value");
  process.exit(1);
}

const dumpCmd = full
  ? "node scripts/dump-state.mjs --tiles"
  : "node scripts/dump-state.mjs";
execSync(dumpCmd, { cwd: ROOT, stdio: "inherit", shell: true });

const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
let deleted = 0;
for (const file of readdirSync(DUMPS_DIR)) {
  if (!file.startsWith("state-") || !file.endsWith(".json")) continue;
  const path = resolve(DUMPS_DIR, file);
  const st = statSync(path);
  if (st.mtimeMs < cutoffMs) {
    unlinkSync(path);
    deleted++;
  }
}

console.log(`Backup complete. Pruned ${deleted} old dump(s).`);
