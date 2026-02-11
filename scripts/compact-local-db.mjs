#!/usr/bin/env node
/**
 * compact-local-db.mjs — Compact the local Convex SQLite database.
 *
 * The Convex local backend stores an append-only transaction log in SQLite.
 * Over time this can grow very large (multiple GB) due to high-frequency
 * mutations (presence updates, NPC ticks, etc.).
 *
 * This script runs SQLite VACUUM on the database file to reclaim space.
 * The backend must be STOPPED before running this.
 *
 * Usage:
 *   node scripts/compact-local-db.mjs           # compact with default path
 *   node scripts/compact-local-db.mjs --check   # just report size, don't compact
 *
 * You can also pass a custom path:
 *   node scripts/compact-local-db.mjs /path/to/convex_local_backend.sqlite3
 */

import { execSync } from "child_process";
import { statSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ---------------------------------------------------------------------------
// Resolve the SQLite database path
// ---------------------------------------------------------------------------

function findDefaultDbPath() {
  const stateDir = join(homedir(), ".convex", "convex-backend-state");
  // Look for the first deployment directory
  try {
    const entries = execSync(`ls "${stateDir}"`, { encoding: "utf-8" })
      .trim()
      .split("\n")
      .filter(Boolean);
    for (const entry of entries) {
      const dbPath = join(stateDir, entry, "convex_local_backend.sqlite3");
      if (existsSync(dbPath)) return dbPath;
    }
  } catch {
    // fall through
  }
  return null;
}

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const customPath = args.find((a) => !a.startsWith("--"));

const dbPath = customPath || findDefaultDbPath();

if (!dbPath || !existsSync(dbPath)) {
  console.error("❌ Could not find local Convex SQLite database.");
  console.error("   Pass the path explicitly: node scripts/compact-local-db.mjs /path/to/db.sqlite3");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Check if backend is running
// ---------------------------------------------------------------------------

function isBackendRunning() {
  try {
    const result = execSync("lsof -i :3210 -t 2>/dev/null", { encoding: "utf-8" }).trim();
    return result.length > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Report size
// ---------------------------------------------------------------------------

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const sizeBefore = statSync(dbPath).size;
console.log(`📂 Database: ${dbPath}`);
console.log(`📏 Current size: ${formatSize(sizeBefore)}`);

if (checkOnly) {
  if (sizeBefore > 500 * 1024 * 1024) {
    console.log(`⚠️  Database is over 500 MB — consider running without --check to compact.`);
  } else {
    console.log(`✅ Database size looks healthy.`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Compact
// ---------------------------------------------------------------------------

if (isBackendRunning()) {
  console.error("❌ Convex local backend appears to be running on port 3210.");
  console.error("   Stop it first (Ctrl+C on 'npx convex dev') then retry.");
  process.exit(1);
}

console.log("🔧 Running VACUUM (this may take a moment for large databases)...");
try {
  execSync(`sqlite3 "${dbPath}" "VACUUM;"`, { stdio: "inherit" });
} catch (err) {
  console.error("❌ VACUUM failed. Make sure sqlite3 is installed.");
  console.error("   On macOS: it's usually pre-installed. On Linux: apt install sqlite3");
  process.exit(1);
}

const sizeAfter = statSync(dbPath).size;
const saved = sizeBefore - sizeAfter;
console.log(`✅ Compacted: ${formatSize(sizeBefore)} → ${formatSize(sizeAfter)} (saved ${formatSize(saved)})`);

if (sizeAfter > 500 * 1024 * 1024) {
  console.log(`💡 Still large. If the data is expendable, consider resetting:`);
  console.log(`   rm "${dbPath}" && npx convex dev`);
}
