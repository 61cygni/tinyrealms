# Creating an NPC — End-to-End Guide

This guide walks through the full workflow of turning a raw sprite PNG into a living NPC in the game world.

## Overview

```
PNG file → Spritesheet Tool → .png + .json → Register sheet → NPC Sprite Def → Place on map
```

There are **four stages**:

1. **Build the spritesheet** — slice a PNG into animation frames and export
2. **Add the spritesheet to the project** — copy files and register them in code
3. **Create an NPC Sprite Definition** — configure animations, speed, and behaviour
4. **Place the NPC on a map** — drop the NPC onto a map in the Build editor

---

## Stage 1: Build the Spritesheet

Use the **Spritesheet Tool** — a standalone page bundled with the project.

### Open the tool

- **Dev:** `http://localhost:5173/sprited.html`
- **Prod:** `https://<your-site>/sprited.html`

### Load your source PNG

1. Set the **tile W** and **tile H** to match the frame size in the PNG (e.g. `32 × 32`, `48 × 48`, `64 × 64`). You can adjust these after loading — the grid re-slices dynamically.
2. Click **Load Grid PNG** and pick your sprite PNG.
3. The tool slices the image into a grid of clickable tiles, skipping fully transparent ones.

> **Tip:** If your frames are individual image files rather than a grid, use the drop zone below the Load button — drag-and-drop multiple PNGs.

### Build animation rows

NPC sprites typically need directional walk cycles. A common layout:

| Row name | Frames | Description |
|----------|--------|-------------|
| `walk-down` | 3–4 frames | Character walking toward camera |
| `walk-left` | 3–4 frames | Character walking left |
| `walk-right` | 3–4 frames | Character walking right |
| `walk-up` | 3–4 frames | Character walking away from camera |
| `idle-down` | 1–2 frames | Standing still, facing camera |

For each row:

1. Click **+ Add Row** in the center panel (or use the default `row0`).
2. **Rename the row** to something descriptive (e.g. `walk-down`).
3. Click tiles in the left panel to add them to the selected row, in order.
4. Use the **Preview** panel on the right to verify the animation looks correct. Adjust the speed slider as needed.

> Row names become the animation keys in the exported JSON. The NPC system uses these names for direction mappings, so use clear, consistent names.

### Set target frame size (optional)

If you want the output frames at a different resolution than the source (e.g. source is 48×48 but you want 32×32), set the **Target frame size** W and H in the Export section. Leave blank to keep the source size.

### Export

1. Enter a **file name** (e.g. `my-npc`). This becomes `my-npc.png` and `my-npc.json`.
2. Click **Export PNG + JSON**.
3. Two files download: the packed spritesheet PNG and its JSON descriptor.

---

## Stage 2: Add the Spritesheet to the Project

### Copy files

Move both exported files into the project's character assets directory:

```bash
cp ~/Downloads/my-npc.png  public/assets/characters/
cp ~/Downloads/my-npc.json public/assets/characters/
```

### Register the spritesheet

Open `src/sprited/SpriteEditorPanel.ts` and add an entry to the `NPC_SPRITE_SHEETS` array:

```typescript
export const NPC_SPRITE_SHEETS: SheetEntry[] = [
  // ... existing entries ...
  { name: "My NPC",  jsonUrl: "/assets/characters/my-npc.json" },
];
```

This makes the sheet available in the NPC Sprite editor.

> **Player characters too?** If you want the sprite available as a player character option, also add it to the `SPRITE_OPTIONS` array in `src/ui/ProfileScreen.ts`.

---

## Stage 3: Create an NPC Sprite Definition

Sprite definitions tell the game engine how to render and animate the sprite.

1. Open the game and enter **Build mode** (you need superuser or admin permissions).
2. Open the **NPCs** menu from the bottom toolbar.
3. Switch to the **NPC Sprites** tab.

### Configure the sprite

In the left sidebar:

4. Select your new spritesheet from the **Sheet** dropdown.
5. Click through the animations to verify they loaded correctly.

In the right panel, fill in the definition form:

| Field | Description | Example |
|-------|-------------|---------|
| **Name** | Unique identifier for this sprite type | `my-npc` |
| **Animation** | The default idle animation | `idle-down` |
| **Speed** | Animation playback speed (lower = slower) | `0.15` |
| **Scale** | Render scale multiplier | `1.0` |
| **Anchor X / Y** | Sprite anchor point (0.5 = center) | `0.5` / `0.8` |
| **Collidable** | Whether the NPC blocks movement | checked |
| **Category** | Automatically set to `npc` | — |

### NPC-specific settings

| Field | Description | Example |
|-------|-------------|---------|
| **Move Speed** | Walk speed in pixels/sec | `30` |
| **Wander Radius** | How far the NPC wanders from its origin (0 = stationary) | `3` |
| **Dir Down/Up/Left/Right** | Animation names for each facing direction | `walk-down`, `walk-up`, etc. |
| **Greeting** | Text shown when a player interacts | `"Hello, traveler!"` |

### Sounds (optional)

- **Ambient sound** — loops while near the NPC (e.g. humming)
- **Interact sound** — plays on interaction (e.g. a voice clip)

6. Click **Save NPC Sprite**.

The definition appears in the **Saved NPC Sprites** list at the bottom.

---

## Stage 4: Place the NPC on a Map

1. Still in **Build mode**, open the **Map Editor** (the main build panel).
2. Select the **🧑 NPC** tool from the toolbar.
3. Your saved NPC sprite definitions appear in the left sidebar. Click one to select it.
4. Click on the map canvas to place the NPC. A ghost preview shows where it will land.
5. The NPC appears immediately and begins its idle animation (or wanders if wander radius > 0).

### Customize the NPC instance

Each placed NPC can have unique instance data — name, backstory, personality, etc.

1. Open the **NPCs** menu again and switch to the **NPC Instances** tab.
2. Find the placed NPC in the sidebar list (grouped by map).
3. Click it to open its profile editor. You can set:
   - **Instance name** — a unique name for this specific NPC
   - **Backstory, personality, appearance** — used for LLM-driven dialogue
   - **Stats, items, relationships** — gameplay data

### Remove an NPC

- In the Map Editor, select **Build → Delete → 🧑 NPC**, then click the NPC on the map.

---

## Quick Reference

| Step | Where | What |
|------|-------|------|
| Build spritesheet | `/sprited.html` | Slice PNG → export `.png` + `.json` |
| Copy assets | Terminal | `cp` files to `public/assets/characters/` |
| Register sheet | `SpriteEditorPanel.ts` | Add to `NPC_SPRITE_SHEETS` |
| Create sprite def | In-game → NPCs → NPC Sprites | Configure animations, speed, behaviour |
| Place on map | In-game → Build → 🧑 NPC | Click to place, then customize in NPC Instances |

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Sprite doesn't appear in sheet dropdown | Sheet not registered | Add entry to `NPC_SPRITE_SHEETS` in `SpriteEditorPanel.ts` |
| NPC invisible on map | Wrong animation name in direction mapping | Check that dir-down/up/left/right match actual animation row names |
| NPC doesn't wander | Wander radius = 0 | Set wander radius > 0 in the sprite definition |
| "No NPC sprites yet" in map editor | No sprite definitions with `category: npc` saved | Create one in NPCs → NPC Sprites tab first |
| Sprite shows in editor but not after deploy | Asset files not committed | `git add public/assets/characters/my-npc.*` |
