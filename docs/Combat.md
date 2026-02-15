# Combat Engine Workflow

Current source of truth for the real-time hostile combat system.

## 1) Overview

Combat is server-authoritative and map-scoped.

- Players attack hostiles with `F`
- Hostiles can retaliate via aggro ticks
- Defeated hostiles grant XP and can drop loot
- Combat can be enabled/disabled per map

## 2) Map Combat Enablement

Combat is controlled by map fields:

- `combatEnabled` (boolean)
- `combatSettings` (optional per-map overrides):
  - `attackRangePx`
  - `playerAttackCooldownMs`
  - `npcHitCooldownMs`
  - `damageVariancePct`

If `combatEnabled` is false, attack and aggro mutations return non-success.

## 3) Player Attack Flow

Client (`Game`) flow:

1. Detect `F` press
2. Gate by local cooldown + not-in-dialogue + map combat enabled
3. Call `api.mechanics.combat.attackNearestHostile` with profile/map/position
4. Render combat feedback from server response

Server (`attackNearestHostile`) flow:

1. Load map and validate combat enabled
2. Resolve hostile candidates on map (`npcState` + `npcProfiles.tags`)
3. Find nearest hostile in range
4. Enforce NPC hit cooldown (`lastHitAt`)
5. Compute damage (with variance)
6. Patch NPC/player state
7. On defeat: XP, loot drop, quest kill progress
8. Return payload for client feedback

## 4) Hostile Aggro Flow

Aggro attack is resolved periodically by client tick calling:

- `api.mechanics.combat.resolveAggroAttack`

Server checks:

- map combat enabled
- hostile tags
- aggro eligibility (high/medium aggression behavior)
- in-range target
- NPC hit cooldown

On success:

- player HP reduced
- aggro timer extended

NPC chase/aggro behavior is integrated into server NPC tick logic.

## 5) NPC Combat State

Combat-relevant runtime fields live on `npcState`:

- `currentHp`, `maxHp`
- `lastHitAt`
- `defeatedAt`, `respawnAt`
- `aggroTargetProfileId`, `aggroUntil`
- movement targets used for flee/chase behavior

Respawn:

- defeated NPCs become unavailable until `respawnAt`
- server NPC loop restores HP/state when respawn time is reached

## 6) Client Combat Feedback

Client presents server results through:

- floating combat notifications
- NPC/player hit flash + shake effects
- hit sound playback
- local HUD/profile updates based on returned values

This is presentation only; server remains authoritative for outcomes.

## 7) Loot, XP, and Quest Integration

On hostile defeat:

- player XP is granted server-side
- simple loot drop can spawn a `worldItems` entry
- kill objectives are progressed via internal quest mutation

This links combat with both item and quest systems.

## 8) Tuning Knobs

Primary combat tuning constants:

- client config: `src/config/combat-config.ts`
- server defaults: `convex/mechanics/combat.ts`

Most production tuning should prefer per-map `combatSettings` overrides
instead of hardcoded global changes.

## 9) Security and Authority Notes

Authoritative checks currently include:

- combat enabled checks
- hostile-tag filtering
- range checks
- NPC cooldown checks
- server-side damage and state updates

Current caveat:

- combat mutations validate profile existence but do not currently enforce
  explicit ownership checks via shared profile-ownership helper in this file.
  Keep this in mind for hardening work.

## 10) Common Gotchas

- hostile NPC must have `hostile` tag (and valid linked profile) to be targetable
- combat appears inactive if map `combatEnabled` is false
- map rename/string mismatches can break map-scoped combat queries
- respawn is tick-driven, so visual return may lag slightly after `respawnAt`
- client cooldown is not the same as full server anti-spam enforcement

## 11) Debug Checklist

1. Verify map `combatEnabled` and `combatSettings`
2. Verify NPC profile has hostile tag and proper instance linkage
3. Verify `npcState` exists for hostile on active map
4. Check mutation responses (`reason` fields on non-success)
5. Inspect `npcState` transitions (`lastHitAt`, `currentHp`, `respawnAt`, aggro fields)

## Key Source Files

- `src/engine/Game.ts`
- `src/config/combat-config.ts`
- `convex/mechanics/combat.ts`
- `convex/npcEngine.ts`
- `convex/schema.ts`

## Related Docs

- `docs/NPCs.md` - hostile tagging, NPC profiles, and interaction routing
- `docs/Items.md` - combat-driven loot and pickup flows
- `docs/Quests.md` - kill objective progress integration
- `docs/LevelCreate.md` - map combat settings and build workflow
- `docs/AuthPermissions.md` - ownership and authorization model
