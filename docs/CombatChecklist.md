# Combat System Checklist

This tracks the phased rollout for world combat (no splash UI, in-world feedback).

## Phase 1 - Combat Skeleton (in progress)

- [x] Choose attack key: `F`.
- [x] Add player attack input handler in runtime loop.
- [x] Add proximity-based target acquisition (nearest hostile only).
- [x] Add server-authoritative damage exchange (player hit + enemy retaliation).
- [x] Add hostile defeat and respawn timer handling.
- [x] Add floating combat feedback text (damage, defeat, XP, loot drop).
- [x] Gate combat by map setting (`combatEnabled`).
- [x] Add attack cooldown tuning and per-NPC hit cooldown.
- [x] Add per-map combat tuning in map metadata + editor UI.
- [ ] Add critical-hit / miss tuning knobs.
- [ ] Add quick smoke tests for attack flow.

## Phase 2 - Spawn Loop

- [ ] Add per-map combat zones.
- [ ] Add spawn definitions (`maxAlive`, `respawnMs`, eligible enemy profiles).
- [ ] Spawn hostiles up to cap and recycle defeated slots.
- [ ] Keep spawn points and wandering radius configurable.

## Phase 3 - Rewards + Progression

- [ ] Improve loot table support (weighted drops, quantity ranges).
- [ ] Add configurable XP curves and level-up stat growth.
- [ ] Add drop and XP balancing knobs in config.

## Phase 4 - UX + Telemetry

- [ ] Add optional enemy health bars in-world.
- [ ] Add combat event log / debug overlay.
- [ ] Add admin/dev commands for spawn and combat diagnostics.
- [ ] Add docs for authoring hostile NPCs and combat maps.
