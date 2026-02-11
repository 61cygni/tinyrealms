#!/usr/bin/env node
/**
 * Safe selective restore from a dump file.
 *
 * Features:
 * - Table-by-table restore (explicit selection)
 * - Dry-run planning mode
 * - Confirmation gate before writes
 * - Chunked inserts
 * - Sanitization of IDs/legacy fields to avoid cross-deployment corruption
 *
 * Usage:
 *   node scripts/restore-world.mjs --in dumps/state-2026-...json --tables maps,itemDefs --dry-run
 *   node scripts/restore-world.mjs --in dumps/state-2026-...json --tables worldItems,messages --confirm
 */
import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { createInterface } from "readline";
import { createHash } from "crypto";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
if (!ADMIN_API_KEY) {
  console.error("Error: ADMIN_API_KEY is not set.");
  console.error("  export ADMIN_API_KEY='your-secret'");
  process.exit(1);
}

const ALLOWED = new Set([
  "maps",
  "spriteDefinitions",
  "npcProfiles",
  "mapObjects",
  "itemDefs",
  "worldItems",
  "messages",
]);

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const inPath = get("--in");
  const tableCsv = get("--tables");
  const reportOutArg = get("--report-out");
  const dryRun = args.includes("--dry-run");
  const confirm = args.includes("--confirm");
  if (!inPath || !tableCsv) {
    console.error("Usage: node scripts/restore-world.mjs --in <dump.json> --tables <a,b,c> [--dry-run] [--confirm]");
    process.exit(1);
  }
  const tables = tableCsv.split(",").map((s) => s.trim()).filter(Boolean);
  for (const t of tables) {
    if (!ALLOWED.has(t)) {
      console.error(`Table "${t}" is not allowed. Allowed: ${[...ALLOWED].join(", ")}`);
      process.exit(1);
    }
  }
  return {
    inPath: resolve(inPath),
    tables,
    dryRun,
    confirm,
    reportOut: reportOutArg ? resolve(reportOutArg) : undefined,
  };
}

function convexRun(fnName, args = {}) {
  const argsJson = JSON.stringify({ adminKey: ADMIN_API_KEY, ...args });
  const out = execSync(`npx convex run "${fnName}" '${argsJson}'`, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  const lines = out.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      // continue
    }
  }
  return out.trim();
}

function sanitizeRow(table, row) {
  const { _id, _creationTime, ...r } = row ?? {};
  if (table === "maps") {
    delete r.createdBy;
    delete r.creatorProfileId;
    delete r.editors;
    delete r.tilesetId;
    delete r.animatedTiles;
    return r;
  }
  if (table === "itemDefs") {
    delete r.createdBy;
    return r;
  }
  if (table === "worldItems") {
    delete r.pickedUpBy;
    delete r.placedBy;
    return r;
  }
  if (table === "messages") {
    delete r.profileId;
    return r;
  }
  return r;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortKeysDeep(value[key]);
    }
    return out;
  }
  return value;
}

function hashRows(rows) {
  const normalized = rows.map((r) => JSON.stringify(sortKeysDeep(r))).sort();
  return createHash("sha256").update(normalized.join("\n"), "utf8").digest("hex");
}

async function askConfirmation(promptText) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolveAnswer) => {
    rl.question(promptText, resolveAnswer);
  });
  rl.close();
  return String(answer).trim();
}

async function main() {
  const { inPath, tables, dryRun, confirm, reportOut } = parseArgs();
  const dump = JSON.parse(readFileSync(inPath, "utf8"));
  const startedAt = new Date().toISOString();

  console.log(`Loaded dump: ${inPath}`);
  console.log(`Tables selected: ${tables.join(", ")}`);

  const plan = [];
  for (const table of tables) {
    const rows = Array.isArray(dump[table]) ? dump[table] : [];
    const sanitized = rows.map((r) => sanitizeRow(table, r));
    plan.push({
      table,
      original: rows.length,
      sanitized: sanitized.length,
      rows: sanitized,
      expectedHash: hashRows(sanitized),
    });
  }

  const beforeDump = convexRun("admin:dumpAll", {});
  const beforeByTable = {};
  for (const p of plan) {
    const rows = Array.isArray(beforeDump[p.table]) ? beforeDump[p.table].map((r) => sanitizeRow(p.table, r)) : [];
    beforeByTable[p.table] = { count: rows.length, hash: hashRows(rows) };
  }

  console.log("\nRestore plan:");
  for (const p of plan) {
    console.log(`- ${p.table}: ${p.original} row(s), hash=${p.expectedHash.slice(0, 12)}...`);
  }

  if (dryRun) {
    console.log("\nDry run only. No writes performed.");
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const defaultReport = resolve(ROOT, "dumps", `restore-report-${ts}.json`);
    const reportPath = reportOut ?? defaultReport;
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(
      reportPath,
      JSON.stringify(
        {
          mode: "dry-run",
          startedAt,
          finishedAt: new Date().toISOString(),
          inputDump: inPath,
          tables,
          before: beforeByTable,
          planned: Object.fromEntries(
            plan.map((p) => [p.table, { count: p.rows.length, expectedHash: p.expectedHash }]),
          ),
        },
        null,
        2,
      ),
      "utf8",
    );
    console.log(`Report written: ${reportPath}`);
    return;
  }

  if (!confirm) {
    console.log("\nBlocked: pass --confirm to execute writes.");
    return;
  }

  const answer = await askConfirmation(
    "\nType RESTORE to continue (this clears selected tables before inserting): ",
  );
  if (answer !== "RESTORE") {
    console.log("Cancelled.");
    return;
  }

  for (const p of plan) {
    console.log(`\nClearing ${p.table}...`);
    convexRun("admin:restoreClearTable", { table: p.table });

    if (p.rows.length === 0) {
      console.log(`Inserted 0 rows into ${p.table}`);
      continue;
    }

    const batches = chunk(p.rows, 25);
    let inserted = 0;
    for (let i = 0; i < batches.length; i++) {
      convexRun("admin:restoreInsertChunk", { table: p.table, rows: batches[i] });
      inserted += batches[i].length;
      console.log(`  ${p.table}: ${inserted}/${p.rows.length}`);
    }
    console.log(`Done: ${p.table} (${inserted} rows)`);
  }

  const afterDump = convexRun("admin:dumpAll", {});
  const afterByTable = {};
  for (const p of plan) {
    const rows = Array.isArray(afterDump[p.table]) ? afterDump[p.table].map((r) => sanitizeRow(p.table, r)) : [];
    afterByTable[p.table] = { count: rows.length, hash: hashRows(rows) };
  }

  const verification = {};
  for (const p of plan) {
    const after = afterByTable[p.table];
    verification[p.table] = {
      expectedCount: p.rows.length,
      actualCount: after.count,
      expectedHash: p.expectedHash,
      actualHash: after.hash,
      countMatch: after.count === p.rows.length,
      hashMatch: after.hash === p.expectedHash,
    };
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const defaultReport = resolve(ROOT, "dumps", `restore-report-${ts}.json`);
  const reportPath = reportOut ?? defaultReport;
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        mode: "apply",
        startedAt,
        finishedAt: new Date().toISOString(),
        inputDump: inPath,
        tables,
        before: beforeByTable,
        planned: Object.fromEntries(
          plan.map((p) => [p.table, { count: p.rows.length, expectedHash: p.expectedHash }]),
        ),
        after: afterByTable,
        verification,
      },
      null,
      2,
    ),
    "utf8",
  );

  const mismatches = Object.entries(verification).filter(([, v]) => !v.countMatch || !v.hashMatch);
  if (mismatches.length > 0) {
    console.warn("\nSelective restore completed with verification mismatches:");
    for (const [table] of mismatches) console.warn(`- ${table}`);
  } else {
    console.log("\nVerification passed for all selected tables.");
  }
  console.log(`Report written: ${reportPath}`);
  console.log("\nSelective restore complete.");
}

main().catch((err) => {
  console.error("Restore failed:", err?.message ?? err);
  process.exit(1);
});
