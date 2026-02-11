# User Map Creation

This document describes the map workflow for regular users and superusers.

## Goals

- Users authenticate with email/password.
- Users create a character.
- Users can create their own maps.
- User-created maps are owned by that user account.
- Owners can set map visibility to:
  - `private` (default — only visible to the owner in the map browser)
  - `public` (visible to the owner; superusers can link portals to it)
- Only superusers can set:
  - `system` (visible to everyone, eligible as start maps)
- `system` can only be assigned or changed via the CLI — the in-game UI does not expose this option.

## Map Visibility in the Map Browser

When a user clicks the globe icon, the map list shows:

| Map type | Who sees it |
|----------|------------|
| `system` | All users |
| `private` / `public` | Only the map owner |

**Exception:** Superusers see all maps regardless of type.

This means a new user who hasn't created any maps will only see the system maps (cozy-cabin, palma, camineet, mage-city).

## Static (System) Maps

The game ships with built-in maps in `public/assets/maps/`. These are **seeded automatically** when a user first loads the game and the maps don't yet exist in Convex.

- Static maps are always seeded with `mapType: "system"`.
- Static maps ship **without portals** — portals are created in-game via the map editor and stored only in Convex.
- Once seeded, the database is the source of truth; static JSON files are never re-applied.

### Changing system map type

Only a superuser can change a system map's type, and only via the CLI:

```bash
export ADMIN_API_KEY="your-key"
node scripts/manage-users.mjs set-superuser user@email.com:ProfileName
# Then use the Convex dashboard or a custom script to update mapType
```

Regular users cannot change the type of system maps even if they somehow have editor access.

## User Workflow

### 1) Sign in and create a character

1. Sign in with email/password.
2. On the character screen, create a profile.
3. Pick starting world/position (system maps + user's own maps are listed).

### 2) Open Maps and create a level

1. Click the **Maps** button (globe icon).
2. Click **Create New Map**.
3. Fill in:
   - map name
   - size
   - tileset
   - music/combat options
   - **Map Type** (`private` or `public`)
4. Save.

Result:
- The map is created with:
  - `createdBy = current user`
  - `creatorProfileId = current profile`
  - editor access for that profile
  - `mapType = private` (default) or `public`

### 3) Edit your level

1. Travel to the map from Map Browser.
2. Enter build mode.
3. Add tiles/objects/labels/portals.
4. Save map.

### 4) Change map visibility

1. Open the Map Browser (globe icon).
2. On your map's card, use the type dropdown to switch between `private` and `public`.
3. Click **Save Type**.

- `private` → only you see this map in the browser and can link portals to it.
- `public` → you still see it; superusers can now create portals to it from other maps.

## Portal Connection Rules

### Regular users

- Can create portals only to maps they own.

### Superusers

- Can create cross-user portals.
- For cross-user portal targets, target map must be:
  - `public`, or
  - `system`
- If target map is `private`, portal save is rejected.

## Map Type Rules

| Type | Who can set it | Visible in Map Browser to | Portal target for |
|------|---------------|--------------------------|-------------------|
| `private` | Map owner | Owner only | Owner only |
| `public` | Map owner | Owner only | Owner + superusers |
| `system` | Superuser (CLI only) | Everyone | Everyone + superusers |

- Only the map owner can toggle between `private` and `public` in the UI.
- Only superusers can set or change `system` — and only via CLI, not the in-game UI.
- The in-game create form and type-change dropdown only show `private` and `public`.

## Character Creation and Start Maps

When creating a character, the starting world list includes:

- maps with `mapType = "system"`
- maps created by the current user

This keeps global/system maps available while always letting users start in their own maps.
