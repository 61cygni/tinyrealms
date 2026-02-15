# Auth & Permissions Workflow

Current reference for authentication, profile ownership, roles, and feature permissions in Here.

## 1) Authentication Model

Backend auth uses `@convex-dev/auth`.

Active auth provider paths:

- Password auth (email + password) for sign-up/sign-in
- GitHub OAuth backend routes exist, but GitHub login is currently not active in the main auth UI

Session behavior:

- Auth tokens are stored client-side and attached to Convex requests
- Refresh runs on an interval via the auth client
- Sign-out clears session tokens and returns to auth flow

Guest mode:

- Supported as a read-only play mode
- Uses a synthetic guest profile (`role: "guest"`)
- Guests can explore but cannot run protected mutations

## 2) App Auth Flow

High-level app path:

1. Auth screen (sign in / sign up / optional guest entry)
2. Profile selection/creation screen (authenticated users)
3. Game session bound to selected profile

Authenticated user behavior:

- Profiles are scoped to `userId`
- Profile selection determines in-game role and ownership checks

## 3) Profiles, Roles, and Elevation

Profiles:

- Created by authenticated users
- Linked to owner via `profiles.userId`
- Default role is `player`

Role assignment:

- Direct self role elevation is disabled in normal profile mutation flows
- Superuser role is granted via guarded admin/superuser pathways
- Admin/management scripts use server-protected admin key checks

## 4) Core Permission Primitives

### Authentication check

Most protected mutations require authenticated `userId`.

### Ownership check

Sensitive profile actions verify `profile.userId === authUserId`.

### Superuser check

Global operations use superuser gating helpers.

### Map editor check

Map-edit operations use map editor helper logic:

- superuser OR
- map creator ownership OR
- profile included in map `editors`

Legacy compatibility still considers `creatorProfileId` where needed.

## 5) Map Permissions

Create map:

- Any authenticated user

Edit map content:

- superuser, creator owner, or profile listed in `editors`

Delete map:

- superuser or creator owner

Set editors:

- superuser or creator owner

Set map type:

- guarded (superuser-sensitive path)

Portal permission behavior:

- non-superusers are constrained to owner-valid map links
- superusers can create broader links, but destination privacy/type rules still apply

## 6) Visibility Models

Many content tables use `visibilityType`:

- `private`
- `public`
- `system`

Used by:

- `spriteDefinitions`
- `npcProfiles`
- `itemDefs`

General behavior:

- private: owner access
- public: readable by all, owner/superuser edit rules
- system: global/system-managed, superuser-sensitive edits

Maps use `mapType` (`private` / `public` / `system`) for discovery and sharing scope.

## 7) Feature-Level Authorization Snapshot

Maps:

- creator/superuser/editor-gated for edits

Profiles:

- owner-gated list/update/delete

Sprite definitions / NPC profiles / item definitions:

- visibility-aware reads
- owner/superuser gated writes, with stricter handling for system content

World items:

- placement/admin surfaces are tightly gated
- pickup/inventory updates still require authenticated ownership checks

Admin and migration surfaces:

- protected by admin key and/or superuser checks depending endpoint

## 8) Environment and Security Requirements

Expected backend env:

- JWT key material (`JWT_PRIVATE_KEY`, `JWKS`)
- `ADMIN_API_KEY` for guarded admin/migration scripts and endpoints
- OAuth credentials for GitHub path if enabled (`AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`)

Security principle in current code:

- Server-side enforcement is the source of truth
- UI hides/disables controls for UX, but backend checks determine authorization

## 9) Operational Notes

Useful management flows:

- list users/profiles
- grant/revoke roles
- assign/remediate ownership data
- run backfills for missing role/visibility defaults

These paths are protected and should be run with explicit admin key handling.

## 10) Common Gotchas

- GitHub OAuth appears available in backend routes, but may be disabled in UI
- Guest mode can read/play but cannot mutate protected state
- Map ownership is user-based (`createdBy`), with legacy profile owner fallback support
- Missing `visibilityType` in legacy rows may resolve to default behavior after backfills/helpers
- Passing UI checks does not imply server permission; always validate through mutation responses

## Key Files

- Auth backend: `convex/auth.ts`, `convex/auth.config.ts`, `convex/http.ts`
- Auth client/UI: `src/lib/authClient.ts`, `src/ui/AuthScreen.ts`, `src/ui/ProfileScreen.ts`, `src/App.ts`
- Permission helpers: `convex/lib/requireSuperuser.ts`, `convex/lib/requireMapEditor.ts`, `convex/lib/requireAdminKey.ts`
- Core permission surfaces: `convex/maps.ts`, `convex/profiles.ts`, `convex/spriteDefinitions.ts`, `convex/npcProfiles.ts`, `convex/items.ts`, `convex/worldItems.ts`, `convex/admin.ts`, `convex/superuser.ts`

## Related Docs

- `docs/LevelCreate.md` - map editing and ownership-sensitive build workflows
- `docs/Objects.md` - object and map-object permissions in practice
- `docs/NPCs.md` - NPC visibility, profile ownership, and capability gating
- `docs/Items.md` - item visibility and world-item mutation authorization
- `docs/Combat.md` - combat authorization boundaries and server authority
- `docs/Operations.md` - admin key usage, scripts, backup/restore operations
