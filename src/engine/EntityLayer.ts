import {
  Container,
  Graphics,
  Text,
  TextStyle,
  AnimatedSprite,
  Spritesheet,
} from "pixi.js";
import { loadSpriteSheet } from "./SpriteLoader.ts";
import type { Game } from "./Game.ts";
import type { InputManager } from "./InputManager.ts";
import type { PresenceData, Direction } from "./types.ts";
import { NPC } from "./NPC.ts";
import type { NPCConfig, DialogueLine } from "./NPC.ts";
import { splashManager } from "../splash/SplashManager.ts";
import { createDialogueSplash } from "../splash/screens/DialogueSplash.ts";
import type { DialogueNode } from "../splash/screens/DialogueSplash.ts";

const MOVE_SPEED = 120; // pixels per second
const SPRINT_MULTIPLIER = 1.5; // hold Shift to move faster
const ANIM_SPEED = 0.12; // frames per tick (PixiJS AnimatedSprite)
const NPC_INTERACT_RADIUS = 48; // pixels
// ---------------------------------------------------------------------------
// Remote player interpolation
// ---------------------------------------------------------------------------
// Instead of extrapolating into the future (which amplifies velocity noise),
// we buffer the last few server snapshots and render in the *recent past*,
// smoothly lerping between two known positions.  This gives perfectly smooth
// movement at the cost of INTERP_DELAY_MS of visual latency — imperceptible
// in a co-op world.
const INTERP_DELAY_MS = 300;       // render this far behind "now"
const INTERP_MAX_SNAPSHOTS = 6;    // keep a small ring buffer per player
const REMOTE_SNAP_DISTANCE_PX = 96; // snap if correction is enormous (teleport)

/** A position snapshot received from the server */
interface RemoteSnapshot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  direction: string;
  animation: string;
  time: number; // performance.now() when we received it
}

// Player collision box (relative to anchor at bottom-center of sprite).
// The original checks two points per direction to form a thin bounding box
// around the character's feet.
const COL_HALF_W = 6;  // half-width of collision box
const COL_TOP = -12;   // top of collision box (above feet)
const COL_BOT = 0;     // bottom of collision box (at feet)

/** Maps our Direction to the villager sprite sheet row animations */
const DIR_ANIM: Record<Direction, string> = {
  down: "row0",
  up: "row1",
  right: "row2",
  left: "row3",
};

/**
 * Manages the player entity, NPCs, and other players (from presence data).
 */
export class EntityLayer {
  container: Container;
  private game: Game;

  // Local player
  playerX = 64;
  playerY = 64;
  playerDirection: Direction = "down";
  private isMoving = false;
  /** Current velocity in px/s (computed each frame for presence broadcasts) */
  playerVX = 0;
  playerVY = 0;

  // Player visual
  private playerContainer: Container;
  private playerSprite: AnimatedSprite | null = null;
  private playerFallback: Graphics | null = null;
  private playerLabel: Text;
  private spritesheet: Spritesheet | null = null;

  // NPCs
  private npcs: NPC[] = [];
  private nearestNPC: NPC | null = null;
  inDialogue = false;
  private npcAmbientHandles = new Map<string, import("./AudioManager.ts").SfxHandle>();

  // Remote players
  private remotePlayers: Map<
    string,
    {
      container: Container;
      sprite: AnimatedSprite | null;
      spritesheet: Spritesheet | null;
      spriteUrl: string;
      label: Text;
      // Interpolation buffer (newest at end)
      snapshots: RemoteSnapshot[];
      // Rendered (smoothed) position
      renderX: number;
      renderY: number;
      // Current visual state (debounced)
      direction: string;
      animation: string;
      directionHoldFrames: number; // frames the current direction has been consistent
    }
  > = new Map();

  constructor(game: Game) {
    this.game = game;
    this.container = new Container();
    this.container.label = "entities";
    this.container.zIndex = 50;

    // Create local player container
    this.playerContainer = new Container();
    this.playerContainer.x = this.playerX;
    this.playerContainer.y = this.playerY;

    // Name label
    this.playerLabel = new Text({
      text: this.game.profile?.name ?? "You",
      style: new TextStyle({
        fontSize: 10,
        fill: 0xe8e8f0,
        fontFamily: "Inter, sans-serif",
      }),
    });
    this.playerLabel.anchor.set(0.5, 1);
    this.playerContainer.addChild(this.playerLabel);

    // Fallback square
    this.showFallback();

    this.container.addChild(this.playerContainer);

    // Load the character sprite
    this.loadCharacterSprite();
  }

  // ---------------------------------------------------------------------------
  // Player sprite loading
  // ---------------------------------------------------------------------------

  private showFallback() {
    const size = 16;
    this.playerFallback = new Graphics();
    this.playerFallback.rect(-size / 2, -size / 2, size, size);
    this.playerFallback.fill(0x6c5ce7);
    this.playerContainer.addChild(this.playerFallback);
    this.playerLabel.y = -size / 2 - 2;
  }

  private async loadCharacterSprite() {
    try {
      const spriteUrl = this.game.profile?.spriteUrl ?? "/assets/characters/villager4.json";
      const sheet = await loadSpriteSheet(spriteUrl);
      this.spritesheet = sheet;
      if (!this.spritesheet.animations) return;

      const downFrames = this.spritesheet.animations["row0"];
      if (!downFrames || downFrames.length === 0) return;

      this.playerSprite = new AnimatedSprite(downFrames);
      this.playerSprite.animationSpeed = ANIM_SPEED;
      this.playerSprite.anchor.set(0.5, 1);
      this.playerSprite.play();

      if (this.playerFallback) {
        this.playerContainer.removeChild(this.playerFallback);
        this.playerFallback.destroy();
        this.playerFallback = null;
      }

      this.playerContainer.addChild(this.playerSprite);
      this.playerLabel.y = -48 - 2;
    } catch (err) {
      console.warn("Failed to load character sprite:", err);
    }
  }

  private setDirection(dir: Direction) {
    if (this.playerDirection === dir && this.isMoving) return;
    this.playerDirection = dir;

    if (this.playerSprite && this.spritesheet?.animations) {
      const animKey = DIR_ANIM[dir];
      const frames = this.spritesheet.animations[animKey];
      if (frames && frames.length > 0) {
        this.playerSprite.textures = frames;
        this.playerSprite.play();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // NPC management
  // ---------------------------------------------------------------------------

  /** Add an NPC to the scene */
  addNPC(config: NPCConfig): NPC {
    const npc = new NPC(config);
    this.npcs.push(npc);
    this.container.addChild(npc.container);

    // Start ambient sound if defined
    if (npc.ambientSoundUrl) {
      this.game.audio.playAmbient(npc.ambientSoundUrl, 0).then((handle) => {
        if (handle) this.npcAmbientHandles.set(npc.id, handle);
      });
    }

    return npc;
  }

  /** Remove an NPC by id */
  /** Find the nearest NPC to a world position, returns { id, dist } or null */
  findNearestNPCAt(worldX: number, worldY: number, maxRadius: number): { id: string; dist: number } | null {
    let best: { id: string; dist: number } | null = null;
    for (const npc of this.npcs) {
      const dx = npc.x - worldX;
      const dy = npc.y - worldY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < maxRadius && (!best || dist < best.dist)) {
        best = { id: npc.id, dist };
      }
    }
    return best;
  }

  /**
   * Re-sync ambient/interact sounds for all NPCs whose name matches the given
   * sprite-definition name.  Called after a sprite definition is re-saved so
   * that live NPCs pick up sound changes immediately.
   */
  refreshNPCSounds(
    defName: string,
    sounds: {
      ambientSoundUrl?: string;
      ambientSoundRadius?: number;
      ambientSoundVolume?: number;
      interactSoundUrl?: string;
    },
  ) {
    for (const npc of this.npcs) {
      if (npc.name !== defName) continue;

      // Update interact sound (just swap the URL – used at dialogue time)
      npc.interactSoundUrl = sounds.interactSoundUrl;

      // --- ambient sound ---
      const oldHandle = this.npcAmbientHandles.get(npc.id);
      const hadAmbient = !!oldHandle;
      const wantsAmbient = !!sounds.ambientSoundUrl;

      // Stop previous ambient if it was playing
      if (hadAmbient) {
        oldHandle!.stop();
        this.npcAmbientHandles.delete(npc.id);
      }

      // Update NPC properties
      npc.ambientSoundUrl = sounds.ambientSoundUrl;
      npc.ambientSoundRadius = sounds.ambientSoundRadius ?? 200;
      npc.ambientSoundVolume = sounds.ambientSoundVolume ?? 0.5;

      // Start new ambient if one is now defined
      if (wantsAmbient) {
        this.game.audio.playAmbient(sounds.ambientSoundUrl!, 0).then((handle) => {
          if (handle) this.npcAmbientHandles.set(npc.id, handle);
        });
      }
    }
  }

  /**
   * Remove all NPCs that were spawned from placed map objects (Convex IDs).
   * Keeps hardcoded NPCs like "jane".
   */
  removeAllPlacedNPCs() {
    // Convex IDs are long strings; hardcoded ones are short like "jane"
    const toRemove = this.npcs.filter((n) => n.id.length > 20);
    for (const npc of toRemove) {
      this.removeNPC(npc.id);
    }
  }

  // ---------------------------------------------------------------------------
  // Server-driven NPC state (from npcState subscription)
  // ---------------------------------------------------------------------------

  /**
   * Called when the npcState subscription fires with a full list of NPC states
   * for the current map. Creates, updates, or removes NPC instances as needed.
   */
  updateNpcStates(
    states: {
      _id: string;
      mapObjectId: string;
      spriteDefName: string;
      instanceName?: string;
      x: number;
      y: number;
      vx: number;
      vy: number;
      direction: string;
      speed: number;
      wanderRadius: number;
    }[],
    /** Sprite definitions keyed by name — used to configure new NPCs */
    defsMap: Map<
      string,
      {
        name: string;
        spriteSheetUrl: string;
        npcSpeed?: number;
        npcWanderRadius?: number;
        npcDirDown?: string;
        npcDirUp?: string;
        npcDirLeft?: string;
        npcDirRight?: string;
        npcGreeting?: string;
        interactSoundUrl?: string;
        ambientSoundUrl?: string;
        ambientSoundRadius?: number;
        ambientSoundVolume?: number;
      }
    >,
  ) {
    const activeIds = new Set<string>();

    for (const s of states) {
      const npcId = s._id; // use npcState row ID as the NPC instance ID
      activeIds.add(npcId);

      const existing = this.npcs.find((n) => n.id === npcId);

      if (existing) {
        // Update position via server-driven interpolation
        if (existing.serverDriven) {
          existing.setServerPosition(s.x, s.y, s.vx, s.vy, s.direction);
        }
      } else {
        // Create new NPC instance
        const def = defsMap.get(s.spriteDefName);
        if (!def) continue;

        // Use instance name when available, otherwise fall back to sprite def name
        const displayName = s.instanceName || def.name;

        const greeting =
          def.npcGreeting || `Hello! I'm ${displayName}. I don't have much to say yet.`;

        const dialogue: DialogueLine[] = [
          {
            id: "greet",
            text: greeting,
            responses: [
              { text: "Nice to meet you!", nextId: "bye" },
              { text: "Tell me more about this place.", nextId: "lore" },
              { text: "See you around.", nextId: "bye" },
            ],
          },
          {
            id: "lore",
            text: "There's not much I know yet... but I'm sure the world will reveal its secrets in time.",
            responses: [
              { text: "I'll keep exploring then.", nextId: "bye" },
              { text: "Thanks for the hint.", nextId: "bye" },
            ],
          },
          {
            id: "bye",
            text: "Take care! Come chat anytime.",
          },
        ];

        this.addNPC({
          id: npcId,
          name: displayName,
          spriteSheet: def.spriteSheetUrl,
          x: s.x,
          y: s.y,
          speed: def.npcSpeed ?? 30,
          wanderRadius: def.npcWanderRadius ?? 60,
          directionMap: {
            down: def.npcDirDown ?? "row0",
            up: def.npcDirUp ?? "row1",
            left: def.npcDirLeft ?? "row3",
            right: def.npcDirRight ?? "row2",
          },
          interactSoundUrl: def.interactSoundUrl,
          ambientSoundUrl: def.ambientSoundUrl,
          ambientSoundRadius: def.ambientSoundRadius,
          ambientSoundVolume: def.ambientSoundVolume,
          dialogue,
          serverDriven: true,
        });
      }
    }

    // Remove NPCs that are no longer in the server state
    // (but keep non-server-driven NPCs like hardcoded "jane")
    const toRemove = this.npcs.filter(
      (n) => n.serverDriven && !activeIds.has(n.id),
    );
    for (const npc of toRemove) {
      this.removeNPC(npc.id);
    }
  }

  removeNPC(id: string) {
    const idx = this.npcs.findIndex((n) => n.id === id);
    if (idx >= 0) {
      const npc = this.npcs[idx];
      this.container.removeChild(npc.container);
      npc.destroy();
      this.npcs.splice(idx, 1);
      // Stop ambient sound
      const handle = this.npcAmbientHandles.get(id);
      if (handle) {
        handle.stop();
        this.npcAmbientHandles.delete(id);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Game loop
  // ---------------------------------------------------------------------------

  update(dt: number, input: InputManager) {
    // Don't process player input while in dialogue
    if (!this.inDialogue) {
      this.updatePlayerMovement(dt, input);
      this.updateNPCInteraction(input);
    }

    // NPCs always wander (even during dialogue, for ambiance)
    const collisionCheck = (px: number, py: number) => this.isBlocked(px, py);
    for (const npc of this.npcs) {
      npc.update(dt, collisionCheck);

      // Update NPC ambient sound volume based on distance
      const ambHandle = this.npcAmbientHandles.get(npc.id);
      if (ambHandle) {
        const dx = npc.x - this.playerX;
        const dy = npc.y - this.playerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const radius = npc.ambientSoundRadius;
        if (dist >= radius) {
          ambHandle.setVolume(0);
        } else {
          const t = 1 - dist / radius;
          ambHandle.setVolume(t * npc.ambientSoundVolume);
        }
      }
    }

    // Update player visual position
    this.playerContainer.x = this.playerX;
    this.playerContainer.y = this.playerY;

    // Camera follows player
    this.game.camera.follow(this.playerX, this.playerY);

    // Interpolate remote players from their snapshot buffers.
    // We render at (now - INTERP_DELAY_MS) so we always have two snapshots
    // to lerp between, giving perfectly smooth movement.
    const now = performance.now();
    const renderTime = now - INTERP_DELAY_MS;

    for (const [, remote] of this.remotePlayers) {
      const snaps = remote.snapshots;
      let targetX: number;
      let targetY: number;
      let interpDir: string = remote.direction;
      let interpAnim: string = remote.animation;

      if (snaps.length >= 2) {
        // Find the two snapshots that bracket renderTime
        let i = snaps.length - 1;
        while (i > 0 && snaps[i].time > renderTime) i--;
        const a = snaps[i];
        const b = snaps[Math.min(i + 1, snaps.length - 1)];

        if (a === b || a.time === b.time) {
          // Only one usable snapshot — hold at its position (no prediction)
          targetX = a.x;
          targetY = a.y;
          interpDir = a.direction;
          interpAnim = a.animation;
        } else {
          // Lerp between a and b — pure interpolation, no velocity
          const t = Math.max(0, Math.min(1, (renderTime - a.time) / (b.time - a.time)));
          targetX = a.x + (b.x - a.x) * t;
          targetY = a.y + (b.y - a.y) * t;
          interpDir = t < 0.5 ? a.direction : b.direction;
          interpAnim = t < 0.5 ? a.animation : b.animation;
        }
      } else if (snaps.length === 1) {
        // Only one snapshot — hold at its position (no prediction)
        targetX = snaps[0].x;
        targetY = snaps[0].y;
        interpDir = snaps[0].direction;
        interpAnim = snaps[0].animation;
      } else {
        // No snapshots — do nothing
        continue;
      }

      // Snap if teleport-level correction, otherwise move directly
      // (interpolation is already smooth, no need for extra blending)
      const cdx = targetX - remote.renderX;
      const cdy = targetY - remote.renderY;
      if (cdx * cdx + cdy * cdy > REMOTE_SNAP_DISTANCE_PX * REMOTE_SNAP_DISTANCE_PX) {
        remote.renderX = targetX;
        remote.renderY = targetY;
      } else {
        remote.renderX = targetX;
        remote.renderY = targetY;
      }

      remote.container.x = remote.renderX;
      remote.container.y = remote.renderY;

      // Debounce direction changes — only apply after 2 consistent frames
      // to prevent one-frame direction flickers from swapping sprites
      if (interpDir !== remote.direction) {
        remote.directionHoldFrames++;
        if (remote.directionHoldFrames >= 2) {
          this.applyRemoteDirection(remote, interpDir);
          remote.direction = interpDir;
          remote.directionHoldFrames = 0;
        }
      } else {
        remote.directionHoldFrames = 0;
      }

      // Smooth animation state: only toggle walk↔idle after direction is stable
      if (interpAnim !== remote.animation) {
        if (remote.sprite) {
          if (interpAnim === "walk" && !remote.sprite.playing) {
            remote.sprite.play();
          } else if (interpAnim === "idle" && remote.sprite.playing) {
            remote.sprite.gotoAndStop(0);
          }
        }
        remote.animation = interpAnim;
      }
    }

    // NOTE: Do NOT call input.endFrame() here — it must be called once
    // at the very end of Game.update() so other systems (toggle, pickup)
    // can still read justPressed keys this frame.
  }

  private updatePlayerMovement(dt: number, input: InputManager) {
    let dx = 0;
    let dy = 0;

    if (input.isDown("ArrowLeft") || input.isDown("a")) dx -= 1;
    if (input.isDown("ArrowRight") || input.isDown("d")) dx += 1;
    if (input.isDown("ArrowUp") || input.isDown("w")) dy -= 1;
    if (input.isDown("ArrowDown") || input.isDown("s")) dy += 1;

    const wasMoving = this.isMoving;
    this.isMoving = dx !== 0 || dy !== 0;

    if (dy < 0) this.setDirection("up");
    else if (dy > 0) this.setDirection("down");
    else if (dx < 0) this.setDirection("left");
    else if (dx > 0) this.setDirection("right");

    if (!this.isMoving && wasMoving && this.playerSprite) {
      this.playerSprite.gotoAndStop(1);
    }
    if (this.isMoving && !wasMoving && this.playerSprite) {
      this.playerSprite.play();
    }

    if (dx !== 0 && dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len;
      dy /= len;
    }

    const prevX = this.playerX;
    const prevY = this.playerY;

    const isSprinting = input.isDown("Shift");
    const speed = MOVE_SPEED * (isSprinting ? SPRINT_MULTIPLIER : 1);
    const newX = this.playerX + dx * speed * dt;
    const newY = this.playerY + dy * speed * dt;

    // Check collision using a bounding box around the player's feet.
    // We check all four corners of the box for the proposed position.
    const canMoveXY = !this.isBlocked(newX, newY);
    if (canMoveXY) {
      this.playerX = newX;
      this.playerY = newY;
    } else {
      // Wall sliding: try each axis independently
      if (!this.isBlocked(newX, this.playerY)) {
        this.playerX = newX;
      }
      if (!this.isBlocked(this.playerX, newY)) {
        this.playerY = newY;
      }
    }

    // Track intended velocity (px/s) for presence broadcasts.
    // We send the INPUT-derived direction × speed, NOT the collision-adjusted
    // displacement.  The old approach produced wildly noisy velocity when the
    // player was sliding along walls (oscillating between 0 and full speed each
    // frame), which caused remote-player extrapolation to jitter.
    this.playerVX = dx * speed;
    this.playerVY = dy * speed;
  }

  /**
   * Check if a position is blocked by testing all four corners
   * of the player's collision box (around the feet).
   */
  private isBlocked(px: number, py: number): boolean {
    const mr = this.game.mapRenderer;
    // Check four corners of the collision rect
    const left = px - COL_HALF_W;
    const right = px + COL_HALF_W;
    const top = py + COL_TOP;
    const bot = py + COL_BOT;

    const tl = mr.worldToTile(left, top);
    const tr = mr.worldToTile(right, top);
    const bl = mr.worldToTile(left, bot);
    const br = mr.worldToTile(right, bot);

    return (
      mr.isCollision(tl.tileX, tl.tileY) ||
      mr.isCollision(tr.tileX, tr.tileY) ||
      mr.isCollision(bl.tileX, bl.tileY) ||
      mr.isCollision(br.tileX, br.tileY)
    );
  }

  private updateNPCInteraction(input: InputManager) {
    // Find nearest NPC within interact radius
    let nearest: NPC | null = null;
    let nearestDist = NPC_INTERACT_RADIUS;

    for (const npc of this.npcs) {
      const dist = npc.distanceTo(this.playerX, this.playerY);
      if (dist < nearestDist) {
        nearest = npc;
        nearestDist = dist;
      }
    }

    // Update prompt visibility
    if (this.nearestNPC && this.nearestNPC !== nearest) {
      this.nearestNPC.setPromptVisible(false);
    }
    this.nearestNPC = nearest;
    if (nearest) {
      nearest.setPromptVisible(true);
    }

    // Interact on E press (guests can't talk to NPCs)
    if (nearest && !this.game.isGuest && (input.wasJustPressed("e") || input.wasJustPressed("E"))) {
      this.startDialogue(nearest);
    }
  }

  private startDialogue(npc: NPC) {
    this.inDialogue = true;

    // Play greeting / interact sound
    if (npc.interactSoundUrl) {
      this.game.audio.playOneShot(npc.interactSoundUrl, 0.7);
    }

    // NPC faces the player
    npc.faceToward(this.playerX, this.playerY);

    // Convert NPC dialogue to DialogueNode format
    const nodes: DialogueNode[] = npc.dialogue.map((line) => ({
      id: line.id,
      text: line.text,
      speaker: npc.name,
      responses: line.responses?.map((r) => ({
        text: r.text,
        nextNodeId: r.nextId,
      })),
      nextNodeId: line.nextId,
    }));

    splashManager.push({
      id: `dialogue-${npc.id}`,
      create: (props) =>
        createDialogueSplash({
          ...props,
          nodes,
          startNodeId: nodes[0]?.id,
          npcName: npc.name,
        }),
      transparent: true,
      pausesGame: false, // NPCs keep wandering
      onClose: () => {
        this.inDialogue = false;
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Remote players (multiplayer presence)
  // ---------------------------------------------------------------------------

  /** Apply a direction change to a remote player's sprite */
  private applyRemoteDirection(
    remote: { sprite: AnimatedSprite | null; spritesheet: Spritesheet | null; animation: string },
    dir: string,
  ) {
    if (!remote.sprite || !remote.spritesheet) return;
    const animKey = DIR_ANIM[dir as Direction] ?? "row0";
    const frames = remote.spritesheet.animations[animKey];
    if (frames && frames.length > 0) {
      remote.sprite.textures = frames;
      if (remote.animation === "walk") remote.sprite.play();
      else remote.sprite.gotoAndStop(0);
    }
  }

  updatePresence(presenceList: PresenceData[], localProfileId: string) {
    const activeIds = new Set<string>();
    const now = performance.now();

    for (const p of presenceList) {
      if (p.profileId === localProfileId) continue;
      activeIds.add(p.profileId);

      let remote = this.remotePlayers.get(p.profileId);
      if (!remote) {
        // New remote player — create container
        const remoteContainer = new Container();
        remoteContainer.x = p.x;
        remoteContainer.y = p.y;

        // Fallback square (will be replaced once sprite loads)
        const graphic = new Graphics();
        graphic.rect(-8, -16, 16, 16);
        graphic.fill(0xa29bfe);
        remoteContainer.addChild(graphic);

        const label = new Text({
          text: p.name || "Player",
          style: new TextStyle({
            fontSize: 10,
            fill: 0xe8e8f0,
            fontFamily: "Inter, sans-serif",
          }),
        });
        label.anchor.set(0.5, 1);
        label.y = -48 - 2;
        remoteContainer.addChild(label);

        this.container.addChild(remoteContainer);

        remote = {
          container: remoteContainer,
          sprite: null,
          spritesheet: null,
          spriteUrl: p.spriteUrl,
          label,
          snapshots: [],
          renderX: p.x,
          renderY: p.y,
          direction: p.direction,
          animation: p.animation,
          directionHoldFrames: 0,
        };
        this.remotePlayers.set(p.profileId, remote);

        // Load the sprite sheet asynchronously
        this.loadRemotePlayerSprite(p.profileId, p.spriteUrl);
      }

      // Push a new snapshot into the interpolation buffer
      remote.snapshots.push({
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        direction: p.direction,
        animation: p.animation,
        time: now,
      });
      // Trim old snapshots (keep only the last N)
      while (remote.snapshots.length > INTERP_MAX_SNAPSHOTS) {
        remote.snapshots.shift();
      }

      remote.label.text = p.name || "Player";
      // Direction and animation are now handled by the interpolation loop
      // in update(), not eagerly here — prevents per-update sprite flicker.
    }

    for (const [id, remote] of this.remotePlayers) {
      if (!activeIds.has(id)) {
        this.container.removeChild(remote.container);
        remote.sprite?.destroy();
        this.remotePlayers.delete(id);
      }
    }
  }

  private async loadRemotePlayerSprite(profileId: string, spriteUrl: string) {
    const remote = this.remotePlayers.get(profileId);
    if (!remote) return;

    try {
      const sheet = await loadSpriteSheet(spriteUrl);
      // Check if remote player is still around
      if (!this.remotePlayers.has(profileId)) return;

      const downFrames = sheet.animations?.["row0"];
      if (!downFrames || downFrames.length === 0) return;

      const sprite = new AnimatedSprite(downFrames);
      sprite.animationSpeed = ANIM_SPEED;
      sprite.anchor.set(0.5, 1);

      if (remote.animation === "walk") {
        sprite.play();
      } else {
        sprite.gotoAndStop(0);
      }

      // Remove fallback graphic (first child is the colored rect)
      if (remote.container.children.length > 0) {
        const fallback = remote.container.children[0];
        if (fallback instanceof Graphics) {
          remote.container.removeChild(fallback);
          fallback.destroy();
        }
      }

      remote.container.addChildAt(sprite, 0);
      remote.sprite = sprite;
      remote.spritesheet = sheet;

      // Apply current direction
      const animKey = DIR_ANIM[remote.direction as Direction] ?? "row0";
      const frames = sheet.animations[animKey];
      if (frames && frames.length > 0) {
        sprite.textures = frames;
        if (remote.animation === "walk") sprite.play();
        else sprite.gotoAndStop(0);
      }
    } catch (err) {
      console.warn(`Failed to load sprite for remote player ${profileId}:`, err);
    }
  }

  getPlayerPosition() {
    return {
      x: this.playerX,
      y: this.playerY,
      vx: this.playerVX,
      vy: this.playerVY,
      direction: this.playerDirection,
    };
  }

  isPlayerMoving(): boolean {
    return this.isMoving;
  }
}
