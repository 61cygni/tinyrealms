import { v } from "convex/values";
import { mutation } from "../_generated/server";

// Loot table resolution is server-authoritative
// Loot tables are defined as part of combatEncounters.rewards

export interface LootTableEntry {
  itemDefName: string;
  weight: number; // relative probability
  minQuantity: number;
  maxQuantity: number;
}

export const resolveLoot = mutation({
  args: {
    encounterId: v.id("combatEncounters"),
    profileId: v.id("profiles"),
  },
  handler: async (ctx, { encounterId, profileId }) => {
    const encounter = await ctx.db.get(encounterId);
    if (!encounter) throw new Error("Encounter not found");

    const rewards = encounter.rewards as any;
    if (!rewards?.lootTable) return [];

    const lootTable = rewards.lootTable as LootTableEntry[];
    const totalWeight = lootTable.reduce(
      (sum: number, entry: LootTableEntry) => sum + entry.weight,
      0
    );

    const drops: { itemDefName: string; quantity: number }[] = [];

    for (const entry of lootTable) {
      const roll = Math.random() * totalWeight;
      if (roll < entry.weight) {
        const quantity =
          entry.minQuantity +
          Math.floor(Math.random() * (entry.maxQuantity - entry.minQuantity + 1));
        drops.push({ itemDefName: entry.itemDefName, quantity });
      }
    }

    // Add drops to player inventory
    for (const drop of drops) {
      let inv = await ctx.db
        .query("inventories")
        .withIndex("by_profile", (q) => q.eq("profileId", profileId))
        .first();

      if (!inv) {
        await ctx.db.insert("inventories", {
          profileId,
          slots: [{ itemDefName: drop.itemDefName, quantity: drop.quantity, metadata: {} }],
        });
      } else {
        const slots = [...(inv.slots as any[])];
        const existing = slots.findIndex(
          (s: any) => s.itemDefName === drop.itemDefName
        );
        if (existing >= 0) {
          slots[existing].quantity += drop.quantity;
        } else {
          slots.push({
            itemDefName: drop.itemDefName,
            quantity: drop.quantity,
            metadata: {},
          });
        }
        await ctx.db.patch(inv._id, { slots });
      }
    }

    // Add currency rewards
    if (rewards.currency) {
      for (const [currency, amount] of Object.entries(rewards.currency)) {
        let wallet = await ctx.db
          .query("wallets")
          .withIndex("by_profile", (q) => q.eq("profileId", profileId))
          .first();

        if (!wallet) {
          await ctx.db.insert("wallets", {
            profileId,
            currencies: { [currency]: amount as number },
          });
        } else {
          const currencies = { ...(wallet.currencies as Record<string, number>) };
          currencies[currency] = (currencies[currency] ?? 0) + (amount as number);
          await ctx.db.patch(wallet._id, { currencies });
        }
      }
    }

    return drops;
  },
});
