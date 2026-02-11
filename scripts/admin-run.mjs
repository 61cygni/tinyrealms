#!/usr/bin/env node
import { execSync } from "child_process";
import { resolve, dirname } from "path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

if (!ADMIN_API_KEY) {
  console.error("Error: ADMIN_API_KEY is not set in your shell environment.");
  console.error("Set it before running admin commands:");
  console.error("  export ADMIN_API_KEY='your-secret'");
  process.exit(1);
}

const fnName = process.argv[2];
if (!fnName) {
  console.error("Usage: node scripts/admin-run.mjs <convex:function> [jsonArgs]");
  process.exit(1);
}

let extraArgs = {};
if (process.argv[3]) {
  try {
    extraArgs = JSON.parse(process.argv[3]);
  } catch {
    console.error("Second argument must be valid JSON, e.g. '{\"name\":\"Alice\"}'");
    process.exit(1);
  }
}

const args = JSON.stringify({ adminKey: ADMIN_API_KEY, ...extraArgs });
const cmd = `npx convex run "${fnName}" '${args}'`;
execSync(cmd, { cwd: ROOT, stdio: "inherit" });
