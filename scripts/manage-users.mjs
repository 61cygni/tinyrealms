#!/usr/bin/env node
/**
 * User & profile management script for the "Here" game.
 *
 * Usage:
 *   node scripts/manage-users.mjs list                                         # list all users + profiles
 *   node scripts/manage-users.mjs remove-user <email>                          # remove a user by email
 *   node scripts/manage-users.mjs remove-profile <email>:<profileName>         # remove a profile
 *   node scripts/manage-users.mjs set-superuser <email>:<profileName>          # make superuser
 *   node scripts/manage-users.mjs set-role <email>:<profileName> superuser     # same as above
 *   node scripts/manage-users.mjs set-role <email>:<profileName> player        # revoke superuser
 *   node scripts/manage-users.mjs remove-anonymous                              # purge anonymous users
 *
 * Requires:
 * - the Convex backend running (`npm run dev`)
 * - ADMIN_API_KEY exported in your shell
 */

import { execSync } from "child_process";
import { resolve, dirname } from "path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

function withAdminKey(args = {}) {
  if (!ADMIN_API_KEY) {
    console.error("Error: ADMIN_API_KEY is not set in your shell environment.");
    console.error("Set it before running this script:");
    console.error("  export ADMIN_API_KEY='your-secret'");
    process.exit(1);
  }
  return { ...args, adminKey: ADMIN_API_KEY };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse an "email:profileName" specifier.
 * The email portion is everything up to the last colon that leaves a valid-looking
 * email on the left (must contain @). This handles emails like "user@example.com"
 * paired with profile names that don't contain colons.
 */
function parseProfileSpec(spec) {
  const idx = spec.lastIndexOf(":");
  if (idx < 1) return null;
  const email = spec.slice(0, idx);
  const name = spec.slice(idx + 1);
  if (!email.includes("@") || !name) return null;
  return { email, name };
}

function convexRun(fnName, args = {}) {
  const argsJson = JSON.stringify(args);
  try {
    const result = execSync(
      `npx convex run "${fnName}" '${argsJson}'`,
      { cwd: ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
    const lines = result.trim().split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(lines[i]);
      } catch {
        continue;
      }
    }
    return JSON.parse(result.trim());
  } catch (err) {
    const stderr = err.stderr?.toString() ?? "";
    const stdout = err.stdout?.toString() ?? "";
    const match = stderr.match(/Error: (.+)/);
    if (match) {
      console.error(`Error: ${match[1]}`);
    } else {
      console.error(stderr || stdout || err.message);
    }
    process.exit(1);
  }
}

function convexMutation(fnName, args = {}) {
  const argsJson = JSON.stringify(args);
  try {
    const result = execSync(
      `npx convex run "${fnName}" '${argsJson}'`,
      { cwd: ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
    const lines = result.trim().split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(lines[i]);
      } catch {
        continue;
      }
    }
    return result.trim();
  } catch (err) {
    const stderr = err.stderr?.toString() ?? "";
    const stdout = err.stdout?.toString() ?? "";
    const match = stderr.match(/Error: (.+)/);
    if (match) {
      console.error(`Error: ${match[1]}`);
    } else {
      console.error(stderr || stdout || err.message);
    }
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdList() {
  console.log("Fetching users and profiles...\n");
  const users = convexRun("admin:listUsersWithProfiles", withAdminKey());

  if (!users || users.length === 0) {
    console.log("  (no users found)");
    return;
  }

  for (const u of users) {
    const email = u.email ?? "(no email)";
    console.log(`  User: ${email}`);
    console.log(`    ID: ${u._id}`);

    if (u.profiles.length === 0) {
      console.log("    Profiles: (none)");
    } else {
      for (const p of u.profiles) {
        console.log(`    Profile: ${email}:${p.name} | role=${p.role} | lv=${p.level}`);
      }
    }
    console.log();
  }

  console.log(`Total: ${users.length} user(s)`);
}

function cmdRemoveUser(email) {
  if (!email) {
    console.error("Usage: manage-users.mjs remove-user <email>");
    process.exit(1);
  }
  console.log(`Removing user "${email}"...`);
  convexMutation("admin:removeUserByEmail", withAdminKey({ email }));
  console.log(`Done. User "${email}" and associated auth data removed.`);
  console.log("Note: Profiles created by this user are NOT deleted.");
  console.log("Use 'remove-profile <email>:<name>' to remove individual profiles.");
}

function cmdRemoveProfile(spec) {
  if (!spec) {
    console.error("Usage: manage-users.mjs remove-profile <email>:<profileName>");
    process.exit(1);
  }
  const parsed = parseProfileSpec(spec);
  if (!parsed) {
    console.error(`Invalid format "${spec}". Expected <email>:<profileName>`);
    process.exit(1);
  }
  const { email, name } = parsed;

  // Look up the profile via listUsersWithProfiles to find the right one
  console.log(`Looking up profile "${name}" for user "${email}"...`);
  const users = convexRun("admin:listUsersWithProfiles", withAdminKey());
  const user = users.find((u) => u.email === email);
  if (!user) {
    console.error(`Error: No user found with email "${email}".`);
    process.exit(1);
  }
  const profile = user.profiles.find((p) => p.name === name);
  if (!profile) {
    const available = user.profiles.map((p) => `"${p.name}"`).join(", ") || "(none)";
    console.error(`Error: No profile "${name}" found for "${email}". Available: ${available}`);
    process.exit(1);
  }

  console.log(`Removing profile "${name}" (id=${profile._id})...`);
  convexMutation("admin:removeProfile", withAdminKey({ email, name }));
  console.log(`Done. Profile "${email}:${name}" and associated presence rows removed.`);
}

function cmdSetRole(spec, role) {
  if (!spec || !role) {
    console.error("Usage: manage-users.mjs set-role <email>:<profileName> <superuser|player>");
    process.exit(1);
  }
  const parsed = parseProfileSpec(spec);
  if (!parsed) {
    console.error(`Invalid format "${spec}". Expected <email>:<profileName>`);
    process.exit(1);
  }
  if (role !== "superuser" && role !== "player") {
    console.error(`Invalid role "${role}". Must be "superuser" or "player".`);
    process.exit(1);
  }

  const { email, name } = parsed;
  console.log(`Setting role for "${email}:${name}" to "${role}"...`);
  convexMutation("admin:setRole", withAdminKey({ email, name, role }));
  console.log(`Done. Profile "${email}:${name}" is now "${role}".`);
}

function cmdSetSuperuser(spec) {
  if (!spec) {
    console.error("Usage: manage-users.mjs set-superuser <email>:<profileName>");
    process.exit(1);
  }
  cmdSetRole(spec, "superuser");
}

function cmdRemoveAnonymous() {
  console.log("Removing all anonymous users and their profiles...");
  const result = convexMutation("admin:removeAnonymousUsers", withAdminKey());
  const usersDeleted = Number(result?.usersDeleted ?? 0);
  const profilesDeleted = Number(result?.profilesDeleted ?? 0);
  const presenceDeleted = Number(result?.presenceDeleted ?? 0);
  console.log(
    `Done. Removed ${usersDeleted} user(s), ${profilesDeleted} profile(s), ${presenceDeleted} presence row(s).`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "list":
  case "ls":
    cmdList();
    break;

  case "remove-user":
  case "rm-user":
    cmdRemoveUser(rest[0]);
    break;

  case "remove-profile":
  case "rm-profile":
    cmdRemoveProfile(rest[0]);
    break;

  case "set-role":
  case "role":
    cmdSetRole(rest[0], rest[1]);
    break;

  case "set-superuser":
  case "superuser":
    cmdSetSuperuser(rest[0]);
    break;

  case "remove-anonymous":
  case "rm-anon":
    cmdRemoveAnonymous();
    break;

  default:
    console.log(`
Here — User Management Script

Usage:
  node scripts/manage-users.mjs <command> [args]

Commands:
  list                                         List all users and their profiles
  remove-user <email>                          Remove a user account (keeps profiles)
  remove-profile <email>:<profileName>         Remove a game profile
  set-role <email>:<profileName> <role>        Set profile role (superuser | player)
  set-superuser <email>:<profileName>          Shortcut for set-role ... superuser
  remove-anonymous                              Remove all anonymous users + profiles

Examples:
  node scripts/manage-users.mjs list
  node scripts/manage-users.mjs set-superuser alice@test.com:Alice
  node scripts/manage-users.mjs set-role bob@test.com:Warrior player
  node scripts/manage-users.mjs remove-user alice@test.com
  node scripts/manage-users.mjs remove-profile alice@test.com:Alice
  node scripts/manage-users.mjs remove-anonymous
    `.trim());
    break;
}
