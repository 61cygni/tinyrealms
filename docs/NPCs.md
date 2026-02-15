# NPCs (Consolidated Guide)

This is the single source of truth for NPCs in Tiny Realms.
It consolidates prior NPC, character, AI-NPC, and NPC-creation docs into one end-to-end reference.

## What This Covers

- Building NPC sprites from raw PNG assets
- Registering sheets and creating NPC sprite definitions
- Placing NPCs in maps and assigning unique identity
- Writing rich profile/backstory/relationship data
- Enabling AI NPC chat with Braintrust slugs and prompts
- Testing in the editor and in game
- Troubleshooting the most common failures

---

## 1) Architecture Overview

An NPC is composed from 4 layers:

1. `spriteDefinitions` (with `category: "npc"`) - visual config and movement defaults
2. `mapObjects` - placement on a map and optional `instanceName`
3. `npcProfiles` - identity, narrative, stats, and AI config
4. `npcState` - server-authoritative runtime movement state

Mental model:

- sprite definition = body
- map object = where it exists
- profile = mind/personality
- npcState = live motion state

### Key Link

`mapObjects.instanceName` must match `npcProfiles.name`.

If this link is missing, runtime falls back to default procedural dialogue.

---

## 2) Asset Pipeline (PNG -> spritesheet)

## 2.1 Use the Spritesheet Tool

Open:

- `http://localhost:5173/sprited.html` (or your active Vite port)

Workflow:

1. Load source PNG (grid or frame files)
2. Set source frame width and height
3. Build animation rows/sequences
4. Optionally set target output frame size
5. Export spritesheet PNG + JSON

Expected output:

- `my-npc.png`
- `my-npc.json` (Pixi-compatible spritesheet metadata)

## 2.2 Put files in project

Use:

- `public/assets/characters/`

Example:

- `public/assets/characters/kita.png`
- `public/assets/characters/kita.json`

## 2.3 Direction rows

Default directional mapping:

- `row0` down
- `row1` up
- `row2` right
- `row3` left

If your sheet layout differs, map directions explicitly in NPC sprite settings.

---

## 3) Register NPC sheet in config

Edit:

- `src/config/spritesheet-config.ts`

Add entry in `NPC_SPRITE_SHEETS`:

```ts
{ name: "Kita", jsonUrl: "/assets/characters/kita.json" }
```

---

## 4) Create NPC Sprite Definition

In game:

- Build mode -> NPCs -> `NPC Sprites`

Create definition with:

- Name (unique)
- Sheet
- Default animation
- Scale and animation speed
- Frame width/height (from sheet)

NPC-specific settings:

- `npcSpeed`
- `npcWanderRadius`
- `npcDirDown`, `npcDirUp`, `npcDirLeft`, `npcDirRight`
- `npcGreeting`

Optional sound settings:

- `ambientSoundUrl`, `ambientSoundRadius`, `ambientSoundVolume`
- `interactSoundUrl`

Save writes to `spriteDefinitions` with `category: "npc"`.

---

## 5) Place NPC on map

In map editor:

1. Build mode -> NPC tool
2. Select NPC sprite definition
3. Click to place on map
4. Save map

This creates/updates `mapObjects`.

---

## 6) Assign Instance Identity (NPC Instances panel)

Open:

- Build mode -> NPCs -> `NPC Instances`

For each placed NPC:

1. Set a unique Instance Name (slug-like), e.g. `kita-lost-child`
2. Set display identity fields
3. Save

Without instance naming, the NPC has no stable profile link.

---

## 7) Build Rich NPC Profiles

In `NPC Instances`, fill these sections:

- Identity: display name, title, faction, tags, visibility
- Narrative: backstory, personality, dialogue style
- Knowledge and secrets
- Stats: hp/maxHp/atk/def/spd/level
- Inventory
- Relationships (by other NPC instance names)
- LLM System Prompt

This writes to `npcProfiles`.

---

## 8) Enable AI NPC Chat

In `NPC Instances` -> AI section:

- `NPC Type` -> `AI`
- check `Enable AI chat`
- check `Allow chat capability`
- set `Braintrust Slug`
- set or refine `System Prompt`

Then click `Save`.

### Stored fields

AI behavior is driven by:

- `npcType: "ai"`
- `aiEnabled: true`
- `braintrustSlug: "<slug>"`
- `aiPolicy.capabilities.canChat: true`

---

## 9) Convex + Braintrust Setup

Set backend env vars in Convex:

- `BRAINTRUST_API_KEY`
- `BRAINTRUST_PROJECT_NAME`

Do not expose Braintrust keys in frontend `VITE_*` variables.

Convex AI proxy endpoints:

- `POST /ai/invoke`
- `POST /ai/stream`

Optional frontend helper env:

- `VITE_CONVEX_HTTP_URL=https://<deployment>.convex.site`

---

## 10) Prompt Design for Braintrust Slugs

Current invoke input passed from game includes:

- `input.npcProfileName`
- `input.mapName`
- `input.userMessage`
- `input.systemPrompt`
- `input.historyText`
- `input.messages`

Safe starter prompt (minimal templating assumptions):

```text
You are {{input.npcProfileName}}, an NPC in Tiny Realms.
Current map: {{input.mapName}}

Character prompt:
{{input.systemPrompt}}

Recent conversation:
{{input.historyText}}

Player says:
{{input.userMessage}}

Respond in-character. Keep replies concise (1-3 sentences).
Return plain text only.
```

Recommendation:

- start simple
- avoid `#if` and `#each` helpers unless your Braintrust template runtime for that slug supports them
- add complexity only after baseline works

---

## 11) Testing Workflows

## 11.1 Editor test (fastest)

In `NPC Instances`:

- set AI fields
- click `Save`
- use `Test Message`
- click `Test AI`
- inspect `Test AI Output`

## 11.2 CLI proxy test

Use:

- `npm run npc:test:ai -- --project <project> --slug <slug> --input "hello"`

Optional:

- `--url https://<deployment>.convex.site`
- `--stream`
- `--raw`

## 11.3 In-game test

Press `E` near the NPC.

Expected:

- AI-enabled NPCs open free-text chat splash
- procedural NPCs open branching procedural dialogue splash

---

## 12) Runtime behavior details

At interaction time:

1. Resolve NPC instance identity from runtime state/map object
2. Load matching profile
3. If AI fields are valid (`npcType`, `aiEnabled`, `canChat`), use AI chat path
4. Otherwise use procedural path

Notes:

- Runtime includes safeguards for stale `npcState.instanceName` by falling back to map-object instance mapping.
- This prevents false procedural fallback when map object has correct instance name but npcState lags.

---

## 13) Troubleshooting

### Issue: Pressing E still shows procedural dialogue

Check:

1. `mapObjects.instanceName` exists and matches `npcProfiles.name`
2. profile has:
   - `npcType = "ai"`
   - `aiEnabled = true`
   - `aiPolicy.capabilities.canChat = true`
3. `braintrustSlug` is valid
4. Convex env vars are set
5. `npx convex dev` is running latest functions

### Issue: Test AI returns "Hello there."

This means invoke path executed but no usable text was extracted.
Check Convex logs for:

- invoke response keys
- Braintrust error body

Then adjust slug prompt/output schema.

### Issue: Braintrust invoke 400

Usually template mismatch or unsupported helper syntax.
Start with the simple prompt in this doc and add complexity gradually.

---

## 14) Visibility and ownership

`npcProfiles` supports:

- `visibilityType`: `private` | `public` | `system`
- `createdByUser`

Visibility affects who can load/edit profiles in client-driven flows.
For shared AI NPCs used by multiple users, use `public` or `system`.

---

## 15) AI-Related Data Tables

Main profile fields:

- `npcType`
- `aiEnabled`
- `braintrustSlug`
- `aiPolicy.capabilities.*`

Supporting AI tables:

- `npcConversations`
- `npcMemories`
- `npcActionLog`

---

## 16) File Map

Core client files:

- `src/ui/NpcEditorPanel.ts`
- `src/engine/EntityLayer.ts`
- `src/engine/NPC.ts`
- `src/npc/dialogue/NpcDialogueController.ts`
- `src/splash/screens/AiChatSplash.ts`

Core backend files:

- `convex/npcProfiles.ts`
- `convex/npc/chat.ts`
- `convex/npc/braintrust.ts`
- `convex/npc/router.ts`
- `convex/npc/memory.ts`
- `convex/npcEngine.ts`
- `convex/ai.ts`
- `convex/http.ts`
- `convex/schema.ts`

Tooling:

- `scripts/test-npc-ai.mjs`
- `src/sprited/SpritedTool.ts`

---

## 17) Recommended Production Sequence

1. Create sheet in sprited tool
2. Register in `NPC_SPRITE_SHEETS`
3. Create NPC sprite definition
4. Place on map and save
5. Assign instance name
6. Fill profile (backstory/personality/knowledge/secrets/stats)
7. Configure AI fields and prompt/slug
8. Validate via panel `Test AI`
9. Validate in game (`E`)
10. Promote visibility as needed (`private` -> `public`/`system`)
