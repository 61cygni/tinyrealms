# Level Creation Workflow

This guide is the current source of truth for creating and editing levels in Here.
It covers map creation, layer workflows, collision, object/NPC/item placement, portals,
permissions, and save/publish behavior.

## Quick Mental Model

A level is made of:

- Tile layers (`bg`, `obj`, `overlay`) with editable visibility/order
- A collision mask (`boolean[]`, one value per tile)
- Labels (named spawn/target regions)
- Portals (rectangles that transfer to another map)
- Placed map objects (decor, doors, interactables, NPC objects)
- Placed world items (pickup entities)
- Metadata (music, combat settings, map type, editors, status)

At save time, data is persisted in three passes:

1. `maps.saveFullMap` (tiles/collision/labels/portals/metadata)
2. `mapObjects.bulkSave` (objects + NPC objects)
3. `worldItems.bulkSave` (pickup items)

## Roles, Ownership, and Permissions

- Map edit access is enforced server-side by map editor checks.
- Allowed editors are:
  - map owner/creator
  - any profile in the map `editors` list
  - superuser
- Map type affects visibility and portal targeting behavior:
  - `private`
  - `public`
  - `system`
- Regular users can only create portal targets they are allowed to target.
- Superusers can edit broadly, but system-map changes still have stricter ownership rules.

## 1) Create a New Level

Use the Map Browser create flow:

- Open Map Browser
- Create map with:
  - unique map name
  - width/height (tile grid)
  - base tileset (optional, can change later)
  - music/combat/map-type metadata

Creation initializes:

- default layers
- empty collision mask
- default `start1` label
- draft-like editable map document

## 2) Enter Build Mode

In build mode, you can author all map content:

- tile painting/erasing
- collision painting
- labels + portals
- object placement
- NPC placement
- world item placement

## 3) Layers (Including Per-Layer Tilesets)

Layers are dynamic (not fixed to only 5 forever). Core layer types:

- `bg` (background)
- `obj` (object)
- `overlay` (renders above entities)

Supported workflows:

- add/remove/reorder layers
- toggle layer visibility
- choose active layer for paint/erase
- assign a tileset per layer

### Per-layer tilesets

- Each layer can optionally override the map default tileset.
- If a layer has no override, it uses the map default tileset.
- The editor and renderer both respect layer `tilesetUrl`.
- Tile size compatibility is validated (layer tileset must match map tile size).

## 4) Collision Authoring

Collision is authored as tile booleans:

- collision tool toggles blocked/unblocked tiles
- overlay shows collision visually in editor
- runtime `isCollision()` uses base mask plus dynamic overrides

Important behavior:

- door/open-close mechanics can apply runtime collision overrides
- overrides take precedence over base mask while active

## 5) NPC Insertion

NPCs are inserted through NPC object placement, backed by sprite definitions.

Flow:

1. Define/select NPC sprite definition
2. Place NPC on map
3. Save map
4. Backend sync updates NPC runtime state rows

Key details:

- placed NPCs are map objects with NPC category behavior
- `instanceName` is generated/deduplicated when needed
- NPC profiles/AI behavior can be tied to instance identity
- chat-disabled NPCs can still be interacted with for greeting/interact sound (for example bark), while hostile NPCs use attack flow

## 6) Item Insertion

Items are separate from map objects and use world-item records.

Flow:

1. Define/select item definition
2. Place item instance on map
3. Configure quantity/respawn behavior
4. Save map

Runtime behavior:

- pickup mutates inventory and world-item state
- respawn-enabled items come back after respawn delay
- non-respawn items are consumed/removed

## 7) Interactable Objects

Objects are placed from sprite definitions and can be purely visual or interactive.

Supported object capabilities include:

- toggleable on/off state (`isOn`)
- interaction sound
- ambient looping sound (distance-based volume)
- door open/close animations and collision integration

Save behavior preserves runtime state for existing objects by patching known IDs
instead of recreating everything.

## 8) Labels and Portals

Labels:

- named rectangular regions
- used for spawn points and portal targets

Portals:

- rectangular trigger zones
- one-way by default (create reciprocal portal for two-way travel)
- store target map + target spawn label (+ optional direction/transition)

Validation and safety:

- portal target must be valid/visible per permission rules
- target label should exist on destination map

## 9) Save, Draft/Published, and Refresh Cycle

When you save in editor:

- map core data saves first
- objects save second
- items save third
- editor refreshes IDs/state so subsequent saves patch correctly

Status and visibility:

- map status (draft/published) affects published listings and downstream selection flows
- map type and permissions still gate who can view/edit/target

## 10) What People Usually Forget

- Per-layer tileset can differ from map default (and must match tile size)
- Overlay layer affects draw order above players/NPCs
- Collision overrides (doors) may make behavior differ from raw collision paint
- NPCs, objects, and items are not all stored in the same table
- Portal links are one-way unless you create a return portal
- Save is multi-step; partial failure can leave mixed state until next successful save

## Recommended Level-Creation Checklist

1. Create map and confirm base metadata (tileset/music/combat/type)
2. Build layer stack and assign any per-layer tilesets
3. Paint terrain/structures, then collision pass
4. Add labels (`start1`, entrances, encounter points)
5. Add portals and validate both directions
6. Place interactable objects (doors/lamps/etc)
7. Place NPCs and verify interaction mode (chat/attack/disabled-chat + sound)
8. Place item pickups and respawn settings
9. Save, reload map, and test end-to-end travel + interaction

## Key Source Files

- Editor UI: `src/editor/MapEditorPanel.ts`
- Map browser/create: `src/ui/MapBrowser.ts`
- Renderer/layers/collision: `src/engine/MapRenderer.ts`
- Runtime map transitions: `src/engine/Game.ts`
- Object runtime: `src/engine/ObjectLayer.ts`
- NPC runtime/interaction: `src/engine/EntityLayer.ts`, `src/engine/NPC.ts`
- World items runtime: `src/engine/WorldItemLayer.ts`
- Map backend: `convex/maps.ts`
- Map objects backend: `convex/mapObjects.ts`
- World items backend: `convex/worldItems.ts`
- Permission guard: `convex/lib/requireMapEditor.ts`
- Schema: `convex/schema.ts`

## Related Docs

- `docs/Objects.md` - object definition/placement, toggleables, doors
- `docs/NPCs.md` - NPC sprite/profile/AI and interaction workflows
- `docs/Items.md` - item definitions, world item placement, pickup/respawn
- `docs/Combat.md` - map combat settings, attack/aggro flow, and tuning
- `docs/AuthPermissions.md` - auth, ownership, roles, and edit permissions
- `docs/Operations.md` - operational runbook, backups, restore, admin scripts
