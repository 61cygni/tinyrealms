#!/usr/bin/env node
/**
 * List NPCs in a compact table:
 *   <name> <instance> <sprite> <map> <map creator>
 *
 * Reads ADMIN_API_KEY from process.env, with fallback to .env.local.
 *
 * Usage:
 *   npm run npcs:list
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
  if (!text) throw new Error("Empty response from convex.");

  try { return JSON.parse(text); } catch { /* fall through */ }

  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i]); } catch { /* continue */ }
  }

  const firstArr = text.indexOf("[");
  const lastArr = text.lastIndexOf("]");
  if (firstArr >= 0 && lastArr > firstArr) {
    try { return JSON.parse(text.slice(firstArr, lastArr + 1)); } catch { /* continue */ }
  }

  const firstObj = text.indexOf("{");
  const lastObj = text.lastIndexOf("}");
  if (firstObj >= 0 && lastObj > firstObj) {
    try { return JSON.parse(text.slice(firstObj, lastObj + 1)); } catch { /* continue */ }
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

function truncate(value, max = 30) {
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
  const npcs = convexRun("admin:listNpcs", { adminKey: ADMIN_API_KEY });

  const rows = (Array.isArray(npcs) ? npcs : [])
    .map((n) => ({
      name: n.name ?? "(unnamed)",
      instance: n.instanceName ?? "(unnamed)",
      sprite: n.spriteDefName ?? "",
      map: n.mapName ?? "(none)",
      creator: n.mapCreator ?? "(unknown)",
    }))
    .sort((a, b) => a.map.localeCompare(b.map) || a.name.localeCompare(b.name));

  if (rows.length === 0) {
    console.log("No NPCs found.");
    process.exit(0);
  }

  const headers = { name: "NAME", instance: "INSTANCE", sprite: "SPRITE", map: "MAP", creator: "MAP CREATOR" };
  const nameW = Math.max(headers.name.length, ...rows.map((r) => truncate(r.name).length), 16);
  const instW = Math.max(headers.instance.length, ...rows.map((r) => truncate(r.instance).length), 16);
  const sprW = Math.max(headers.sprite.length, ...rows.map((r) => truncate(r.sprite).length), 12);
  const mapW = Math.max(headers.map.length, ...rows.map((r) => truncate(r.map).length), 12);
  const creW = Math.max(headers.creator.length, ...rows.map((r) => truncate(r.creator).length), 20);

  console.log(
    `${pad(headers.name, nameW)}  ${pad(headers.instance, instW)}  ${pad(headers.sprite, sprW)}  ${pad(headers.map, mapW)}  ${pad(headers.creator, creW)}`,
  );
  console.log(
    `${"-".repeat(nameW)}  ${"-".repeat(instW)}  ${"-".repeat(sprW)}  ${"-".repeat(mapW)}  ${"-".repeat(creW)}`,
  );

  for (const row of rows) {
    console.log(
      `${pad(truncate(row.name), nameW)}  ${pad(truncate(row.instance), instW)}  ${pad(truncate(row.sprite), sprW)}  ${pad(truncate(row.map), mapW)}  ${pad(truncate(row.creator), creW)}`,
    );
  }

  console.log(`\nTotal NPCs: ${rows.length}`);
} catch (err) {
  console.error("Failed to list NPCs:", err?.message ?? err);
  process.exit(1);
}
