import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("spriteSheets").collect();
  },
});

export const get = query({
  args: { id: v.id("spriteSheets") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

const frameValidator = v.record(v.string(), v.object({
  frame: v.object({ x: v.number(), y: v.number(), w: v.number(), h: v.number() }),
  rotated: v.optional(v.boolean()),
  trimmed: v.optional(v.boolean()),
  spriteSourceSize: v.optional(v.object({
    x: v.number(), y: v.number(), w: v.number(), h: v.number(),
  })),
  sourceSize: v.optional(v.object({ w: v.number(), h: v.number() })),
}));
const animValidator = v.record(v.string(), v.array(v.string()));

export const create = mutation({
  args: {
    name: v.string(),
    imageId: v.id("_storage"),
    frameWidth: v.number(),
    frameHeight: v.number(),
    frames: frameValidator,
    animations: animValidator,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId = identity.subject as any;
    return await ctx.db.insert("spriteSheets", { ...args, createdBy: userId });
  },
});

export const update = mutation({
  args: {
    id: v.id("spriteSheets"),
    name: v.optional(v.string()),
    imageId: v.optional(v.id("_storage")),
    frameWidth: v.optional(v.number()),
    frameHeight: v.optional(v.number()),
    frames: v.optional(frameValidator),
    animations: v.optional(animValidator),
  },
  handler: async (ctx, { id, ...updates }) => {
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    if (Object.keys(filtered).length > 0) {
      await ctx.db.patch(id, filtered);
    }
  },
});

export const remove = mutation({
  args: { id: v.id("spriteSheets") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
