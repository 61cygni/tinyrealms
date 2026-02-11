# Authentication & Permissions

User authentication and permission model for **Here** — linking real users to profiles, scoping map ownership, and supporting local development, password auth, and production GitHub OAuth.

---

## Table of Contents

1. [Overview](#overview)
2. [Auth Providers](#auth-providers)
3. [Auth Flow](#auth-flow)
4. [Permissions & Roles](#permissions--roles)
5. [Schema](#schema)
6. [Backend](#backend)
7. [Frontend](#frontend)
8. [User Management Script](#user-management-script)
9. [Environment Setup](#environment-setup)
10. [Open Questions](#open-questions)

---

## Overview

Authentication uses [`@convex-dev/auth`](https://labs.convex.dev/auth) with two providers:

| Provider | Use case | How it works |
|----------|----------|--------------|
| **Password** | Multi-user testing, production | Email + password (Scrypt-hashed). Supports sign-up and sign-in flows. |
| **GitHub OAuth** | Production | Redirects to GitHub, exchanges code for session tokens. |
Both create proper user sessions in the `users` / `authSessions` tables, so downstream code (profile ownership, permissions) works identically regardless of provider.

---

## Auth Providers

### Password (`@convex-dev/auth/providers/Password`)

- Uses `email` as the account identifier and `password` as the secret
- Passwords are hashed with Scrypt (from Lucia)
- Minimum 8 characters enforced client-side and server-side
- Two flows: `signUp` (creates account) and `signIn` (validates credentials)
- No email verification required (can be added later via the `verify` option)

### GitHub OAuth (`@auth/core/providers/github`)

- Standard OAuth 2.0 with PKCE
- Requires `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` env vars on the Convex backend
- Callback handled via `convex/http.ts` routes
- Only shown in production (when `VITE_CONVEX_URL` is not localhost)

## Auth Flow

### Sign in with email + password

```
1. User opens app → auth screen shown
2. User enters email + password, clicks "Sign In" or "Sign Up"
3. AuthManager calls signIn action with provider="password", flow="signIn"|"signUp"
4. Backend validates/creates credentials, returns JWT + refresh token
5. Tokens stored in localStorage, ConvexClient picks up auth
6. App transitions to profile picker (scoped to this user)
```

### GitHub OAuth (production)

```
1. User clicks "Sign in with GitHub"
2. AuthManager calls signIn action → gets redirect URL + PKCE verifier
3. Browser redirects to GitHub → user authorizes → redirected back
4. AuthScreen.init() detects OAuth callback code in URL
5. Code exchanged for tokens via signIn action
6. Tokens stored, app transitions to profile picker
```

### Returning user

```
1. User opens app with tokens in localStorage
2. AuthScreen.init() detects existing token → calls done()
3. ConvexClient validates token on next query
4. Profile picker shown with user's profiles
```

### Token refresh

`AuthManager` runs a refresh timer every 5 minutes. If a refresh token exists, it calls the signIn action with `refreshToken` to get fresh JWT + refresh tokens.

---

## Permissions & Roles

### Role hierarchy

```
Superuser (profile.role === "superuser")
  ├── Admin over ALL maps (edit, delete, set editors)
  ├── Can create portals between ANY maps (cross-user)
  ├── Can set map type (public / private / system)
  ├── Can manage global game content (sprite defs, item defs, NPC profiles)
  └── Can place world items on any map

Map Creator (map.createdBy === user._id)
  ├── Admin over their OWN maps (edit, delete, set editors)
  ├── Can create portals between their own maps only
  └── Cannot create portals to/from maps they don't own

Map Editor (map.editors includes profileId)
  └── Can edit that specific map (tiles, objects, metadata)

Regular Player (default, profile.role === "player")
  ├── Can create new maps (becomes the creator)
  └── Can play the game, chat, interact with world
```

### Key permission rules

| Action | Who can do it |
|--------|--------------|
| **Create a map** | Any authenticated user |
| **Edit a map** | Superuser, map creator (by userId), or anyone in the map's editors list |
| **Delete a map** | Superuser or map creator |
| **Set map editors** | Superuser or map creator |
| **Set map type** | Superuser only |
| **Create portal within own maps** | Map creator |
| **Create portal across users' maps** | Superuser only |
| **Manage sprite/item/NPC definitions** | Superuser only |
| **Place world items** | Superuser only |

### Map ownership

Maps track their creator via two fields:
- **`createdBy`** (`Id<"users">`) — the user who created the map. This is the canonical ownership field. A user owns a map regardless of which profile they used to create it.
- **`creatorProfileId`** (`Id<"profiles">`) — legacy field, the specific profile used to create the map. Kept for backwards compatibility.

### How roles are assigned

- All new profiles are created with `role: "player"`
- Superuser is **never** auto-assigned — it must be granted explicitly via the management script:

```bash
node scripts/manage-users.mjs set-superuser alice@test.com:Alice
```

- Profiles are identified by `email:profileName` to avoid ambiguity when users pick similar names
- This ensures no user gets elevated privileges without an explicit admin action

---

## Schema

### Key tables

```
users (from authTables)        ← created by @convex-dev/auth
  ├── email, name, image, isAnonymous, phone
  ├── index: email, phone
  │
authSessions                   ← one per login session
  ├── userId, expirationTime
  ├── index: userId
  │
authAccounts                   ← one per provider per user
  ├── userId, provider, providerAccountId, secret
  ├── index: userIdAndProvider, providerAndAccountId
  │
profiles                       ← game characters, owned by users
  ├── userId (links to users._id)
  ├── name, spriteUrl, color, role ("superuser" | "player"), stats, items, ...
  ├── index: by_name, by_user
  │
maps                           ← game maps
  ├── createdBy (Id<"users">, the user who created this map)
  ├── creatorProfileId (legacy, the profile used to create)
  ├── editors (array of profile IDs with edit access)
  ├── name, layers, portals, labels, ...
  ├── index: by_name
```

### Profile ownership

- `profiles.userId` links a profile to its owning user
- `profiles.list` query returns only profiles matching the authenticated user's ID
- `profiles.create` sets `userId` from the authenticated session
- `profiles.remove` verifies ownership

### Profile deletion

Users can delete their own characters from the profile screen UI. Deletion:
- Requires authentication and ownership (`profile.userId === userId`)
- Removes the profile document and any associated presence rows
- Is permanent — all stats, items, and progress are lost
- Can also be done via the management script (`remove-profile email:name`)

---

## Backend

### `convex/auth.ts`

```typescript
import GitHub from "@auth/core/providers/github";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [GitHub, Password],
});
```

### `convex/http.ts`

Serves OAuth callback routes and the JWKS endpoint for token verification:

```typescript
import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);

export default http;
```

### `convex/auth.config.ts`

Tells the Convex backend where to find the JWKS for JWT validation:

```typescript
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
```

### Permission helpers

- **`convex/lib/requireSuperuser.ts`** — throws if the profile's role is not `"superuser"`. Used for global content management (sprite defs, item defs, NPC profiles, world items).
- **`convex/lib/requireMapEditor.ts`** — throws if the profile is not a superuser, map creator (by userId), or in the map's editors list. Also exports `isMapOwner()` for portal validation.

### `convex/profiles.ts` (key functions)

- **`list`** — returns only profiles owned by the authenticated user. Checks for stale presence to auto-release abandoned sessions.
- **`create`** — requires auth, sets `userId`, checks for duplicate names. All new profiles get `role: "player"`.
- **`remove`** — deletes a profile and its presence rows. Enforces ownership (only the authenticated user can delete their own profiles).

### `convex/admin.ts` (key functions)

- **`myAccountInfo`** — query returning the authenticated user's account details: email, auth providers, profiles (name, role, level), maps created (name, status, map type), and creation date. Used by the frontend account info panel.

### `convex/maps.ts` (key functions)

- **`create`** — any authenticated user can create a map. Sets `createdBy` to the user's ID and `creatorProfileId` to the profile used. Only superusers can designate a map as the hub.
- **`saveFullMap`** — requires map editor permissions. Validates portal permissions: regular users can only create portals to maps they own; superusers can create portals to any map.
- **`setEditors`** — only the map creator (by userId) or a superuser can change the editors list.
- **`remove`** — only the map creator or a superuser can delete a map.

---

## Frontend

### `src/lib/authClient.ts` — AuthManager

Vanilla-JS auth manager (no React). Handles:

- Token storage in `localStorage` (`__convexAuthJWT`, `__convexAuthRefreshToken`)
- `setAuth()` on the `ConvexClient` so queries/mutations are authenticated
- Methods: `signInPassword(email, password, flow)`, `signInGitHub()`, `signOut()`
- Periodic token refresh (every 5 min)
- OAuth callback detection on page load

**Important:** The `setAuth` callback must return the raw JWT string (not `{token: string}`). The `ConvexClient.AuthTokenFetcher` type is `(args) => Promise<string | null | undefined>`.

### `src/ui/AuthScreen.ts`

The auth screen shows (top to bottom):

1. **Email + password form** with Sign In / Sign Up buttons
2. **Divider** ("or")
3. **GitHub button** (production only, hidden on localhost)
4. **Status message** area for errors/progress

On init, it checks for OAuth callback, then existing session, then shows the form.

### `src/ui/ProfileScreen.ts`

The profile screen ("Choose Your Character") has three views:

1. **Profile list** — shows existing characters as cards with avatar, name, level, role badges, and item count. Each card has:
   - **Click to play** — enters the game with that profile
   - **Delete button** (trash icon, top-right) — appears on hover, opens a confirmation dialog before deleting.
2. **Create form** — name input + sprite picker to create a new character
3. **Account info panel** — accessible via the "Account" button in the top-right bar. Shows:
   - Email and auth type (Password, GitHub)
   - Number of profiles and a list of all characters (name, role, level)
   - Maps created by this user (name, status, map type)
   - Member since date

Top-right bar also has a **Sign Out** button.

### App flow

```
App.start() → AuthScreen → ProfileScreen (user-scoped) → Game
```

Sign-out is available on the ProfileScreen. It clears tokens and returns to the AuthScreen.

---

## User Management Script

`scripts/manage-users.mjs` provides CLI commands for managing users and profiles.

> Security note: admin/management commands now require `ADMIN_API_KEY` in your shell environment:
> `export ADMIN_API_KEY='your-secret'`

### Commands

Profiles are identified by `email:profileName` to avoid ambiguity:

```bash
# List all users and their linked profiles
node scripts/manage-users.mjs list

# Remove a user account by email (keeps profiles)
node scripts/manage-users.mjs remove-user alice@test.com

# Remove a game profile
node scripts/manage-users.mjs remove-profile alice@test.com:Alice

# Remove all anonymous users + profiles
node scripts/manage-users.mjs remove-anonymous

# Grant superuser
node scripts/manage-users.mjs set-superuser alice@test.com:Alice

# Set a profile's role explicitly
node scripts/manage-users.mjs set-role alice@test.com:Alice superuser
node scripts/manage-users.mjs set-role bob@test.com:Warrior player
```

### npm shortcuts

```bash
npm run users list
npm run users -- set-superuser alice@test.com:Alice
npm run users -- set-role bob@test.com:Warrior player
npm run users -- remove-user alice@test.com
npm run users -- remove-anonymous
```

### Backend mutations used

| Script command | Convex function |
|----------------|-----------------|
| `list` | `admin:listUsersWithProfiles` (query) |
| `remove-user` | `admin:removeUserByEmail` (mutation) |
| `remove-profile` | `admin:removeProfile` (mutation) |
| `remove-anonymous` | `admin:removeAnonymousUsers` (mutation) |
| `set-role` / `set-superuser` | `admin:setRole` (mutation) — takes `email` + `name` + `role` |

### Additional admin mutations

```bash
# Reset a profile's map location to the hub
npx convex run admin:resetProfileMap '{"adminKey":"<ADMIN_API_KEY>","name":"Alice"}'

# Reset ALL profiles to the hub
npx convex run admin:resetAllProfileMaps '{"adminKey":"<ADMIN_API_KEY>"}'

# Grant superuser to all of a user's profiles (by user ID)
npx convex run admin:grantSuperuser '{"userId": "<user-id>"}'

# Grant map editor access (by user ID)
npx convex run admin:grantMapEditor '{"userId": "<user-id>", "mapNames": ["cozy-cabin"]}'
```

---

## Environment Setup

### Environment variables reference

| Variable | Required | Where | Purpose |
|----------|----------|-------|---------|
| `JWT_PRIVATE_KEY` | Yes | Convex backend | RSA private key (PKCS8 PEM) for signing auth JWTs |
| `JWKS` | Yes | Convex backend | JSON Web Key Set with the matching public key for JWT verification |
| `ADMIN_API_KEY` | Yes | Convex backend + shell | Shared secret protecting admin/migration mutations |
| `AUTH_GITHUB_ID` | Production only | Convex backend | GitHub OAuth app client ID |
| `AUTH_GITHUB_SECRET` | Production only | Convex backend | GitHub OAuth app client secret |

### `ADMIN_API_KEY` — admin operations key

All sensitive admin and migration mutations (user management, data cleanup, backfills, backups, restores) are protected by a shared secret called `ADMIN_API_KEY`. This prevents unauthorized callers from running destructive operations.

**How it works:**

1. The key is set as a Convex environment variable on the backend
2. CLI scripts pass the key from your shell environment in every admin mutation call
3. The backend helper `requireAdminKey()` (in `convex/lib/requireAdminKey.ts`) compares the provided key against the env var and throws if they don't match

**Setup:**

```bash
# 1. Choose a strong secret (any string)
export ADMIN_API_KEY="my-strong-admin-secret-2026"

# 2. Set it on the Convex backend (must match your shell value)
npx convex env set ADMIN_API_KEY "$ADMIN_API_KEY"
```

**Both values must match.** If you reset the local database, you must re-set the Convex env var.

**Which commands use it:**

All `scripts/manage-users.mjs` commands, `scripts/admin-run.mjs` commands, `scripts/backup-world.mjs`, `scripts/restore-world.mjs`, and any direct `npx convex run admin:*` or `npx convex run migrations:*` calls.

If you see `"Server misconfigured: ADMIN_API_KEY is not set"` — the Convex backend env var is missing. If you see `"Invalid admin key"` — your shell's `ADMIN_API_KEY` doesn't match the backend's.

### Local development

The following env vars are needed for the local Convex backend:

```bash
# JWT keys (set once — generated RSA keys for JWT signing/verification)
npx convex env set JWT_PRIVATE_KEY -- '<RSA private key in PKCS8 PEM format>'
npx convex env set JWKS '<JSON Web Key Set with the public key>'

# Admin key (must also be exported in your shell)
npx convex env set ADMIN_API_KEY "your-admin-key"
```

JWT keys can be generated with:

```bash
npx @convex-dev/auth
```

Or manually with Node.js `crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })`.

Password auth works out of the box with just these three variables.

### Production (GitHub OAuth)

```bash
# GitHub OAuth App credentials
npx convex env set AUTH_GITHUB_ID "your-github-client-id"
npx convex env set AUTH_GITHUB_SECRET "your-github-client-secret"

# JWT keys (same as local, or generate new ones for production)
npx convex env set JWT_PRIVATE_KEY -- '<key>'
npx convex env set JWKS '<jwks>'

# Admin key
npx convex env set ADMIN_API_KEY "your-production-admin-key"
```

**GitHub OAuth App settings:**
- Homepage URL: `https://your-domain.com`
- Callback URL: `https://your-convex-deployment.convex.site/api/auth/callback/github`

### Testing multi-user locally

1. Open two browser windows (one regular, one incognito)
2. Sign up with different emails (e.g. `alice@test.com`, `bob@test.com`)
3. Create characters in each window
4. Use the management script to adjust roles:

```bash
ADMIN_API_KEY="your-admin-key" node scripts/manage-users.mjs list
ADMIN_API_KEY="your-admin-key" node scripts/manage-users.mjs set-superuser alice@test.com:Alice
```

---

## Open Questions

1. **Should profile names be globally unique or per-user unique?** Currently globally unique. Per-user would allow duplicate names across accounts but could confuse chat/presence.

2. **Rate limiting on profile creation?** Currently none. Consider adding a cap (e.g., 10 profiles per user).

3. **Password reset flow?** The Password provider supports it via the `reset` option (requires an email provider). Not yet configured.

4. **Should map editors be able to place world items?** Currently world item management requires superuser. Map editors can place map objects but not world items (pickups). This may need revisiting.
