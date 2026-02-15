# Here

Persistent shared-world 2D RPG built with PixiJS + Convex.

## Major Features

- **Multiplayer presence**: real-time player sync with interpolation and presence heartbeats
- **Level creation tooling**: in-game build mode for layers, per-layer tilesets, collision, labels, and portals
- **Object system**: placeable map objects with toggle logic, ambient/interact audio, and door state machines with collision overrides
- **NPC system**: sprite definitions, map instances, profile-backed behavior, procedural + AI dialogue modes, and hostile/combat behavior
- **Item system**: item definitions, world item placement, pickup flow, respawn scheduling, inventory updates, and pickup audio
- **Quest system**: quest definitions, active quest tracking, item/kill objective progress, HUD quest log, and reward/failure flows
- **Combat system**: server-authoritative hostile combat, aggro retaliation, NPC defeat/respawn, XP + loot drops, and combat notifications
- **Auth + permissions**: Convex auth, guest mode, role/ownership checks, map editor permissions, and visibility scopes (`private/public/system`)
- **Ops tooling**: admin scripts, dumps/backups/restores, migration helpers, and runbook docs

## Core Subsystems

- **Frontend game engine** (`src/engine`): `Game`, `MapRenderer`, `EntityLayer`, `ObjectLayer`, `WorldItemLayer`, audio, input
- **Editor/tooling UI** (`src/editor`, `src/ui`, `src/sprited`): map editor, object/NPC/item editors, sprite tool
- **Backend domain logic** (`convex`): maps, mapObjects, worldItems, items, quests, mechanics/combat, npcProfiles, npcEngine, presence, auth/admin/migrations
- **Dialogue/AI runtime** (`src/npc`, `convex/npc`): NPC mode resolution, chat pipeline, memory/conversation services

## Quick Start

### Prerequisites

- Node.js 18+
- Convex account/project
- Optional: Braintrust credentials for AI-NPC flows

### Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy local env template:
   ```bash
   cp .env.local.example .env.local
   ```
3. Configure required Convex env vars (see auth/ops docs for full list), including:
   - `JWT_PRIVATE_KEY`
   - `JWKS`
   - `ADMIN_API_KEY`
   - optional OAuth + Braintrust vars
4. Run local dev:
   ```bash
   npm run dev
   ```

## Useful Scripts

- `npm run dev` - frontend + local Convex backend
- `npm run dev:cloud` - frontend + cloud Convex backend
- `npm run build` / `npm run lint` / `npm run typecheck`
- `npm run users -- <command>` - user/role management
- `npm run dump`, `npm run dump:full`, `npm run backup:world`, `npm run restore:world`

## Documentation

- `docs/LevelCreate.md` - level creation and map editing workflows
- `docs/Objects.md` - object definitions, toggleables, doors
- `docs/NPCs.md` - NPC authoring, profiles, AI/chat/combat behavior
- `docs/Items.md` - item definitions, world item placement, pickup/respawn
- `docs/Combat.md` - combat architecture, aggro flow, tuning knobs, and troubleshooting
- `docs/Quests.md` - quest design, lifecycle, and runtime integrations
- `docs/AuthPermissions.md` - auth, ownership, roles, and permission model
- `docs/Operations.md` - backups, restore procedures, admin operations
