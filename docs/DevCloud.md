# Cloud Development Guide

Developing **Here** with Convex's cloud dev backend — the differences from local mode, how to set it up, and what to watch out for.

---

## Table of Contents

1. [Overview](#overview)
2. [When to Use Cloud Dev](#when-to-use-cloud-dev)
3. [Prerequisites](#prerequisites)
4. [Initial Setup](#initial-setup)
5. [Running in Cloud Dev Mode](#running-in-cloud-dev-mode)
6. [Switching Between Local and Cloud](#switching-between-local-and-cloud)
7. [Environment Variables](#environment-variables)
8. [GitHub OAuth Setup](#github-oauth-setup)
9. [User & Data Management](#user--data-management)
10. [Differences from Local Dev](#differences-from-local-dev)
11. [Troubleshooting](#troubleshooting)

---

## Overview

By default, `npm run dev` runs Convex locally (`convex dev --local`) using a SQLite database on disk. Cloud dev mode (`npm run dev:cloud`) connects to a Convex cloud deployment instead. Your backend functions still hot-reload on save, but the database, scheduler, and file storage all live in the cloud.

```
Local mode:                          Cloud mode:
  Browser → Vite (localhost:5173)      Browser → Vite (localhost:5173)
    ↕                                    ↕
  Convex local backend (localhost:3210)  Convex cloud (charming-cod-198.convex.cloud)
    ↕                                    ↕
  SQLite on disk                       Convex managed database
```

---

## When to Use Cloud Dev

| Use case | Recommended mode |
|----------|-----------------|
| Day-to-day solo development | Local (`npm run dev`) |
| Offline / airplane | Local (`npm run dev`) |
| Multi-device testing | Cloud (`npm run dev:cloud`) |
| Sharing a dev build with others | Cloud (`npm run dev:cloud`) |
| Testing production auth (GitHub OAuth) | Cloud (`npm run dev:cloud`) |
| Testing real-time multiplayer across machines | Cloud (`npm run dev:cloud`) |
| CI / staging environment | Cloud (deployed) |

---

## Prerequisites

- **Internet connection** — cloud mode requires a persistent connection to Convex servers
- **Convex account** — sign up at [dashboard.convex.dev](https://dashboard.convex.dev)
- **Node.js** and `npm install` already run

---

## Initial Setup

### 1. Create a cloud project

If you haven't already linked a cloud deployment:

```bash
npx convex dev --configure
```

This will:
- Open a browser to authenticate with your Convex account
- Let you create or select a project
- Update `.env.local` with the cloud deployment URL

Your `.env.local` will look like:

```bash
CONVEX_DEPLOYMENT=dev:charming-cod-198  # team: ..., project: ...
VITE_CONVEX_URL=https://charming-cod-198.convex.cloud
VITE_CONVEX_SITE_URL=https://charming-cod-198.convex.site
```

### 2. Set environment variables on the cloud deployment

The cloud deployment needs the same env vars as local, but they're set differently — via `npx convex env set` rather than stored in SQLite.

**Generate JWT keys:**

```bash
node -e "
const { generateKeyPairSync } = require('crypto');
const { writeFileSync } = require('fs');
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'jwk' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
const jwks = JSON.stringify({ keys: [{ ...publicKey, alg: 'RS256', use: 'sig', kid: 'convex-auth-1' }] });
writeFileSync('/tmp/jwt_private_key.pem', privateKey.trim());
writeFileSync('/tmp/jwks.json', jwks);
console.log('Keys written to /tmp/jwt_private_key.pem and /tmp/jwks.json');
"
```

**Set them on the deployment:**

```bash
# JWT keys (use file-based approach to preserve PEM newlines)
npx convex env set JWT_PRIVATE_KEY -- "$(cat /tmp/jwt_private_key.pem)"
npx convex env set JWKS -- "$(cat /tmp/jwks.json)"

# Admin API key (pick any strong secret)
npx convex env set ADMIN_API_KEY -- "your-admin-secret-here"

# Clean up temp files
rm /tmp/jwt_private_key.pem /tmp/jwks.json
```

> **Important:** The `JWT_PRIVATE_KEY` must contain real newlines, not literal `\n` characters. Using the `"$(cat ...)"` approach ensures this. If you pass the PEM directly on the command line, the `-----BEGIN` prefix gets misinterpreted as a CLI flag, and newlines get escaped.

> **Note:** `CONVEX_SITE_URL` is automatically provided by Convex cloud — do not set it manually (the CLI will reject it as a built-in variable).

### 3. Set the matching ADMIN_API_KEY in your shell

For CLI scripts to work, your shell must have the same key:

```bash
export ADMIN_API_KEY="your-admin-secret-here"
```

Add this to your `~/.zshrc` or `~/.bashrc` if you want it to persist across sessions.

### 4. Verify env vars

```bash
npx convex env list
```

You should see: `JWT_PRIVATE_KEY`, `JWKS`, and `ADMIN_API_KEY`.

---

## Running in Cloud Dev Mode

```bash
npm run dev:cloud
```

This starts:
- **Vite** frontend dev server on `localhost:5173`
- **Convex** cloud dev watcher — pushes function changes to the cloud deployment on save

Open `http://localhost:5173` in your browser. The frontend connects to the cloud Convex deployment.

### Running components separately

```bash
# Terminal 1 — cloud backend watcher
npm run dev:backend:cloud

# Terminal 2 — frontend
npm run dev:frontend
```

---

## Switching Between Local and Cloud

The mode is controlled by `.env.local`. The `--configure` step and `convex dev --local` each update this file.

### Switch to cloud

```bash
npx convex dev --configure
# Select your cloud project, then:
npm run dev:cloud
```

Or manually edit `.env.local`:

```bash
CONVEX_DEPLOYMENT=dev:charming-cod-198
VITE_CONVEX_URL=https://charming-cod-198.convex.cloud
VITE_CONVEX_SITE_URL=https://charming-cod-198.convex.site
```

### Switch back to local

Restore your local config:

```bash
cp .env.local.bak .env.local
# Or manually:
cat > .env.local << 'EOF'
CONVEX_DEPLOYMENT=local:local-martin_casado-here
VITE_CONVEX_URL=http://127.0.0.1:3210
VITE_CONVEX_SITE_URL=http://127.0.0.1:3211
EOF
```

Then run:

```bash
npm run dev
```

> **Tip:** Keep a `.env.local.bak` copy of your local config so you can switch back easily.

---

## Environment Variables

### Cloud deployment env vars

Set via `npx convex env set`:

| Variable | Required | Purpose |
|----------|----------|---------|
| `JWT_PRIVATE_KEY` | Yes | RSA private key (PKCS8 PEM) for signing auth JWTs |
| `JWKS` | Yes | JSON Web Key Set with the matching public key |
| `ADMIN_API_KEY` | Yes | Shared secret protecting admin mutations |
| `AUTH_GITHUB_ID` | For GitHub auth | GitHub OAuth app client ID |
| `AUTH_GITHUB_SECRET` | For GitHub auth | GitHub OAuth app client secret |

### Auto-provided by Convex cloud

These are **built-in** on cloud deployments — do not set them manually:

- `CONVEX_SITE_URL` — automatically set to `https://<deployment>.convex.site`

### Shell env vars (for CLI scripts)

```bash
export ADMIN_API_KEY="your-admin-secret-here"
```

Required for: `manage-users.mjs`, `admin-run.mjs`, `backup-world.mjs`, `restore-world.mjs`, `dump-state.mjs`.

---

## GitHub OAuth Setup

GitHub OAuth requires a GitHub OAuth App with the correct callback URL for your cloud deployment.

### 1. Create or update the OAuth App

Go to [GitHub Developer Settings > OAuth Apps](https://github.com/settings/developers).

- **Homepage URL:** `http://localhost:5173` (for dev) or your production domain
- **Authorization callback URL:** `https://charming-cod-198.convex.site/api/auth/callback/github`

### 2. Set the credentials

```bash
npx convex env set AUTH_GITHUB_ID -- "your-github-client-id"
npx convex env set AUTH_GITHUB_SECRET -- "your-github-client-secret"
```

### 3. Verify

The "Sign in with GitHub" button appears when `VITE_CONVEX_URL` is not `localhost`. In cloud dev mode, the frontend URL is still `localhost:5173`, but the Convex URL is the cloud one — so GitHub sign-in should appear if your `AuthScreen` checks the Convex URL rather than the page URL. If it doesn't appear, you can still use email/password auth.

> **Note:** If you have both a local and cloud GitHub OAuth App, make sure the callback URLs match the correct deployment. Each deployment needs its own OAuth App (or you update the callback URL when switching).

---

## User & Data Management

### Cloud database is separate from local

The cloud and local databases are completely independent. Users, profiles, maps, and all game data created locally do **not** exist in the cloud, and vice versa.

After switching to cloud, you'll need to:

1. **Sign up** with email/password (or GitHub)
2. **Create a character** — this auto-seeds the default map ("cozy-cabin")
3. **Grant superuser** if needed:

```bash
export ADMIN_API_KEY="your-admin-secret-here"
node scripts/manage-users.mjs set-superuser you@email.com:YourCharacter
```

### All CLI scripts work the same way

The scripts read `CONVEX_DEPLOYMENT` from `.env.local` to determine which backend to target:

```bash
npm run users list                     # List users on cloud
npm run dump                           # Dump cloud state
npm run backup:world                   # Back up cloud world
npm run clear:chat                     # Clear cloud chat
```

### Convex Dashboard

With cloud dev, you get access to the [Convex Dashboard](https://dashboard.convex.dev):

- Browse and query tables visually
- View function logs in real-time
- Monitor scheduler jobs
- Inspect environment variables
- View deployment metrics

---

## Differences from Local Dev

| Aspect | Local | Cloud |
|--------|-------|-------|
| **Internet required** | No | Yes |
| **Database** | SQLite on disk | Convex-managed |
| **Database growth** | Can balloon (needs VACUUM) | Managed by Convex |
| **Dashboard** | Not available | Full dashboard at dashboard.convex.dev |
| **Function hot-reload** | Yes | Yes |
| **Startup speed** | Fast (local binary) | Slightly slower (network round-trip) |
| **Multi-device access** | No (localhost only) | Yes (cloud URL accessible from anywhere) |
| **Scheduler** | Runs locally | Runs in cloud (persists across restarts) |
| **File storage** | Local disk (`~/.convex/...`) | Convex cloud storage |
| **CONVEX_SITE_URL** | Must be set manually | Auto-provided |
| **Cost** | Free | Free tier, then usage-based |
| **Data persistence** | Survives restarts, lost on DB delete | Always persisted |

### Things that "just work" differently

- **No SQLite maintenance** — no need for `db:check` or `db:compact`
- **Scheduler jobs persist** — if you deploy an NPC tick scheduler, it keeps running even when your dev machine is off
- **Real URLs** — other devices on the internet can connect to your cloud backend (useful for testing with friends)

---

## Troubleshooting

### `client_id=undefined` when signing in with GitHub

The `AUTH_GITHUB_ID` environment variable is not set on the cloud deployment:

```bash
npx convex env set AUTH_GITHUB_ID -- "your-github-client-id"
npx convex env set AUTH_GITHUB_SECRET -- "your-github-client-secret"
```

### `atob: Invalid byte 92` / JWT signing errors

The `JWT_PRIVATE_KEY` was set with literal `\n` characters instead of real newlines. Re-set it using the file-based approach:

```bash
# Write the PEM to a file first, then:
npx convex env set JWT_PRIVATE_KEY -- "$(cat /tmp/jwt_private_key.pem)"
```

### `Unexpected error when authorizing - are you connected to the internet?`

Cloud mode requires internet. If you need to work offline, switch back to local mode:

```bash
cp .env.local.bak .env.local
npm run dev
```

### `Missing environment variable JWT_PRIVATE_KEY`

Set it on the cloud deployment (see [Initial Setup](#initial-setup)).

### `Server misconfigured: ADMIN_API_KEY is not set`

Set the `ADMIN_API_KEY` on the cloud deployment:

```bash
npx convex env set ADMIN_API_KEY -- "your-admin-secret-here"
```

### `Invalid admin key`

Your shell's `ADMIN_API_KEY` doesn't match the cloud deployment's value. Check both:

```bash
echo $ADMIN_API_KEY              # Your shell value
npx convex env list              # Cloud deployment value
```

### Maps don't load / empty world after switching to cloud

The cloud database starts empty. Create a character to auto-seed the default map. If you need to restore data from a local backup:

```bash
npm run restore:world -- --file dumps/state-XXXXXX.json
```

### `EnvVarNameForbidden: CONVEX_SITE_URL is built-in`

Don't set `CONVEX_SITE_URL` on cloud deployments — it's provided automatically by Convex.

---

## Quick Reference

```bash
# Start cloud dev
npm run dev:cloud

# Switch to cloud
npx convex dev --configure

# Switch back to local
cp .env.local.bak .env.local && npm run dev

# Set cloud env vars
npx convex env set KEY -- "value"
npx convex env list

# Grant superuser on cloud
export ADMIN_API_KEY="your-key"
node scripts/manage-users.mjs set-superuser email:CharacterName

# Open dashboard
open https://dashboard.convex.dev
```
