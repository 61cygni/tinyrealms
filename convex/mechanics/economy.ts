import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const getWallet = query({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, { profileId }) => {
    return await ctx.db
      .query("wallets")
      .withIndex("by_profile", (q) => q.eq("profileId", profileId))
      .first();
  },
});

export const addCurrency = mutation({
  args: {
    profileId: v.id("profiles"),
    currency: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, { profileId, currency, amount }) => {
    let wallet = await ctx.db
      .query("wallets")
      .withIndex("by_profile", (q) => q.eq("profileId", profileId))
      .first();

    if (!wallet) {
      return await ctx.db.insert("wallets", {
        profileId,
        currencies: { [currency]: amount },
      });
    }

    const currencies = { ...(wallet.currencies as Record<string, number>) };
    currencies[currency] = (currencies[currency] ?? 0) + amount;
    await ctx.db.patch(wallet._id, { currencies });
    return wallet._id;
  },
});

export const spendCurrency = mutation({
  args: {
    profileId: v.id("profiles"),
    currency: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, { profileId, currency, amount }) => {
    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_profile", (q) => q.eq("profileId", profileId))
      .first();

    if (!wallet) throw new Error("No wallet");
    const currencies = wallet.currencies as Record<string, number>;
    if ((currencies[currency] ?? 0) < amount) {
      throw new Error("Insufficient funds");
    }

    currencies[currency] -= amount;
    await ctx.db.patch(wallet._id, { currencies });
  },
});

export const getShop = query({
  args: { npcId: v.id("npcs") },
  handler: async (ctx, { npcId }) => {
    return await ctx.db
      .query("shops")
      .withIndex("by_npc", (q) => q.eq("npcId", npcId))
      .first();
  },
});

export const createShop = mutation({
  args: {
    npcId: v.id("npcs"),
    inventory: v.any(),
    mapId: v.optional(v.id("maps")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("shops", args);
  },
});
