#!/usr/bin/env node
/**
 * List maps in a compact table:
 *   <name> <owner> <size> <type>
 *
 * Reads ADMIN_API_KEY from process.env, with fallback to .env.local.
 *
 * Usage:
 *   npm run maps:list
 */
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");

function readEnvLocalAdminKey() {
  const envPath = resolve(ROOT, ".env.local");
  let content = "";
  try {
    content = readFileSync(envPath, "utf8");
  } catch {
    return undefined;
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (key !== "ADMIN_API_KEY") continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return undefined;
}

function parseJsonFromConvexOutput(output) {
  const text = String(output ?? "").trim();
  if (!text) {
    throw new Error("Empty response from convex.");
  }

  // 1) Fast path: response is pure JSON
  try {
    return JSON.parse(text);
  } catch {
    // fall through
  }

  // 2) Try parsing from trailing lines (handles banner + one-line JSON)
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      // continue scanning
    }
  }

  // 3) Try extracting a JSON object or array block from noisy output
  const firstObj = text.indexOf("{");
  const lastObj = text.lastIndexOf("}");
  if (firstObj >= 0 && lastObj > firstObj) {
    try {
      return JSON.parse(text.slice(firstObj, lastObj + 1));
    } catch {
      // continue
    }
  }

  const firstArr = text.indexOf("[");
  const lastArr = text.lastIndexOf("]");
  if (firstArr >= 0 && lastArr > firstArr) {
    try {
      return JSON.parse(text.slice(firstArr, lastArr + 1));
    } catch {
      // continue
    }
  }

  throw new Error("Could not parse JSON from convex output.");
}

function convexRun(fnName, args) {
  const argsJson = JSON.stringify(args);
  const out = execSync(`npx convex run "${fnName}" '${argsJson}'`, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    shell: true,
  });
  return parseJsonFromConvexOutput(out);
}

function pad(value, width) {
  const s = String(value ?? "");
  if (s.length >= width) return s;
  return s + " ".repeat(width - s.length);
}

function truncate(value, max = 36) {
  const s = String(value ?? "");
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || readEnvLocalAdminKey();
if (!ADMIN_API_KEY) {
  console.error("Error: ADMIN_API_KEY not found in env or .env.local.");
  process.exit(1);
}

try {
  const maps = convexRun("admin:listMaps", { adminKey: ADMIN_API_KEY });

  const rows = (Array.isArray(maps) ? maps : [])
    .map((m) => ({
      name: m.name ?? "(unnamed)",
      owner: m.owner ?? "(none)",
      size: `${m.width}x${m.height}`,
      type: m.mapType ?? "private",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (rows.length === 0) {
    console.log("No maps found.");
    process.exit(0);
  }

  const headers = { name: "NAME", owner: "OWNER", size: "SIZE", type: "TYPE" };
  const nameW = Math.max(headers.name.length, ...rows.map((r) => String(r.name).length), 16);
  const ownerW = Math.max(headers.owner.length, ...rows.map((r) => truncate(r.owner).length), 24);
  const sizeW = Math.max(headers.size.length, ...rows.map((r) => String(r.size).length), 8);
  const typeW = Math.max(headers.type.length, ...rows.map((r) => String(r.type).length), 8);

  console.log(
    `${pad(headers.name, nameW)}  ${pad(headers.owner, ownerW)}  ${pad(headers.size, sizeW)}  ${pad(headers.type, typeW)}`,
  );
  console.log(
    `${"-".repeat(nameW)}  ${"-".repeat(ownerW)}  ${"-".repeat(sizeW)}  ${"-".repeat(typeW)}`,
  );

  for (const row of rows) {
    console.log(
      `${pad(row.name, nameW)}  ${pad(truncate(row.owner), ownerW)}  ${pad(row.size, sizeW)}  ${pad(row.type, typeW)}`,
    );
  }

  console.log(`\nTotal maps: ${rows.length}`);
} catch (err) {
  console.error("Failed to list maps:", err?.message ?? err);
  process.exit(1);
}
