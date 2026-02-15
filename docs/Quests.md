# Quests Workflow

Current source of truth for basic quest design and runtime behavior.

## 1) Quest Model

Quests are split into:

- `questDefs` - reusable quest templates
- `playerQuests` - per-profile accepted quest instances with progress

Quest progress is server-authoritative and updated from gameplay events.

## 2) Basic Quest Design

A quest definition should include:

- `key` (stable unique ID)
- `title` and `description`
- `sourceType` (for example HUD or NPC)
- objective list (collect/kill goals)
- reward data
- optional deadline/failure config
- visibility/scope controls as needed

Keep MVP quests simple:

- 1-2 objectives
- clear target naming
- straightforward rewards
- optional timer only when it adds real pressure

## 3) Objective Types

Current core objectives:

- `collect_item` - progress from item pickup/inventory grant paths
- `kill_npc` - progress from confirmed combat defeats

Progress is tracked as `currentCount / requiredCount` per objective.

## 4) Player Quest Lifecycle

Common statuses:

- `active`
- `completed`
- `failed`
- `abandoned`

Typical flow:

1. Player accepts quest definition
2. Progress updates through gameplay hooks
3. Quest auto-completes when all objectives are satisfied
4. Rewards are claimed/applied (depending on design)
5. Timed quests can fail and apply penalties

## 5) Quest Entry Points

### HUD request flow

- Player requests available quests from HUD
- Quest is accepted into `playerQuests`
- Active quest log updates live

### NPC quest flow

- NPC interactions can offer/route quest acceptance
- NPC identity can scope which quests are available

## 6) Runtime Integrations

Quests integrate with:

- **Items**: pickup updates `collect_item` objectives
- **Combat**: hostile defeat updates `kill_npc` objectives
- **HUD**: active quests + progress + timers rendered live

This keeps quest state synchronized with core gameplay loops.

## 7) Timers, Failures, and Rewards

Timed quests:

- set `deadlineAt` from accept time + duration
- move to `failed` when expired and incomplete
- optional penalties (gold/HP/death) should be idempotent

Rewards:

- should be granted once per quest instance
- guard against double-claim with claimed markers

## 8) Permissions and Safety

- quest state mutations must be profile-owned
- progress increments only from authoritative server paths
- avoid client-only progress writes
- use idempotency guards for failure and reward application

## 9) Practical Design Checklist

1. Define quest key/title/description clearly
2. Use concrete objective targets (item/npc keys)
3. Validate rewards and optional penalties
4. Test acceptance, progress, completion, and failure paths
5. Verify HUD updates and multiplayer/profile isolation

## 10) Common Gotchas

- quest key/name mismatches between defs and progress targets
- item/kill hooks not wired to progress mutation path
- deadlines applied without idempotent failure guards
- reward duplication when claim checks are missing
- visibility/scope filters hiding quests unexpectedly

## Key Source Files

- `convex/quests.ts`
- `convex/schema.ts`
- `src/ui/HUD.ts`
- `src/ui/QuestEditorPanel.ts`
- `src/engine/Game.ts` (item/combat event integration points)
- `convex/mechanics/combat.ts` (kill objective hooks)
- `convex/worldItems.ts` (collect objective hooks)

## Related Docs

- `docs/Items.md` - item objective progress integration
- `docs/Combat.md` - kill objective progress integration
- `docs/NPCs.md` - NPC quest source workflows
- `docs/LevelCreate.md` - build workflows for quest-enabled maps
- `docs/AuthPermissions.md` - profile ownership and mutation permissions
# Quests Workflow

Current source of truth for basic quest design and runtime behavior.

## 1) Quest Model

Quests are split into:

- `questDefs` - reusable quest templates
- `playerQuests` - per-profile accepted quest instances with progress

Quest progress is server-authoritative and updated from gameplay events.

## 2) Basic Quest Design

A quest definition should include:

- `key` (stable unique ID)
- `title` and `description`
- `sourceType` (for example HUD or NPC)
- objective list (collect/kill goals)
- reward data
- optional deadline/failure config
- visibility/scope controls as needed

Keep MVP quests simple:

- 1-2 objectives
- clear target naming
- straightforward rewards
- optional timer only when it adds real pressure

## 3) Objective Types

Current core objectives:

- `collect_item` - progress from item pickup/inventory grant paths
- `kill_npc` - progress from confirmed combat defeats

Progress is tracked as `currentCount / requiredCount` per objective.

## 4) Player Quest Lifecycle

Common statuses:

- `active`
- `completed`
- `failed`
- `abandoned`

Typical flow:

1. Player accepts quest definition
2. Progress updates through gameplay hooks
3. Quest auto-completes when all objectives are satisfied
4. Rewards are claimed/applied (depending on design)
5. Timed quests can fail and apply penalties

## 5) Quest Entry Points

### HUD request flow

- Player requests available quests from HUD
- Quest is accepted into `playerQuests`
- Active quest log updates live

### NPC quest flow

- NPC interactions can offer/route quest acceptance
- NPC identity can scope which quests are available

## 6) Runtime Integrations

Quests integrate with:

- **Items**: pickup updates `collect_item` objectives
- **Combat**: hostile defeat updates `kill_npc` objectives
- **HUD**: active quests + progress + timers rendered live

This keeps quest state synchronized with core gameplay loops.

## 7) Timers, Failures, and Rewards

Timed quests:

- set `deadlineAt` from accept time + duration
- move to `failed` when expired and incomplete
- optional penalties (gold/HP/death) should be idempotent

Rewards:

- should be granted once per quest instance
- guard against double-claim with claimed markers

## 8) Permissions and Safety

- quest state mutations must be profile-owned
- progress increments only from authoritative server paths
- avoid client-only progress writes
- use idempotency guards for failure and reward application

## 9) Practical Design Checklist

1. Define quest key/title/description clearly
2. Use concrete objective targets (item/npc keys)
3. Validate rewards and optional penalties
4. Test acceptance, progress, completion, and failure paths
5. Verify HUD updates and multiplayer/profile isolation

## 10) Common Gotchas

- quest key/name mismatches between defs and progress targets
- item/kill hooks not wired to progress mutation path
- deadlines applied without idempotent failure guards
- reward duplication when claim checks are missing
- visibility/scope filters hiding quests unexpectedly

## Key Source Files

- `convex/quests.ts`
- `convex/schema.ts`
- `src/ui/HUD.ts`
- `src/ui/QuestEditorPanel.ts`
- `src/engine/Game.ts` (item/combat event integration points)
- `convex/mechanics/combat.ts` (kill objective hooks)
- `convex/worldItems.ts` (collect objective hooks)

## Related Docs

- `docs/Items.md` - item objective progress integration
- `docs/Combat.md` - kill objective progress integration
- `docs/NPCs.md` - NPC quest source workflows
- `docs/LevelCreate.md` - build workflows for quest-enabled maps
- `docs/AuthPermissions.md` - profile ownership and mutation permissions
# Quests

Architecture and rollout plan for adding quests to **Here**.

This document focuses on a practical MVP that fits the current codebase:
- Convex is authoritative for world/player state
- Players can have multiple active quests
- Quests come from NPCs or HUD "Request Quest"
- Objectives are item collection and kill counts
- Some quests have deadlines and penalties on failure

---

## Goals

- Let players discover and accept quests from multiple entry points.
- Support multiple simultaneous quests per profile.
- Track objective progress live from existing gameplay events.
- Expose active quests and descriptions in HUD.
- Support timed quests with meaningful failure consequences.
- Keep schema evolution safe and backward compatible.

---

## MVP Scope (Phase 1)

### Quest sources

1. **NPC-offered quests**
   - Interact with NPC.
   - NPC can offer one or more quest templates.
2. **HUD "Request Quest"**
   - Player requests a procedurally selected quest from a quest board/service.

### Objective types

- **Collect item objective**
  - "Obtain item X, quantity N"
  - Counts inventory + future pickups.
- **Kill objective**
  - "Kill enemy type Y, quantity N"
  - Increments on combat kill events.

### Quest state

- Players can have multiple active quests.
- Each quest has:
  - Description text
  - Objective list + progress
  - Optional deadline
  - Rewards
  - Failure penalties (optional)

### Timed quest failure

If deadline is exceeded before completion:
- Quest transitions to `failed`
- Apply configured penalty:
  - lose money
  - lose HP
  - death (HP -> 0)

---

## Data Model (Convex)

Use additive tables/fields only (safe migration pattern).

### `questDefs` (template definitions)

Purpose: reusable quest templates authored by designers/system.

Suggested fields:
- `key: string` unique id (stable)
- `title: string`
- `description: string`
- `sourceType: "npc" | "hud" | "system"`
- `offeredByNpcInstanceName?: string` (for npc quests)
- `repeatable: boolean`
- `cooldownMs?: number`
- `objectives: QuestObjectiveDef[]`
- `rewards: QuestRewardDef`
- `failure: QuestFailureDef` (optional)
- `timeLimitMs?: number` (optional)
- `mapScope?: string | "any"` (optional)
- `visibilityType?: "public" | "private" | "system"` (same pattern as other defs)
- `enabled: boolean`
- `updatedAt: number`

Objective defs:
- `type: "collect_item" | "kill_npc"`
- `itemDefName?: string`
- `targetNpcProfileName?: string` (or sprite/category key)
- `requiredCount: number`

### `playerQuests` (per-profile instances)

Purpose: concrete accepted quests with progress and timers.

Suggested fields:
- `profileId: id("profiles")`
- `questDefKey: string`
- `status: "active" | "completed" | "failed" | "abandoned"`
- `acceptedAt: number`
- `deadlineAt?: number`
- `completedAt?: number`
- `failedAt?: number`
- `progress: QuestObjectiveProgress[]`
- `rewardClaimedAt?: number`
- `failureAppliedAt?: number`
- `source: { type: "npc" | "hud"; npcInstanceName?: string }`

Progress rows:
- `type: "collect_item" | "kill_npc"`
- `targetKey: string` (item name or npc key)
- `currentCount: number`
- `requiredCount: number`

Indexes:
- `by_profile` -> `["profileId"]`
- `by_profile_status` -> `["profileId", "status"]`
- optional `by_deadline` -> `["status", "deadlineAt"]` for timeout sweeps

### `npcProfiles` optional extension

To attach authored quest offers:
- `questOfferKeys?: string[]`

Alternative: keep this in `questDefs` via `offeredByNpcInstanceName`.

---

## Backend API Design

Add `convex/quests.ts` + internal helpers.

### Queries

- `listAvailable({ profileId, sourceType, npcInstanceName? })`
  - Returns quests player can accept now.
- `listActive({ profileId })`
  - Returns all active quests + progress + deadline state.
- `listHistory({ profileId, status? })`
  - Completed/failed quest history.

### Mutations

- `accept({ profileId, questDefKey, source })`
  - Validate eligibility/cooldown/repeatable.
  - Create `playerQuests` row with initialized progress and deadline.
- `abandon({ profileId, playerQuestId })`
  - Optional in MVP; marks abandoned.
- `claimReward({ profileId, playerQuestId })`
  - If reward model requires explicit claim.

### Internal mutations/actions

- `recordItemProgress({ profileId, itemDefName, quantity })`
  - Called from item pickup/inventory grant paths.
- `recordKillProgress({ profileId, npcProfileName, count })`
  - Called from combat kill path.
- `evaluateQuestCompletion({ playerQuestId })`
  - Marks completed when all objectives met.
- `applyTimeoutPenalty({ playerQuestId })`
  - Fails quest and applies penalty exactly once.
- `sweepExpiredQuests()`
  - Scheduled periodic sweep for missed deadlines.

---

## Event Integration Points

### Item objective progress

Wire `recordItemProgress` from:
- world item pickup path
- any other inventory-grant path (shops, rewards)

### Kill objective progress

Wire `recordKillProgress` from:
- combat flow when hostile is defeated

### Completion

After progress updates:
- evaluate completion server-side
- emit status change naturally via Convex subscriptions

---

## Timer and Failure Semantics

### Deadline behavior

- `deadlineAt = acceptedAt + timeLimitMs`
- Quest is active until completed or failed.
- If now > deadlineAt and not completed:
  - mark failed
  - apply penalty once

### Penalty types (MVP)

- `goldLoss`: subtract fixed amount, clamp to >= 0
- `hpLoss`: subtract fixed amount, clamp to >= 0
- `death`: set HP to 0

### Safety rules

- Penalty application must be idempotent (`failureAppliedAt` guard).
- Validate profile still exists before penalty.
- Never run penalty twice across retries.

---

## HUD / UX Plan

### New HUD elements

1. **Quest log panel**
   - Active quests list
   - per-quest objective progress
   - time remaining badge for timed quests
2. **Request Quest button**
   - Opens available HUD quests
   - Accept flow with confirm

### NPC interaction

- Existing NPC interaction flow can include an "Available Quests" section.
- Selecting a quest calls `quests.accept`.

### Authoring / Admin tooling

- Added admin-only in-game **Quest Editor** mode (`quest-edit`) via mode toggle.
- Quest Editor supports create/edit for quest templates and saves via `quests.upsertQuestDef`.
- Current defaults follow product decision:
  - `visibilityType = "public"` (everyone can see)
  - `mapScope = current map` when "Limit to current map level" is enabled, otherwise `"any"`
  - any player can accept and complete (per-profile quest instances)

### Notifications

- Quest accepted
- Objective progress increments
- Quest completed
- Quest failed + penalty text

---

## Multiplayer / Consistency

- Quest ownership is per `profileId`.
- Progress updates and completion are server-authoritative only.
- Client displays subscribed state, no local authority.
- Multiple sessions on same profile should see same quest state live.

---

## Anti-Exploitation Notes

- Only count kill progress when combat backend confirms defeat.
- Ensure item progress increments from authoritative inventory mutations.
- Enforce quest acceptance limits (optional cap for MVP, e.g. 10 active).
- Repeatable quests should have cooldown to prevent reward farming.

---

## Migration / Rollout Plan

### Phase 0: Schema + read APIs

- Add `questDefs` + `playerQuests`
- Add `listAvailable`, `listActive`
- Seed 2-3 test quest defs

### Phase 1: Accept + progress plumbing

- Implement `accept`
- Hook item pickup -> item progress
- Hook combat kills -> kill progress
- Auto-complete on objective completion

### Phase 2: HUD + NPC UX

- Add Quest log in HUD
- Add "Request Quest" flow
- Add NPC quest offer flow

### Phase 3: Timed failures

- Deadlines + `sweepExpiredQuests`
- Failure penalties (gold/hp/death)
- Failure notifications

### Phase 4: Balancing + tools

- Quest tuning fields (difficulty/reward tiers)
- Admin/debug commands for quest state inspection

---

## Implementation Checklist

Use this as the execution checklist during implementation.

### Phase 0 - Foundations

- [ ] Add quest types to shared typings (`QuestStatus`, objective/reward/failure unions).
- [x] Extend `convex/schema.ts` with `questDefs` table.
- [x] Extend `convex/schema.ts` with `playerQuests` table and indexes:
  - [x] `by_profile`
  - [x] `by_profile_status`
  - [x] `by_deadline` (if using sweep)
- [ ] Run Convex codegen and verify schema compiles.
- [x] Add `convex/quests.ts` skeleton with placeholder query/mutation exports.
- [x] Add read queries:
  - [x] `listAvailable`
  - [x] `listActive`
  - [x] `listHistory` (optional in MVP but recommended)
- [x] Seed 2-3 test quest definitions (including one timed quest).
- [x] Add admin/dev utility to list quest defs and active player quests.

### Phase 1 - Accept + Progress

- [x] Implement `quests.accept`.
- [x] Enforce acceptance rules:
  - [x] enabled quest only
  - [x] repeatable/cooldown handling
  - [x] active quest cap (if enabled)
- [x] Initialize `playerQuests.progress` from objective definitions.
- [x] Set `deadlineAt` when `timeLimitMs` exists.
- [x] Implement `recordItemProgress` internal mutation/action.
- [x] Hook item progress from world item pickup path.
- [x] Hook item progress from any non-world pickup inventory grants.
- [x] Implement `recordKillProgress` internal mutation/action.
- [x] Hook kill progress from combat defeat path.
- [x] Implement `evaluateQuestCompletion`.
- [x] Mark quests `completed` when all objectives reached.
- [ ] Decide reward behavior:
  - [ ] auto grant on completion OR
  - [x] explicit `claimReward` mutation

### Phase 2 - HUD + NPC UX

- [x] Add HUD "Request Quest" button.
- [x] Add HUD active quest log panel:
  - [x] title + description
  - [x] objective progress counters
  - [x] deadline countdown/timer badge
- [ ] Add quest notifications:
  - [ ] accepted
  - [ ] objective progress
  - [ ] completed
  - [ ] failed (with penalty text)
- [ ] Add NPC quest offer UI in interaction flow.
- [ ] Wire NPC accept action to `quests.accept`.
- [ ] Ensure subscriptions live-update quest log while playing.

### Phase 3 - Timed Failure + Penalties

- [ ] Implement `applyTimeoutPenalty`.
- [ ] Add idempotency guard (`failureAppliedAt`).
- [ ] Implement penalty handlers:
  - [ ] gold loss
  - [ ] HP loss
  - [ ] death (set HP to 0)
- [ ] Implement `sweepExpiredQuests`.
- [ ] Schedule periodic sweep (or evaluate on relevant quest reads/writes).
- [ ] Add failure telemetry/logging for balancing and debugging.

### Phase 4 - Hardening

- [ ] Add permission checks (player can only mutate their own quest rows).
- [ ] Add validation/error messaging for malformed quest defs.
- [ ] Add anti-exploit guards (double counting, retry safety).
- [ ] Add tests (unit/integration) for:
  - [ ] accept flow
  - [ ] item progress increments
  - [ ] kill progress increments
  - [ ] completion transition
  - [ ] timeout failure
  - [ ] idempotent penalty application
- [ ] Add migration/backfill notes to ops docs.
- [ ] Add basic admin scripts:
  - [ ] inspect active quests by profile
  - [ ] manually fail/complete quest instance
  - [ ] reseed quest defs

### Release Readiness Gate

- [ ] "Collect item" quest works end-to-end.
- [ ] "Kill count" quest works end-to-end.
- [ ] Timed quest fails and applies exactly one penalty.
- [ ] HUD quest log stays in sync across reconnects.
- [ ] No regression in combat, inventory, or NPC interaction flows.
- [ ] Backup/restore runbook verified before production deploy.

### Dev Commands (Phase 0)

- `npm run quests:seed` (requires `ADMIN_API_KEY`) seeds/updates test quest defs.
- `npm run quests:list-defs` lists all quest templates.
- `npm run quests:list-profile -- '{"profileId":"<PROFILE_ID>"}'` lists quest instances for a profile.

---

## Open Questions

1. Should quest rewards be auto-granted on completion or manually claimed?
2. Should kill objectives key by NPC profile name, species tag, or sprite category?
3. Can item objectives consume items, or only require possession?
4. Do failed timed quests lock re-acceptance for a cooldown period?
5. Should "Request Quest" pull from map-local quests first, then global?

---

## Recommended First Implementation Slice

Implement this smallest valuable slice first:

1. Add schema tables + active quest query.
2. Seed one HUD quest:
   - "Collect 5 mushrooms in 20 minutes"
   - failure: lose 20 gold
3. Hook item pickup progress updates.
4. Add minimal HUD quest list panel.
5. Add timeout sweep and penalty application.

Then add NPC-issued quests and kill objectives next.

