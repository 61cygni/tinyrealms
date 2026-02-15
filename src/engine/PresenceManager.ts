import { getConvexClient } from "../lib/convexClient.ts";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { PresenceData, ProfileData } from "./types.ts";
import {
  PRESENCE_INTERVAL_MS,
  PRESENCE_MOVE_THRESHOLD_PX,
  PRESENCE_STATIONARY_HEARTBEAT_MS,
  SAVE_POSITION_INTERVAL_MS,
} from "../config/multiplayer-config.ts";

export interface PresenceManagerHooks {
  getCurrentMapName: () => string;
  getPlayerPosition: () => { x: number; y: number; vx: number; vy: number; direction: string };
  isPlayerMoving: () => boolean;
  onPresenceList: (presence: PresenceData[], localProfileId: string) => void;
}

export class PresenceManager {
  private readonly profile: ProfileData;
  private readonly isGuest: () => boolean;
  private readonly hooks: PresenceManagerHooks;

  private presenceTimer: ReturnType<typeof setInterval> | null = null;
  private saveTimer: ReturnType<typeof setInterval> | null = null;
  private presenceUnsub: (() => void) | null = null;
  private lastPresenceX = 0;
  private lastPresenceY = 0;
  private lastPresenceSentAt = 0;
  private unloadHandler: (() => void) | null = null;

  constructor(profile: ProfileData, isGuest: () => boolean, hooks: PresenceManagerHooks) {
    this.profile = profile;
    this.isGuest = isGuest;
    this.hooks = hooks;
  }

  start() {
    const convex = getConvexClient();
    const profileId = this.profile._id as Id<"profiles">;
    const mapName = this.hooks.getCurrentMapName();
    console.log(
      `[Presence] Starting for profile "${this.profile.name}" (${profileId}) on map "${mapName}"${this.isGuest() ? " [GUEST — read-only]" : ""}`,
    );

    if (!this.isGuest()) {
      // Force a first publish when presence starts/restarts so map joins are visible
      // even if the player is stationary.
      this.publishPresence(convex, profileId, true);
      this.presenceTimer = setInterval(() => {
        this.publishPresence(convex, profileId, false);
      }, PRESENCE_INTERVAL_MS);
    }

    this.presenceUnsub = convex.onUpdate(
      api.presence.listByMap,
      { mapName: this.hooks.getCurrentMapName() },
      (presenceList) => {
        const mapped: PresenceData[] = presenceList.map((p) => ({
          profileId: p.profileId,
          name: p.name,
          spriteUrl: p.spriteUrl,
          x: p.x,
          y: p.y,
          vx: p.vx ?? 0,
          vy: p.vy ?? 0,
          direction: p.direction,
          animation: p.animation,
          lastSeen: p.lastSeen,
        }));
        this.hooks.onPresenceList(mapped, profileId);
      },
      (err) => {
        console.warn("Presence subscription error:", err);
      },
    );

    if (!this.isGuest()) {
      this.saveTimer = setInterval(() => {
        const pos = this.hooks.getPlayerPosition();
        convex
          .mutation(api.profiles.savePosition, {
            id: profileId,
            mapName: this.hooks.getCurrentMapName(),
            x: pos.x,
            y: pos.y,
            direction: pos.direction,
          })
          .catch((err) => console.warn("Position save failed:", err));
      }, SAVE_POSITION_INTERVAL_MS);

      this.unloadHandler = () => {
        const c = getConvexClient();
        c.mutation(api.presence.remove, { profileId }).catch(() => {});
      };
      window.addEventListener("beforeunload", this.unloadHandler);
      window.addEventListener("pagehide", this.unloadHandler);
    }
  }

  private publishPresence(
    convex: ReturnType<typeof getConvexClient>,
    profileId: Id<"profiles">,
    force: boolean,
  ) {
    const pos = this.hooks.getPlayerPosition();
    const dx = pos.x - this.lastPresenceX;
    const dy = pos.y - this.lastPresenceY;
    const moved =
      dx * dx + dy * dy >=
      PRESENCE_MOVE_THRESHOLD_PX * PRESENCE_MOVE_THRESHOLD_PX;
    const now = Date.now();
    const heartbeatDue =
      now - this.lastPresenceSentAt >= PRESENCE_STATIONARY_HEARTBEAT_MS;
    if (!force && !moved && !heartbeatDue) return;

    this.lastPresenceX = pos.x;
    this.lastPresenceY = pos.y;
    this.lastPresenceSentAt = now;
    convex
      .mutation(api.presence.update, {
        profileId,
        mapName: this.hooks.getCurrentMapName(),
        x: pos.x,
        y: pos.y,
        vx: pos.vx,
        vy: pos.vy,
        direction: pos.direction,
        animation: this.hooks.isPlayerMoving() ? "walk" : "idle",
        spriteUrl: this.profile.spriteUrl,
        name: this.profile.name,
      })
      .catch((err) => console.warn("Presence update failed:", err));
  }

  stop() {
    if (this.presenceTimer) {
      clearInterval(this.presenceTimer);
      this.presenceTimer = null;
    }
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.presenceUnsub) {
      this.presenceUnsub();
      this.presenceUnsub = null;
    }
    if (this.unloadHandler) {
      window.removeEventListener("beforeunload", this.unloadHandler);
      window.removeEventListener("pagehide", this.unloadHandler);
      this.unloadHandler = null;
    }

    if (!this.isGuest()) {
      const convex = getConvexClient();
      const profileId = this.profile._id as Id<"profiles">;
      convex.mutation(api.presence.remove, { profileId }).catch(() => {});
    }
  }
}
