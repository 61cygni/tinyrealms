# Items Workflow

Current source of truth for item definitions, world item placement, pickup,
respawn, permissions, and runtime behavior.

## 1) System Overview

Items are split into two layers:

- `itemDefs` (templates): what an item is
- `worldItems` (instances): where item pickups exist on maps

Inventories on player/NPC records store lightweight `{ name, quantity }` entries
that reference `itemDefs.name`.

## 2) Item Definitions (Catalog Layer)

Definitions are authored in the Item Editor and stored in `itemDefs`.

Common fields:

- identity: `name`, `displayName`, `description`
- classification: `type`, `rarity`, tags, lore
- icon data: direct URL or tileset crop (`iconTilesetUrl`, tile rect)
- gameplay data: stats, effects, stackability, value, level requirement, uniqueness
- pickup audio: `pickupSoundUrl`
- visibility: `visibilityType` (`private` / `public` / `system`)

## 3) Item Editor Workflow

Open via toolbar -> **Items**.

Typical flow:

1. Create or select item from sidebar
2. Edit metadata/stats/effects/icon/sounds
3. Set visibility
4. Save

Delete requires owner/superuser permissions depending visibility/ownership.

## 4) Visibility and Permissions

`itemDefs` visibility model:

- `private`: owner-only read/write
- `public`: globally readable, owner/superuser writable
- `system`: globally readable, superuser-sensitive write path

World item placement permissions are stricter than reading definitions:

- placing/removing/saving world items is privileged (superuser-gated server path)
- pickup is allowed for authenticated users with ownership checks on profile usage
- guest mode is read-only and does not run mutation flows

## 5) World Item Placement (Build Mode)

In map build mode:

1. Select Item placement tool
2. Pick an item definition
3. Configure quantity and respawn behavior
4. Click map to place item instance
5. Save map

You can also erase placed world items with item-erase tooling.

## 6) Save Pipeline (World Items)

Map save persists world items via bulk save with upsert semantics.

Behavior:

- existing instances are patched when source ID is known
- removed instances are deleted
- runtime pickup/respawn state for existing records is preserved

After save, the editor/runtime reloads instances so local state has Convex IDs
for future patch-based saves.

## 7) Pickup Runtime Flow

Pickup interaction uses `E` near an item.

On pickup:

1. server validates item availability and auth ownership
2. item quantity is added to profile inventory
3. quest progress hooks can be updated
4. if respawn enabled: mark picked-up and schedule respawn
5. if not respawn: remove world item record

Client side:

- plays item pickup SFX (item-specific or default fallback)
- shows pickup notification (`+N Item Name`)
- updates local world-item visuals (fade/remove)
- applies optimistic inventory UI update

## 8) Respawn Behavior

Respawn-enabled world items:

- store pickup timestamp
- enforce cooldown window before next pickup
- clear pickup state when scheduled respawn executes

Visual behavior reflects respawn state (reduced alpha while unavailable).

## 9) Icons, Audio, and UI Integration

Icons:

- support direct icon URL
- support tileset crop-based icon extraction
- fallback visual exists when icon cannot be loaded

Audio:

- `pickupSoundUrl` per definition
- fallback pickup sound if item sound is unset

UI integration points:

- Item Editor for definition authoring
- Map Editor for world placement
- Character/inventory surfaces for owned item quantities

## 10) Common Gotchas

- item appears in editor but not world:
  - verify map save completed and world items reloaded
- pickup fails:
  - check respawn cooldown (`pickedUpAt`/`respawnMs`) and auth/profile ownership
- icon missing:
  - validate URL/crop rectangle and tileset dimensions
- state resets after save:
  - ensure source IDs are preserved so save patches instead of reinserts
- permissions denied:
  - check role/ownership and visibility rules on definition or world item operation

## 11) Practical Checklist

1. Create/verify item definition and visibility
2. Set icon and pickup sound
3. Place world item instance on target map
4. Configure quantity + respawn delay
5. Save map and reload to confirm IDs/state
6. Test pickup in play mode with `E`
7. Verify inventory update, notification, and respawn behavior

## Key Source Files

- `src/ui/ItemEditorPanel.ts`
- `src/editor/MapEditorPanel.ts`
- `src/engine/WorldItemLayer.ts`
- `src/engine/Game.ts`
- `convex/items.ts`
- `convex/worldItems.ts`
- `convex/schema.ts`

## Related Docs

- `docs/LevelCreate.md` - world item placement and save flow in build mode
- `docs/Objects.md` - complementary map object workflows and interactions
- `docs/NPCs.md` - NPC inventory and quest-adjacent item interactions
- `docs/Combat.md` - combat loot drops and defeat-driven item spawns
- `docs/AuthPermissions.md` - visibility, ownership, and mutation authorization
- `docs/Operations.md` - admin and restore workflows for item/world tables
