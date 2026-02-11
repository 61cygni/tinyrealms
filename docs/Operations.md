# Operations Runbook

Operational guide for managing **Here** as a long-lived persistent world.

---

## 1) Security Prerequisite

Most admin and migration commands are protected by `ADMIN_API_KEY`.

Set it in your shell before running operations:

```bash
export ADMIN_API_KEY="your-strong-secret"
```

Set it for Convex backend validation:

```bash
npx convex env set ADMIN_API_KEY "your-strong-secret"
```

Both values must match.

---

## 2) Daily / Per-Deploy Checklist

- Run typecheck + lint:
  - `npm run typecheck`
  - `npm run lint`
- Audit map sizes:
  - `npm run audit:maps`
- Backup world state before risky changes:
  - `npm run backup:world`
- If touching schema, follow migration phases in `docs/EvolvingTheWorld.md`.

---

## 3) Backup Strategy

### Manual backup

```bash
npm run dump
npm run dump:full
```

- `dump` excludes full tile payloads in maps (compact)
- `dump:full` includes full tile payloads (large)

### Automated local backup helper

```bash
npm run backup:world
```

- Creates a new dump in `dumps/`
- Prunes old dumps (default retention 14 days)
- Optional:
  - `node scripts/backup-world.mjs --full --retention-days 30`

---

## 4) Selective Restore (Safe Mode)

Use selective restore for controlled recovery of specific world tables.

### Dry-run plan first

```bash
npm run restore:world -- --in dumps/state-2026-...json --tables maps,itemDefs --dry-run
```

### Execute restore

```bash
npm run restore:world -- --in dumps/state-2026-...json --tables maps,itemDefs --confirm
```

You will be prompted to type `RESTORE`.

### What restore does

- Clears only selected allowlisted tables
- Reinserts rows in chunks
- Sanitizes unsafe fields (`_id`, `_creationTime`, and sensitive cross-deployment IDs)
- Writes a verification report:
  - `dumps/restore-report-<timestamp>.json`
  - Includes before/after counts and SHA-256 hashes per selected table

### Current restore allowlist

- `maps`
- `spriteDefinitions`
- `npcProfiles`
- `mapObjects`
- `itemDefs`
- `worldItems`
- `messages`

---

## 5) User/Admin Management

### List users/profiles

```bash
npm run users list
```

### Role changes

```bash
npm run users -- set-superuser alice@test.com:Alice
npm run users -- set-role bob@test.com:Warrior player
```

### Remove user/profile

```bash
npm run users -- remove-user alice@test.com
npm run users -- remove-profile alice@test.com:Alice
```

---

## 6) Emergency Procedures

### Bad backend deploy

1. Revert code changes
2. Restart/deploy Convex
3. Validate critical queries/mutations
4. If data changed unexpectedly, restore selected tables from latest known-good dump

### Data corruption suspected

1. Stop high-risk admin edits
2. Create immediate backup (`npm run dump:full`)
3. Run targeted restore dry-run to inspect impact
4. Execute selective restore only for affected tables
5. Verify with restore report hashes and in-app checks

---

## 7) Local Database Maintenance

The Convex local backend stores all mutations in an append-only SQLite file at
`~/.convex/convex-backend-state/<deployment>/convex_local_backend.sqlite3`.

High-frequency mutations (presence updates, NPC ticks) can cause this to grow
to multiple GB over days of development.

### Check database size

```bash
npm run db:check
```

### Compact without losing data

Stop the backend first (`Ctrl+C` on `npx convex dev`), then:

```bash
npm run db:compact
```

This runs `VACUUM` on the SQLite file, reclaiming unused pages.

### Full reset (loses local data)

```bash
rm ~/.convex/convex-backend-state/local-*/convex_local_backend.sqlite3
npx convex dev
```

Maps will be re-seeded from static JSON on first load. You'll need to:
- Re-set environment variables (`JWT_PRIVATE_KEY`, `JWKS`, `ADMIN_API_KEY`)
- Re-create user accounts and characters
- Optionally restore from backup: `npm run restore:world -- --in dumps/<file> --tables maps,itemDefs --confirm`

### Mutation budget (what drives DB growth)

| Source | Interval | Mutations/hour (1 client) |
|--------|----------|---------------------------|
| Presence updates | 1000ms (delta-only) | ~1,000–3,600 |
| NPC tick | 1500ms | ~2,400 |
| Profile save | 30s | ~120 |

These intervals are tuned to balance responsiveness and DB growth. If developing
offline for extended periods, run `npm run db:compact` periodically.

---

## 8) Recommended Cadence

- **Daily while actively editing world:** `npm run backup:world`
- **Before schema or admin script changes:** `npm run dump:full`
- **Weekly:** run `npm run audit:maps` and `npm run db:check` to inspect growth trends
- **Before major releases:** run full checklist + dry-run selective restore on staging/local copy

---

## 9) Related Docs

- `docs/EvolvingTheWorld.md` — architecture and migration strategy
- `docs/Auth.md` — auth and permissions model
- `docs/5.3Codex.md` — architecture critique + remediation tracking
- `docs/deploymet.md` — deployment workflow (Netlify + Convex)
