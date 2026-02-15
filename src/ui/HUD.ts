/**
 * HUD overlay – shows the current mode label.
 */
import type { AppMode } from "../engine/types.ts";
import { getConvexClient } from "../lib/convexClient.ts";
import { api } from "../../convex/_generated/api";
import "./HUD.css";

type ActiveQuestRow = {
  _id: string;
  status: "active" | "completed" | "failed" | "abandoned";
  acceptedAt: number;
  deadlineAt?: number;
  rewardClaimedAt?: number;
  progress: Array<{
    type: "collect_item" | "kill_npc";
    targetKey: string;
    currentCount: number;
    requiredCount: number;
  }>;
  questDef: null | {
    key: string;
    title: string;
    description: string;
  };
};

type HUDOptions = {
  profileId?: string;
  isGuest?: boolean;
  getMapName?: () => string | undefined;
};

export class HUD {
  readonly el: HTMLElement;
  private label: HTMLElement;
  private profileId: string | null = null;
  private getMapName: (() => string | undefined) | null = null;
  private questsListEl: HTMLElement | null = null;
  private questStatusEl: HTMLElement | null = null;
  private requestBtn: HTMLButtonElement | null = null;
  private questCollapseBtn: HTMLButtonElement | null = null;
  private questBodyEl: HTMLElement | null = null;
  private questsUnsub: (() => void) | null = null;
  private activeQuests: ActiveQuestRow[] = [];
  private questsCollapsed = false;

  constructor(mode: AppMode, options?: HUDOptions) {
    this.el = document.createElement("div");
    this.el.className = "hud";

    this.label = document.createElement("div");
    this.label.className = "hud-mode-label";
    this.label.textContent = `${mode.toUpperCase()} MODE`;
    this.el.appendChild(this.label);

    const canShowQuests = !!options?.profileId && !options?.isGuest;
    if (canShowQuests) {
      this.profileId = options!.profileId!;
      this.getMapName = options?.getMapName ?? null;

      const questWrap = document.createElement("div");
      questWrap.className = "hud-quests";

      const questHeader = document.createElement("div");
      questHeader.className = "hud-quests-header";

      const questTitle = document.createElement("div");
      questTitle.className = "hud-quests-title";
      questTitle.textContent = "Quests";
      questHeader.appendChild(questTitle);

      this.requestBtn = document.createElement("button");
      this.requestBtn.className = "hud-quest-btn";
      this.requestBtn.textContent = "Request Quest";
      this.requestBtn.addEventListener("click", () => this.requestQuest());
      questHeader.appendChild(this.requestBtn);

      this.questCollapseBtn = document.createElement("button");
      this.questCollapseBtn.className = "hud-quest-collapse-btn";
      this.questCollapseBtn.type = "button";
      this.questCollapseBtn.title = "Collapse quests";
      this.questCollapseBtn.addEventListener("click", () => {
        this.setQuestsCollapsed(!this.questsCollapsed);
      });
      questHeader.appendChild(this.questCollapseBtn);

      questWrap.appendChild(questHeader);

      this.questBodyEl = document.createElement("div");
      this.questBodyEl.className = "hud-quests-body";

      this.questStatusEl = document.createElement("div");
      this.questStatusEl.className = "hud-quest-status";
      this.questBodyEl.appendChild(this.questStatusEl);

      this.questsListEl = document.createElement("div");
      this.questsListEl.className = "hud-quests-list";
      this.questBodyEl.appendChild(this.questsListEl);
      questWrap.appendChild(this.questBodyEl);

      this.el.appendChild(questWrap);
      this.setQuestsCollapsed(false);
      this.subscribeQuests();
    }
  }

  setMode(mode: AppMode) {
    this.label.textContent = `${mode.toUpperCase()} MODE`;
  }

  private subscribeQuests() {
    if (!this.profileId) return;
    this.questsUnsub?.();
    const convex = getConvexClient();
    this.questsUnsub = convex.onUpdate(
      (api as any).quests.listActive,
      { profileId: this.profileId },
      (rows: any[]) => {
        this.activeQuests = (rows ?? []) as ActiveQuestRow[];
        this.renderQuests();
      },
    );
  }

  private formatDeadline(deadlineAt?: number): string {
    if (!deadlineAt) return "";
    const ms = deadlineAt - Date.now();
    if (ms <= 0) return "expired";
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")} left`;
  }

  private setQuestsCollapsed(collapsed: boolean) {
    this.questsCollapsed = collapsed;
    if (this.questBodyEl) {
      this.questBodyEl.style.display = collapsed ? "none" : "";
    }
    if (this.requestBtn) {
      this.requestBtn.style.display = collapsed ? "none" : "";
    }
    if (this.questCollapseBtn) {
      this.questCollapseBtn.textContent = collapsed ? "▸" : "▾";
      this.questCollapseBtn.title = collapsed ? "Expand quests" : "Collapse quests";
      this.questCollapseBtn.setAttribute("aria-label", this.questCollapseBtn.title);
    }
  }

  private renderQuests() {
    if (!this.questsListEl) return;
    this.questsListEl.innerHTML = "";
    if (this.activeQuests.length === 0) {
      const empty = document.createElement("div");
      empty.className = "hud-quest-empty";
      empty.textContent = "No active quests";
      this.questsListEl.appendChild(empty);
      return;
    }

    for (const q of this.activeQuests) {
      const card = document.createElement("div");
      card.className = "hud-quest-card";

      const name = document.createElement("div");
      name.className = "hud-quest-name";
      name.textContent = q.questDef?.title ?? q.questDef?.key ?? "Quest";
      card.appendChild(name);

      if (q.questDef?.description) {
        const desc = document.createElement("div");
        desc.className = "hud-quest-desc";
        desc.textContent = q.questDef.description;
        card.appendChild(desc);
      }

      for (const p of q.progress ?? []) {
        const row = document.createElement("div");
        row.className = "hud-quest-progress";
        const label =
          p.type === "collect_item"
            ? `Collect ${p.targetKey}`
            : `Defeat ${p.targetKey}`;
        row.textContent = `${label}: ${p.currentCount}/${p.requiredCount}`;
        card.appendChild(row);
      }

      const deadlineText = this.formatDeadline(q.deadlineAt);
      if (deadlineText) {
        const deadline = document.createElement("div");
        deadline.className = "hud-quest-deadline";
        deadline.textContent = deadlineText;
        card.appendChild(deadline);
      }

      card.addEventListener("dblclick", () => this.claimReward(q._id));
      this.questsListEl.appendChild(card);
    }
  }

  private showQuestStatus(text: string, isError = false) {
    if (!this.questStatusEl) return;
    this.questStatusEl.textContent = text;
    this.questStatusEl.style.color = isError ? "#ff8080" : "#9fd6ff";
    window.setTimeout(() => {
      if (this.questStatusEl?.textContent === text) this.questStatusEl.textContent = "";
    }, 2500);
  }

  private async requestQuest() {
    if (!this.profileId) return;
    if (!this.requestBtn) return;
    this.requestBtn.disabled = true;
    try {
      const convex = getConvexClient();
      const mapName = this.getMapName?.();
      const available = await convex.query((api as any).quests.listAvailable, {
        profileId: this.profileId,
        sourceType: "hud",
        mapName,
      });
      if (!available || available.length === 0) {
        this.showQuestStatus("No quests available right now.");
        return;
      }
      const pick = available[0];
      await convex.mutation((api as any).quests.accept, {
        profileId: this.profileId,
        questDefKey: pick.key,
        source: { type: "hud" },
        mapName,
      });
      this.showQuestStatus(`Accepted: ${pick.title}`);
    } catch (err: any) {
      this.showQuestStatus(err?.message ?? "Failed to request quest", true);
    } finally {
      this.requestBtn.disabled = false;
    }
  }

  private async claimReward(playerQuestId: string) {
    if (!this.profileId) return;
    const quest = this.activeQuests.find((q) => q._id === playerQuestId);
    if (!quest) return;
    if (quest.status !== "completed" || quest.rewardClaimedAt) return;
    try {
      const convex = getConvexClient();
      await convex.mutation((api as any).quests.claimReward, {
        profileId: this.profileId,
        playerQuestId,
      });
      this.showQuestStatus("Reward claimed");
    } catch (err: any) {
      this.showQuestStatus(err?.message ?? "Failed to claim reward", true);
    }
  }

  show() { this.el.style.display = ""; }
  hide() { this.el.style.display = "none"; }
  destroy() {
    this.questsUnsub?.();
    this.el.remove();
  }
}
