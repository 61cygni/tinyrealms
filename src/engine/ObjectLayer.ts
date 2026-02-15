/**
 * ObjectLayer — renders placed sprite objects on the map.
 * These are static or animated sprites placed via the editor's object tool.
 * Supports toggleable on/off state (e.g. fireplaces, lamps) with glow + prompt.
 */
import { Container, AnimatedSprite, Graphics, Text, TextStyle } from "pixi.js";
import { loadSpriteSheet } from "./SpriteLoader.ts";
import type { Spritesheet, Texture } from "pixi.js";
import type { PlacedObject } from "../editor/MapEditorPanel.ts";
import type { AudioManager } from "./AudioManager.ts";

const OBJ_INTERACT_RADIUS = 88; // pixels — range for doors & toggleables

/** Minimal sprite def info needed for rendering */
export interface SpriteDefInfo {
  name: string;
  spriteSheetUrl: string;
  defaultAnimation: string;
  animationSpeed: number;     // PixiJS animationSpeed (e.g. 0.05 slow, 0.3 fast)
  scale: number;
  frameWidth: number;
  frameHeight: number;
  // Sound (optional)
  ambientSoundUrl?: string;
  ambientSoundRadius?: number;
  ambientSoundVolume?: number;
  interactSoundUrl?: string;
  // Toggleable on/off
  toggleable?: boolean;
  onAnimation?: string;
  offAnimation?: string;
  onSoundUrl?: string;
  // Door (4-state)
  isDoor?: boolean;
  doorClosedAnimation?: string;
  doorOpeningAnimation?: string;
  doorOpenAnimation?: string;
  doorClosingAnimation?: string;
  doorOpenSoundUrl?: string;
  doorCloseSoundUrl?: string;
}

type DoorState = "closed" | "opening" | "open" | "closing";

interface RenderedObject {
  id: string;
  defName: string;
  animationSpeed: number;
  layer: number;              // editor layer index (0-1 bg, 2-3 obj, 4 overlay)
  sprite: AnimatedSprite;
  container: Container;       // wrapper for sprite + glow + prompt
  x: number;
  y: number;
  sfxHandle?: import("./AudioManager.ts").SfxHandle;
  ambientRadius?: number;
  ambientBaseVolume?: number;
  // Toggle state
  toggleable: boolean;
  isOn: boolean;
  onFrames?: Texture[];
  offFrames?: Texture[];
  glow?: Graphics;
  prompt?: Text;
  onSoundUrl?: string;
  onSfxHandle?: import("./AudioManager.ts").SfxHandle;
  interactSoundUrl?: string;
  // Door state
  isDoor: boolean;
  doorState: DoorState;
  doorClosedFrames?: Texture[];
  doorOpeningFrames?: Texture[];
  doorOpenFrames?: Texture[];
  doorClosingFrames?: Texture[];
  /** Tile positions this door blocks when closed */
  doorCollisionTiles?: { x: number; y: number }[];
  doorOpenSoundUrl?: string;
  doorCloseSoundUrl?: string;
}

export class ObjectLayer {
  /** Main container for obj-layer objects (y-sorted, same tier as entities) */
  container: Container;
  /** Container for background-layer objects (renders behind entities) */
  bgContainer: Container;
  /** Container for overlay-layer objects (renders above entities) */
  overlayContainer: Container;

  private rendered: RenderedObject[] = [];
  private sheetCache = new Map<string, Spritesheet>();
  private defCache = new Map<string, SpriteDefInfo>();
  private audio: AudioManager | null = null;

  // Ghost preview sprite
  private ghostSprite: AnimatedSprite | null = null;
  private ghostDefName: string | null = null;

  /** Currently highlighted interactable object (toggle or door nearest within radius) */
  private nearestToggleable: RenderedObject | null = null;
  private elapsed = 0;

  /** Tile size for computing door collision tiles (set by Game.ts) */
  tileWidth = 16;
  tileHeight = 16;

  /** Called when a door's collision state changes. Set by Game.ts. */
  onDoorCollisionChange:
    | ((tiles: { x: number; y: number }[], blocked: boolean) => void)
    | null = null;

  constructor() {
    this.bgContainer = new Container();
    this.bgContainer.label = "objects-bg";
    this.bgContainer.sortableChildren = true;
    this.bgContainer.zIndex = 4; // above base map tiles, below entities

    this.container = new Container();
    this.container.label = "objects";
    this.container.sortableChildren = true;
    this.container.zIndex = 50; // same tier as entities (y-sorted)

    this.overlayContainer = new Container();
    this.overlayContainer.label = "objects-overlay";
    this.overlayContainer.sortableChildren = true;
    this.overlayContainer.zIndex = 55; // above entities, below map overlay tiles
  }

  /** Set the audio manager for ambient sounds */
  setAudio(audio: AudioManager) {
    this.audio = audio;
  }

  /** Return the correct parent container for the given editor layer index.
   *  Layers 0-1 (bg) → bgContainer, 2-3 (obj) → container, 4 (overlay) → overlayContainer */
  private parentForLayer(layer: number): Container {
    if (layer <= 1) return this.bgContainer;
    if (layer >= 4) return this.overlayContainer;
    return this.container;
  }

  /** Cache a sprite definition (called when loading from Convex) */
  registerSpriteDef(def: SpriteDefInfo) {
    this.defCache.set(def.name, def);
  }

  /** Place an object and render it immediately */
  async addPlacedObject(obj: PlacedObject, defInfo?: SpriteDefInfo) {
    const def = defInfo ?? this.defCache.get(obj.spriteDefName);
    if (!def) {
      console.warn(`[ObjectLayer] No sprite def found for "${obj.spriteDefName}"`);
      return;
    }

    try {
      // Load sprite sheet (cached)
      let sheet = this.sheetCache.get(def.spriteSheetUrl);
      if (!sheet) {
        sheet = await loadSpriteSheet(def.spriteSheetUrl);
        this.sheetCache.set(def.spriteSheetUrl, sheet);
      }

      const isToggleable = !!def.toggleable;
      const isDoor = !!def.isDoor;
      // Default toggleables/doors to OFF/CLOSED unless explicitly set
      const isOn = obj.isOn ?? ((isToggleable || isDoor) ? false : true);

      if (isDoor) {
        console.log(`[ObjectLayer] Door "${obj.spriteDefName}" at (${obj.x}, ${obj.y}) isOn=${isOn}`);
      }

      // Resolve animation names (case-insensitive lookup)
      const animKeys = Object.keys(sheet.animations);
      const findAnim = (name?: string) => {
        if (!name) return undefined;
        // exact match first, then case-insensitive
        if (sheet!.animations[name]) return sheet!.animations[name];
        const lower = name.toLowerCase();
        const key = animKeys.find(k => k.toLowerCase() === lower);
        return key ? sheet!.animations[key] : undefined;
      };

      // ── Door: resolve 4 animations ──
      let doorClosedFrames: Texture[] | undefined;
      let doorOpeningFrames: Texture[] | undefined;
      let doorOpenFrames: Texture[] | undefined;
      let doorClosingFrames: Texture[] | undefined;
      let doorState: DoorState = "closed";

      if (isDoor) {
        doorClosedFrames = findAnim(def.doorClosedAnimation || def.defaultAnimation);
        doorOpeningFrames = findAnim(def.doorOpeningAnimation);
        doorOpenFrames = findAnim(def.doorOpenAnimation);
        doorClosingFrames = findAnim(def.doorClosingAnimation);
        doorState = isOn ? "open" : "closed";
      }

      // ── Toggle: resolve on/off animations ──
      // For toggleables: only resolve animations that are explicitly configured.
      // If offAnimation is not set, the sprite hides when OFF (and vice versa).
      const onAnimName = def.onAnimation || def.defaultAnimation;
      const onFrames = findAnim(onAnimName);
      const offFrames = isToggleable && !def.offAnimation
        ? undefined                           // no off animation → invisible when off
        : findAnim(def.offAnimation || def.defaultAnimation);

      // ── Pick initial frames ──
      let activeFrames: Texture[] | undefined;
      if (isDoor) {
        activeFrames = doorState === "open" ? doorOpenFrames : doorClosedFrames;
      } else {
        activeFrames = isOn ? onFrames : offFrames;
      }

      // For non-interactable objects we need at least some frames
      if (!isToggleable && !isDoor && (!activeFrames || activeFrames.length === 0)) {
        console.warn(`[ObjectLayer] No frames for animation in ${def.spriteSheetUrl}`);
        return;
      }

      // For toggleables, we need at least one state to have frames
      if (isToggleable && !onFrames && !offFrames) {
        console.warn(`[ObjectLayer] No on or off frames for toggleable "${obj.spriteDefName}" in ${def.spriteSheetUrl}`);
        return;
      }

      // For doors, we need at least the closed animation
      if (isDoor && !doorClosedFrames) {
        console.warn(`[ObjectLayer] No closed animation for door "${obj.spriteDefName}"`);
        return;
      }

      // Create wrapper container for sprite + glow + prompt
      const objContainer = new Container();
      objContainer.x = obj.x;
      objContainer.y = obj.y;
      objContainer.zIndex = Math.round(obj.y);
      const layer = obj.layer ?? 2; // default to obj0

      // Use whichever frames are available for initial creation
      const initFrames = activeFrames || onFrames || offFrames || doorClosedFrames;
      const sprite = new AnimatedSprite(initFrames!);
      sprite.anchor.set(0.5, 1.0);
      sprite.scale.set(def.scale);
      sprite.animationSpeed = def.animationSpeed;
      if (!activeFrames) {
        // No frames for the current state → hide sprite
        sprite.visible = false;
        sprite.gotoAndStop(0);
      } else if (isDoor) {
        // Doors: always static — hold first frame of current state
        sprite.gotoAndStop(0);
      } else if (isOn || !isToggleable) {
        sprite.play();
      } else {
        sprite.gotoAndStop(0); // show first frame of off animation
      }
      objContainer.addChild(sprite);

      const entry: RenderedObject = {
        id: obj.id,
        defName: obj.spriteDefName,
        animationSpeed: def.animationSpeed,
        layer,
        container: objContainer,
        sprite,
        x: obj.x,
        y: obj.y,
        toggleable: isToggleable,
        isOn,
        onFrames: onFrames ?? undefined,
        offFrames: offFrames ?? undefined,
        onSoundUrl: def.onSoundUrl,
        interactSoundUrl: def.interactSoundUrl,
        // Door
        isDoor,
        doorState,
        doorClosedFrames,
        doorOpeningFrames,
        doorOpenFrames,
        doorClosingFrames,
        doorOpenSoundUrl: def.doorOpenSoundUrl,
        doorCloseSoundUrl: def.doorCloseSoundUrl,
      };

      // Compute door collision tiles
      if (isDoor) {
        entry.doorCollisionTiles = this.computeDoorCollisionTiles(
          obj.x, obj.y, def.frameWidth, def.frameHeight, def.scale,
        );
        // Apply initial collision: closed = blocked
        if (doorState === "closed" && entry.doorCollisionTiles.length > 0) {
          this.onDoorCollisionChange?.(entry.doorCollisionTiles, true);
        }
        // If the door loaded as open, ensure collision is cleared
        if (doorState === "open" && entry.doorCollisionTiles.length > 0) {
          this.onDoorCollisionChange?.(entry.doorCollisionTiles, false);
        }
      }

      // Add glow + prompt for interactable objects (toggleable or door)
      if (isToggleable || isDoor) {
        const glow = new Graphics();
        glow.circle(0, -(def.frameHeight * def.scale) / 2, 18);
        glow.fill({ color: 0xffcc44, alpha: 0.3 });
        glow.visible = false;
        objContainer.addChildAt(glow, 0); // behind sprite
        entry.glow = glow;

        let promptText: string;
        if (isDoor) {
          promptText = doorState === "open" ? "[E] Close" : "[E] Open";
        } else {
          promptText = `[E] Turn ${isOn ? "Off" : "On"}`;
        }
        const prompt = new Text({
          text: promptText,
          style: new TextStyle({
            fontSize: 9,
            fill: 0xffffff,
            fontFamily: "Inter, sans-serif",
            stroke: { color: 0x000000, width: 2 },
          }),
        });
        prompt.anchor.set(0.5, 1);
        prompt.y = -(def.frameHeight * def.scale) - 8;
        prompt.visible = false;
        objContainer.addChild(prompt);
        entry.prompt = prompt;
      }

      this.parentForLayer(layer).addChild(objContainer);

      // Start ambient sound if defined (and object is "on" or non-toggleable)
      if (def.ambientSoundUrl && this.audio) {
        entry.ambientRadius = def.ambientSoundRadius ?? 200;
        entry.ambientBaseVolume = def.ambientSoundVolume ?? 0.5;
        if (!isToggleable || isOn) {
          this.audio.playAmbient(def.ambientSoundUrl, 0).then((handle) => {
            if (handle) entry.sfxHandle = handle;
          });
        }
      }

      // Start "on" sound if toggleable and currently on
      if (isToggleable && isOn && def.onSoundUrl && this.audio) {
        entry.ambientRadius = entry.ambientRadius ?? (def.ambientSoundRadius ?? 200);
        entry.ambientBaseVolume = entry.ambientBaseVolume ?? (def.ambientSoundVolume ?? 0.5);
        this.audio.playAmbient(def.onSoundUrl, 0).then((handle) => {
          if (handle) entry.onSfxHandle = handle;
        });
      }

      this.rendered.push(entry);
    } catch (err) {
      console.warn(`Failed to render object "${obj.spriteDefName}":`, err);
    }
  }

  /** Remove a placed object */
  removePlacedObject(id: string) {
    const idx = this.rendered.findIndex((r) => r.id === id);
    if (idx >= 0) {
      const r = this.rendered.splice(idx, 1)[0];
      r.sfxHandle?.stop();
      r.onSfxHandle?.stop();
      this.parentForLayer(r.layer).removeChild(r.container);
      r.container.destroy({ children: true });
      if (this.nearestToggleable === r) this.nearestToggleable = null;
    }
  }

  /** Load a batch of objects + their sprite defs */
  async loadAll(objects: PlacedObject[], defs: SpriteDefInfo[]) {
    // Register all defs
    for (const d of defs) {
      this.registerSpriteDef(d);
    }

    // Render all objects
    for (const obj of objects) {
      await this.addPlacedObject(obj);
    }
  }

  // =========================================================================
  // Spatial audio: update ambient volumes based on listener position
  // =========================================================================

  /** Call each frame with the player's world position to update ambient volumes */
  updateAmbientVolumes(listenerX: number, listenerY: number) {
    for (const r of this.rendered) {
      if (!r.ambientRadius) continue;

      const dx = r.x - listenerX;
      const dy = r.y - listenerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const vol = dist >= r.ambientRadius
        ? 0
        : (1 - dist / r.ambientRadius) * (r.ambientBaseVolume ?? 0.5);

      if (r.sfxHandle) r.sfxHandle.setVolume(vol);
      if (r.onSfxHandle) r.onSfxHandle.setVolume(vol);
    }
  }

  // =========================================================================
  // Live-refresh sounds after a sprite definition is updated
  // =========================================================================

  refreshSoundsForDef(
    defName: string,
    sounds: {
      ambientSoundUrl?: string;
      ambientSoundRadius?: number;
      ambientSoundVolume?: number;
      onSoundUrl?: string;
      interactSoundUrl?: string;
    },
  ) {
    for (const r of this.rendered) {
      if (r.defName !== defName) continue;

      // Stop old ambient sound
      if (r.sfxHandle) {
        r.sfxHandle.stop();
        r.sfxHandle = undefined;
      }

      // Stop old on-sound
      if (r.onSfxHandle) {
        r.onSfxHandle.stop();
        r.onSfxHandle = undefined;
      }

      // Update cached URLs
      r.onSoundUrl = sounds.onSoundUrl;
      r.interactSoundUrl = sounds.interactSoundUrl;
      r.ambientRadius = undefined;
      r.ambientBaseVolume = undefined;

      // Restart ambient sound if defined and object is on (or non-toggleable)
      if (sounds.ambientSoundUrl && this.audio && (!r.toggleable || r.isOn)) {
        r.ambientRadius = sounds.ambientSoundRadius ?? 200;
        r.ambientBaseVolume = sounds.ambientSoundVolume ?? 0.5;
        this.audio.playAmbient(sounds.ambientSoundUrl, 0).then((handle) => {
          if (handle) r.sfxHandle = handle;
        });
      }

      // Restart on-sound if defined and object is currently on
      if (sounds.onSoundUrl && this.audio && r.toggleable && r.isOn) {
        if (!r.ambientRadius) {
          r.ambientRadius = sounds.ambientSoundRadius ?? 200;
          r.ambientBaseVolume = sounds.ambientSoundVolume ?? 0.5;
        }
        this.audio.playAmbient(sounds.onSoundUrl, 0).then((handle) => {
          if (handle) r.onSfxHandle = handle;
        });
      }
    }
  }

  // =========================================================================
  // Toggleable object interaction (proximity + glow + prompt)
  // =========================================================================

  /** Call each frame in play mode to update interactable object interaction */
  updateToggleInteraction(dt: number, playerX: number, playerY: number) {
    this.elapsed += dt;

    // Find nearest interactable (toggleable or door) within interact radius
    let nearest: RenderedObject | null = null;
    let nearestDist = OBJ_INTERACT_RADIUS;

    for (const r of this.rendered) {
      if (!r.toggleable && !r.isDoor) continue;
      // Skip doors that are mid-transition (opening/closing)
      if (r.isDoor && (r.doorState === "opening" || r.doorState === "closing")) continue;
      // Don't allow closing an open door while the player stands in its collision area
      if (r.isDoor && r.isOn && r.doorCollisionTiles && r.doorCollisionTiles.length > 0) {
        const ptx = Math.floor(playerX / this.tileWidth);
        const pty = Math.floor(playerY / this.tileHeight);
        if (r.doorCollisionTiles.some((t) => t.x === ptx && t.y === pty)) continue;
      }
      const dx = r.x - playerX;
      // Use the sprite's vertical center for distance, not the anchor (bottom).
      // This makes approaching from above feel natural.
      const def = this.defCache.get(r.defName);
      const spriteHalfH = def ? (def.frameHeight * def.scale) / 2 : 0;
      const dy = (r.y - spriteHalfH) - playerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) {
        nearest = r;
        nearestDist = dist;
      }
    }

    // Update glow + prompt visibility
    if (this.nearestToggleable && this.nearestToggleable !== nearest) {
      if (this.nearestToggleable.glow) this.nearestToggleable.glow.visible = false;
      if (this.nearestToggleable.prompt) this.nearestToggleable.prompt.visible = false;
    }

    this.nearestToggleable = nearest;
    if (nearest) {
      if (nearest.glow) {
        nearest.glow.visible = true;
        // Pulse glow
        nearest.glow.alpha = 0.2 + 0.15 * Math.sin(this.elapsed * 3);
      }
      if (nearest.prompt) {
        nearest.prompt.visible = true;
      }
    }
  }

  /** Get the ID of the nearest interactable object (for toggle/door action) */
  getNearestToggleableId(): string | null {
    return this.nearestToggleable?.id ?? null;
  }

  /** Get whether the nearest interactable is currently on / open */
  getNearestToggleableState(): boolean {
    return this.nearestToggleable?.isOn ?? false;
  }

  /** Check if the nearest interactable is a door */
  isNearestDoor(): boolean {
    return this.nearestToggleable?.isDoor ?? false;
  }

  /** Apply a toggle state change to a rendered object (called after Convex mutation) */
  applyToggle(id: string, isOn: boolean) {
    const r = this.rendered.find((r) => r.id === id);
    if (!r) return;

    // Route to door handler if applicable
    if (r.isDoor) {
      this.applyDoorTransition(r, isOn);
      return;
    }

    if (!r.toggleable) return;

    r.isOn = isOn;

    // Switch animation — hide sprite if no frames for this state
    const frames = isOn ? r.onFrames : r.offFrames;
    if (frames && frames.length > 0) {
      r.sprite.textures = frames;
      r.sprite.animationSpeed = r.animationSpeed;
      r.sprite.visible = true;
      if (isOn) {
        r.sprite.gotoAndPlay(0);
      } else {
        r.sprite.gotoAndStop(0);
      }
    } else {
      // No frames for this state — hide the sprite
      r.sprite.visible = false;
      r.sprite.stop();
    }

    // Update prompt text
    if (r.prompt) {
      (r.prompt as Text).text = `[E] Turn ${isOn ? "Off" : "On"}`;
    }

    // Play one-shot interact sound when turning ON
    if (isOn && r.interactSoundUrl && this.audio) {
      this.audio.playOneShot(r.interactSoundUrl, 0.7);
    }

    // Handle ambient / looping sounds
    if (isOn) {
      const def = this.defCache.get(r.defName);

      // Ensure ambientRadius is set so updateAmbientVolumes can control volume
      if (!r.ambientRadius) {
        r.ambientRadius = def?.ambientSoundRadius ?? 200;
        r.ambientBaseVolume = def?.ambientSoundVolume ?? 0.5;
      }

      // Start on-sound if defined
      if (r.onSoundUrl && this.audio && !r.onSfxHandle) {
        this.audio.playAmbient(r.onSoundUrl, 0).then((handle) => {
          if (handle) r.onSfxHandle = handle;
        });
      }
      // Start ambient sound
      if (def?.ambientSoundUrl && this.audio && !r.sfxHandle) {
        this.audio.playAmbient(def.ambientSoundUrl, 0).then((handle) => {
          if (handle) r.sfxHandle = handle;
        });
      }
    } else {
      // Stop on-sound
      if (r.onSfxHandle) {
        r.onSfxHandle.stop();
        r.onSfxHandle = undefined;
      }
      // Stop ambient sound
      if (r.sfxHandle) {
        r.sfxHandle.stop();
        r.sfxHandle = undefined;
      }
    }
  }

  // =========================================================================
  // Door state machine
  // =========================================================================

  /** Compute which tile positions a door blocks, based on its sprite bounds.
   *  The bounds are shrunk by DOOR_COLLISION_INSET (fraction) on each side so
   *  the blocked area is slightly smaller than the visual sprite. */
  private static readonly DOOR_COLLISION_INSET = 0.2; // 20% inset on each edge

  private computeDoorCollisionTiles(
    worldX: number, worldY: number,
    frameWidth: number, frameHeight: number, scale: number,
  ): { x: number; y: number }[] {
    const tw = this.tileWidth;
    const th = this.tileHeight;
    if (tw <= 0 || th <= 0) return [];

    const inset = ObjectLayer.DOOR_COLLISION_INSET;
    const spriteW = frameWidth * scale;
    const spriteH = frameHeight * scale;

    // Sprite anchor is (0.5, 1.0) — bottom-center, then shrink inward
    const left = worldX - spriteW / 2 + spriteW * inset;
    const right = worldX + spriteW / 2 - spriteW * inset;
    const top = worldY - spriteH + spriteH * inset;
    const bottom = worldY - spriteH * inset;

    const tiles: { x: number; y: number }[] = [];
    const tx1 = Math.floor(left / tw);
    const tx2 = Math.floor((right - 1) / tw);
    const ty1 = Math.floor(top / th);
    const ty2 = Math.floor((bottom - 1) / th);
    for (let ty = ty1; ty <= ty2; ty++) {
      for (let tx = tx1; tx <= tx2; tx++) {
        tiles.push({ x: tx, y: ty });
      }
    }
    return tiles;
  }

  /** Transition a door to open or closed with animation sequence */
  private applyDoorTransition(r: RenderedObject, targetOpen: boolean) {
    // Prevent re-triggering while already transitioning
    if (r.doorState === "opening" || r.doorState === "closing") return;

    if (targetOpen) {
      // closed → opening → open
      r.doorState = "opening";
      const frames = r.doorOpeningFrames;

      // Play door-open sound
      if (r.doorOpenSoundUrl && this.audio) {
        this.audio.playOneShot(r.doorOpenSoundUrl, 0.7);
      }

      // Remove collision immediately when opening starts
      if (r.doorCollisionTiles && r.doorCollisionTiles.length > 0) {
        this.onDoorCollisionChange?.(r.doorCollisionTiles, false);
      }

      if (frames && frames.length > 0) {
        r.sprite.textures = frames;
        r.sprite.animationSpeed = r.animationSpeed;
        r.sprite.loop = false;
        r.sprite.visible = true;
        r.sprite.onComplete = () => {
          r.sprite.onComplete = undefined;
          this.setDoorOpen(r);
        };
        r.sprite.gotoAndPlay(0);
      } else {
        // No opening animation — jump straight to open
        this.setDoorOpen(r);
      }
    } else {
      // open → closing → closed
      r.doorState = "closing";
      const frames = r.doorClosingFrames;

      // Play door-close sound
      if (r.doorCloseSoundUrl && this.audio) {
        this.audio.playOneShot(r.doorCloseSoundUrl, 0.7);
      }

      if (frames && frames.length > 0) {
        r.sprite.textures = frames;
        r.sprite.animationSpeed = r.animationSpeed;
        r.sprite.loop = false;
        r.sprite.visible = true;
        r.sprite.onComplete = () => {
          r.sprite.onComplete = undefined;
          this.setDoorClosed(r);
        };
        r.sprite.gotoAndPlay(0);
      } else {
        // No closing animation — jump straight to closed
        this.setDoorClosed(r);
      }
    }

    // Update prompt text
    if (r.prompt) {
      (r.prompt as Text).text = targetOpen ? "[E] Close" : "[E] Open";
    }
  }

  /** Set a door to the fully-open resting state */
  private setDoorOpen(r: RenderedObject) {
    r.doorState = "open";
    r.isOn = true;
    const frames = r.doorOpenFrames;
    if (frames && frames.length > 0) {
      r.sprite.textures = frames;
      r.sprite.loop = false;
      r.sprite.visible = true;
      r.sprite.gotoAndStop(0); // static — hold first frame of "open"
    } else {
      // No open animation — hold last frame of opening
      r.sprite.gotoAndStop(r.sprite.totalFrames - 1);
    }
    r.sprite.animationSpeed = r.animationSpeed;
  }

  /** Set a door to the fully-closed resting state */
  private setDoorClosed(r: RenderedObject) {
    r.doorState = "closed";
    r.isOn = false;
    const frames = r.doorClosedFrames;
    if (frames && frames.length > 0) {
      r.sprite.textures = frames;
      r.sprite.loop = false;
      r.sprite.visible = true;
      r.sprite.gotoAndStop(0);
    } else {
      // No closed animation — hold last frame of closing
      r.sprite.gotoAndStop(r.sprite.totalFrames - 1);
    }
    r.sprite.animationSpeed = r.animationSpeed;

    // Add collision back when door finishes closing
    if (r.doorCollisionTiles && r.doorCollisionTiles.length > 0) {
      this.onDoorCollisionChange?.(r.doorCollisionTiles, true);
    }
  }

  // =========================================================================
  // Ghost preview
  // =========================================================================

  /** Show a semi-transparent ghost of a sprite def at the cursor position */
  async showGhost(def: SpriteDefInfo) {
    // Don't reload if it's already the same def
    if (this.ghostDefName === def.name && this.ghostSprite) return;

    this.hideGhost();
    this.ghostDefName = def.name;

    try {
      let sheet = this.sheetCache.get(def.spriteSheetUrl);
      if (!sheet) {
        sheet = await loadSpriteSheet(def.spriteSheetUrl);
        this.sheetCache.set(def.spriteSheetUrl, sheet);
      }

      const animFrames = sheet.animations[def.defaultAnimation];
      if (!animFrames || animFrames.length === 0) return;

      const sprite = new AnimatedSprite(animFrames);
      sprite.anchor.set(0.5, 1.0);
      sprite.scale.set(def.scale);
      sprite.alpha = 0.45;
      sprite.animationSpeed = def.animationSpeed;
      sprite.play();
      sprite.zIndex = 99999; // always on top
      sprite.visible = false; // hidden until first updateGhost

      this.ghostSprite = sprite;
      this.container.addChild(sprite);
    } catch (err) {
      console.warn("Failed to create ghost sprite:", err);
    }
  }

  /** Update the ghost position (world coordinates) */
  updateGhost(worldX: number, worldY: number) {
    if (!this.ghostSprite) return;
    this.ghostSprite.x = Math.round(worldX);
    this.ghostSprite.y = Math.round(worldY);
    this.ghostSprite.visible = true;
  }

  /** Remove the ghost */
  hideGhost() {
    if (this.ghostSprite) {
      this.container.removeChild(this.ghostSprite);
      this.ghostSprite.destroy();
      this.ghostSprite = null;
      this.ghostDefName = null;
    }
  }

  /** Clear everything */
  clear() {
    this.hideGhost();
    for (const r of this.rendered) {
      r.sfxHandle?.stop();
      r.onSfxHandle?.stop();
      this.parentForLayer(r.layer).removeChild(r.container);
      r.container.destroy({ children: true });
    }
    this.rendered = [];
    this.nearestToggleable = null;
  }

  destroy() {
    this.clear();
    this.bgContainer.destroy();
    this.container.destroy();
    this.overlayContainer.destroy();
  }
}
