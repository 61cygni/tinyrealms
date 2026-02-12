# Evolving the World

Strategy and roadmap for continuously evolving **Here** — a persistent multiplayer 2D RPG — without downtime, data loss, or breaking active sessions.

---

## Quick Guide: Backup and Restore World State

Use this before risky schema/data changes so you always have a rollback point.

### 1) Create a backup dump (recommended before big changes)

```bash
# Compact world backup (no tile arrays)
npm run dump

# Full world backup (includes map tile data)
npm run dump:full

# Optional helper with retention policy (default: 14 days)
npm run backup:world -- --full --retention-days 30
```

Backups are written to `dumps/state-<timestamp>.json`.

### 2) Restore from a dump if changes go bad

```bash
# Required for restore scripts
export ADMIN_API_KEY='your-admin-api-key'

# Plan restore first (no writes)
npm run restore:world -- --in dumps/state-YYYY-MM-DDTHH-MM-SS.json --tables maps,spriteDefinitions,npcProfiles,mapObjects,itemDefs,worldItems,messages --dry-run

# Apply restore (clears selected tables, then inserts)
npm run restore:world -- --in dumps/state-YYYY-MM-DDTHH-MM-SS.json --tables maps,spriteDefinitions,npcProfiles,mapObjects,itemDefs,worldItems,messages --confirm
```

Notes:
- Always run `--dry-run` first to verify plan/output.
- Restore is **table-selective** and destructive for selected tables (clear + reinsert).
- A verification report is written to `dumps/restore-report-<timestamp>.json`.

---

## Table of Contents

1. [Quick Guide: Backup and Restore World State](#quick-guide-backup-and-restore-world-state)
2. [Philosophy](#philosophy)
3. [Architecture Assessment](#architecture-assessment)
4. [How Convex Handles Live Deploys](#how-convex-handles-live-deploys)
5. [Schema Evolution Strategy](#schema-evolution-strategy)
6. [Safe Change Patterns](#safe-change-patterns)
7. [Dangerous Change Patterns](#dangerous-change-patterns)
8. [Known Risks & Mitigations](#known-risks--mitigations)
9. [Recommended Refactors](#recommended-refactors)
10. [Operational Runbook](#operational-runbook)
11. [Operations Guide](#operations-guide)
12. [Roadmap](#roadmap)

---

## Philosophy

The world should feel alive and permanent. Players invest time in a world that persists across sessions, across months, across years. The development approach must respect that:

- **Never wipe data.** Treat every profile, item, and NPC conversation as sacred.
- **Deploy while players are online.** Convex + Vite HMR make this possible today.
- **Evolve incrementally.** Small, backward-compatible changes that can be rolled back.
- **Defensive code.** Always handle missing fields, unknown values, and stale clients.

---

## Architecture Assessment

### What works well today

| Area | Status | Notes |
|------|--------|-------|
| **Layer separation** | Good | MapRenderer, ObjectLayer, EntityLayer, WorldItemLayer are independent |
| **Data/rendering split** | Good | Convex owns state, PixiJS owns pixels. Clean boundary. |
| **Live subscriptions** | Good | `onUpdate` subscriptions push changes to all clients instantly |
| **Optional schema fields** | Good | Most new features use `v.optional()` — safe to add |
| **Server-authoritative NPCs** | Good | Self-scheduling tick loop, auto-recovery |
| **Editor tools** | Good | Map, sprite, NPC, and item editors all work while game is live |
| **Modular game mechanics** | Good | Combat, inventory, economy, loot are separate files |

### What needs attention

| Area | Risk | Notes |
|------|------|-------|
| **Map names as foreign keys** | High | `mapObjects`, `worldItems`, `npcState`, `presence`, `portals` all reference maps by string name, not ID. Renaming a map breaks everything. |
| **~~Hardcoded "cozy-cabin"~~** | ~~High~~ Fixed | Starting map is now chosen at character creation. Maps have a `mapType` field (`public`/`private`/`system`). System maps + user's own maps appear in the dropdown. |
| **`v.any()` fields** | Medium | `stats`, `slots`, `steps` have no structure validation. Silent breakage. |
| **`as any` casts** | Medium | 30+ instances across frontend and backend. Hides type errors. |
| **Map data size** | Medium | Large maps stored as JSON strings. 400x400 = ~640K tiles. Could approach Convex's 1MB document limit. |
| **Game.ts size** | Medium | 1100+ lines, too many responsibilities. Hard to modify safely. |
| **No schema versioning** | Low | Works fine today but limits future migration options. |
| **No feature flags** | Low | All features ship to all clients simultaneously. |

---

## How Convex Handles Live Deploys

Understanding Convex's deployment model is key to zero-downtime evolution:

### Function deploys (safe, instant)

When you run `npx convex dev` or `npx convex deploy`:
- New function versions replace old ones **atomically**
- Connected clients continue using old versions until they re-subscribe
- Queries re-fire automatically with the new function code
- **No downtime.** Old and new code never run simultaneously for the same query.

### Schema changes

- **Adding optional fields:** Always safe. Old records simply don't have the field.
- **Adding required fields:** Dangerous. Old records fail validation. Must backfill first.
- **Removing fields:** Safe if code no longer reads them. Old data retains the field.
- **Changing field types:** Dangerous. Old records have the old type.
- **Changing union literals:** Dangerous. Old records may have values not in the new union.

### Frontend deploys (Vite)

- Vite HMR updates modules in place during development
- Production deploys require a page refresh (standard SPA behavior)
- Active game sessions survive Convex backend deploys but need a refresh for frontend changes
- PixiJS state (position, animations) is lost on refresh but restored from Convex (player position saved on `beforeunload`)

---

## Schema Evolution Strategy

### The golden rule

> Every schema change must be backward-compatible with existing data.

### Step-by-step process for schema changes

**Phase 1: Add (deploy backend)**
```
1. Add new fields as v.optional()
2. Update mutations to write the new fields
3. Update queries to read new fields with fallback defaults
4. Deploy backend (npx convex dev pushes automatically)
```

**Phase 2: Backfill (run migration)**
```
5. Write an internalMutation to backfill old records
6. Run it: npx convex run migrations:backfillXyz
7. Verify all records have the new field
```

**Phase 3: Tighten (optional)**
```
8. If needed, change v.optional() to required
9. Deploy — safe because all records now have the field
```

**Phase 4: Clean up (deploy frontend)**
```
10. Remove fallback defaults from query code
11. Deploy frontend
```

### Example: Adding a `biome` field to maps

```typescript
// Phase 1: schema.ts
biome: v.optional(v.string()),  // "forest" | "desert" | "cave" | ...

// Phase 1: maps.ts query
biome: m.biome ?? "default",  // fallback for old maps

// Phase 2: migrations.ts
export const backfillMapBiome = internalMutation({
  handler: async (ctx) => {
    const maps = await ctx.db.query("maps").collect();
    for (const m of maps) {
      if (!m.biome) {
        await ctx.db.patch(m._id, { biome: "default" });
      }
    }
  },
});
```

---

## Safe Change Patterns

### Adding a new table
Always safe. No existing data affected.

### Adding optional fields
Always safe. Use `v.optional()` and provide defaults in code:
```typescript
// Schema
newField: v.optional(v.string()),

// Query
const value = record.newField ?? "default";
```

### Adding new mutations/queries
Always safe. Old clients don't call them.

### Adding new animation types, item types, categories
Safe if code uses fallback handling:
```typescript
// Instead of exhaustive switch
const icon = CATEGORY_ICONS[item.type] ?? "📦";  // fallback for unknown types
```

### Changing rendering code
Safe — frontend-only, doesn't affect data. Players see changes on refresh.

### Adding new map layers
Safe if the renderer handles missing layers gracefully.

---

## Dangerous Change Patterns

### Renaming a field
**Never rename.** Add a new field, migrate data, deprecate the old one.

### Changing a field from optional to required
**Must backfill first.** All existing records need a value before tightening.

### Changing field types
**Never change in place.** Add a new field with the new type, migrate, remove old.

### Removing a field from the schema
Safe for Convex (old data retains the field), but ensure no code reads it.

### Changing union literal values
**Dangerous.** Old records with removed values fail validation. Instead, expand the union and handle old values in code.

### Renaming a map
**Currently dangerous** (map names are used as foreign keys). See [Known Risks](#known-risks--mitigations).

---

## Known Risks & Mitigations

### 1. Map names as foreign keys (HIGH)

**Problem:** Seven tables reference maps by `mapName: v.string()` instead of `mapId: v.id("maps")`. Renaming or deleting a map orphans objects, items, NPCs, portals, and player positions.

**Mitigation (short-term):** Never rename or delete maps. Add a `slug` field for display if needed.

**Mitigation (long-term):** Migrate to `mapId: v.id("maps")`. This is the single most impactful refactor for long-term safety. See [Recommended Refactors](#recommended-refactors).

### 2. Hardcoded "cozy-cabin" default (HIGH)

**Problem:** New players, reset commands, and fallback logic all reference `"cozy-cabin"` by name. If this map is deleted or renamed, the game breaks for new players.

**Mitigation (short-term):** Never delete the cozy-cabin map.

**Mitigation (long-term — done):** Starting map is chosen at character creation via `mapType: "system"` maps.

### 3. Map document size limits (MEDIUM)

**Problem:** Tile data is stored as JSON strings. A 400x400 map with 5 layers = 800K tiles. At ~4 bytes per tile index (JSON), that's ~3.2MB — exceeding Convex's 1MB document limit.

**Mitigation (short-term):** Monitor map sizes. Keep large maps under ~250x250 tiles per the current JSON encoding.

**Mitigation (long-term):**
- Use more compact encoding (e.g., base64-encoded binary)
- Or split large maps into chunks (regions)
- Or store tile data in Convex file storage instead of document fields

### ~~4. `v.any()` schema fields (MEDIUM)~~ FIXED

> Completed: replaced all `v.any()` fields with structured validators:
> - `spriteSheets.frames` → `v.record(v.string(), v.object({ frame, rotated, trimmed, ... }))`
> - `spriteSheets.animations` → `v.record(v.string(), v.array(v.string()))`
> - `players.stats` → `v.object({ hp, maxHp, atk, def, spd, level, xp })`
> - `quests.steps` → `v.array(v.object({ description, type, target, count, optional }))`
> - `quests.rewards` → `v.object({ items, xp, currency })`
> - `questProgress.choices` → `v.record(v.string(), v.string())`
> - `dialogueTrees.nodes` → `v.array(v.object({ id, text, speaker, choices, ... }))`
> - `dialogueTrees.metadata` → `v.optional(v.object({ title, description, tags }))`
> - `storyEvents.conditions` → `v.optional(v.object({ requiredQuest, requiredItem, minLevel, flag }))`
> - `storyEvents.script` → `v.array(v.object({ action, args }))`
> - `inventories.slots` → `v.array(v.object({ itemDefName, quantity, metadata }))`
> - `combatEncounters.enemies` → `v.array(v.object({ npcName, level, stats }))`
> - `combatEncounters.rewards` → structured rewards object
> - `combatLog.turns` → `v.array(v.object({ actor, action, target, damage, heal }))`
> - `wallets.currencies` → `v.record(v.string(), v.number())`
> - `shops.inventory` → `v.array(v.object({ itemDefName, price, stock }))`

### 5. NPC tick loop accumulation (LOW)

**Problem:** Multiple NPC tick loops could spawn if `ensureLoop` is called concurrently.

**Mitigation:** The existing staleness check (`lastTickAt` > 5s) handles this. Monitor for symptoms (NPCs moving too fast = multiple loops).

---

## Recommended Refactors

These are ordered by impact and safety. None are urgent — the current architecture works. Do them when convenient.

### ~~Priority 1: Add a migrations file~~ DONE

> Completed: created `convex/migrations.ts` with reusable utilities:
> - `backfillField` — set a default value for records missing a field
> - `removeField` — strip a legacy field from all records in a table
> - `listMissing` — audit which records are missing a field (dry-run)
> - `bumpSchemaVersion` — set schemaVersion for all records in a table
> - `auditMapSizes` — check map document sizes and warn if approaching Convex's 1MB limit
>
> Usage: `npx convex run migrations:backfillField '{"table":"profiles","field":"role","defaultValue":"player"}'`

### ~~Priority 2: Replace hardcoded "cozy-cabin" with hub map lookup~~ DONE

> Completed: replaced the hub map concept with the `mapType` system (`public`/`private`/`system`). Starting world is now chosen at character creation. System maps + user's own maps appear in the dropdown. "cozy-cabin" remains as a hardcoded fallback only when a profile has no `mapName` set.

### ~~Priority 3: Expose `worldItemLayer` as a public property~~ DONE

> Completed: removed all 7 `(game as any).worldItemLayer` casts in `MapEditorPanel.ts`. The property was already public on `Game` — the editor was just bypassing the type system unnecessarily.

### Priority 4: Extract managers from Game.ts

Split `Game.ts` into:
- `MapManager` — loading, transitions, seeding
- `PresenceManager` — heartbeat, cleanup
- `SubscriptionManager` — Convex subscription lifecycle

**Effort:** Medium. **Risk:** Low (pure refactor). **Impact:** Much easier to modify individual systems.

### Priority 5: Migrate map references from names to IDs

Change `mapName: v.string()` to `mapId: v.id("maps")` across all tables.

**Effort:** Large (touches every table, every query, editor UI). **Risk:** Medium. **Impact:** Eliminates the biggest data integrity risk. Do this when you have time to test thoroughly.

---

## Operational Runbook

### Deploying a backend change while players are online

```bash
# 1. Make your changes to convex/ files
# 2. Convex dev server auto-deploys (or run manually):
npx convex dev --once

# 3. Verify in Convex dashboard that functions deployed
# 4. Active players see changes immediately (queries re-fire)
# 5. No restart needed
```

### Deploying a frontend change

```bash
# Development: Vite HMR applies changes instantly
# Production: Build and deploy — players need to refresh
npm run build
# Deploy dist/ to your hosting provider
```

### Adding a new optional field to the schema

```bash
# 1. Add to schema.ts with v.optional()
# 2. Update relevant mutations and queries
# 3. Save — Convex auto-deploys
# 4. Test with existing data (should work with undefined)
# 5. Optionally backfill:
npx convex run migrations:backfillNewField
```

### Emergency: rolling back a bad deploy

```bash
# Convex: revert the code change and save (auto-deploys)
# Git: git revert HEAD && save
# Schema: if schema was changed, revert schema.ts too
# Data: if data was corrupted, restore from Convex dashboard backup
```

### Dumping world state (backup)

```bash
npm run dump        # Compact (no tile data)
npm run dump:full   # Full dump including tiles
# Output: dumps/state-<timestamp>.json
```

## Operations Guide

For end-to-end operational procedures (security key setup, backup cadence, selective restore with verification reports, emergency flows), see:

- `docs/Operations.md`

---

## Roadmap

### Phase 1: Foundation hardening (do now, as convenient)

- [x] Create `convex/migrations.ts` with backfill utilities
- [x] Replace hardcoded "cozy-cabin" with hub map lookup
- [x] Make `worldItemLayer` a typed public property on Game
- [x] Add `schemaVersion` field to maps and profiles tables
- [x] Replace `v.any()` in stats/inventory with structured validators
- [x] Add map document size monitoring (warn if >500KB)

### Phase 2: Architecture cleanup (next major session)

- [ ] Extract `MapManager`, `PresenceManager` from Game.ts
- [ ] Remove `as any` casts (add proper interfaces)
- [ ] Add feature flags table for gradual rollouts
- [ ] Add pagination to map list queries
- [ ] Centralize constants to `src/engine/constants.ts`

### Phase 3: Data model migration (when ready for a focused effort)

- [ ] Migrate map references from `mapName` strings to `mapId` IDs
- [ ] Add portal target validation (ensure spawn labels exist)
- [ ] Implement map chunking for 400x400+ maps
- [ ] Add data cleanup jobs (stale presence, old messages)

### Phase 4: Operational maturity (ongoing)

- [ ] Automated world state backups (scheduled dump)
- [ ] Health monitoring (NPC loop running, presence cleanup working)
- [ ] Rate limiting on mutations
- [ ] Audit logging for admin actions
- [ ] Client version detection (graceful "please refresh" prompt)

---

## Summary

The current architecture is **solid for continuous evolution**. Convex's live deploy model means you can push backend changes while players are online. The extensive use of `v.optional()` fields makes schema evolution safe for most changes.

The main risks are:
1. **Map name strings as foreign keys** — don't rename/delete maps until migrated to IDs
2. ~~**Hardcoded "cozy-cabin"**~~ — fixed (map type system + character creation)
3. **Large map sizes** — keep under ~250x250 until chunking is implemented. Use `npx convex run migrations:auditMapSizes` to check.

Phase 1 (foundation hardening) is **complete**. Everything else is incremental improvement. The world can keep running.
