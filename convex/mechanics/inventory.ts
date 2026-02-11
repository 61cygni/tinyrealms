import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const getByPlayer = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, { playerId }) => {
    return await ctx.db
      .query("inventories")
      .withIndex("by_player", (q) => q.eq("playerId", playerId))
      .first();
  },
});

export const addItem = mutation({
  args: {
    playerId: v.id("players"),
    itemDefName: v.string(),
    quantity: v.number(),
  },
  handler: async (ctx, { playerId, itemDefName, quantity }) => {
    let inv = await ctx.db
      .query("inventories")
      .withIndex("by_player", (q) => q.eq("playerId", playerId))
      .first();

    if (!inv) {
      return await ctx.db.insert("inventories", {
        playerId,
        slots: [{ itemDefName, quantity, metadata: {} }],
      });
    }

    const slots = [...(inv.slots as any[])];
    const itemDef = await ctx.db
      .query("itemDefs")
      .withIndex("by_name", (q) => q.eq("name", itemDefName))
      .first();
    const existing = slots.findIndex(
      (s: any) => s.itemDefName === itemDefName && itemDef?.stackable
    );

    if (existing >= 0) {
      slots[existing] = {
        ...slots[existing],
        quantity: slots[existing].quantity + quantity,
      };
    } else {
      slots.push({ itemDefName, quantity, metadata: {} });
    }

    await ctx.db.patch(inv._id, { slots });
    return inv._id;
  },
});

export const removeItem = mutation({
  args: {
    playerId: v.id("players"),
    itemDefName: v.string(),
    quantity: v.number(),
  },
  handler: async (ctx, { playerId, itemDefName, quantity }) => {
    const inv = await ctx.db
      .query("inventories")
      .withIndex("by_player", (q) => q.eq("playerId", playerId))
      .first();

    if (!inv) throw new Error("No inventory");

    const slots = [...(inv.slots as any[])];
    const idx = slots.findIndex((s: any) => s.itemDefName === itemDefName);
    if (idx < 0) throw new Error("Item not found");

    slots[idx].quantity -= quantity;
    if (slots[idx].quantity <= 0) {
      slots.splice(idx, 1);
    }

    await ctx.db.patch(inv._id, { slots });
  },
});
