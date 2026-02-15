# Operations Runbook

Operational guide for running **Here** safely in local/dev/prod-like environments.

## 1) Security Prerequisite

Most admin/migration/data-management commands are protected by `ADMIN_API_KEY`.

```bash
export ADMIN_API_KEY="your-strong-secret"
npx convex env set ADMIN_API_KEY "$ADMIN_API_KEY"
```

Both values must match.

## 2) Core Dev Commands

```bash
npm run dev            # frontend + local Convex backend
npm run dev:cloud      # frontend + cloud Convex backend
npm run build
npm run lint
npm run typecheck
```

## 3) Backups and Restore

### Backups

```bash
npm run dump           # compact dump
npm run dump:full      # includes full tile payloads
npm run backup:world   # rotating backup helper
```

### Restore (safe path)

```bash
npm run restore:world -- --in dumps/<file>.json --tables maps,itemDefs --dry-run
npm run restore:world -- --in dumps/<file>.json --tables maps,itemDefs --confirm
```

Restore behavior:

- table allowlist only
- chunked inserts
- sanitizes unsafe IDs/fields
- writes verification report in `dumps/`

Current allowlisted restore tables:

- `maps`, `spriteDefinitions`, `npcProfiles`, `mapObjects`, `itemDefs`, `worldItems`, `messages`

## 4) User and Permission Management

### User/profile management

```bash
npm run users list
npm run users -- set-superuser alice@test.com:Alice
npm run users -- set-role bob@test.com:Warrior player
npm run users -- remove-user alice@test.com
npm run users -- remove-profile alice@test.com:Alice
npm run users:remove-anonymous
```

### Auth/admin helper commands

```bash
npm run auth:list-users
npm run auth:assign-profiles
npm run auth:grant-admin
npm run auth:grant-editor
```

Reference permission model:

- see `docs/AuthPermissions.md` for role hierarchy, ownership, visibility, and server enforcement

## 5) Level / Map Management

### Map inspection and exports

```bash
npm run maps:list
npm run dump:maps
npm run audit:maps
```

### Map/profile resets

```bash
npm run reset:map
npm run reset:all-maps
```

### Map/object/world cleanup helpers

```bash
npm run clear:objects
npm run clear:presence
npm run clear:chat
npm run clear:profiles
```

## 6) NPC, Quest, and Combat Ops Helpers

```bash
npm run npcs:list
npm run clear:npcs
npm run npc:test:ai

npm run quests:seed
npm run quests:list-defs
npm run quests:list-profile -- '{"profileId":"<PROFILE_ID>"}'
```

## 7) Migrations and Backfills

```bash
npm run backfill:maps
npm run migrate:player-refs
npm run migrate:player-cleanup
npm run migrate:npc-ai-defaults
```

Run these with fresh backups and a rollback plan.

## 8) Local Convex DB Maintenance

Convex local state can grow large over time.

```bash
npm run db:check
npm run db:compact
```

For hard reset (destructive), remove local sqlite backend state and restart `convex dev`.

## 9) Suggested Operational Cadence

- Daily active development: `npm run backup:world`
- Before migrations/admin cleanup: `npm run dump:full`
- Weekly: `npm run audit:maps` + `npm run db:check`
- Before major release: lint/typecheck/build + backup + restore dry-run

## 10) Incident Basics

### If a deploy introduces bad data

1. Stop risky admin edits
2. Create immediate full dump
3. Dry-run restore on affected tables
4. Execute targeted restore
5. Validate counts/hash report + smoke-test critical gameplay loops

### If permissions look wrong

1. Verify `ADMIN_API_KEY` and auth env vars
2. Check role assignments (`users` / `auth:*` commands)
3. Confirm ownership + visibility per `docs/AuthPermissions.md`

## 11) Related Docs

- `docs/AuthPermissions.md` - auth, ownership, roles, and permissions
- `docs/LevelCreate.md` - map/level authoring workflow
- `docs/Objects.md` - objects, doors, toggleables
- `docs/NPCs.md` - NPC profile/AI/runtime workflow
- `docs/Items.md` - item and world-item workflow
- `docs/Combat.md` - combat architecture and tuning
- `docs/Quests.md` - quest design, lifecycle, and runtime integrations
- `docs/EvolvingTheWorld.md` - architecture and migration strategy
- `docs/5.3Codex.md` - architecture critique and hardening notes
- `docs/deploymet.md` - deployment workflow
