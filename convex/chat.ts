import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/** Send a chat message */
export const send = mutation({
  args: {
    mapName: v.optional(v.string()),
    profileId: v.id("profiles"),
    senderName: v.string(),
    text: v.string(),
    type: v.union(
      v.literal("chat"),
      v.literal("npc"),
      v.literal("system"),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new Error("Profile not found");
    if (profile.userId !== userId) throw new Error("Cannot send chat as another profile");

    return await ctx.db.insert("messages", {
      mapName: args.mapName,
      profileId: args.profileId,
      senderName: profile.name,
      text: args.text,
      type: args.type,
      timestamp: Date.now(),
    });
  },
});

/** List recent messages for a map (newest last) */
export const listRecent = query({
  args: {
    mapName: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { mapName, limit }) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_map_time", (q) => q.eq("mapName", mapName))
      .order("desc")
      .take(limit ?? 50);
    return messages.reverse();
  },
});
